const DIRECT_MEDIA_EXTENSIONS = new Map([
  ["mp4", "video"],
  ["m4v", "video"],
  ["mov", "video"],
  ["webm", "video"],
  ["mp3", "audio"],
  ["m4a", "audio"],
  ["aac", "audio"],
  ["ogg", "audio"],
  ["wav", "audio"],
  ["jpg", "image"],
  ["jpeg", "image"],
  ["png", "image"],
  ["gif", "image"],
  ["webp", "image"],
  ["avif", "image"],
]);

const BLOCKED_PROTOCOLS = new Set(["file:", "ftp:", "data:", "blob:", "javascript:"]);
const MEDIA_URL_PATTERN =
  /https?:\\?\/\\?\/[^\s"'<>\\]+?\.(?:mp4|m4v|mov|webm|mp3|m4a|aac|ogg|wav|jpg|jpeg|png|gif|webp|avif)(?:\?[^"'<>\\\s]*)?/gi;

export function parseHttpUrl(value) {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value.trim());
    if (BLOCKED_PROTOCOLS.has(url.protocol)) return null;
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (!url.hostname || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export function sanitizeFilename(name, fallback = "getbox-download") {
  const safe = String(name || fallback)
    .replace(/[\x00-\x1f\x80-\x9f/?<>\\:*|"]/g, "_")
    .replace(/^\.+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);

  return safe || fallback;
}

export function unescapeHtml(value) {
  return String(value || "")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-fA-F]+);?/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec) => String.fromCharCode(dec));
}

export function inferTypeFromUrl(value) {
  return getDirectMedia(value)?.type || null;
}

export function getDirectMedia(url) {
  const parsed = typeof url === "string" ? parseHttpUrl(url) : url;
  if (!parsed) return null;

  const pathname = decodeURIComponent(parsed.pathname || "");
  const match = pathname.match(/\.([a-z0-9]{2,5})$/i);
  const extension = match?.[1]?.toLowerCase();
  const type = extension ? DIRECT_MEDIA_EXTENSIONS.get(extension) : null;

  if (!type) return null;

  const filename = sanitizeFilename(
    pathname.split("/").filter(Boolean).pop(),
    `getbox.${extension}`
  );

  return {
    type,
    url: parsed.toString(),
    filename,
    quality: type === "image" ? "Original" : "Direct file",
    source: "direct",
  };
}

export function uniqueItems(items) {
  const seen = new Set();

  return items.filter((item) => {
    if (!item?.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

export function findDirectMediaUrls(text, source = "page") {
  const matches = unescapeHtml(text).match(MEDIA_URL_PATTERN) || [];

  return uniqueItems(
    matches
      .map((rawUrl) => {
        const cleanUrl = unescapeHtml(rawUrl)
          .replace(/\\\//g, "/")
          .replace(/[),.;]+$/g, "");
        const direct = getDirectMedia(cleanUrl);
        if (!direct) return null;

        return {
          ...direct,
          source,
        };
      })
      .filter(Boolean)
  );
}

export function buildFallback(platform, url, reason) {
  return {
    type: "open",
    url: url.toString(),
    label: `Open ${platform}`,
    reason,
  };
}

export function getPlatform(url) {
  const hostname = url.hostname.replace(/^www\./i, "").toLowerCase();

  if (hostname === "reddit.com" || hostname.endsWith(".reddit.com")) {
    return "reddit";
  }

  if (
    hostname === "i.imgur.com" ||
    hostname === "imgur.com" ||
    hostname === "m.imgur.com"
  ) {
    return "imgur";
  }

  if (hostname === "tiktok.com" || hostname.endsWith(".tiktok.com")) {
    return "tiktok";
  }

  if (hostname === "instagram.com" || hostname.endsWith(".instagram.com")) {
    return "instagram";
  }

  if (hostname === "youtube.com" || hostname === "youtu.be" || hostname.endsWith(".youtube.com")) {
    return "youtube";
  }

  if (
    hostname === "facebook.com" ||
    hostname.endsWith(".facebook.com") ||
    hostname === "fb.watch"
  ) {
    return "facebook";
  }

  if (hostname === "x.com" || hostname === "twitter.com" || hostname.endsWith(".twitter.com")) {
    return "twitter";
  }

  if (hostname === "soundcloud.com" || hostname === "snd.sc") {
    return "soundcloud";
  }

  if (
    hostname === "pinterest.com" ||
    hostname.endsWith(".pinterest.com") ||
    hostname === "pin.it"
  ) {
    return "pinterest";
  }

  return null;
}

export function samePublicRedditPath(url) {
  const cleanPath = url.pathname.replace(/\/+$/, "");

  if (!/^\/r\/[^/]+\/comments\/[^/]+/i.test(cleanPath)) {
    return null;
  }

  return `https://www.reddit.com${cleanPath}.json`;
}
