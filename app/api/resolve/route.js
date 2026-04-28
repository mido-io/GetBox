import { resolveMedia } from "@/lib/media/resolve.js";
import { parseHttpUrl } from "@/lib/media/url.js";

export const runtime = "edge";

function json(body, init = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init.headers || {}),
    },
  });
}

export async function POST(req) {
  let body;

  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = parseHttpUrl(body?.url);

  if (!url) {
    return json({ error: "Paste a valid http or https URL." }, { status: 400 });
  }

  try {
    const result = await resolveMedia(url);
    return json(result);
  } catch (error) {
    return json(
      { error: error?.message || "Could not resolve this URL." },
      { status: 502 }
    );
  }
}
