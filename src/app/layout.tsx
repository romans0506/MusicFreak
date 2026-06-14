import type { Metadata } from "next";
import { Inter, Geist_Mono, Fredoka } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Rounded, playful display font used on game screens (titles, rules).
const fredoka = Fredoka({
  variable: "--font-rounded",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MusicFreak — Music Gaming Platform",
  description: "Guess songs, take quizzes and compete with friends around the world",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} ${fredoka.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>{children}</body>
    </html>
  );
}
