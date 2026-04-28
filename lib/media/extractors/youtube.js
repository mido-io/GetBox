import { buildFallback, sanitizeFilename, uniqueItems } from "../url.js";
import { fetchJson, fetchText } from "../http.js";
import { resolveFromPage } from "./generic.js";

function getVideoId(url) {
  // Handle various YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.pathname.match(pattern) || url.search.match(pattern) || url.href.match(pattern);
    if (match) return match[1];
  }

  return null;
}

function getVideoTitle(videoId) {
  return sanitizeFilename(`youtube-${videoId}`);
}

// Helper service options for fallback
function getHelperServices(videoId) {
  const videoUrl = encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`);
  return [
    {
      name: "ssyoutube",
      url: `https://www.ssyoutube.com/watch?v=${videoId}`,
      label: "Open ssyoutube downloader",
    },
    {
      name: "savefrom",
      url: `https://en1.savefrom.net/17Bb/#url=https://www.youtube.com/watch?v=${videoId}`,
      label: "Open SaveFrom.net",
    },
    {
      name: "vidssave",
      url: `https://www.vidssave.com/?url=${videoUrl}`,
      label: "Open VidsSave",
    },
  ];
}

async function tryInvidious(videoId) {
  // Try Invidious instances (open-source YouTube frontend)
  const instances = [
    "https://invidious.io",
    "https://inv.riverside.rocks",
    "https://invidious.nerdvpn.de",
    "https://invidious.slipfox.xyz",
  ];

  for (const instance of instances) {
    try {
      const data = await fetchJson(`${instance}/api/v1/videos/${videoId}?fields=title,formatStreams`, {
        timeoutMs: 5000,
      });

      if (data?.formatStreams?.length) {
        const streams = data.formatStreams
          .filter((stream) => stream.type?.includes("video/mp4") && stream.url)
          .sort((a, b) => {
            const aQuality = parseInt(a.qualityLabel) || 0;
            const bQuality = parseInt(b.qualityLabel) || 0;
            return bQuality - aQuality; // Highest quality first
          });

        if (streams.length) {
          return {
            title: data.title || getVideoTitle(videoId),
            videos: streams.slice(0, 3).map((stream, index) => ({
              type: "video",
              url: stream.url,
              filename: sanitizeFilename(`youtube-${videoId}-${stream.qualityLabel || index + 1}.mp4`),
              quality: stream.qualityLabel || `Quality ${index + 1}`,
              source: "invidious",
            })),
          };
        }
      }
    } catch {
      // Try next instance
    }
  }

  return null;
}

async function tryNobsYoutube(videoId) {
  // Try NOBS YouTube API
  try {
    const data = await fetchJson(`https://nobs.dev/api/videos/${videoId}`, {
      timeoutMs: 5000,
    });

    if (data?.download_urls?.length) {
      const videos = data.download_urls
        .filter((url) => url.mime_type?.includes("video"))
        .sort((a, b) => (b.quality_label || "").localeCompare(a.quality_label || ""))
        .slice(0, 3)
        .map((url, index) => ({
          type: "video",
          url: url.url,
          filename: sanitizeFilename(`youtube-${videoId}-${url.quality_label || index + 1}.mp4`),
          quality: url.quality_label || `Quality ${index + 1}`,
          source: "nobs",
        }));

      if (videos.length) {
        return {
          title: data.title || getVideoTitle(videoId),
          videos,
        };
      }
    }
  } catch {
    // Continue to next method
  }

  return null;
}

async function tryApiMaestro(videoId) {
  // Try API Maestro
  try {
    const data = await fetchJson(`https://www.api-maestro.com/api/video-info?url=https://www.youtube.com/watch?v=${videoId}`, {
      timeoutMs: 5000,
    });

    if (data?.video_url) {
      return {
        title: data.title || getVideoTitle(videoId),
        videos: [
          {
            type: "video",
            url: data.video_url,
            filename: sanitizeFilename(`youtube-${videoId}.mp4`),
            quality: "Available quality",
            source: "api-maestro",
          },
        ],
      };
    }
  } catch {
    // Continue to next method
  }

  return null;
}

export async function resolveYouTube(url) {
  const videoId = getVideoId(url);

  if (!videoId) {
    return {
      supported: true,
      meta: { title: "YouTube Video", author: "YouTube", platform: "YouTube" },
      items: [],
      fallback: buildFallback("YouTube", url, "Paste a valid YouTube video URL (youtube.com/watch?v=... or youtu.be/...)"),
    };
  }

  const attempts = [
    () => tryInvidious(videoId),
    () => tryNobsYoutube(videoId),
    () => tryApiMaestro(videoId),
  ];

  let result = null;

  // Try each API method in sequence
  for (const attempt of attempts) {
    try {
      result = await attempt();
      if (result?.videos?.length) {
        break;
      }
    } catch {
      // Try next method
    }
  }

  const items = result?.videos ? uniqueItems(result.videos) : [];
  const helpers = getHelperServices(videoId);

  if (items.length) {
    return {
      supported: true,
      meta: {
        title: result.title,
        author: "YouTube",
        platform: "YouTube",
      },
      items,
      helpers,
    };
  }

  // Fallback to helper services
  return {
    supported: true,
    meta: { title: "YouTube Video", author: "YouTube", platform: "YouTube" },
    items: [],
    helpers,
    fallback: {
      type: "helper",
      helpers,
      url: url.toString(),
      label: "Download via helper service",
      reason:
        "YouTube protects video downloads. Use a trusted helper service below to download this video. All services are free and work directly in your browser.",
    },
  };
}
