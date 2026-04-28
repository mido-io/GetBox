import { buildFallback, sanitizeFilename, unescapeHtml, uniqueItems } from "../url.js";
import { fetchText } from "../http.js";

function isReel(url) {
  return /\/reels?\//i.test(url.pathname);
}

function shortcodeFromPath(url) {
  return url.pathname.match(/\/(?:p|reel|reels|tv)\/([^/?#]+)/i)?.[1] || "media";
}

function helperUrls(url) {
  return [
    url.toString(),
    `https://www.ddinstagram.com${url.pathname}`,
    `https://www.vxinstagram.com${url.pathname}`,
    `https://www.instasave.io${url.pathname}`,
    `https://www.instanavigation.com${url.pathname}`,
  ];
}

function isInstagramCdnUrl(value) {
  try {
    const url = new URL(value);
    const urlStr = url.toString();
    
    // Accept Instagram's official CDNs
    if (/\.(mp4|jpe?g|webp)(?:$|\?)/i.test(urlStr) &&
        /(?:cdninstagram|fbcdn|scontent)/i.test(url.hostname + url.pathname) &&
        !/profile|avatar|s150x150|p150x150|rsrc\.php/i.test(urlStr)) {
      return true;
    }
    
    // For videos from helper services, be more permissive
    if (/\.mp4(?:$|\?)/i.test(urlStr) && url.hostname) {
      // Reject obvious non-media domains
      if (/instagram\.com|facebook\.com|google\.com|javascript/i.test(url.hostname)) {
        return !/profile|avatar|s150x150|p150x150/i.test(urlStr);
      }
      return true; // Accept any other .mp4 URL
    }
    
    return false;
  } catch {
    return false;
  }
}

function extractMetaUrls(html) {
  const urls = [];
  const patterns = [
    /<meta[^>]+property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+name=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html))) urls.push(unescapeHtml(match[1]));
  }

  return urls;
}

function extractJsonFieldUrls(html) {
  const urls = [];
  const patterns = [
    /"video_url"\s*:\s*"([^"]+)"/gi,
    /"playback_url"\s*:\s*"([^"]+)"/gi,
    /"display_url"\s*:\s*"([^"]+)"/gi,
    /"thumbnail_src"\s*:\s*"([^"]+)"/gi,
    /"src"\s*:\s*"([^"]+\.(?:mp4|jpg|jpeg|webp)[^"]*)"/gi,
    /"video"\s*:\s*{\s*"url"\s*:\s*"([^"]+)"/gi,
    /"asset"\s*:\s*{\s*"src"\s*:\s*"([^"]+\.mp4[^"]*)"/gi,
    /"mediaUrl"\s*:\s*"([^"]+\.mp4[^"]*)"/gi,
    /"href"\s*:\s*"([^"]+\.mp4[^"]*)"/gi,
    /<source[^>]+src="([^"]+\.mp4[^"]*)"/gi,
    /"https?[^"]*\.mp4[^"]*/gi,
    /https?:\/\/[^\s"'<>]+\.mp4(?:\?[^\s"'<>]*)?/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html))) {
      const url = unescapeHtml(match[1] || match[0]);
      if (url && /\.mp4(?:\?|$)/i.test(url)) {
        urls.push(url);
      }
    }
  }

  // Try to extract from script tags with JSON data
  const scriptPattern = /<script[^>]*type=["']application\/json["'][^>]*>([^<]+)<\/script>/gi;
  let scriptMatch;
  while ((scriptMatch = scriptPattern.exec(html))) {
    try {
      const json = JSON.parse(scriptMatch[1]);
      const extracted = extractUrlsFromJson(json);
      urls.push(...extracted);
    } catch {
      // Skip invalid JSON
    }
  }

  return urls;
}

function extractUrlsFromJson(obj, visited = new Set()) {
  const urls = [];
  
  if (visited.has(obj)) return urls;
  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'string' && /\.(?:mp4|jpg|jpeg|webp)(?:\?|$)/i.test(obj)) {
      urls.push(obj);
    }
    return urls;
  }
  
  visited.add(obj);

  for (const value of Object.values(obj)) {
    if (typeof value === 'string') {
      // Check for video URLs specifically
      if (/\.mp4(?:\?|$)/i.test(value) || /https?:\/\/.*video/i.test(value)) {
        urls.push(value);
      } else if (/\.(?:jpg|jpeg|webp)(?:\?|$)/i.test(value)) {
        urls.push(value);
      }
    } else if (typeof value === 'object' && value !== null) {
      urls.push(...extractUrlsFromJson(value, visited));
    }
  }

  return urls;
}

