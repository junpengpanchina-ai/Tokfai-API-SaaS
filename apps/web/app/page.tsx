import type { Metadata } from "next";

import { HomeExtraSections } from "@/components/home-extra-sections";
import { HomeHero } from "@/components/home-hero";
import { HomeScenarios } from "@/components/home-scenarios";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { TOKFAI_PRODUCT_TAGLINE } from "@/lib/tokfai-api";

export const metadata: Metadata = {
  title: "Tokfai — OpenAI-compatible image & chat API",
  description: TOKFAI_PRODUCT_TAGLINE,
};

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden">
      <PublicHeader />

      <main className="flex-1">
        <HomeHero />
        <HomeScenarios />
        <HomeExtraSections />
      </main>

      <PublicFooter />
    </div>
  );
}
