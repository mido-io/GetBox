// lib/downloader/extractors/tiktok.js
import { ExtractionError } from "../errors.js";

const HYDRATION_REGEX = /__INIT_PROPS__\s*=\s*({.+})/;

export default async function resolve(url, ctx) {
  try {
    const res = await ctx.http.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    const html = res.data;

    let item;

    // Try new hydration method
    const hydrationMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([^<]+)<\/script>/);
    if (hydrationMatch) {
      try {
        const json = JSON.parse(hydrationMatch[1]);
        const scope = json.__DEFAULT_SCOPE__;
        const detail = scope['webapp.video-detail'];
        if (detail && detail.itemInfo && detail.itemInfo.itemStruct) {
          item = detail.itemInfo.itemStruct;
        }
      } catch (e) {
        // ignore parse error
      }
    }

    // Fallback to old SIGI_STATE if new method fails
    if (!item) {
      const match = html.match(/<script id="SIGI_STATE" type="application\/json">([\s\S]*?)<\/script>/);
      if (match) {
        const json = JSON.parse(match[1]);
        const itemModule = json.ItemModule && Object.values(json.ItemModule)[0];
        if (itemModule) {
          item = itemModule;
        }
      }
    }

    if (item) {
      const id = item.id;
      const urls = [];
      if (item.video && item.video.playAddr) {
        urls.push({ type: 'video', url: item.video.playAddr, filename: `tiktok-${id}.mp4`, quality: 'HD' });

        // Add Audio
        if (!item.music?.playUrl) {
          urls.push({ type: 'audio', url: item.video.playAddr, filename: `tiktok-${id}.mp3`, quality: 'MP3 (Converted)', is_transcode: true });
        }

        // Add Cover Image
        if (item.video.cover) {
          urls.push({ type: 'image', url: item.video.cover, filename: `tiktok-${id}-cover.jpg`, quality: 'Cover' });
        }
      }

      if (item.imagePost && item.imagePost.images) {
        item.imagePost.images.forEach((img, idx) => urls.push({ type: 'image', url: img.imageURL?.urlList?.[0], filename: `tiktok-${id}-${idx + 1}.jpg` }));
      }

      if (item.music?.playUrl) urls.push({ type: 'audio', url: item.music.playUrl, filename: `tiktok-${id}-audio.mp3`, quality: 'Original Audio' });

      if (urls.length) return { urls, meta: { title: item.desc || 'TikTok', author: item.author?.nickname } };
    }

    // fallback error
    throw new Error('Could not parse TikTok page');
  } catch (e) {
    throw new ExtractionError(e.message, 'tiktok');
  }
}