function bestByPath(urls) {
  const byFile = new Map();

  for (const rawUrl of urls) {
    const cleanUrl = unescapeHtml(rawUrl).replace(/\\\//g, "/");
    if (!isInstagramCdnUrl(cleanUrl)) continue;

    const parsed = new URL(cleanUrl);
    // The actual filename is the last segment of the pathname
    const segments = parsed.pathname.split("/");
    const filename = segments.pop();

    // Ignore small thumbnails often used for UI/Avatars if there are other files
    if (/(?:profile|avatar|s150x150|p150x150|s320x320|p320x320|150x150|320x320)/i.test(cleanUrl)) continue;

    const existing = byFile.get(filename);

    // Keep the URL with the longest string length (typically contains the highest quality parameters)
    if (!existing || cleanUrl.length > existing.length) {
      byFile.set(filename, cleanUrl);
    }
  }

  return [...byFile.values()];
}

function buildItems(urls, shortcode) {
  return uniqueItems(
    urls.map((mediaUrl, index) => {
      const isVideo = /\.mp4(?:$|\?)/i.test(mediaUrl);
      return {
        type: isVideo ? "video" : "image",
        url: mediaUrl,
        filename: sanitizeFilename(
          `instagram-${shortcode}-${index + 1}.${isVideo ? "mp4" : "jpg"}`
        ),
        quality: isVideo ? "Highest found video" : "Highest found image",
        source: "instagram",
        experimental: true,
      };
    })
  );
}

async function fetchAllInstagramPages(url) {
  const pages = [];

  for (const helperUrl of helperUrls(url)) {
    try {
      pages.push(await fetchText(helperUrl, { timeoutMs: 7500 }));
    } catch {
      // Try the next public helper/original page.
    }
  }

  return pages;
}

function getHelperServices(url) {
  const encodedUrl = encodeURIComponent(url.toString());
  return [
    {
      name: "IG.media",
      url: "https://www.ig.media/",
      label: "Open IG.media",
    },
    {
      name: "SnapInsta",
      url: "https://snapinsta.app/",
      label: "Open SnapInsta",
    },
    {
      name: "VidsSave",
      url: `https://www.vidssave.com/?url=${encodedUrl}`,
      label: "Open VidsSave",
    },
  ];
}

export async function resolveInstagram(url) {
  if (/\/stories\//i.test(url.pathname)) {
    return {
      supported: true,
      meta: { title: "Instagram Story", author: "Instagram", platform: "Instagram" },
      items: [],
      helpers: getHelperServices(url),
      fallback: buildFallback(
        "Instagram",
        url,
        "Stories normally require an authenticated Instagram session."
      ),
    };
  }

  const shortcode = shortcodeFromPath(url);
  const pages = await fetchAllInstagramPages(url);
  const candidates = bestByPath(
    pages.flatMap((html) => [...extractMetaUrls(html), ...extractJsonFieldUrls(html)])
  );

  const videos = candidates.filter((mediaUrl) => /\.mp4(?:$|\?)/i.test(mediaUrl));
  const images = candidates.filter((mediaUrl) => !/\.mp4(?:$|\?)/i.test(mediaUrl));
  // For reels, only accept videos. For regular posts, return all images and videos
  let chosen = [];
  if (isReel(url)) {
    chosen = videos; // Only videos for reels
  } else {
    chosen = [...videos, ...images]; // Both videos and images for regular posts
  }
  const items = buildItems(chosen, shortcode);
  const helpers = getHelperServices(url);

  return {
    supported: true,
    meta: {
      title: isReel(url) ? "Instagram Reel" : "Instagram post",
      author: "Instagram",
      platform: isReel(url) ? "Instagram Reel" : "Instagram",
    },
    items,
    helpers,
    fallback: items.length
      ? null
      : buildFallback(
          "Instagram",
          url,
          isReel(url)
            ? "This Reel did not expose a direct public video URL through the free extractors."
            : "This post did not expose direct public media URLs through the free extractors."
        ),
  };
}
