import { resolveFromPage } from "./generic.js";

function getHelperServices(url) {
  const encodedUrl = encodeURIComponent(url.toString());
  return [
    {
      name: "PinterestDownloader",
      url: "https://pinterestdownloader.com/",
      label: "Open PinterestDownloader",
    },
    {
      name: "BotDownloader",
      url: "https://botdownloader.com/pinterest-video-downloader",
      label: "Open BotDownloader",
    },
    {
      name: "VidsSave",
      url: `https://www.vidssave.com/?url=${encodedUrl}`,
      label: "Open VidsSave",
    },
  ];
}

export async function resolvePinterest(url) {
  const result = await resolveFromPage(url, "Pinterest", { scanBody: true });
  return {
    ...result,
    helpers: getHelperServices(url),
  };
}
