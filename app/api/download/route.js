export const runtime = "edge";

// Block SSRF targets: localhost, private ranges, metadata endpoints
const BLOCK_HOST =
  /^(localhost|127\.|0\.0\.0\.0|::1|169\.254\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/i;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mediaUrl = searchParams.get("url");
  const filename = (searchParams.get("filename") || "download")
    .replace(/[^\w.\- ]/g, "_")
    .slice(0, 200);

  if (!mediaUrl) {
    return new Response("Missing url", { status: 400 });
  }

  let parsed;
  try {
    parsed = new URL(mediaUrl);
  } catch {
    return new Response("Invalid URL", { status: 400 });
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return new Response("Blocked protocol", { status: 400 });
  }

  if (BLOCK_HOST.test(parsed.hostname)) {
    return new Response("Blocked host", { status: 400 });
  }

  let upstream;
  try {
    upstream = await fetch(mediaUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Referer": parsed.origin,
        "Accept": "*/*",
      },
    });
  } catch {
    return new Response("Failed to reach media server", { status: 502 });
  }

  if (!upstream.ok) {
    return new Response(`Upstream returned ${upstream.status}`, { status: 502 });
  }

  const contentType =
    upstream.headers.get("content-type") || "application/octet-stream";

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
