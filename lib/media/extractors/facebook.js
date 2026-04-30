import { buildFallback, sanitizeFilename, unescapeHtml } from "../url.js";

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Facebook video CDN hostnames — URLs from these hosts are videos even without .mp4
const FB_VIDEO_CDN = /(?:video(?:cdn)?[^.]*\.|[^.]*\.(?:fbcdn|fna\.fbcdn))\.net/i;

function getHelperServices(url) {
  const encodedUrl = encodeURIComponent(url.toString());
  return [
    { name: "FDOWN", url: "https://fdown.net/", label: "Open FDOWN.net" },
    { name: "SnapSave", url: "https://snapsave.app/", label: "Open SnapSave" },
    { name: "FBDown", url: "https://fbdown.net/", label: "Open FBDown.net" },
    { name: "VidsSave", url: `https://www.vidssave.com/?url=${encodedUrl}`, label: "Open VidsSave" },
  ];
}

async function safeFetch(url, opts = {}) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), opts.timeoutMs || 10000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": opts.ua || DESKTOP_UA,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
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

function toVariantUrl(url, hostname) {
  try {
    const u = new URL(url.toString());
    u.hostname = hostname;
    return u.toString();
  } catch {
    return null;
  }
}

function isFbVideoUrl(src) {
  if (!src || !src.startsWith("http")) return false;
  try {
    const u = new URL(src);
    return FB_VIDEO_CDN.test(u.hostname) || /\.mp4(?:$|\?)/i.test(src);
  } catch {
    return false;
  }
}

function extractVideoUrls(html) {
  if (!html) return { hd: null, sd: null, images: [] };

  let hd = null;
  let sd = null;

  // ── JSON field patterns (desktop & mobile Facebook pages) ─────────────────
  const jsonPatterns = [
    { key: "hd", re: /"playable_url_quality_hd"\s*:\s*"([^"]+)"/i },
    { key: "hd", re: /"hd_src"\s*:\s*"([^"]+)"/i },
    { key: "hd", re: /"browser_native_hd_url"\s*:\s*"([^"]+)"/i },
    { key: "sd", re: /"playable_url"\s*:\s*"([^"]+)"/i },
    { key: "sd", re: /"sd_src"\s*:\s*"([^"]+)"/i },
    { key: "sd", re: /"browser_native_sd_url"\s*:\s*"([^"]+)"/i },
    { key: "sd", re: /"video_url"\s*:\s*"([^"]+)"/i },
    { key: "sd", re: /"stream_url"\s*:\s*"([^"]+)"/i },
  ];
  for (const { key, re } of jsonPatterns) {
    if (hd && sd) break;
    const m = html.match(re);
    if (m) {
      const val = unescapeHtml(m[1]).replace(/\\\//g, "/");
      if (val.startsWith("http") && !val.includes("javascript")) {
        if (key === "hd" && !hd) hd = val;
        if (key === "sd" && !sd) sd = val;
      }
    }
  }

  // ── data-store JSON attributes (mbasic.facebook.com) ─────────────────────
  // mbasic encodes video info as: data-store='{"sdSrc":"...","hdSrc":"..."}'
  if (!hd || !sd) {
    const dsRe = /data-store=['"]([^'"]{20,})['"]/gi;
    let dsm;
    while ((dsm = dsRe.exec(html))) {
      try {
        const store = JSON.parse(unescapeHtml(dsm[1]));
        const hdVal = store.hdSrc || store.HD || store.hd_src;
        const sdVal = store.sdSrc || store.SD || store.sd_src || store.videoURL || store.src;
        if (hdVal && !hd && isFbVideoUrl(hdVal)) hd = hdVal;
        if (sdVal && !sd && isFbVideoUrl(sdVal)) sd = sdVal;
      } catch { /* invalid JSON, skip */ }
    }
  }

  // ── <video> / <source> tags — NO .mp4 requirement ─────────────────────────
  // Facebook CDN video URLs look like: https://video-xxx.fbcdn.net/v/t42.xxxx/...
  // They never have .mp4 in the URL path.
  if (!hd && !sd) {
    const tagRe = /<(?:video|source)[^>]+src=["']([^"']+)["']/gi;
    let tm;
    while ((tm = tagRe.exec(html))) {
      const src = unescapeHtml(tm[1]);
      if (isFbVideoUrl(src) && !sd) sd = src;
    }
  }

  // ── mbasic download links — HD / SD anchor tags ───────────────────────────
  // mbasic renders: <a href="/video/download/?...">HD</a>
  // The href is relative and URL-encoded with &amp;
  if (!hd || !sd) {
    const dlRe = /href=["']([^"']*(?:\/video\/download\/|\/video_redirect\/)[^"']*)["'][^>]*>\s*(HD|SD|Download)/gi;
    let dlm;
    while ((dlm = dlRe.exec(html))) {
      const raw = unescapeHtml(dlm[1]).replace(/&amp;/g, "&");
      const href = raw.startsWith("/") ? `https://mbasic.facebook.com${raw}` : raw;
      const label = dlm[2].toUpperCase();
      if ((label === "HD" || label === "DOWNLOAD") && !hd) hd = href;
      else if (label === "SD" && !sd) sd = href;
    }
  }

  // ── OG image (always collected, used only if no video found) ─────────────
  const images = [];
  const ogRe = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i;
  const ogm = html.match(ogRe);
  if (ogm) images.push(unescapeHtml(ogm[1]));

  return { hd, sd, images };
}

