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
    const hostname = url.hostname;
    if (/profile|avatar|s150x150|p150x150|rsrc\.php/i.test(s)) return false;
    if (/(?:cdninstagram|fbcdn|scontent)/i.test(hostname)) return true;
    // Allow .mp4 from any domain that isn't an official Instagram/FB/Google domain.
    // Use proper suffix matching — "vxinstagram.com" contains "instagram.com" as a
    // substring and would incorrectly match the old regex.
    const isOfficialDomain =
      hostname === "instagram.com" || hostname.endsWith(".instagram.com") ||
      hostname === "facebook.com"  || hostname.endsWith(".facebook.com")  ||
      hostname === "google.com"    || hostname.endsWith(".google.com");
    if (/\.mp4(?:$|\?)/i.test(s) && !isOfficialDomain) return true;
    return false;
  } catch {
    return false;
  }
}

// Returns true when the response is a login wall, checkpoint, or blocked page.
function isBlockedResponse(html) {
  if (!html) return true;
  const sample = html.slice(0, 8000);
  return /(?:"is_logged_in"\s*:\s*false|\/accounts\/login\/|"loginRequired"\s*:\s*true|Log in to Instagram|"requiresAuth"\s*:\s*true|login_required|"status"\s*:\s*"fail")/i.test(sample);
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

// Extract all carousel items from Instagram's edge_sidecar_to_children structure.
// This JSON key is present in both old GraphQL and newer sharedData blobs.
function extractCarouselFromSidecar(html) {
  const urls = [];
  const sidecarRe = /"edge_sidecar_to_children"\s*:\s*\{[^{]*?"edges"\s*:\s*\[/gi;
  let sm;
  while ((sm = sidecarRe.exec(html))) {
    const start = sm.index + sm[0].length;
    let depth = 1;
    let i = start;
    while (i < html.length && depth > 0) {
      if (html[i] === "[") depth++;
      if (html[i] === "]") depth--;
      i++;
    }
    const edgesContent = html.slice(start, i - 1);
    const displayRe = /"display_url"\s*:\s*"([^"]+)"/gi;
    const videoRe = /"video_url"\s*:\s*"([^"]+)"/gi;
    let m;
    while ((m = displayRe.exec(edgesContent))) {
      const u = unescapeHtml(m[1]).replace(/\\\//g, "/");
      if (isInstagramCdnUrl(u)) urls.push(u);
    }
    while ((m = videoRe.exec(edgesContent))) {
      const u = unescapeHtml(m[1]).replace(/\\\//g, "/");
      if (isInstagramCdnUrl(u)) urls.push(u);
    }
  }
  return urls;
}

// Extract image_versions2 candidates — used in newer Instagram API JSON (carousel_media items).
// Takes the first (highest-resolution) candidate URL from each candidates array.
function extractImageCandidates(html) {
  const urls = [];
  // Match each image_versions2 block and grab the first candidate URL
  const blockRe = /"image_versions2"\s*:\s*\{[^{]*?"candidates"\s*:\s*\[\s*\{[^}]*?"url"\s*:\s*"([^"]+)"/gi;
  let m;
  while ((m = blockRe.exec(html))) {
    const u = unescapeHtml(m[1]).replace(/\\\//g, "/");
    if (isInstagramCdnUrl(u)) urls.push(u);
  }
  return urls;
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
    if (html && !isBlockedResponse(html)) {
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
    { u: url.toString(), ua: MOBILE_UA },
    { u: `https://www.instagram.com/p/${shortcode}/`, ua: MOBILE_UA },
    { u: `https://www.instagram.com/p/${shortcode}/`, ua: DESKTOP_UA },
  ];
  for (const { u, ua } of attempts) {
    const html = await safeFetch(u, {
      ua,
      timeoutMs: 8000,
      headers: { "x-ig-app-id": "936619743392459" },
    });
    if (!html || isBlockedResponse(html)) continue;

    // Try carousel-specific extractors first for completeness, then fall back to general
    const sidecarUrls = extractCarouselFromSidecar(html);
    const candidateUrls = extractImageCandidates(html);
    const generalUrls = extractCdnUrls(html);

    // Merge all, preserving order: sidecar > candidates > general
    const merged = [...sidecarUrls];
    for (const u2 of [...candidateUrls, ...generalUrls]) {
      if (!merged.includes(u2)) merged.push(u2);
    }

    if (merged.length) return merged;
  }
  return null;
}

// Try Instagram's ?__a=1 JSON endpoint — returns structured post data including
// all carousel_media items when it works for public content.
async function tryApiEndpoint(shortcode) {
  const apiUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
  const html = await safeFetch(apiUrl, {
    ua: MOBILE_UA,
    timeoutMs: 7000,
    headers: { "x-ig-app-id": "936619743392459" },
  });
  if (!html || isBlockedResponse(html)) return [];
  try {
    const data = JSON.parse(html);
    const media = data?.items?.[0] || data?.graphql?.shortcode_media;
    if (!media) return [];

    const urls = [];
    const processMediaItem = (m) => {
      if (m.video_url) {
        const v = unescapeHtml(m.video_url).replace(/\\\//g, "/");
        if (isInstagramCdnUrl(v)) urls.push(v);
      }
      const candidates = m.image_versions2?.candidates;
      if (candidates?.length) {
        const u = unescapeHtml(candidates[0].url).replace(/\\\//g, "/");
        if (isInstagramCdnUrl(u)) urls.push(u);
      }
      if (m.display_url && !m.video_url) {
        const u = unescapeHtml(m.display_url).replace(/\\\//g, "/");
        if (isInstagramCdnUrl(u)) urls.push(u);
      }
    };

    if (media.carousel_media?.length) {
      for (const item of media.carousel_media) processMediaItem(item);
    } else {
      processMediaItem(media);
    }
    return urls;
  } catch { return []; }
}

async function tryProxies(url, shortcode) {
  const proxies = [
    // vxinstagram is tried first — it reliably returns OG:video with a proxy mp4 URL
    `https://www.vxinstagram.com${url.pathname}`,
    `https://www.ddinstagram.com${url.pathname}`,
    `https://www.ddinstagram.com/p/${shortcode}/`,
    // imginn.com renders full carousel content without auth
    `https://imginn.com/p/${shortcode}/`,
  ];
  for (const proxyUrl of proxies) {
    const html = await safeFetch(proxyUrl, { ua: MOBILE_UA, timeoutMs: 7000 });
    if (html && !isBlockedResponse(html)) {
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

  // 2. Full page fetch — needed for carousel posts (embed only returns slide 1).
  //    Also applies when embed is blocked or returns a reel with no results.
  if (!reel || !cdnUrls.length) {
    const pageItems = await tryFullPage(url, shortcode);
    if (pageItems?.length) {
      for (const u of pageItems) {
        if (!cdnUrls.includes(u)) cdnUrls.push(u);
      }
    }
  }

  // 3. Structured API endpoint — tries the ?__a=1 JSON for all carousel items
  if (!reel && cdnUrls.length <= 1) {
    const apiItems = await tryApiEndpoint(shortcode);
    for (const u of apiItems) {
      if (!cdnUrls.includes(u)) cdnUrls.push(u);
    }
  }

  // 4. Proxy mirrors — last resort.
  // For reels: also try proxies when we have only images (no video found yet),
  // because the Instagram page can return unrelated feed thumbnails.
  const hasVideoUrl = cdnUrls.some((u) => /\.mp4(?:$|\?)/i.test(u));
  if (!cdnUrls.length || (reel && !hasVideoUrl)) {
    const proxyItems = await tryProxies(url, shortcode);
    if (proxyItems?.length) cdnUrls.push(...proxyItems);
  }

  // For reels only take videos; for posts take both (videos first, then images)
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
