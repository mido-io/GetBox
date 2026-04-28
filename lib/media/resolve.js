import { getDirectMedia, getPlatform } from "./url.js";
import { resolveReddit } from "./reddit.js";
import { resolveFacebook } from "./extractors/facebook.js";
import { resolveInstagram } from "./extractors/instagram.js";
import { resolvePinterest } from "./extractors/pinterest.js";
import { resolveSoundCloud } from "./extractors/soundcloud.js";
import { resolveTikTok } from "./extractors/tiktok.js";
import { resolveTwitter } from "./extractors/twitter.js";
import { resolveYouTube } from "./extractors/youtube.js";

const EXTRACTORS = {
  reddit: resolveReddit,
  pinterest: resolvePinterest,
  twitter: resolveTwitter,
  tiktok: resolveTikTok,
  soundcloud: resolveSoundCloud,
  instagram: resolveInstagram,
  facebook: resolveFacebook,
  youtube: resolveYouTube,
};

export async function resolveMedia(url) {
  const direct = getDirectMedia(url);

  if (direct) {
    return {
      mode: "direct",
      meta: {
        title: direct.filename,
        author: url.hostname,
        platform: "Direct file",
      },
      items: [direct],
    };
  }

  const platform = getPlatform(url);
  const extractor = EXTRACTORS[platform];

  if (!extractor) {
    return {
      mode: "unsupported",
      meta: {
        title: "Unsupported URL",
        author: url.hostname,
        platform: "Unsupported",
      },
      items: [],
      fallback: {
        type: "open",
        url: url.toString(),
        label: "Open original URL",
        reason:
          "This host is not in GetBox's free extractor allowlist. Direct media links still work.",
      },
    };
  }

  const result = await extractor(url);

  return {
    mode: result.items?.length ? "resolved" : "fallback",
    ...result,
    items: result.items || [],
  };
}
