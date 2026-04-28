import { buildFallback, sanitizeFilename, uniqueItems } from "../url.js";
import { fetchJson } from "../http.js";
import { resolveFromPage } from "./generic.js";

function getTweetId(url) {
  return url.pathname.match(/\/status(?:es)?\/(\d+)/)?.[1];
}

function mediaFromFxTwitter(data) {
  const tweet = data?.tweet || data;
  const media = tweet?.media?.all || tweet?.media_extended || tweet?.mediaDetails || [];

  return media
    .map((entry, index) => {
      const url = entry?.url || entry?.video_url || entry?.thumbnail_url;
      if (!url) return null;

      const isImage = entry?.type === "photo" || /\.(jpe?g|png|webp)$/i.test(new URL(url).pathname);
      return {
        type: isImage ? "image" : "video",
        url,
        filename: sanitizeFilename(`x-${tweet?.id || "media"}-${index + 1}.${isImage ? "jpg" : "mp4"}`),
        quality: entry?.quality || "Best found",
        source: "fxtwitter",
        experimental: true,
      };
    })
    .filter(Boolean);
}

function getHelperServices(url) {
  const encodedUrl = encodeURIComponent(url.toString());
  return [
    {
      name: "Publer",
      url: "https://publer.com/tools/twitter-video-downloader",
      label: "Open Publer",
    },
    {
      name: "SSSTwitter",
      url: "https://ssstwitter.com/",
      label: "Open SSSTwitter",
    },
    {
      name: "VidsSave",
      url: `https://www.vidssave.com/?url=${encodedUrl}`,
      label: "Open VidsSave",
    },
  ];
}

export async function resolveTwitter(url) {
  const tweetId = getTweetId(url);
  const helpers = getHelperServices(url);

  if (!tweetId) {
    return {
      supported: true,
      meta: { title: "X post", author: "X", platform: "X" },
      items: [],
      helpers,
      fallback: buildFallback("X", url, "Paste a public X/Twitter post URL containing /status/."),
    };
  }

  const apiUrl = `https://api.fxtwitter.com/status/${tweetId}`;

  try {
    const data = await fetchJson(apiUrl);
    const items = uniqueItems(mediaFromFxTwitter(data));

    if (items.length) {
      return {
        supported: true,
        meta: {
          title: data?.tweet?.text || "X media",
          author: data?.tweet?.author?.name || "X",
          platform: "X",
        },
        items,
        helpers,
      };
    }
  } catch {
    // Fall through to page metadata scan.
  }

  const scanned = await resolveFromPage(url, "X", { scanBody: true });
  scanned.helpers = helpers;
  scanned.fallback ||= buildFallback(
    "X",
    url,
    "X did not expose a public direct media file through free extractors."
  );
  return scanned;
}
