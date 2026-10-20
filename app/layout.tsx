import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Streamly — всё видео в одном месте",
  description: "Единая лента видео и стримов с любимых платформ.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
