# GetBox - Universal Media Downloader

GetBox is a powerful, full-stack media downloader built with Next.js. It allows users to extract and download video, audio, and images from popular social media platforms with a clean, modern interface.

## Architecture

```
[Client (Next.js)]  <-- JSON -->  [API Routes (/api/download)]
                                        |
                                  [Extractors]
                                  (yt-dlp, custom logic)
                                        |
                                  [Normalization]
                                        |
      -------------------------------------------------------
      |                         |                           |
[/api/file]               [/api/mux]                 [/api/transcode]
(Direct Stream)        (Merge Video+Audio)          (Convert to MP3)
```

## Features

-   **Universal Support**: Works with major platforms.
-   **Smart Processing**: Automatically merges separate video/audio streams (ffmpeg).
-   **Audio Conversion**: Converts HLS/m3u8 streams to MP3 on the fly.
-   **Metadata Preservation**: Retains original filenames, thumbnails, and author info.
-   **Privacy Focused**: Proxies all downloads to hide client IP from source.
-   **Rate Limiting**: Built-in protection against abuse.

## Supported Platforms

-   YouTube
-   TikTok (Watermark-free)
-   Instagram (Reels, Stories, Posts)
-   Facebook
-   Twitter / X
-   SoundCloud
-   Reddit
-   Pinterest
-   Imgur

## How It Works

1.  **Resolve**: The user pastes a URL. The backend identifies the platform and uses a specific extractor (or `yt-dlp` fallback) to find media URLs.
2.  **Prepare**: The client selects a format. The backend caches the target URL and headers (User-Agent, Cookies) to ensure access.
3.  **Download**:
    -   **Direct**: Streams raw files (e.g., images, simple MP4s).
    -   **Mux**: Uses FFmpeg to merge high-quality video (1080p+) with separate audio tracks.
    -   **Transcode**: Uses FFmpeg to convert streams (like SoundCloud m3u8) to standard MP3.

## Installation & Development

### Prerequisites
-   Node.js 18+
-   FFmpeg (installed and in system PATH)
-   Python 3 (for `yt-dlp`)

### Setup

1.  Clone the repository:
    ```bash
    git clone https://github.com/mido-io/GetBox.git
    cd getbox
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Run the development server:
    ```bash
    npm run dev
    ```

4.  Open [http://localhost:3000](http://localhost:3000) in your browser.

## Build

To create a production build:

```bash
npm run build
npm start
```


## Troubleshooting

-   **403 Forbidden**: Usually due to missing User-Agent/Cookies. The system handles this, but some platforms rotate keys.
-   **Empty Audio**: Ensure FFmpeg is installed correctly.
-   **Rate Limit**: The API limits requests by IP. Check `lib/server/rateLimit.js` to adjust.

## Contributing

Pull requests are welcome. Please ensure you do not break existing extractors.

1.  Fork the repo.
2.  Create a feature branch.
3.  Commit your changes.
4.  Push to the branch.
5.  Create a Pull Request.