import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://tokfai.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const paths = [
    "/",
    "/pricing",
    "/docs",
    "/login",
    "/signup",
    "/terms",
    "/privacy",
    "/use-cases/openai-compatible-api",
    "/use-cases/ecommerce-ai-credits",
    "/use-cases/uav-engineering-ai",
  ];

  return paths.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "/" || path.startsWith("/use-cases") ? "weekly" : "monthly",
    priority:
      path === "/"
        ? 1
        : path === "/pricing" || path === "/docs"
          ? 0.9
          : path.startsWith("/use-cases")
            ? 0.8
            : 0.5,
  }));
}
