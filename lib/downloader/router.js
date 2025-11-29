
const routes = [
  [/^instagram\.com$/, () => import("./extractors/instagram.js")],
  [/^tiktok\.com$/, () => import("./extractors/tiktok.js")],
  [/^(facebook|fb)\.com$/, () => import("./extractors/facebook.js")],
  [/^(twitter\.com|x\.com)$/, () => import("./extractors/twitter.js")],
  [/^(youtube\.com|youtu\.be)$/, () => import("./extractors/youtube.js")],
  [/^(reddit\.com|redd\.it)$/, () => import("./extractors/reddit.js")],
  [/^(i\.)?imgur\.com$/, () => import("./extractors/imgur.js")],
  [/^(?:[a-z]{2}\.)?pinterest\.com$/, () => import("./extractors/pinterest.js")],
  [/^soundcloud\.com$/, () => import("./extractors/soundcloud.js")],
];

export async function route(url) {
  const hostname = new URL(url).hostname.replace(/^www\./, "");
  for (const [pattern, loader] of routes) {
    if (pattern.test(hostname)) {
      const mod = await loader();
      return mod.default;
    }
  }
  return null;
}
