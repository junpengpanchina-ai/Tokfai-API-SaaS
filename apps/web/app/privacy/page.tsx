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

const POLICY_SECTIONS = [
  {
    title: "Information we collect",
    body: [
      "When you create or use a Tokfai account, we may collect account information such as your email address, name, avatar, OAuth provider, and authentication identifiers provided by services such as Google OAuth or GitHub OAuth.",
      "We also collect service-related records, including API usage logs, request metadata needed to operate the platform, billing information, credit balance history, and transaction records associated with purchases or account activity.",
    ],
  },
  {
    title: "How we use information",
    body: [
      "We use account information to provide login, authentication, account management, customer support, and secure access to the Tokfai API gateway.",
      "We use usage logs, billing information, and credit records to deliver the service, calculate API usage, show dashboards, prevent abuse, improve reliability, perform security and fraud checks, and process payments or invoices.",
    ],
  },
  {
    title: "Third-party services",
    body: [
      "Tokfai relies on trusted third-party services to operate the product. These may include Supabase for authentication and database services, Stripe for payment processing and billing, Google OAuth for Google sign-in, GitHub OAuth for GitHub sign-in, and model service providers that process API requests on behalf of users.",
      "These providers may process data according to their own privacy policies and contractual obligations. We only share information with these providers when needed to authenticate users, provide the service, process payments, route model requests, maintain security, or meet legal obligations.",
    ],
  },
  {
    title: "Data sharing and sale of data",
    body: [
      "We do not sell user data. We do not share personal information with advertisers or data brokers.",
      "We may disclose information if required by law, to protect the security and integrity of Tokfai, to investigate abuse or fraud, or in connection with a business transfer such as a merger, acquisition, or sale of assets.",
    ],
  },
  {
    title: "Data retention and security",
    body: [
      "We retain account, billing, credit, and usage records for as long as needed to provide Tokfai, maintain accurate financial and system records, resolve disputes, enforce our terms, and comply with legal requirements.",
      "We use reasonable administrative, technical, and organizational safeguards to protect user information. No internet service can be guaranteed to be completely secure, but we work to reduce risk and limit access to sensitive information.",
    ],
  },
  {
    title: "Your choices and data requests",
    body: [
      `You may contact us to request account deletion, data deletion, or help with privacy-related questions. Some records may need to be retained when required for security, fraud prevention, billing, tax, accounting, or legal compliance.`,
      `For privacy requests, contact us at ${CONTACT_EMAIL}.`,
    ],
  },
];

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Tokfai Privacy Policy for account, OAuth, usage, billing, and service data.",
};

export default function PrivacyPage() {
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
                Privacy Policy
              </h1>
              <p className="mt-4 text-lg text-muted-foreground">
                This Privacy Policy explains how Tokfai collects, uses, and
                protects information when you use tokfai.com, the Tokfai
                dashboard, and the Tokfai AI API gateway.
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Overview</CardTitle>
                <CardDescription>
                  Tokfai is an AI API and model aggregation platform. We collect
                  only the information needed to run accounts, provide API
                  access, process usage and billing, and keep the service safe.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-8">
                {POLICY_SECTIONS.map((section) => (
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
