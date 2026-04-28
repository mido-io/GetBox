import { fetchText } from "../http.js";
import { buildFallback, sanitizeFilename, unescapeHtml } from "../url.js";

function getHelperServices(url) {
  const encodedUrl = encodeURIComponent(url.toString());
  return [
    {
      name: "FDOWN",
      url: "https://fdown.net/",
      label: "Open FDOWN.net",
    },
    {
      name: "SnapSave",
      url: "https://snapsave.app/",
      label: "Open SnapSave",
    },
    {
      name: "VidsSave",
      url: `https://www.vidssave.com/?url=${encodedUrl}`,
      label: "Open VidsSave",
    },
  ];
}

export async function resolveFacebook(url) {
  let html = "";
  try {
    html = await fetchText(url.toString(), { timeoutMs: 10000 });
  } catch (err) {
    // ignore
  }

  const items = [];
  if (html) {
    const hdMatch = html.match(/"browser_native_hd_url":"([^"]+)"/);
    if (hdMatch) {
      items.push({
        type: "video",
        url: unescapeHtml(hdMatch[1]).replace(/\\\//g, "/"),
        filename: sanitizeFilename("facebook-hd.mp4"),
        quality: "HD",
        source: "facebook",
        experimental: true,
      });
    }

    const sdMatch = html.match(/"browser_native_sd_url":"([^"]+)"/);
    if (sdMatch && (!hdMatch || hdMatch[1] !== sdMatch[1])) {
      items.push({
        type: "video",
        url: unescapeHtml(sdMatch[1]).replace(/\\\//g, "/"),
        filename: sanitizeFilename("facebook-sd.mp4"),
        quality: "SD",
        source: "facebook",
        experimental: true,
      });
    }
  }

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? unescapeHtml(titleMatch[1]) : "Facebook media";

  return {
    supported: true,
    meta: {
      title,
      author: "Facebook",
      platform: "Facebook",
    },
    items,
    fallback: items.length
      ? null
      : buildFallback(
          "Facebook",
          url,
          "Facebook did not expose a direct media file in public page metadata."
        ),
    helpers: getHelperServices(url),
  };
}
