import Link from "next/link";
import { Check } from "lucide-react";

import { PublicHeader } from "@/components/public-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const TIERS = [
  {
    name: "Starter",
    price: "$0",
    cadence: "Free credits on signup",
    description: "Try the API before you put a card down.",
    features: [
      "$1 in free credits",
      "All chat & image models",
      "Per-request usage logs",
      "Community support",
    ],
    cta: { label: "Get started", href: "/signup" },
  },
  {
    name: "Pay as you go",
    price: "Top up",
    cadence: "From $10",
    description: "Buy credits, burn them down. No subscription.",
    features: [
      "Same per-token pricing as our cost page",
      "Hard limit on overspend",
      "Multiple API keys",
      "Email support",
    ],
    cta: { label: "Top up credits", href: "/signup" },
    highlight: true,
  },
  {
    name: "Scale",
    price: "Custom",
    cadence: "Volume contracts",
    description: "For teams running serious traffic.",
    features: [
      "Invoiced billing",
      "Dedicated capacity",
      "Priority SLA",
      "Migration help",
    ],
    cta: { label: "Talk to us", href: "mailto:sales@tokfai.com" },
  },
];

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />

      <main className="flex-1">
        <section className="container py-20 md:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
              Simple, usage-based pricing
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              You pay only for the tokens (and images) you generate. No seats,
              no monthly minimums.
            </p>
          </div>

          <div className="mx-auto mt-16 grid max-w-5xl gap-6 md:grid-cols-3">
            {TIERS.map((tier) => (
              <Card
                key={tier.name}
                className={
                  tier.highlight
                    ? "border-primary shadow-md ring-1 ring-primary/20"
                    : ""
                }
              >
                <CardHeader>
                  <CardTitle>{tier.name}</CardTitle>
                  <CardDescription>{tier.description}</CardDescription>
                  <div className="pt-4">
                    <div className="text-3xl font-semibold tracking-tight">
                      {tier.price}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {tier.cadence}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <ul className="flex flex-col gap-2 text-sm">
                    {tier.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2 text-muted-foreground"
                      >
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    asChild
                    variant={tier.highlight ? "default" : "outline"}
                  >
                    <Link href={tier.cta.href}>{tier.cta.label}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
