import { buildFallback, sanitizeFilename, uniqueItems } from "../url.js";
import { fetchText } from "../http.js";
import { resolveFromPage } from "./generic.js";

const MAX_PLAYLIST_TRACKS = 50;

function extractClientId(html) {
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+\.js)["']/gi)]
    .map((match) => match[1])
    .filter((src) => src.includes("sndcdn.com") || src.includes("soundcloud.com"));

  return scripts.slice(-8);
}

async function findClientId(html) {
  for (const script of extractClientId(html)) {
    try {
      const js = await fetchText(script.startsWith("http") ? script : `https:${script}`, {
        timeoutMs: 5000,
        accept: "application/javascript,text/plain,*/*",
      });
      const clientId = js.match(/client_id["']?\s*[:=]\s*["']([a-zA-Z0-9_-]{20,})["']/)?.[1];
      if (clientId) return clientId;
    } catch {
      // Try next script.
    }
  }

  return null;
}

function getTrackTranscodings(track) {
  return track?.media?.transcodings || [];
}

function sortTranscodings(transcodings) {
  return [...transcodings].sort((a, b) => {
    const aProgressive = a?.format?.protocol === "progressive" ? 0 : 1;
    const bProgressive = b?.format?.protocol === "progressive" ? 0 : 1;
    return aProgressive - bProgressive;
  });
}

async function getPlayableStream(transcodings, clientId) {
  for (const transcoding of sortTranscodings(transcodings)) {
    if (!transcoding?.url) continue;

    try {
      const stream = JSON.parse(
        await fetchText(`${transcoding.url}?client_id=${clientId}`, {
          accept: "application/json,text/plain,*/*",
          timeoutMs: 6000,
        })
      );

      if (!stream?.url) continue;

      const protocol = transcoding?.format?.protocol || "stream";
      const isProgressive = protocol === "progressive";

      return {
        url: stream.url,
        protocol,
        extension: isProgressive ? "mp3" : "m3u8",
        quality: isProgressive ? "Progressive MP3" : "HLS stream",
      };
    } catch {
      // Some transcodings are geo-blocked, preview-only, or expired.
    }
  }

  return null;
}

async function trackToItem(track, clientId, index = 0, playlistTitle = "") {
  const stream = await getPlayableStream(getTrackTranscodings(track), clientId);
  if (!stream) return null;

  const trackNumber = String(index + 1).padStart(2, "0");
  const title = track?.title || `SoundCloud track ${trackNumber}`;
  const filenamePrefix = playlistTitle ? `${trackNumber} - ${title}` : title;

  return {
    type: "audio",
    url: stream.url,
    filename: sanitizeFilename(`${filenamePrefix}.${stream.extension}`),
    quality: stream.quality,
    source: "soundcloud",
    experimental: true,
    originalUrl: track?.permalink_url || null,
  };
}

async function resolveSoundCloudTrack(track, clientId) {
  const item = await trackToItem(track, clientId);

  return {
    supported: true,
    meta: {
      title: track?.title || "SoundCloud track",
      author: track?.user?.username || "SoundCloud",
      platform: "SoundCloud",
    },
    items: item ? [item] : [],
    fallback: item
      ? null
      : buildFallback("SoundCloud", new URL(track?.permalink_url || "https://soundcloud.com"), "This track did not expose a playable free stream URL."),
  };
}

async function resolveSoundCloudPlaylist(playlist, clientId, originalUrl) {
  const tracks = (playlist?.tracks || []).slice(0, MAX_PLAYLIST_TRACKS);
  const items = (
    await Promise.all(
      tracks.map((track, index) =>
        trackToItem(track, clientId, index, playlist?.title || "SoundCloud playlist")
      )
    )
  ).filter(Boolean);

  const skipped = tracks.length - items.length;
  const suffix =
    playlist?.track_count && playlist.track_count > MAX_PLAYLIST_TRACKS
      ? ` Showing the first ${MAX_PLAYLIST_TRACKS} tracks.`
      : "";

  return {
    supported: true,
    meta: {
      title: playlist?.title || "SoundCloud playlist",
      author: playlist?.user?.username || "SoundCloud",
      platform: "SoundCloud playlist",
    },
    items: uniqueItems(items),
    fallback:
      skipped || suffix
        ? buildFallback(
            "SoundCloud",
            originalUrl,
            `${items.length} playlist tracks exposed playable links. ${skipped} tracks were blocked or unavailable.${suffix}`.trim()
          )
        : null,
  };
}

function getHelperServices(url) {
  const encodedUrl = encodeURIComponent(url.toString());
  return [
    {
      name: "SCloudDownloader",
      url: "https://sclouddownloader.net/",
      label: "Open SCloudDownloader",
    },
    {
      name: "SoundCloudTo",
      url: "https://soundcloudto.com/",
      label: "Open SoundCloudTo",
    },
    {
      name: "VidsSave",
      url: `https://www.vidssave.com/?url=${encodedUrl}`,
      label: "Open VidsSave",
    },
  ];
}

export async function resolveSoundCloud(url) {
  const html = await fetchText(url.toString());
  const scanned = await resolveFromPage(url, "SoundCloud", { scanBody: false }).catch(() => null);
  const clientId = await findClientId(html);
  const helpers = getHelperServices(url);

  if (!clientId) {
    return {
      supported: true,
      meta: scanned?.meta || { title: "SoundCloud track", author: "SoundCloud", platform: "SoundCloud" },
      items: scanned?.items || [],
      helpers,
      fallback: buildFallback(
        "SoundCloud",
        url,
        "SoundCloud did not expose a free public client id for stream resolution."
      ),
    };
  }

  try {
    const resolvedText = await fetchText(
      `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(url.toString())}&client_id=${clientId}`,
      { accept: "application/json,text/plain,*/*" }
    );
    const resolved = JSON.parse(resolvedText);

    if (Array.isArray(resolved?.tracks)) {
      const playlistResult = await resolveSoundCloudPlaylist(resolved, clientId, url);
      playlistResult.helpers = helpers;
      return playlistResult;
    }

    const trackResult = await resolveSoundCloudTrack(resolved, clientId);
    trackResult.helpers = helpers;
    return trackResult;
  } catch {
    return {
      supported: true,
      meta: scanned?.meta || { title: "SoundCloud track", author: "SoundCloud", platform: "SoundCloud" },
      items: scanned?.items || [],
      helpers,
      fallback: buildFallback("SoundCloud", url, "SoundCloud stream resolution failed."),
    };
  }
}
