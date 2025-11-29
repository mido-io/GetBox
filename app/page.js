"use client";

import { useState } from "react";
import { LuBox, LuVideo, LuMusic, LuImage } from "react-icons/lu";
import styles from "./page.module.css";

const icons = {
  box: <LuBox size={28} />,
  video: <LuVideo size={18} />,
  audio: <LuMusic size={18} />,
  image: <LuImage size={18} />,
};

// Animated Box Component
function AnimatedBox({ size = 26, spinning = false }) {
  return (
    <div
      style={{
        display: "inline-flex",
        animation: spinning ? "spin 1s linear infinite" : "none",
      }}
    >
      <LuBox size={size} />
    </div>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [selectedMedia, setSelectedMedia] = useState("video");
  const [downloadingId, setDownloadingId] = useState(null);

  async function handleResolve() {
    if (!url) return;
    setLoading(true);
    setData(null);

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const json = await res.json();
      if (json.error) {
        alert("Error: " + json.error);
        return;
      }

      const videos = (json.urls || []).filter((u) => u.type === "video");
      const audios = (json.urls || []).filter((u) => u.type === "audio");
      const images = (json.urls || []).filter((u) => u.type === "image");

      const processed = {
        meta: json.meta || {},
        mediaTypes: { video: videos, audio: audios, image: images },
      };

      setData(processed);

      if (videos.length) setSelectedMedia("video");
      else if (audios.length) setSelectedMedia("audio");
      else if (images.length) setSelectedMedia("image");
    } catch (e) {
      console.error(e);
      alert("Failed to resolve URL");
    } finally {
      setLoading(false);
    }
  }

  const handleDownload = async (item, key) => {
    try {
      setDownloadingId(key);

      const prepareBody = {
        url: item.url,
        filename: item.filename || "download",
        userAgent: item.userAgent,
        referer: item.referer,
        cookie: item.cookie,
        headers: item.headers,
        quality: item.quality,
        type: item.type,
      };

      if (item.type === "video") {
        prepareBody.videoUrl = item.url;

        if (item.is_muted) {
          let audioSource =
            item.audio_source_url ||
            (data?.mediaTypes?.audio?.length
              ? data.mediaTypes.audio[0].url
              : null);

          if (!audioSource) audioSource = item.url;

          prepareBody.audioUrl = audioSource;
        }
      }

      const res = await fetch("/api/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prepareBody),
      });

      if (!res.ok) throw new Error("Failed to prepare download");

      const { id } = await res.json();

      let href = `/api/file?id=${id}`;

      if (item.type === "video" && item.is_muted && prepareBody.audioUrl) {
        href = `/api/mux?id=${id}`;
      } else if (item.type === "audio") {
        href = item.is_transcode
          ? `/api/transcode?id=${id}`
          : `/api/file?id=${id}`;
      }

      const a = document.createElement("a");
      a.target = "_blank";
      a.href = href;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("Download failed:", err);
      alert("Download failed to start");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <main className={styles.main}>
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>

      <div className={styles.container}>
        {/* Branding */}
        <div className={styles.branding}>
          <div className={styles.logoWrapper}>{icons.box}</div>
          <div>
            <div className={styles.title}>GetBox</div>
            <div className={styles.small}>Fast & Light Media Downloader</div>
          </div>
        </div>

        {/* Input */}
        <div className={styles.inputRow}>
          <input
            className={styles.input}
            placeholder="Paste URL here..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleResolve()}
          />
          <button className={styles.button} onClick={handleResolve} disabled={loading}>
            {loading ? <AnimatedBox spinning size={26} /> : <AnimatedBox size={26} />}
          </button>
        </div>

        {data && (
          <div className={styles.results}>
            {/* Meta */}
            <div
              style={{
                display: "flex",
                gap: 16,
                marginTop: 12,
                alignItems: "center",
              }}
            >
              {data.meta.thumbnail && (
                <img src={data.meta.thumbnail} alt="thumb" className={styles.thumbnail} />
              )}
              <div>
                <h2 className={styles.metaTitle}>{data.meta.title || "Untitled"}</h2>
                <p className={styles.small}>{data.meta.author || ""}</p>
              </div>
            </div>

            {/* Tabs */}
            <div className={styles.tabs}>
              <button
                className={`${styles.tab} ${
                  selectedMedia === "video" ? styles.active : ""
                }`}
                onClick={() => setSelectedMedia("video")}
              >
                {icons.video} Video
              </button>
              <button
                className={`${styles.tab} ${
                  selectedMedia === "audio" ? styles.active : ""
                }`}
                onClick={() => setSelectedMedia("audio")}
              >
                {icons.audio} Audio
              </button>
              <button
                className={`${styles.tab} ${
                  selectedMedia === "image" ? styles.active : ""
                }`}
                onClick={() => setSelectedMedia("image")}
              >
                {icons.image} Image
              </button>
            </div>

            {/* Quality List */}
            <div className={styles.qualityList}>
              {(data.mediaTypes[selectedMedia] || []).length === 0 && (
                <div className={styles.emptyState}>No {selectedMedia} found.</div>
              )}

              {(data.mediaTypes[selectedMedia] || []).map((item, i) => (
                <div className={styles.qualityItem} key={i}>
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {item.quality || "Standard"}
                    </div>
                    <div className={styles.small}>{item.filename}</div>
                  </div>

                  <button
                    className={styles.button}
                    onClick={() => handleDownload(item, i)}
                  >
                    <AnimatedBox spinning={downloadingId === i} size={22} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
