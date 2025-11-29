import "./globals.css";

export const metadata = {
  title: "GetBox",
  description: "Fast and light media downloader",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
