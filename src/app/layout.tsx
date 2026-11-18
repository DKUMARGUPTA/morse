import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Morse Messenger — Chat normally. Talk in Morse.",
  description:
    "Global chat with Morse code communication: convert messages to Morse, send them through sound, screen light or vibration, and learn Morse interactively.",
  applicationName: "Morse Messenger",
  manifest: "/manifest.webmanifest",
  metadataBase: new URL("https://morse-ashen.vercel.app"),
  openGraph: {
    type: "website",
    siteName: "Morse Messenger",
    title: "Morse Messenger — Chat normally. Talk in Morse.",
    description:
      "Invitation-only encrypted messenger: no phone number, no contacts upload, no ads. Message in Morse through sound, light or vibration.",
    url: "/",
    images: [{ url: "/icon-192.png", width: 192, height: 192, alt: "Morse Messenger" }],
  },
  twitter: {
    card: "summary",
    title: "Morse Messenger — Chat normally. Talk in Morse.",
    description: "Invitation-only encrypted messenger: no phone number, no contacts upload, no ads.",
    images: ["/icon-192.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Morse Messenger",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0A1224",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
