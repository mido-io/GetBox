import { create_context } from "./context.js";
import { route } from "./router.js";
import { normalizeItem } from "./utils.js";
import { ExtractionError } from "./errors.js";

export async function resolve(url, options = {}) {
  const ctx = create_context(options);
  let extractor = null;

  try {
    extractor = await route(url);
    if (extractor) {
      const result = await extractor(url, ctx);
      // normalize items
      const urls = (result.urls || []).map(normalizeItem);
      return { urls, meta: result.meta || {}, headers: result.headers || {} };
    }
  } catch (e) {
    // continue to fallback
    console.warn("Extractor failed:", e.message);
  }

  // fallback to youtube extractor (which uses yt-dlp)
  try {
    const youtube = (await import("./extractors/youtube.js")).default;
    const fallback = await youtube(url, ctx);
    const urls = (fallback.urls || []).map(normalizeItem);
    return { urls, meta: fallback.meta || {}, headers: fallback.headers || {} };
  } catch (e) {
    throw new ExtractionError(e.message || "Failed to extract", "generic");
  }
}
