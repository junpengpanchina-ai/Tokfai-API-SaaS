import type { Metadata } from "next";

import { PublicHeader } from "@/components/public-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const CONTACT_EMAIL = "junpengpanchina@gmail.com";

const TERMS_SECTIONS = [
  {
    title: "Use of the service",
    body: [
      "Tokfai provides an AI API gateway and model aggregation platform for developers and teams. You may use the service only in compliance with applicable laws, these Terms, platform documentation, and any usage limits or policies we publish.",
      "You are responsible for the prompts, inputs, outputs, applications, API calls, integrations, and other activity associated with your account and API keys.",
    ],
  },
  {
    title: "Prohibited activity",
    body: [
      "You may not misuse the service, attack the platform, bypass rate limits or credit limits, interfere with security controls, scrape or overload systems, use stolen credentials, or attempt unauthorized access to Tokfai, Supabase, Stripe, model providers, or other users' accounts.",
      "You may not use Tokfai to generate, distribute, or facilitate illegal content, malware, fraud, harassment, abuse, exploitation, or other activity that violates applicable law or the rights of others.",
    ],
  },
  {
    title: "API keys and account security",
    body: [
      "You are responsible for keeping your account credentials, OAuth sessions, and Tokfai API keys secure. API keys should be stored safely and should not be published in client-side code, public repositories, logs, screenshots, or other insecure locations.",
      "If you believe your account or API key has been compromised, you should revoke the affected key, rotate credentials, and contact us promptly.",
    ],
  },
  {
    title: "Credits, billing, and usage records",
    body: [
      "Tokfai may offer prepaid credits, free trial credits, paid top-ups, usage-based pricing, or other billing arrangements. Credits, balances, transactions, and API usage are calculated based on Tokfai system records.",
      "Unless otherwise required by law or expressly stated in writing, credits are not cash equivalents and may be subject to usage limits, expiration rules, fraud checks, provider pricing changes, and account status.",
    ],
  },
  {
    title: "Availability and changes",
    body: [
      "Tokfai is provided on an availability basis. We work to keep the service reliable, but we do not promise that it will always be uninterrupted, error-free, secure, or available at a particular time.",
      "We may change, suspend, limit, or discontinue features, models, providers, pricing, documentation, or access to the service as needed for security, compliance, provider availability, product development, or business reasons.",
    ],
  },
  {
    title: "Suspension and enforcement",
    body: [
      "We may suspend, restrict, or terminate accounts, API keys, credits, or access to Tokfai if we believe there is abuse, fraud, payment risk, illegal activity, security risk, excessive load, violation of these Terms, or conduct that could harm Tokfai, users, providers, or third parties.",
      "We may investigate suspicious activity and preserve records when needed for security, billing, dispute resolution, or legal compliance.",
    ],
  },
  {
    title: "Disclaimers and limitation of liability",
    body: [
      "Tokfai and its services are provided as is and as available. To the fullest extent permitted by law, we disclaim warranties of merchantability, fitness for a particular purpose, non-infringement, and any warranties arising from course of dealing or usage of trade.",
      "To the fullest extent permitted by law, Tokfai will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, lost data, business interruption, or losses caused by third-party providers or user applications.",
    ],
  },
  {
    title: "Contact",
    body: [
      `Questions about these Terms or your account can be sent to ${CONTACT_EMAIL}.`,
    ],
  },
];

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Tokfai Terms of Service for account, API, credits, billing, and acceptable use.",
};

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />

      <main className="flex-1">
        <section className="container py-16 md:py-24">
          <div className="mx-auto max-w-3xl">
            <div className="mb-10">
              <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Tokfai Legal
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
                Terms of Service
              </h1>
              <p className="mt-4 text-lg text-muted-foreground">
                These Terms govern your access to and use of tokfai.com, the
                Tokfai dashboard, and Tokfai AI API gateway services.
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Agreement</CardTitle>
                <CardDescription>
                  By creating an account, signing in with an OAuth provider, or
                  using Tokfai API services, you agree to these Terms.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-8">
                {TERMS_SECTIONS.map((section) => (
                  <section key={section.title}>
                    <h2 className="text-xl font-semibold tracking-tight">
                      {section.title}
                    </h2>
                    <div className="mt-3 flex flex-col gap-3 text-sm leading-6 text-muted-foreground">
                      {section.body.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                    </div>
                  </section>
                ))}

                <div className="border-t pt-6 text-sm text-muted-foreground">
                  Last updated: May 2026
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
