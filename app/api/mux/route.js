
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

    let videoUrl, audioUrl, filename, userAgent, referer, cookie, headersObj;

    if (id) {
      const data = getDownloadData(id);
      if (!data) return new Response(JSON.stringify({ error: 'Download link expired or invalid' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      ({ videoUrl, audioUrl, filename, userAgent, referer, cookie, headers: headersObj } = data);
      if (!videoUrl) videoUrl = data.url;
      if (!audioUrl) audioUrl = data.audioUrl;
    } else {
      videoUrl = params.get('videoUrl');
      audioUrl = params.get('audioUrl');
      filename = params.get('filename') || 'video.mp4';
      userAgent = params.get('userAgent') || 'Mozilla/5.0';
      referer = params.get('referer') || null;
      cookie = params.get('cookie') || null;
      headersObj = {};
    }

    if (!videoUrl || !audioUrl) {
      return new Response(JSON.stringify({ error: 'Missing videoUrl or audioUrl' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (!await isAllowedUrl(videoUrl) || !await isAllowedUrl(audioUrl)) {
      return new Response(JSON.stringify({ error: 'URL blocked (SSRF protection)' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    filename = sanitizeFilename(filename);
    if (!filename.endsWith('.mp4')) filename += '.mp4';

    const stream = new PassThrough();

    // Build per-input header blocks to give ffmpeg correctly
    // If the cached headers object contains per-source overrides (videoHeaders/audioHeaders), prefer them.
    const makeHeadersBlock = (overrideHeaders = {}) => {
      const ua = overrideHeaders['User-Agent'] || overrideHeaders['user-agent'] || userAgent || 'GetBox/1.0';
      const ref = overrideHeaders['Referer'] || overrideHeaders['referer'] || referer || '';
      const ck = overrideHeaders['Cookie'] || overrideHeaders['cookie'] || cookie || '';
      let s = `User-Agent: ${ua}\r\n`;
      if (ref) s += `Referer: ${ref}\r\n`;
      if (ck) s += `Cookie: ${ck}\r\n`;
      return s;
    };

    const videoHeadersBlock = makeHeadersBlock((headersObj && headersObj.video) || headersObj || {});
    const audioHeadersBlock = makeHeadersBlock((headersObj && headersObj.audio) || headersObj || {});

    // ffmpeg: input video with its headers, then audio with its headers
    const command = ffmpeg()
      .input(videoUrl)
      .inputOptions([
        '-headers', videoHeadersBlock,
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5'
      ])
      .input(audioUrl)
      .inputOptions([
        '-headers', audioHeadersBlock,
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5'
      ])
      .outputOptions([
        '-c:v copy',
        '-c:a aac',
        '-movflags frag_keyframe+empty_moov+default_base_moof',
        '-preset fast'
      ])
      .format('mp4')
      .on('start', cmd => console.log('Mux started:', cmd))
      .on('error', (err) => {
        console.error('Mux error:', err);
        if (!stream.destroyed) stream.destroy(err);
      })
      .on('end', () => {
        console.log('Mux finished');
      })
      .pipe(stream, { end: true });

    // abort handling
    req.signal.addEventListener('abort', () => {
      console.log('Client aborted mux request');
      try { command.kill('SIGKILL'); } catch (e) { }
      try { stream.destroy(); } catch (e) { }
    });

    const resHeaders = new Headers();
    resHeaders.set('Content-Type', 'video/mp4');
    resHeaders.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    resHeaders.set('X-Content-Type-Options', 'nosniff');

    return new Response(stream, { status: 200, headers: resHeaders });

  } catch (err) {
    console.error("mux error:", err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
