import {
  buildFallback,
  findDirectMediaUrls,
  sanitizeFilename,
  unescapeHtml,
  uniqueItems,
} from "../url.js";
import { fetchText } from "../http.js";

function readTitle(html, fallback) {
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return unescapeHtml(ogTitle?.[1] || title?.[1] || fallback);
}

function readOgMedia(html) {
  const patterns = [
    /<meta[^>]+property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+name=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/gi,
  ];

  const urls = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html))) urls.push(unescapeHtml(match[1]));
  }

  return findDirectMediaUrls(urls.join("\n"), "metadata");
}

export async function resolveFromPage(url, platform, options = {}) {
  const html = await fetchText(url.toString(), options);
  const metadataItems = readOgMedia(html);
  const bodyItems = options.scanBody ? findDirectMediaUrls(html, platform.toLowerCase()) : [];
  const items = uniqueItems([...metadataItems, ...bodyItems]).map((item, index) => ({
    ...item,
    filename: sanitizeFilename(
      item.filename,
      `${platform.toLowerCase()}-${index + 1}.${item.type === "image" ? "jpg" : "mp4"}`
    ),
    quality: item.quality || "Best found",
    experimental: true,
  }));

  return {
    supported: true,
    meta: {
      title: readTitle(html, `${platform} media`),
      author: platform,
      platform,
    },
    items,
    fallback: items.length
      ? null
      : buildFallback(
          platform,
          url,
          `${platform} did not expose a direct media file in public page metadata.`
        ),
  };
}
