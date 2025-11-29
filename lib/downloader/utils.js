export const DEFAULT_TIMEOUT_MS = 20000; // Increased timeout
export const DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export function sanitizeFilename(name) {
  if (!name) return "download";
  // Allow alphanumeric, dots, dashes, underscores, spaces, and common parentheses
  // Remove dangerous characters like slashes, null bytes, control chars
  return name
    .replace(/[\x00-\x1f\x80-\x9f/?<>\\:*|"]/g, "_") // Remove control chars and reserved fs chars
    .replace(/^\.+/, "") // Remove leading dots (hidden files)
    .trim()
    .slice(0, 200);
}

export function normalizeItem(item) {
  // ensures canonical shape
  return {
    type: ["video", "audio", "image"].includes(item.type) ? item.type : "video",
    url: String(item.url || ""),
    filename: sanitizeFilename(item.filename || (item.title ? `${item.title}.mp4` : "download")),
    quality: item.quality || null,
    is_muted: Boolean(item.is_muted),
    audio_source_url: item.audio_source_url || null,
    is_transcode: Boolean(item.is_transcode),
    // CRITICAL: Preserve headers for downstream use
    userAgent: item.userAgent || DEFAULT_USER_AGENT,
    referer: item.referer || null,
    cookie: item.cookie || null,
    headers: item.headers || {},
    // Metadata
    duration: item.duration || 0,
    thumbnail: item.thumbnail || null
  };
}
