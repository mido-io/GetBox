import { getDirectMedia, sanitizeFilename, samePublicRedditPath } from "./url.js";

function decodeRedditUrl(value) {
  return typeof value === "string" ? value.replace(/&amp;/g, "&") : "";
}

function mediaTypeFromUrl(url) {
  return getDirectMedia(url)?.type || "image";
}

function getHelperServices(url) {
  const encodedUrl = encodeURIComponent(url.toString());
  return [
    {
      name: "RapidSave",
      url: "https://rapidsave.com/",
      label: "Open RapidSave",
    },
    {
      name: "Viddit",
      url: "https://viddit.red/",
      label: "Open Viddit",
    },
    {
      name: "VidsSave",
      url: `https://www.vidssave.com/?url=${encodedUrl}`,
      label: "Open VidsSave",
    },
  ];
}

export async function resolveReddit(url) {
  const endpoint = samePublicRedditPath(url);
  const helpers = getHelperServices(url);
  
  if (!endpoint) {
    return {
      supported: false,
      reason: "Paste a public reddit.com post URL. Short links are not expanded server-side.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8500);

  let response;
  try {
    response = await fetch(endpoint, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "GetBox/1.0 (+https://getbox.app)",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Reddit returned ${response.status}`);
  }

  const payload = await response.json();
  const post = payload?.[0]?.data?.children?.[0]?.data;

  if (!post) {
    throw new Error("No public Reddit post data found");
  }

  const source = post.crosspost_parent_list?.[0] || post;
  const items = [];

  if (source.is_gallery && source.media_metadata) {
    const gallery = source.gallery_data?.items || [];

    for (const entry of gallery) {
      const media = source.media_metadata[entry.media_id];
      const directUrl = decodeRedditUrl(media?.s?.u || media?.s?.gif);
      if (!directUrl) continue;

      const direct = getDirectMedia(directUrl);
      const extension = direct?.filename?.split(".").pop() || "jpg";

      items.push({
        type: direct?.type || mediaTypeFromUrl(directUrl),
        url: directUrl,
        filename: sanitizeFilename(`reddit-${entry.media_id}.${extension}`),
        quality: "Original",
        source: "reddit",
      });
    }
  }

  if (source.is_video && source.media?.reddit_video?.fallback_url) {
    const videoUrl = decodeRedditUrl(source.media.reddit_video.fallback_url);
    items.push({
      type: "video",
      url: videoUrl,
      filename: sanitizeFilename(`reddit-${source.id}.mp4`),
      quality: source.media.reddit_video.height
        ? `${source.media.reddit_video.height}p`
        : "Direct video",
      source: "reddit",
    });
  }

  if (!source.is_gallery && !source.is_video) {
    const directUrl = decodeRedditUrl(source.url_overridden_by_dest || source.url);
    const direct = getDirectMedia(directUrl);

    if (direct) {
      items.push({
        ...direct,
        filename: sanitizeFilename(`reddit-${source.id}-${direct.filename}`),
        source: "reddit",
      });
    }
  }

  return {
    supported: true,
    meta: {
      title: source.title || "Reddit media",
      author: source.author ? `u/${source.author}` : "Reddit",
      platform: "Reddit",
      thumbnail: source.thumbnail?.startsWith("http") ? source.thumbnail : null,
    },
    items,
    helpers,
  };
}
