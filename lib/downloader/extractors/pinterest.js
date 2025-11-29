// lib/downloader/extractors/pinterest.js
import { ExtractionError } from "../errors.js";

const API_URL = "https://getindevice.com/wp-json/aio-dl/video-data/";

export default async function resolve(url, ctx) {
  try {
    const token = Buffer.from(String(Math.random())).toString('base64').slice(0,16);
    const params = new URLSearchParams({ url, token });
    const res = await ctx.http.post(API_URL, params.toString(), { headers: { "Content-Type":"application/x-www-form-urlencoded", Referer: "https://getindevice.com/pinterest-video-downloader/" }});
    const data = res.data;
    if (!data?.medias || !data.medias.length) throw new Error('No media');
    const media = data.medias.find(m=>m.videoAvailable) || data.medias[0];
    const isVideo = media.extension === 'mp4' || media.url.includes('.mp4');
    return { urls: [{ type: isVideo ? 'video':'image', url: media.url, filename: `pin-${Date.now()}.${media.extension || (isVideo?'mp4':'jpg')}` }], meta: { title: data.title || 'Pinterest' } };
  } catch (e) {
    throw new ExtractionError(e.message, 'pinterest');
  }
}
