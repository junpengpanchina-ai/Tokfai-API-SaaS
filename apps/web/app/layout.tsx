import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Tokfai — OpenAI-compatible image & chat API",
    template: "%s · Tokfai",
  },
  description:
    "OpenAI-compatible API for image generation and chat completions. Drop-in replacement, pay only for what you use.",
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
