
export const runtime = "nodejs";

import { resolve } from "@/lib/downloader/api.js";
import { rateLimit } from "@/lib/server/rateLimit.js";
import { isAllowedUrl } from "@/lib/server/ssrf.js";

export async function POST(req) {
  try {
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'local';
    const limit = rateLimit(ip);
    if (!limit.ok) return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: { 'Content-Type':'application/json' } });

    const body = await req.json();
    const url = body?.url;
    if (!url) return new Response(JSON.stringify({ error: 'URL required' }), { status: 400, headers: { 'Content-Type':'application/json' } });

    const allowed = await isAllowedUrl(url);
    if (!allowed) return new Response(JSON.stringify({ error: 'URL blocked (SSRF protection)' }), { status: 400, headers: { 'Content-Type':'application/json' } });

    const result = await resolve(url, {});
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error("download route error:", err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), { status: 500, headers: { 'Content-Type':'application/json' } });
  }
}
