
export const runtime = "nodejs";

import ffmpeg from "fluent-ffmpeg";
import { PassThrough } from "stream";
import { isAllowedUrl } from "@/lib/server/ssrf.js";
import { rateLimit } from "@/lib/server/rateLimit.js";
import { sanitizeFilename } from "@/lib/downloader/utils.js";
import { getDownloadData } from "@/lib/server/cache.js";
import { getFfmpegPath } from "@/lib/server/binaries.js";

ffmpeg.setFfmpegPath(getFfmpegPath());

export async function GET(req) {
  try {
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'local';
    const limit = rateLimit(ip);
    if (!limit.ok) return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: { 'Content-Type': 'application/json' } });

    const params = new URL(req.url).searchParams;
    const id = params.get('id');

    let url, filename, userAgent, referer, cookie, headersObj;

    if (id) {
      const data = getDownloadData(id);
      if (!data) return new Response(JSON.stringify({ error: 'Download link expired or invalid' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      ({ url, filename, userAgent, referer, cookie, headers: headersObj } = data);
    } else {
      url = params.get('url');
      filename = params.get('filename') || 'audio.mp3';
      userAgent = params.get('userAgent') || null;
      referer = params.get('referer') || null;
      cookie = params.get('cookie') || null;
      headersObj = {};
    }

    if (!url) return new Response(JSON.stringify({ error: 'Missing url' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    if (!await isAllowedUrl(url)) return new Response(JSON.stringify({ error: 'URL blocked (SSRF protection)' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    filename = sanitizeFilename(filename);
    if (!filename.endsWith('.mp3')) filename += '.mp3';

    const stream = new PassThrough();

    // Prepare ffmpeg headers block
    const ua = (headersObj && (headersObj['User-Agent'] || headersObj['user-agent'])) || userAgent || 'GetBox/1.0';
    let headersStr = `User-Agent: ${ua}\r\n`;
    if (referer) headersStr += `Referer: ${referer}\r\n`;
    if (cookie) headersStr += `Cookie: ${cookie}\r\n`;

    try {
      const command = ffmpeg(url)
        .inputOptions(['-headers', headersStr, '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5'])
        .noVideo()
        .format('mp3')
        .audioBitrate(192)
        .outputOptions(['-preset fast'])
        .on('start', cmd => console.log('Transcode started:', cmd))
        .on('error', (err) => {
          console.error('Transcode error:', err);
          if (!stream.destroyed) stream.destroy(err);
        })
        .on('end', () => {
          console.log('Transcode finished');
        })
        .pipe(stream);

      req.signal.addEventListener('abort', () => {
        console.log('Client aborted transcode request');
        try { command.kill('SIGKILL'); } catch (e) {}
        try { stream.destroy(); } catch (e) {}
      });

      const resHeaders = new Headers();
      resHeaders.set('Content-Type', 'audio/mpeg');
      resHeaders.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      resHeaders.set('X-Content-Type-Options', 'nosniff');

      return new Response(stream, { status: 200, headers: resHeaders });
    } catch (err) {
      console.error('Transcode setup error', err);
      return new Response(JSON.stringify({ error: err.message || 'FFmpeg error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

  } catch (err) {
    console.error("transcode error:", err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
