import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Tokfai — OpenAI-compatible image & chat API",
    template: "%s · Tokfai",
  },
  description:
    "OpenAI-compatible image & chat API — one API for chat, image, and AI apps.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
