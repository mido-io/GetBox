// lib/downloader/extractors/instagram.js
import { ExtractionError } from "../errors.js";

const SHORTCODE = /(?:p|reel|tv)\/([A-Za-z0-9_-]+)/;

export default async function resolve(url, ctx) {
  try {
    const m = url.match(SHORTCODE);
    if (!m?.[1]) throw new Error('Shortcode not found');
    const shortcode = m[1];
    const vars = JSON.stringify({ shortcode });
    const params = new URLSearchParams({ doc_id: '8845758582119845', variables: vars });
    const res = await ctx.http.post("https://www.instagram.com/graphql/query", params, { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    const data = res.data?.data?.xdt_shortcode_media;
    if (!data) throw new Error('No media data found');
    // map media
    const items = [];
    function pushItem(node, idx = 0) {
      const isVideo = node.is_video;
      const url = isVideo ? node.video_url : node.display_url;

      if (url) {
        // Main Item (Video or Image)
        items.push({
          type: isVideo ? 'video' : 'image',
          url,
          filename: `instagram-${shortcode}${idx ? '-' + idx : ''}.${isVideo ? 'mp4' : 'jpg'}`,
          quality: 'High'
        });

        // If video, add Audio and Thumbnail
        if (isVideo) {
          // Audio
          items.push({
            type: 'audio',
            url,
            filename: `instagram-${shortcode}${idx ? '-' + idx : ''}.mp3`,
            quality: 'MP3 (Converted)',
            is_transcode: true
          });

          // Thumbnail (display_url is the thumb for videos)
          if (node.display_url) {
            items.push({
              type: 'image',
              url: node.display_url,
              filename: `instagram-${shortcode}${idx ? '-' + idx : ''}-thumb.jpg`,
              quality: 'Thumbnail'
            });
          }
        }
      }
    }
    const mediaItems = (data.edge_sidecar_to_children?.edges || []).map(e => e.node).filter(Boolean);
    if (mediaItems.length) mediaItems.forEach((n, i) => pushItem(n, i + 1));
    else pushItem(data, 0);
    return { urls: items, meta: { title: data.edge_media_to_caption?.edges?.[0]?.node?.text || "Instagram post", author: data.owner?.username } };
  } catch (e) {
    throw new ExtractionError(e.message, 'instagram');
  }
}
