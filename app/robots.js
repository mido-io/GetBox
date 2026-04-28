export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
    ],
    sitemap: "https://getbox.vercel.app/sitemap.xml",
  };
}
