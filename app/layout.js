import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

const SITE_URL = "https://getbox.vercel.app";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "GetBox — Free Online Media Downloader | Download Videos, Audio & Images Instantly",
    template: "%s | GetBox",
  },
  description:
    "Download videos, audio, and images from YouTube, Instagram, TikTok, Twitter/X, Reddit, Facebook, SoundCloud & more. Free, fast, no sign-up required. GetBox is the #1 direct media downloader.",
  keywords: [
    "media downloader",
    "video downloader",
    "download youtube video",
    "instagram downloader",
    "tiktok downloader",
    "twitter video download",
    "reddit video downloader",
    "facebook video downloader",
    "soundcloud downloader",
    "online video downloader",
    "free video downloader",
    "download media online",
    "audio downloader",
    "image downloader",
    "getbox",
  ],
  authors: [{ name: "GetBox Team", url: SITE_URL }],
  creator: "GetBox",
  publisher: "GetBox",
  applicationName: "GetBox",
  generator: "Next.js",
  referrer: "strict-origin-when-cross-origin",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "GetBox",
    title: "GetBox — Free Online Media Downloader",
    description:
      "Download videos, audio, and images from YouTube, Instagram, TikTok, Twitter/X, Reddit & more. Free, fast, no sign-up.",
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "GetBox – Download media from any platform",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "GetBox — Free Online Media Downloader",
    description:
      "Download videos, audio & images from YouTube, Instagram, TikTok, X, Reddit & more. No sign-up required.",
    images: [`${SITE_URL}/og-image.png`],
    creator: "@getbox",
  },
  alternates: {
    canonical: SITE_URL,
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  category: "technology",
};

// JSON-LD structured data for rich search results
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "GetBox",
  url: SITE_URL,
  description:
    "Free online media downloader. Download videos, audio, and images from YouTube, Instagram, TikTok, Twitter/X, Reddit, Facebook, SoundCloud and more.",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Any",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "Download YouTube videos",
    "Download Instagram reels and posts",
    "Download TikTok videos",
    "Download Twitter/X videos",
    "Download Reddit videos",
    "Download Facebook videos",
    "Download SoundCloud audio",
    "Download Pinterest images",
    "No sign-up required",
    "Free to use",
  ],
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: SITE_URL,
    },
  ],
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "GetBox",
  url: SITE_URL,
  logo: `${SITE_URL}/icon.svg`,
  sameAs: [],
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#000000",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Web App Manifest */}
        <link rel="manifest" href="/manifest.json" />
        
        {/* JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
