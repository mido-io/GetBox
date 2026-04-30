import { buildFallback, sanitizeFilename, unescapeHtml, uniqueItems } from "../url.js";

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function isReel(url) {
  return /\/reels?\//i.test(url.pathname);
}

function shortcodeFromPath(url) {
  return url.pathname.match(/\/(?:p|reel|reels|tv)\/([^/?#]+)/i)?.[1] || "media";
}

function getHelperServices(url) {
  const encodedUrl = encodeURIComponent(url.toString());
  return [
    { name: "SnapInsta", url: "https://snapinsta.app/", label: "Open SnapInsta" },
    { name: "SaveInsta", url: "https://saveinsta.app/", label: "Open SaveInsta" },
    { name: "VidsSave", url: `https://www.vidssave.com/?url=${encodedUrl}`, label: "Open VidsSave" },
    { name: "IG.media", url: "https://www.ig.media/", label: "Open IG.media" },
  ];
}

function isInstagramCdnUrl(value) {
  try {
    const url = new URL(value);
    const s = url.toString();
    if (/profile|avatar|s150x150|p150x150|rsrc\.php/i.test(s)) return false;
    if (/(?:cdninstagram|fbcdn|scontent)/i.test(url.hostname)) return true;
    if (/\.mp4(?:$|\?)/i.test(s) && !/instagram\.com|facebook\.com|google\.com/i.test(url.hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

function extractCdnUrls(html) {
  if (!html) return [];
  const raw = [];

  // OG / Twitter meta tags
  const metaPatterns = [
    /<meta[^>]+property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video(?::secure_url)?["']/gi,
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/gi,
    /<meta[^>]+name=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:player:stream["']/gi,
  ];
  for (const p of metaPatterns) {
    let m;
    while ((m = p.exec(html))) raw.push(unescapeHtml(m[1]));
  }

  // JSON field patterns — covers both current and older Instagram JSON shapes
  const jsonPatterns = [
    /"video_url"\s*:\s*"([^"]+)"/gi,
    /"playback_url"\s*:\s*"([^"]+)"/gi,
    /"display_url"\s*:\s*"([^"]+)"/gi,
    /"thumbnail_src"\s*:\s*"([^"]+)"/gi,
    /"src"\s*:\s*"([^"]+\.(?:mp4|jpg|jpeg|webp)[^"]*)"/gi,
    /"video"\s*:\s*\{\s*"url"\s*:\s*"([^"]+)"/gi,
    /"asset"\s*:\s*\{\s*"src"\s*:\s*"([^"]+\.mp4[^"]*)"/gi,
    /"mediaUrl"\s*:\s*"([^"]+\.mp4[^"]*)"/gi,
    /"video_versions"\s*:\s*\[([^\]]{0,4000})\]/gi,
    /"contentUrl"\s*:\s*"([^"]+)"/gi,
    /"embedUrl"\s*:\s*"([^"]+)"/gi,
    /https?:\\\/\\\/[^\s"'<>\\]+\.mp4(?:\\\/[^\s"'<>\\]*)?/gi,
    /https?:\/\/[^\s"'<>]+\.mp4(?:\?[^\s"'<>]*)?/gi,
  ];
  for (const p of jsonPatterns) {
    let m;
    while ((m = p.exec(html))) {
      const val = unescapeHtml((m[1] || m[0]).replace(/\\\//g, "/"));
      if (val) raw.push(val);
    }
  }

  // <source src="..."> tags (embed page)
  const srcPattern = /<source[^>]+src=["']([^"']+)["']/gi;
  let sm;
  while ((sm = srcPattern.exec(html))) raw.push(unescapeHtml(sm[1]));

  // Deduplicate and filter by CDN
  const byFile = new Map();
  for (const u of raw) {
    if (!isInstagramCdnUrl(u)) continue;
    let parsed;
    try { parsed = new URL(u); } catch { continue; }
    const seg = parsed.pathname.split("/").pop();
    const existing = byFile.get(seg);
    if (!existing || u.length > existing.length) byFile.set(seg, u);
  }
  return [...byFile.values()];
}

async function safeFetch(url, opts = {}) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), opts.timeoutMs || 8000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": opts.ua || DESKTOP_UA,
        "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(tid);
  }
}

// Try Instagram's embed endpoint.
// For reels, Instagram uses /reel/{shortcode}/embed/ — /p/ won't return the video.
async function tryInstagramEmbed(shortcode, reel) {
  const urls = reel
    ? [
        `https://www.instagram.com/reel/${shortcode}/embed/captioned/`,
        `https://www.instagram.com/reel/${shortcode}/embed/`,
        `https://www.instagram.com/p/${shortcode}/embed/captioned/`,
      ]
    : [
        `https://www.instagram.com/p/${shortcode}/embed/captioned/`,
        `https://www.instagram.com/p/${shortcode}/embed/`,
      ];

  for (const u of urls) {
    const html = await safeFetch(u, { ua: DESKTOP_UA, timeoutMs: 7000 });
    if (html) {
      const items = extractCdnUrls(html);
      if (items.length) return items;
    }
  }
  return null;
}

