"use client";

import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import {
  LuArrowDownToLine,
  LuBox,
  LuCircleAlert,
  LuClipboard,
  LuExternalLink,
  LuImage,
  LuLink,
  LuMusic,
  LuCopy,
  LuVideo,
  LuX,
  LuYoutube,
  LuTwitter,
  LuInstagram,
  LuFacebook,
  LuMessageCircle,
  LuSmartphone,
  LuMonitor,
  LuShare,
  LuApple,
} from "./icons";
import styles from "./page.module.css";

const TYPE_ICON = {
  video: LuVideo,
  audio: LuMusic,
  image: LuImage,
};

const PLATFORM_ICON = {
  "Direct file": LuBox,
  "Instagram": LuInstagram,
  "Instagram Reel": LuInstagram,
  "X": LuTwitter,
  "Twitter": LuTwitter,
  "Reddit": LuMessageCircle,
  "TikTok": LuBox,
  "YouTube": LuYoutube,
  "Facebook": LuFacebook,
  "SoundCloud": LuMusic,
  "SoundCloud playlist": LuMusic,
  "Pinterest": LuBox,
};

const SUPPORTED_PLATFORMS = [
  { name: "YouTube", icon: "🎬", formats: "Video, Audio" },
  { name: "Instagram", icon: "📸", formats: "Photos, Reels, Videos" },
  { name: "TikTok", icon: "🎵", formats: "Video, Audio, Images" },
  { name: "X / Twitter", icon: "🐦", formats: "Video, Images" },
  { name: "Reddit", icon: "🔗", formats: "Video, Images, Galleries" },
  { name: "SoundCloud", icon: "🎧", formats: "Audio, Playlists" },
  { name: "Facebook", icon: "📘", formats: "Video, Images" },
  { name: "Pinterest", icon: "📌", formats: "Images, Videos" },
  { name: "Direct Links", icon: "📁", formats: "MP4, MP3, JPG, PNG, etc." },
];


function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iP(ad|hone|od)/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua);
}

function getDeviceInfo() {
  if (typeof navigator === "undefined") return { type: "other", label: "Install App", Icon: LuArrowDownToLine };
  const ua = navigator.userAgent;
  if (/iPhone|iPod/.test(ua)) return { type: "ios", label: "Add to iPhone", Icon: LuApple };
  if (/iPad/.test(ua)) return { type: "ios", label: "Add to iPad", Icon: LuApple };
  if (/Android/.test(ua)) return { type: "android", label: "Install App", Icon: LuSmartphone };
  if (/Windows/.test(ua)) return { type: "windows", label: "Install for Windows", Icon: LuMonitor };
  if (/Mac/.test(ua)) return { type: "mac", label: "Add to Mac", Icon: LuApple };
  if (/Linux/.test(ua)) return { type: "linux", label: "Install App", Icon: LuMonitor };
  return { type: "other", label: "Install App", Icon: LuArrowDownToLine };
}

