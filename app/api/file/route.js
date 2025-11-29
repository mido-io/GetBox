
export const runtime = "nodejs";

import { isAllowedUrl } from "@/lib/server/ssrf.js";
import { rateLimit } from "@/lib/server/rateLimit.js";
import { sanitizeFilename } from "@/lib/downloader/utils.js";
import { getDownloadData } from "@/lib/server/cache.js";

export async function GET(req) {
  try {
    const ip =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "local";

    const limit = rateLimit(ip);
    if (!limit.ok)
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded" }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }
      );

    const params = new URL(req.url).searchParams;
    const id = params.get("id");

    let url, filename, userAgent, referer, cookie, headersObj;

    if (id) {
      const data = getDownloadData(id);
      if (!data)
        return new Response(
          JSON.stringify({ error: "Download link expired or invalid" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );

      ({ url, filename, userAgent, referer, cookie, headers: headersObj } =
        data);
    } else {
      url = params.get("url");
      filename = params.get("filename") || null;
      userAgent = params.get("userAgent") || null;
      referer = params.get("referer") || null;
      cookie = params.get("cookie") || null;
      headersObj = {};
    }

    if (!url)
      return new Response(JSON.stringify({ error: "url required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });

    if (!(await isAllowedUrl(url)))
      return new Response(
        JSON.stringify({ error: "URL blocked (SSRF protection)" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );

    const clientRange = req.headers.get("range");

    const upstreamHeaders = {
      "User-Agent":
        userAgent ||
        (headersObj && headersObj["User-Agent"]) ||
        "GetBox/1.0",
      "Accept-Encoding": "identity", // default behavior
    };

    if (referer) upstreamHeaders["Referer"] = referer;
    if (cookie) upstreamHeaders["Cookie"] = cookie;
    if (clientRange) upstreamHeaders["Range"] = clientRange;


    if (url.includes("tiktok.com") || url.includes("ttcdn")) {
      if (!upstreamHeaders["Referer"]) upstreamHeaders["Referer"] = "https://www.tiktok.com/";
      if (!upstreamHeaders["User-Agent"]) {
        upstreamHeaders["User-Agent"] =
          userAgent ||
          "Mozilla/5.0 (Linux; Android 11; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
      }

      // Allow gzip from TikTok CDN — required for video URLs
      delete upstreamHeaders["Accept-Encoding"];
    }

    const upstream = await fetch(url, {
      method: "GET",
      headers: upstreamHeaders,
    });

    if (!upstream.ok && upstream.status !== 206) {
      return new Response(
        JSON.stringify({ error: `Upstream returned ${upstream.status}` }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    // auto filename
    if (!filename) {
      const cd = upstream.headers.get("content-disposition");
      if (cd) {
        const m = cd.match(/filename\*?=.*''?([^;]+)/);
        if (m) filename = decodeURIComponent(m[1].replace(/['"]/g, ""));
      }
      if (!filename) {
        try {
          filename =
            new URL(url).pathname.split("/").pop() || "download";
        } catch {
          filename = "download";
        }
      }
    }

    filename = sanitizeFilename(filename);

    const resHeaders = new Headers(upstream.headers);
    resHeaders.set(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    resHeaders.set("X-Content-Type-Options", "nosniff");

    return new Response(upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    });
  } catch (err) {
    console.error("file proxy error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
