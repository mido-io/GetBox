// lib/downloader/extractors/reddit.js
import { ExtractionError } from "../errors.js";

export default async function resolve(url, ctx) {
  try {
    const jsonUrl = `${url.replace(/\/$/, "")}.json`;
    const res = await ctx.http.get(jsonUrl);
    const data = res.data;
    if (!Array.isArray(data) || !data[0]?.data?.children?.[0]?.data) {
      throw new Error("Invalid reddit response");
    }
    const post = data[0].data.children[0].data;
    const items = [];

    if (post.is_gallery && post.media_metadata) {
      const gallery = post.gallery_data?.items || [];
      for (const g of gallery) {
        const meta = post.media_metadata[g.media_id];
        const u = meta?.s?.u || meta?.s?.gif;
        if (u) items.push({ type: "image", url: u.replace(/&amp;/g, "&"), filename: `reddit-${g.media_id}.jpg` });
      }
    } else if (post.is_video && post.media?.reddit_video?.fallback_url) {
      items.push({ type: "video", url: post.media.reddit_video.fallback_url.replace(/&amp;/g, "&"), filename: `reddit-${post.id}.mp4` });
    } else {
      const direct = (post.url_overridden_by_dest || post.url).replace(/&amp;/g,"&");
      const ext = direct.match(/\.(mp4|webm|mkv)$/i) ? 'video' : 'image';
      items.push({ type: ext === 'video' ? 'video':'image', url: direct, filename: `reddit-${post.id}.${ext==='video'?'mp4':'jpg'}` });
    }

    return { urls: items, meta: { title: post.title, author: post.author, platform: 'reddit' } };
  } catch (e) {
    throw new ExtractionError(e.message, "reddit");
  }
}
