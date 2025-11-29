import { execFile } from "child_process";
import { promisify } from "util";
import { ExtractionError } from "../errors.js";
import { getYtDlpPath, getFfmpegPath } from "@/lib/server/binaries.js";
import fs from "fs";

const execFileAsync = promisify(execFile);

/**
 * Loads cookies from ENV (YTDLP_COOKIES)
 * Render / Railway treat it as a plain text env var.
 */
function loadCookies() {
  const raw = process.env.YTDLP_COOKIES;

  if (!raw || raw.trim().length < 5) return null;

  // Write cookies to a temp file during runtime
  const path = "/tmp/ytdlp_cookies.txt";
  try {
    fs.writeFileSync(path, raw, "utf8");
    return path;
  } catch (err) {
    console.error("Failed to write cookies:", err);
    return null;
  }
}

async function resolveWithYtDlp(url) {
  try {
    const binary = getYtDlpPath();
    const ffmpegPath = getFfmpegPath();
    const cookiePath = loadCookies();

    const args = [
      url,
      "--dump-single-json",
      "--no-warnings",
      "--prefer-free-formats",
      "--ffmpeg-location", ffmpegPath
    ];

    if (cookiePath) {
      args.push("--cookies", cookiePath);
    }

    console.log("Starting yt-dlp:", binary, args.join(" "));

    const { stdout } = await execFileAsync(binary, args, {
      maxBuffer: 1024 * 1024 * 10
    });

    const output = JSON.parse(stdout);
    const formats = output.formats || [];
    const title = output.title || "video";

    let bestAudio = formats.find(f => f.acodec !== "none" && f.vcodec === "none");
    if (!bestAudio) bestAudio = formats.find(f => f.acodec !== "none");

    const items = formats
      .filter(f => f.url)
      .map(f => {
        const isVideo = f.vcodec && f.vcodec !== "none";
        const isAudio = !isVideo && f.acodec && f.acodec !== "none";
        const isMuted = isVideo && !isAudio;

        let audioSourceUrl = null;
        if (isMuted && bestAudio) audioSourceUrl = bestAudio.url;

        return {
          type: isAudio ? "audio" : "video",
          url: f.url,
          filename: `${title}.${f.ext || "mp4"}`,
          quality: isVideo ? (f.format_note || `${f.height}p`) : `${Math.round(f.abr || 0)}kbps`,
          is_muted: isMuted,
          audio_source_url: audioSourceUrl,
          height: f.height,
          abr: f.abr || 0,
          ext: f.ext,
          fps: f.fps || 0
        };
      });


    const uniqueVideos = [];
    const seenRes = new Set();
    const sortedVideos = items
      .filter(i => i.type === "video")
      .sort((a, b) =>
        (b.height || 0) - (a.height || 0) ||
        (b.fps || 0) - (a.fps || 0) ||
        (a.ext === "mp4" ? -1 : 1)
      );

    for (const v of sortedVideos) {
      const key = `${v.height}`;
      if (!seenRes.has(key)) {
        seenRes.add(key);
        uniqueVideos.push(v);
      }
    }


    const uniqueAudios = [];
    const seenBit = new Set();
    const sortedAudios = items
      .filter(i => i.type === "audio")
      .sort((a, b) => b.abr - a.abr);

    for (const a of sortedAudios) {
      const rounded = Math.round(a.abr / 10) * 10;
      if (!seenBit.has(rounded)) {
        seenBit.add(rounded);
        uniqueAudios.push(a);
      }
    }


    if (bestAudio) {
      uniqueAudios.unshift({
        type: "audio",
        url: bestAudio.url,
        filename: `${title}.mp3`,
        quality: "MP3 (Converted)",
        is_transcode: true
      });
    }

    const httpHeaders = output.http_headers || {};
    const ua = httpHeaders["User-Agent"];
    const ref = httpHeaders["Referer"];
    const cook = httpHeaders["Cookie"];

    const finalItems = [...uniqueVideos, ...uniqueAudios].map(item => ({
      ...item,
      userAgent: ua,
      referer: ref,
      cookie: cook,
      headers: httpHeaders,
      duration: output.duration,
      thumbnail: output.thumbnail
    }));

    if (output.thumbnail) {
      finalItems.push({
        type: "image",
        url: output.thumbnail,
        filename: `${title}.jpg`,
        quality: "Thumbnail",
        userAgent: ua,
        referer: ref,
        cookie: cook,
        headers: httpHeaders
      });
    }

    return {
      urls: finalItems,
      meta: {
        title,
        author: output.uploader,
        thumbnail: output.thumbnail,
        duration: output.duration,
        platform: "youtube"
      }
    };

  } catch (err) {
    console.error("yt-dlp error:", err);
    throw new ExtractionError(err.message || "yt-dlp failed", "youtube");
  }
}

export default async function resolve(url) {
  return await resolveWithYtDlp(url);
}
