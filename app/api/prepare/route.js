
export const runtime = "nodejs";

import { setDownloadData } from "@/lib/server/cache.js";
import { rateLimit } from "@/lib/server/rateLimit.js";

export async function POST(req) {
  try {
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'local';
    const limit = rateLimit(ip);
    if (!limit.ok) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const {
      url, filename, userAgent, referer, cookie,
      audioUrl, videoUrl, quality, type, headers
    } = body;

    if (!url && !videoUrl && !audioUrl) {
      return new Response(JSON.stringify({ error: 'Missing url/videoUrl/audioUrl' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 👇 هنا المهم: استخدم فقط ID الراجع من setDownloadData
    const id = setDownloadData({
      url: url || null,
      filename: filename || null,
      userAgent: userAgent || null,
      referer: referer || null,
      cookie: cookie || null,
      audioUrl: audioUrl || null,
      videoUrl: videoUrl || null,
      quality: quality || null,
      type: type || null,
      headers: headers || {}
    });

    return new Response(JSON.stringify({ id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error("Prepare download error:", err);
    return new Response(JSON.stringify({
      error: err.message || 'Internal error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
