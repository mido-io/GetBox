// lib/downloader/extractors/soundcloud.js
import { ExtractionError } from "../errors.js";

const API_URL = "https://postsyncer.com/api/social-media-downloader";
const PAGE_URL = "https://postsyncer.com/tools/soundcloud-downloader";

export default async function resolve(url, ctx) {
  try {
    const page = await ctx.http.get(PAGE_URL);
    const token = (page.data.match(/name="csrf-token" content="([^"]+)"/) || [])[1];
    if (!token) throw new Error('No csrf token');
    const setCookies = page.headers['set-cookie'] || [];
    const cookieString = setCookies.map(c => c.split(';')[0]).join('; ');
    const res = await ctx.http.post(API_URL, JSON.stringify({ url, platform: "soundcloud" }), {
      headers: { "content-type": "application/json", referer: PAGE_URL, "x-csrf-token": token, cookie: cookieString }
    });
    const data = res.data;
    if (!data || !data.medias) throw new Error('No data from API');
    const items = (data.medias.audios || []).map(a => ({ type: 'audio', url: a.url, filename: `${data.title || 'sound'}.mp3`, quality: a.quality || '128kbps', is_transcode: true }));

    // Add Artwork
    if (data.thumbnail || data.cover) {
      items.push({
        type: 'image',
        url: data.thumbnail || data.cover,
        filename: `${data.title || 'sound'}-cover.jpg`,
        quality: 'Artwork'
      });
    }
    if (items.length) return { urls: items, meta: { title: data.title, author: data.author } };
    throw new Error('No audio found');
  } catch (e) {
    throw new ExtractionError(e.message, 'soundcloud');
  }
}
