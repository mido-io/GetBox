// lib/downloader/extractors/imgur.js
import path from "path";
import { ExtractionError } from "../errors.js";

const CLIENT_ID = "546c25a59c58ad7"; // public anonymous client id; consider config

export default async function resolve(url, ctx) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    let id = parts[parts.length - 1];
    if (!id) throw new Error("Invalid Imgur URL");
    id = id.split(".")[0];
    const isAlbum = parts.includes("gallery") || parts.includes("a");
    const endpoint = `https://api.imgur.com/3/${isAlbum ? 'album' : 'image'}/${id}?client_id=${CLIENT_ID}`;
    const res = await ctx.http.get(endpoint);
    const data = res.data?.data;
    if (!data) throw new Error("No imgur data");
    const images = data.images || [data];
    const items = images.map(img => {
      const ext = path.extname(img.link) || ".jpg";
      return { type: img.type?.startsWith('video') ? 'video' : 'image', url: img.link, filename: `imgur-${img.id}${ext}` };
    });
    return { urls: items, meta: { title: data.title || 'Imgur', author: data.account_url } };
  } catch (e) {
    throw new ExtractionError(e.message, 'imgur');
  }
}
