import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], weight: ["400", "500"] });

const title = "musdy | Buy Any Coin On Any Chain";
const description = "Buy any coin on any chain from one dollar balance on Mezo. See what traders buy and copy them in one tap. No gas, no bridges.";
const short = "Buy any coin on any chain. One dollar balance on Mezo.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://musdy.fun"),
  title,
  description,
  applicationName: "musdy",
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/brand/apple-touch-icon-180.png",
  },
  openGraph: {
    title,
    description: short,
    type: "website",
    url: "/",
    siteName: "musdy",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "musdy, buy any coin on any chain from one dollar balance on Mezo" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: short,
    site: "@vwakesahu",
    creator: "@vwakesahu",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#070510",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} dark antialiased`}>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