function InstallButton() {
  const [state, setState] = useState("idle"); // idle | available | ios | installed
  const [showModal, setShowModal] = useState(false);
  const promptRef = useRef(null);
  const device = useMemo(getDeviceInfo, []);

  useEffect(() => {
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    ) {
      setState("installed");
      return;
    }

    if (device.type === "ios") {
      setState("ios");
      return;
    }

    function onPrompt(e) {
      e.preventDefault();
      promptRef.current = e;
      setState("available");
    }
    function onInstalled() {
      setState("installed");
    }

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [device.type]);

  async function handleClick() {
    if (state === "ios") {
      setShowModal(true);
      return;
    }
    if (promptRef.current) {
      promptRef.current.prompt();
      const { outcome } = await promptRef.current.userChoice;
      if (outcome === "accepted") {
        setState("installed");
        promptRef.current = null;
      }
    }
  }

  if (state === "installed" || state === "idle") return null;

  const { label, Icon } = device;

  return (
    <>
      <button
        type="button"
        className={styles.installButton}
        onClick={handleClick}
        aria-label={label}
        title={label}
      >
        <Icon />
        <span>{label}</span>
      </button>

      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)} role="dialog" aria-modal="true" aria-label="Install GetBox">
          <div className={styles.installModal} onClick={(e) => e.stopPropagation()}>
            <button
              className={styles.modalClose}
              type="button"
              onClick={() => setShowModal(false)}
              aria-label="Close"
            >
              <LuX />
            </button>
            <div className={styles.modalIcon}>
              <LuBox />
            </div>
            <h2>Install GetBox</h2>
            <p>Add GetBox to your Home Screen for instant access — no App Store needed.</p>
            <ol className={styles.installSteps}>
              <li>
                <LuShare aria-hidden="true" />
                <span>Tap the <strong>Share</strong> button at the bottom of Safari</span>
              </li>
              <li>
                <LuArrowDownToLine aria-hidden="true" />
                <span>Scroll down and tap <strong>Add to Home Screen</strong></span>
              </li>
              <li>
                <LuApple aria-hidden="true" />
                <span>Tap <strong>Add</strong> — done!</span>
              </li>
            </ol>
            <button
              type="button"
              className={styles.modalDone}
              onClick={() => setShowModal(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function groupByType(items) {
  return items.reduce(
    (groups, item) => {
      const type = ["video", "audio", "image"].includes(item.type) ? item.type : "video";
      groups[type].push(item);
      return groups;
    },
    { video: [], audio: [], image: [] }
  );
}

function filenameFromUrl(value) {
  try {
    const url = new URL(value);
    return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "download");
  } catch {
    return "download";
  }
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [activeType, setActiveType] = useState("video");
  const [copied, setCopied] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [history, setHistory] = useState([]);
  const iosSafari = useMemo(isIosSafari, []);
  const toastTimeoutRef = useRef(null);

  // Load search history on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("getbox-history");
      if (saved) {
        try {
          setHistory(JSON.parse(saved));
        } catch {
          // Invalid history, ignore
        }
      }
    }
  }, []);

  const resolveUrl = useCallback(async function resolveUrl(event) {
    event?.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || status === "loading") return;

    setStatus("loading");
    setMessage("");
    setResult(null);

    try {
      const response = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Could not resolve that URL.");
      }

      const items = Array.isArray(data.items) ? data.items : [];
      const groups = groupByType(items);
      const firstType = ["video", "audio", "image"].find((type) => groups[type].length) || "video";

      setResult({ ...data, groups });
      setActiveType(firstType);
      setStatus("ready");

      // Save to history
      if (typeof window !== "undefined") {
        const newHistory = [trimmed, ...history.filter((h) => h !== trimmed)].slice(0, 10);
        setHistory(newHistory);
        localStorage.setItem("getbox-history", JSON.stringify(newHistory));
      }
    } catch (error) {
      setStatus("error");
      setMessage(error?.message || "Something went wrong.");
    }
  }, [url, status, history]);

  // Handle keyboard shortcuts
  useEffect(() => {
    function handleKeyPress(e) {
      // ESC key to close recent URLs dropdown or guide
      if (e.key === "Escape") {
        if (showGuide) {
          setShowGuide(false);
        } else if (history.length > 0 && !result && status === "idle") {
          // Clear history when ESC is pressed on history view
          setHistory([]);
          localStorage.removeItem("getbox-history");
        }
      }
      // Ctrl+V or Cmd+V to paste
      if ((e.ctrlKey || e.metaKey) && e.key === "v" && e.target.id !== "media-url") {
        e.preventDefault();
        pasteFromClipboard();
      }
      // Ctrl+Enter or Cmd+Enter to submit
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && url.trim()) {
        resolveUrl();
      }
    }

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [url, showGuide, history.length, result, status, resolveUrl]);

  async function pasteFromClipboard() {
    if (!navigator.clipboard?.readText) return;
    const text = await navigator.clipboard.readText();
    setUrl(text.trim());
  }

  function downloadItem(item) {
    const filename = item.filename || filenameFromUrl(item.url);
    const params = new URLSearchParams({ url: item.url, filename });
    const link = document.createElement("a");
    link.href = `/api/download?${params}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function copyLink(value) {
    if (!value) return;
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(true);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select and copy
      const textarea = document.createElement("textarea");
      textarea.value = value;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    }
  }

  function openItem(value) {
    if (!value) return;
    window.open(value, "_blank", "noopener,noreferrer");
  }

  function openHelper(helperUrl) {
    window.open(helperUrl, "_blank", "noopener,noreferrer");
  }

  function loadFromHistory(historyUrl) {
    setUrl(historyUrl);
  }

  const activeItems = result?.groups?.[activeType] || [];
  const isLoading = status === "loading";
  const hasHelpers = result?.fallback?.helpers && result.fallback.helpers.length > 0;

  return (
    <main className={styles.shell}>
      <InstallButton />
      {copied && <div className={styles.toast} role="status" aria-live="polite">✓ Copied to clipboard</div>}

      <section className={styles.workspace} aria-labelledby="app-title">
        <header className={styles.header}>
          <div className={styles.brandMark} aria-hidden="true">
            <LuBox />
          </div>
          <div>
            <h1 id="app-title">GetBox</h1>
            <p>Free media downloader — download videos, audio &amp; images from any platform instantly.</p>
            <div className={styles.headerLinks}>
              <button
                className={styles.guideToggle}
                type="button"
                onClick={() => setShowGuide(!showGuide)}
                title="Show supported platforms"
                aria-expanded={showGuide}
              >
                {showGuide ? "Hide" : "Supported platforms"}
              </button>
              <span className={styles.guideToggleText}> | </span>
              <a
                href="https://github.com/mido-io/GetBox"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.guideToggleLink}
              >
                GitHub
              </a>
            </div>
          </div>
        </header>

        {showGuide && (
          <div className={styles.guide} role="region" aria-label="Supported platforms list">
            <h3>Supported Platforms</h3>
            <div className={styles.platformGrid}>
              {SUPPORTED_PLATFORMS.map((platform) => (
                <div key={platform.name} className={styles.platformCard}>
                  <span className={styles.platformEmoji} aria-hidden="true">{platform.icon}</span>
                  <div className={styles.platformInfo}>
                    <h4>{platform.name}</h4>
                    <p>{platform.formats}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <form className={styles.search} onSubmit={resolveUrl} role="search" aria-label="Media URL search">
          <label className={styles.inputLabel} htmlFor="media-url">
            Media URL
          </label>
          <div className={styles.inputRow}>
            <LuLink className={styles.inputIcon} aria-hidden="true" />
            <input
              id="media-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="Paste a media URL or paste with Ctrl+V"
              inputMode="url"
              autoComplete="url"
              spellCheck="false"
              type="url"
            />
            <button
              className={styles.iconButton}
              type="button"
              onClick={pasteFromClipboard}
              aria-label="Paste from clipboard"
              title="Paste (Ctrl+V)"
            >
              <LuClipboard />
            </button>
          </div>
          <button
            className={styles.primaryButton}
            type="submit"
            disabled={isLoading}
            aria-label={isLoading ? "Getting media" : "Get media"}
            title={isLoading ? "Getting media" : "Get media (Ctrl+Enter)"}
          >
            <LuBox className={isLoading ? styles.spin : ""} />
          </button>
        </form>

        {history.length > 0 && !result && status === "idle" && (
          <nav className={styles.history} aria-label="Recent search history">
            <h3>Recent URLs</h3>
            <div className={styles.historyList}>
              {history.map((item, index) => (
                <div key={index} className={styles.historyItemContainer}>
                  <button
                    type="button"
                    className={styles.historyItem}
                    onClick={() => loadFromHistory(item)}
                    title={item}
                  >
                    <span>{item.substring(0, 50)}...</span>
                  </button>
                  <button
                    type="button"
                    className={styles.historyDelete}
                    onClick={(e) => {
                      e.stopPropagation();
                      const newHistory = history.filter((_, i) => i !== index);
                      setHistory(newHistory);
                      localStorage.setItem("getbox-history", JSON.stringify(newHistory));
                    }}
                    aria-label="Delete from history"
                    title="Delete"
                  >
                    <LuX />
                  </button>
                </div>
              ))}
            </div>
          </nav>
        )}

        {iosSafari && (
          <div className={styles.notice} role="note">
            <LuCircleAlert aria-hidden="true" />
            <p>
              On iPhone Safari, some cross-site media opens instead of saving immediately. Use
              Open, then Share, then Save Video, Save Image, or Save to Files.
            </p>
          </div>
        )}

        {status === "error" && (
          <div className={styles.error} role="alert">
            <LuCircleAlert aria-hidden="true" />
            <div>
              <h3>Could not download this media</h3>
              <p>{message}</p>
              <p className={styles.errorHint}>Try a different URL or use a supported platform from the guide above.</p>
            </div>
          </div>
        )}

        {result && (
          <section className={styles.results} aria-label="Download options">
            <div className={styles.resultHeader}>
              <div className={styles.thumbnailFallback}>
                {PLATFORM_ICON[result.meta?.platform] ? (
                  <>
                    {(() => {
                      const Icon = PLATFORM_ICON[result.meta.platform];
                      return <Icon />;
                    })()}
                  </>
                ) : (
                  <LuBox />
                )}
              </div>
              <div>
                <p className={styles.platform}>{result.meta?.platform || "Media"}</p>
                <h2>{result.meta?.title || "Download ready"}</h2>
                {result.meta?.author && <p className={styles.author}>{result.meta.author}</p>}
              </div>
            </div>

            {result.fallback && (
              <div className={hasHelpers ? styles.fallbackHelper : styles.fallback}>
                <LuCircleAlert aria-hidden="true" />
                <div>
                  <h3>{result.fallback.reason || "No direct media file was exposed."}</h3>

                  {hasHelpers && (
                    <div className={styles.helperServices}>
                      <p className={styles.helperText}>Choose a trusted helper service:</p>
                      <div className={styles.helperButtons}>
                        {result.fallback.helpers.map((helper, index) => (
                          <button
                            key={index}
                            type="button"
                            className={styles.helperButton}
                            onClick={() => openHelper(helper.url)}
                            title={`Use ${helper.name} to download`}
                          >
                            <LuExternalLink />
                            <span>{helper.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {!hasHelpers && (
                    <div className={styles.fallbackActions}>
                      <button type="button" onClick={() => openItem(result.fallback.url)}>
                        <LuExternalLink />
                        <span>{result.fallback.label || "Open original"}</span>
                      </button>
                      <button type="button" onClick={() => copyLink(result.fallback.url)}>
                        <LuCopy />
                        <span>Copy link</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {result.items?.length > 0 && (
              <div className={styles.tabs} role="tablist" aria-label="Media type">
                {["video", "audio", "image"].map((type) => {
                  const Icon = TYPE_ICON[type];
                  const count = result.groups[type].length;
                  return (
                    <button
                      key={type}
                      type="button"
                      role="tab"
                      aria-selected={activeType === type}
                      className={activeType === type ? styles.activeTab : ""}
                      onClick={() => setActiveType(type)}
                      disabled={!count}
                    >
                      <Icon />
                      <span>{type}</span>
                      <strong>{count}</strong>
                    </button>
                  );
                })}
              </div>
            )}

            {activeItems.length > 0 && (
              <div className={styles.list}>
                {activeItems.map((item, index) => {
                  const Icon = TYPE_ICON[item.type] || LuVideo;
                  return (
                    <article className={styles.mediaItem} key={`${item.url}-${index}`}>
                      <div className={styles.mediaIcon} aria-hidden="true">
                        <Icon />
                      </div>
                      <div className={styles.mediaCopy}>
                        <h3>{item.filename || filenameFromUrl(item.url)}</h3>
                        <p>
                          {item.quality || "Original media"}
                          {item.experimental ? " - experimental" : ""}
                        </p>
                      </div>
                      <div className={styles.itemActions}>
                        <button
                          className={styles.downloadButton}
                          type="button"
                          onClick={() => downloadItem(item)}
                          aria-label={`Download ${item.filename || "media"}`}
                          title="Download"
                        >
                          <LuArrowDownToLine />
                        </button>
                        <button
                          className={styles.downloadButton}
                          type="button"
                          onClick={() => openItem(item.url)}
                          aria-label={`Open ${item.filename || "media"}`}
                          title="Open in new tab"
                        >
                          <LuExternalLink />
                        </button>
                        <button
                          className={styles.downloadButton}
                          type="button"
                          onClick={() => copyLink(item.url)}
                          aria-label={`Copy ${item.filename || "media"} link`}
                          title="Copy link"
                        >
                          <LuCopy />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {result.helpers && result.helpers.length > 0 && (
              <div className={styles.fallbackHelper} style={{ marginTop: '1.5rem' }}>
                <LuCircleAlert aria-hidden="true" />
                <div>
                  <h3>Alternative Download Options</h3>
                  <div className={styles.helperServices} style={{ marginTop: '0.5rem' }}>
                    <p className={styles.helperText}>If the links above don&apos;t work, try these trusted helper services:</p>
                    <div className={styles.helperButtons}>
                      {result.helpers.map((helper, index) => (
                        <button
                          key={index}
                          type="button"
                          className={styles.helperButton}
                          onClick={() => openHelper(helper.url)}
                          title={`Use ${helper.name} to download`}
                        >
                          <LuExternalLink />
                          <span>{helper.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
