import { execFile } from "child_process";
import { promisify } from "util";
import { ExtractionError } from "../errors.js";
import { getYtDlpPath, getFfmpegPath } from "@/lib/server/binaries.js";

const execFileAsync = promisify(execFile);

async function resolveWithYtDlp(url) {
  try {
    const binary = getYtDlpPath();
    const ffmpegPath = getFfmpegPath();
    const args = [
      url,
      '--dump-single-json',
      '--no-warnings',
      '--no-call-home',
      '--prefer-free-formats',
      '--ffmpeg-location',
      ffmpegPath
    ];

    console.log("Starting yt-dlp for:", url);

    // Increase buffer for large JSON output
    const { stdout } = await execFileAsync(binary, args, { maxBuffer: 1024 * 1024 * 10 });
    const output = JSON.parse(stdout);

    const formats = output.formats || [];
    const title = output.title || "video";

    // Find best audio source: prefer audio-only, fallback to video+audio
    let bestAudio = formats.find(f => f.acodec !== 'none' && f.vcodec === 'none');
    if (!bestAudio) {
      bestAudio = formats.find(f => f.acodec !== 'none');
    }

    const items = formats
      .filter(f => f.url && f.ext !== 'mhtml' && f.ext !== '3gp')
      .map(f => {
        const isVideo = f.vcodec && f.vcodec !== 'none';
        const isAudio = !isVideo && f.acodec && f.acodec !== 'none';
        const isMuted = isVideo && !isAudio;

        // Determine audio source for muted videos
        let audioSourceUrl = null;
        if (isMuted) {
          if (bestAudio) audioSourceUrl = bestAudio.url;
          else if (f.url) audioSourceUrl = f.url; // Fallback: try to use itself if it might have audio hidden or just fail gracefully later
        }

        return {
          type: isAudio ? "audio" : (isVideo ? "video" : "video"),
          url: f.url,
          filename: `${title}.${f.ext || 'mp4'}`,
          quality: isVideo ? (f.format_note || `${f.height || 'unknown'}p`) : `${Math.round(f.abr || 0)}kbps`,
          is_muted: isMuted,
          audio_source_url: audioSourceUrl,
          height: f.height,
          abr: f.abr || 0,
          ext: f.ext,
          fps: f.fps || 0
        };
      });

    // Deduplicate Videos: Keep best bitrate/format for each resolution
    const uniqueVideos = [];
    const seenResolutions = new Set();

    // Sort by height desc, then fps desc, then preference for mp4
    const sortedVideos = items.filter(i => i.type === 'video').sort((a, b) => {
      const hDiff = (b.height || 0) - (a.height || 0);
      if (hDiff !== 0) return hDiff;
      const fpsDiff = (b.fps || 0) - (a.fps || 0);
      if (fpsDiff !== 0) return fpsDiff;
      return (a.ext === 'mp4' ? -1 : 1);
    });

    for (const v of sortedVideos) {
      const key = `${v.height}p`;
      if (!seenResolutions.has(key)) {
        seenResolutions.add(key);
        uniqueVideos.push(v);
      }
    }

    // Deduplicate Audios: Keep best bitrate
    const uniqueAudios = [];
    const seenAudioQualities = new Set();
    const sortedAudios = items.filter(i => i.type === 'audio').sort((a, b) => b.abr - a.abr);

    for (const a of sortedAudios) {
      // Group roughly by bitrate to avoid 128k vs 129k duplicates
      const rounded = Math.round(a.abr / 10) * 10;
      if (!seenAudioQualities.has(rounded)) {
        seenAudioQualities.add(rounded);
        uniqueAudios.push(a);
      }
    }

    // Add MP3 option if we have any audio source (even from video)
    if (bestAudio) {
      uniqueAudios.unshift({
        type: "audio",
        url: bestAudio.url,
        filename: `${title}.mp3`,
        quality: "MP3 (Converted)",
        is_transcode: true,
        format: "mp3"
      });
    }

    const httpHeaders = output.http_headers || {};
    const userAgent = httpHeaders['User-Agent'] || httpHeaders['user-agent'];
    const referer = httpHeaders['Referer'] || httpHeaders['referer'];
    const cookie = httpHeaders['Cookie'] || httpHeaders['cookie'];

    const finalItems = [...uniqueVideos, ...uniqueAudios].map(item => ({
      ...item,
      userAgent,
      referer,
      cookie,
      headers: httpHeaders, // Store full headers just in case
      duration: output.duration,
      thumbnail: output.thumbnail
    }));

    if (output.thumbnail) {
      finalItems.push({
        type: "image",
        url: output.thumbnail,
        filename: `${title}.jpg`,
        quality: "Thumbnail",
        userAgent,
        referer,
        cookie,
        headers: httpHeaders
      });
    }

    return {
      urls: finalItems,
      meta: { title, author: output.uploader, thumbnail: output.thumbnail, duration: output.duration, platform: "youtube" }
    };
  } catch (e) {
    console.error("yt-dlp error:", e);
    throw new ExtractionError(e.message || "yt-dlp failed", "youtube");
  }
}

export default async function resolve(url, ctx) {
  return await resolveWithYtDlp(url);
}
