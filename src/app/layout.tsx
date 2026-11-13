import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tutor Amma | Verified Tutors, Safe Home Tuition, AI Teaching Studio",
  description:
    "Tutor Amma is a verified tutor marketplace: online 1:1, safe home tuition with OTP check-in, geofence and live tracking, group batches, escrow payments, AI lesson plans and question papers.",
  keywords: ["Tutor Amma", "tutoring", "home tuition", "verified tutors", "lesson plans", "question papers", "India"],
  icons: {
    icon: "/brand/tutor-amma-logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#14246B",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