// Fetch the full Instagram page — required for carousel posts because the embed
// endpoint only returns slide 1. The full page's JSON contains all display_url values.
async function tryFullPage(url, shortcode) {
  const attempts = [
    // Canonical URL with mobile UA — closest to what a phone browser sends
    { u: url.toString(), ua: MOBILE_UA },
    // Normalised /p/ path (works for reels too via Instagram's own redirect)
    { u: `https://www.instagram.com/p/${shortcode}/`, ua: MOBILE_UA },
    { u: `https://www.instagram.com/p/${shortcode}/`, ua: DESKTOP_UA },
  ];
  for (const { u, ua } of attempts) {
    const html = await safeFetch(u, {
      ua,
      timeoutMs: 8000,
      headers: { "x-ig-app-id": "936619743392459" },
    });
    if (html) {
      const items = extractCdnUrls(html);
      if (items.length) return items;
    }
  }
  return null;
}

async function tryProxies(url, shortcode) {
  const proxies = [
    `https://www.ddinstagram.com${url.pathname}`,
    `https://www.vxinstagram.com${url.pathname}`,
    // Also try the /p/ normalised path on the proxies
    `https://www.ddinstagram.com/p/${shortcode}/`,
  ];
  for (const proxyUrl of proxies) {
    const html = await safeFetch(proxyUrl, { ua: MOBILE_UA, timeoutMs: 7000 });
    if (html) {
      const items = extractCdnUrls(html);
      if (items.length) return items;
    }
  }
  return null;
}

function buildItems(urls, shortcode) {
  return uniqueItems(
    urls.map((mediaUrl, index) => {
      const isVideo = /\.mp4(?:$|\?)/i.test(mediaUrl);
      return {
        type: isVideo ? "video" : "image",
        url: mediaUrl,
        filename: sanitizeFilename(`instagram-${shortcode}-${index + 1}.${isVideo ? "mp4" : "jpg"}`),
        quality: isVideo ? "Best available quality" : "Best available image",
        source: "instagram",
        experimental: true,
      };
    })
  );
}

export async function resolveInstagram(url) {
  if (/\/stories\//i.test(url.pathname)) {
    return {
      supported: true,
      meta: { title: "Instagram Story", author: "Instagram", platform: "Instagram" },
      items: [],
      helpers: getHelperServices(url),
      fallback: buildFallback("Instagram", url, "Stories require an authenticated Instagram session."),
    };
  }

  const shortcode = shortcodeFromPath(url);
  const reel = isReel(url);
  let cdnUrls = [];

  // 1. Embed endpoint — reel-aware paths tried first
  const embedItems = await tryInstagramEmbed(shortcode, reel);
  if (embedItems?.length) cdnUrls.push(...embedItems);

  // 2. Full page fetch — needed for carousel posts (embed only returns slide 1)
  //    Also helpful when embed is blocked.
  if (!reel || !cdnUrls.length) {
    const pageItems = await tryFullPage(url, shortcode);
    if (pageItems?.length) {
      // For carousels, page items may include more images than the embed returned
      for (const u of pageItems) {
        if (!cdnUrls.includes(u)) cdnUrls.push(u);
      }
    }
  }

  // 3. Proxy mirrors — last resort
  if (!cdnUrls.length) {
    const proxyItems = await tryProxies(url, shortcode);
    if (proxyItems?.length) cdnUrls.push(...proxyItems);
  }

  // For reels only take videos; for posts take both
  const videos = cdnUrls.filter((u) => /\.mp4(?:$|\?)/i.test(u));
  const images = cdnUrls.filter((u) => !/\.mp4(?:$|\?)/i.test(u));
  const chosen = reel ? videos : [...videos, ...images];

  const items = buildItems(chosen, shortcode);
  const helpers = getHelperServices(url);

  return {
    supported: true,
    meta: {
      title: reel ? "Instagram Reel" : "Instagram post",
      author: "Instagram",
      platform: reel ? "Instagram Reel" : "Instagram",
    },
    items,
    helpers,
    fallback: items.length
      ? null
      : buildFallback(
          "Instagram",
          url,
          reel
            ? "This Reel is private or Instagram blocked the request. Use a helper service below."
            : "This post is private or Instagram blocked the request. Use a helper service below."
        ),
  };
}
