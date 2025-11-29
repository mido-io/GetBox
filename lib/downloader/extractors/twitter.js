// lib/downloader/extractors/twitter.js
import { ExtractionError } from "../errors.js";
import path from "path";

const API_BASE = "https://api.vxtwitter.com";

export default async function resolve(url, ctx) {
  try {
    const u = new URL(url);
    const apiUrl = `${API_BASE}${u.pathname}`;
    try {
      const res = await ctx.http.get(apiUrl);
      const data = res.data;
      if (!data?.media_extended || !data.media_extended.length) throw new Error('No media');
      const items = [];
      data.media_extended.forEach((m, i) => {
        const ext = path.extname(new URL(m.url).pathname) || ".mp4";
        const isVideo = m.type === 'gif' || m.type === 'video';

        // Add Video/Image
        items.push({
          type: isVideo ? 'video' : 'image',
          url: m.url,
          filename: `twitter-${data.tweetID}-${i}${ext}`,
          quality: 'High'
        });

        // If video, add Audio and Thumbnail
        if (isVideo) {
          // Audio (Transcode)
          items.push({
            type: 'audio',
            url: m.url,
            filename: `twitter-${data.tweetID}-${i}.mp3`,
            quality: 'MP3 (Converted)',
            is_transcode: true
          });

          // Thumbnail
          if (m.thumbnail_url) {
            items.push({
              type: 'image',
              url: m.thumbnail_url,
              filename: `twitter-${data.tweetID}-${i}-thumb.jpg`,
              quality: 'Thumbnail'
            });
          }
        }
      });
      return { urls: items, meta: { title: data.text, author: `${data.user_name} (@${data.user_screen_name})` } };
    } catch (e) {
      // fallback to yt-dlp handled upstream in api.js fallback
      throw e;
    }
  } catch (e) {
    throw new ExtractionError(e.message, 'twitter');
  }
}