function extractTitle(html) {
  if (!html) return "Facebook media";
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? unescapeHtml(m[1]).replace(/ \| Facebook$/i, "").trim() : "Facebook media";
}

export async function resolveFacebook(url) {
  const helpers = getHelperServices(url);
  const items = [];
  let title = "Facebook media";

  // Try variants: mbasic first (no JS, most scraper-friendly), then mobile, then desktop.
  // mbasic follows share/r/ redirects and renders the actual reel/post page.
  const urlsToTry = [
    { u: toVariantUrl(url, "mbasic.facebook.com"), ua: MOBILE_UA },
    { u: toVariantUrl(url, "m.facebook.com"), ua: MOBILE_UA },
    { u: url.toString(), ua: DESKTOP_UA },
  ];

  for (const { u, ua } of urlsToTry) {
    if (!u) continue;
    const html = await safeFetch(u, { ua, timeoutMs: 10000 });
    if (!html) continue;

    if (title === "Facebook media") title = extractTitle(html);

    const { hd, sd, images } = extractVideoUrls(html);

    if (hd && !items.find((i) => i.quality === "HD")) {
      items.push({
        type: "video",
        url: hd,
        filename: sanitizeFilename("facebook-hd.mp4"),
        quality: "HD",
        source: "facebook",
        experimental: true,
      });
    }

    if (sd && hd !== sd && !items.find((i) => i.quality === "SD")) {
      items.push({
        type: "video",
        url: sd,
        filename: sanitizeFilename("facebook-sd.mp4"),
        quality: "SD",
        source: "facebook",
        experimental: true,
      });
    }

    if (items.length > 0) break;

    // Image fallback — only add if this is the last attempt and nothing else worked
    if (images.length && u === urlsToTry[urlsToTry.length - 1]?.u) {
      items.push({
        type: "image",
        url: images[0],
        filename: sanitizeFilename("facebook-image.jpg"),
        quality: "Original",
        source: "facebook",
      });
    }
  }

  return {
    supported: true,
    meta: { title, author: "Facebook", platform: "Facebook" },
    items,
    helpers,
    fallback: items.length
      ? null
      : buildFallback(
          "Facebook",
          url,
          "Facebook requires login to access this content, or the video is private. Use a helper service below."
        ),
  };
}
