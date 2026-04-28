import { buildFallback, sanitizeFilename, uniqueItems } from "../url.js";
import { fetchJson } from "../http.js";
import { resolveFromPage } from "./generic.js";

function getVideoId(url) {
  return url.pathname.match(/\/video\/(\d+)/)?.[1] || url.pathname.match(/\/(\d{10,})/)?.[1];
}

function mediaFromTikwm(data, originalUrl) {
  const video = data?.data || data;
  const videoUrl = video?.hdplay || video?.play || video?.wmplay;
  const musicUrl = video?.music;
  const images = Array.isArray(video?.images) ? video.images : [];
  const items = [];

  if (videoUrl) {
    items.push({
      type: "video",
      url: videoUrl,
      filename: sanitizeFilename(`tiktok-${video?.id || getVideoId(originalUrl) || "video"}.mp4`),
      quality: video?.hdplay ? "HD no watermark" : "No watermark",
      source: "tikwm",
      experimental: true,
    });
  }

  if (musicUrl) {
    items.push({
      type: "audio",
      url: musicUrl,
      filename: sanitizeFilename(`tiktok-${video?.id || "audio"}.mp3`),
      quality: "Original sound",
      source: "tikwm",
      experimental: true,
    });
  }

  images.forEach((imageUrl, index) => {
    items.push({
      type: "image",
      url: imageUrl,
      filename: sanitizeFilename(`tiktok-image-${index + 1}.jpg`),
      quality: "Original image",
      source: "tikwm",
      experimental: true,
    });
  });

  return uniqueItems(items);
}

async function resolveViaTikwm(url) {
  const data = await fetchJson(
    `https://www.tikwm.com/api/?url=${encodeURIComponent(url.toString())}`,
    { timeoutMs: 10000 }
  );

  if (data?.code !== 0 && data?.msg) {
    throw new Error(data.msg);
  }

  const items = mediaFromTikwm(data, url);

  return {
    supported: true,
    meta: {
      title: data?.data?.title || "TikTok video",
      author: data?.data?.author?.nickname || data?.data?.author?.unique_id || "TikTok",
      platform: "TikTok",
    },
    items,
    fallback: items.length
      ? null
      : buildFallback("TikTok", url, "TikTok did not expose a downloadable file via free extractors."),
  };
}

function getHelperServices(url) {
  const encodedUrl = encodeURIComponent(url.toString());
  return [
    {
      name: "SSSTik",
      url: "https://ssstik.io/",
      label: "Open SSSTik",
    },
    {
      name: "SnapTik",
      url: "https://snaptik.app/en2",
      label: "Open SnapTik",
    },
    {
      name: "VidsSave",
      url: `https://www.vidssave.com/?url=${encodedUrl}`,
      label: "Open VidsSave",
    },
  ];
}

export async function resolveTikTok(url) {
  const videoId = getVideoId(url);
  const helpers = getHelperServices(url);

  try {
    const tikwm = await resolveViaTikwm(url);
    if (tikwm.items.length) {
      tikwm.helpers = helpers;
      return tikwm;
    }
  } catch {
    // Fall through to oEmbed/page scan.
  }

  try {
    if (videoId) {
      const data = await fetchJson(
        `https://www.tiktok.com/oembed?url=${encodeURIComponent(url.toString())}`
      );
      const scanned = await resolveFromPage(url, "TikTok", { scanBody: true }).catch(() => null);
      const items = uniqueItems(scanned?.items || []).map((item, index) => ({
        ...item,
        filename: sanitizeFilename(item.filename, `tiktok-${videoId || index + 1}.mp4`),
      }));

      return {
        supported: true,
        meta: {
          title: data?.title || scanned?.meta?.title || "TikTok video",
          author: data?.author_name || "TikTok",
          platform: "TikTok",
        },
        items,
        helpers,
        fallback: items.length
          ? null
          : buildFallback(
              "TikTok",
              url,
              "TikTok oEmbed is available, but no free extractor exposed a direct downloadable video file."
            ),
      };
    }
  } catch {
    // Fall through to page scan.
  }

  const result = await resolveFromPage(url, "TikTok", { scanBody: true });
  result.items = uniqueItems(result.items).map((item, index) => ({
    ...item,
    filename: sanitizeFilename(item.filename, `tiktok-${videoId || index + 1}.mp4`),
  }));
  result.helpers = helpers;

  return result;
}
