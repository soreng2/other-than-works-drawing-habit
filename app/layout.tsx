import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const socialImage = new URL("/og.jpg", metadataBase).href;

  return {
    metadataBase,
    title: "OTHER THAN WORKS — 하루 10분 그림 작업실",
    description: "매일 10분, 직접 그린 작업친구와 함께 그림을 시작하는 아더댄웍스 수강생 작업실.",
    applicationName: "OTHER THAN WORKS",
    manifest: "/manifest.webmanifest",
    icons: {
      icon: "/brand-character.png",
      apple: "/brand-character.png",
    },
    openGraph: {
      title: "OTHER THAN WORKS — 하루 10분 그림 작업실",
      description: "잘 그리는 날보다 시작하는 날을 늘려봐요.",
      type: "website",
      images: [{ url: socialImage, width: 1200, height: 630, alt: "아더댄웍스 10분 그림 작업실" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "OTHER THAN WORKS — 하루 10분 그림 작업실",
      description: "잘 그리는 날보다 시작하는 날을 늘려봐요.",
      images: [socialImage],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#f7f2e8",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body className={geist.variable}>{children}</body></html>;
}
