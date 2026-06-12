"use client";

import Link from "next/link";
import { AlertCircle, Check, Copy } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { dashboardCtaHref } from "@/lib/auth/public-cta";
import { useAuth } from "@/lib/auth/auth-provider";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";

import {
  TOKFAI_API_BASE_URL,
  TOKFAI_API_KEY_FORMAT,
  TOKFAI_API_KEY_PLACEHOLDER,
  TOKFAI_BILLING_POLICY,
  TOKFAI_CHAT_COMPLETIONS_ENDPOINT,
  TOKFAI_CLIENT_TEST_PROMPT,
  TOKFAI_HEALTH_URL,
  TOKFAI_IMAGES_GENERATIONS_FULL_PATH,
  TOKFAI_MODELS_ENDPOINT,
  TOKFAI_PLAYGROUND_POLICY,
  TOKFAI_PRODUCT_TAGLINE,
  TOKFAI_RECOMMENDED_MODEL,
  TOKFAI_STARTER_PLAN,
} from "@/lib/tokfai-api";

const BASE_URL = TOKFAI_API_BASE_URL;
const API_KEY_PLACEHOLDER = TOKFAI_API_KEY_PLACEHOLDER;
const DEFAULT_MODEL = TOKFAI_RECOMMENDED_MODEL;

const AUTH_HEADER = `Authorization: Bearer ${API_KEY_PLACEHOLDER}`;

const MODELS_CURL = `curl https://api.tokfai.com/v1/models \\
  -H "Authorization: Bearer sk-tokfai_xxx"`;

const HEALTH_CURL = `curl https://api.tokfai.com/v1/health`;

const CHAT_COMPLETIONS_CURL = `curl https://api.tokfai.com/v1/chat/completions \\
  -H "Authorization: Bearer sk-tokfai_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${DEFAULT_MODEL}",
    "messages": [
      { "role": "user", "content": "Hello from Tokfai" }
    ],
    "stream": false
  }'`;

const IMAGE_TEXT_TO_IMAGE_CURL = `curl https://api.tokfai.com/v1/images/generations \\
  -H "Authorization: Bearer sk-tokfai_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "nano-banana",
    "prompt": "A serene mountain landscape at sunset, digital art",
    "size": "1024x1024",
    "n": 1,
    "response_format": "url"
  }'`;

const IMAGE_TO_IMAGE_CURL = `curl https://api.tokfai.com/v1/images/generations \\
  -H "Authorization: Bearer sk-tokfai_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "nano-banana",
    "prompt": "Restyle as watercolor illustration",
    "image_urls": ["https://example.com/reference.jpg"],
    "size": "1024x1024",
    "n": 1,
    "response_format": "url"
  }'`;

const OPENAI_JS_EXAMPLE = `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-tokfai_xxx",
  baseURL: "https://api.tokfai.com/v1",
});

const completion = await client.chat.completions.create({
  model: "${DEFAULT_MODEL}",
  messages: [{ role: "user", content: "Hello from Tokfai" }],
});

console.log(completion.choices[0]?.message?.content);`;

const OPENAI_PYTHON_EXAMPLE = `from openai import OpenAI

client = OpenAI(
    api_key="sk-tokfai_xxx",
    base_url="https://api.tokfai.com/v1",
)

completion = client.chat.completions.create(
    model="${DEFAULT_MODEL}",
    messages=[{"role": "user", "content": "Hello from Tokfai"}],
)

print(completion.choices[0].message.content)`;

const OPENAI_JS_IMAGE_EXAMPLE = `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-tokfai_xxx",
  baseURL: "https://api.tokfai.com/v1",
});

const image = await client.images.generate({
  model: "nano-banana",
  prompt: "A serene mountain landscape at sunset, digital art",
  size: "1024x1024",
});`;

const OPENAI_PYTHON_IMAGE_EXAMPLE = `from openai import OpenAI

client = OpenAI(
    api_key="sk-tokfai_xxx",
    base_url="https://api.tokfai.com/v1",
)

image = client.images.generate(
    model="nano-banana",
    prompt="A serene mountain landscape at sunset, digital art",
    size="1024x1024",
)`;

const COMPAT_CLIENT_CONFIG = `Base URL: https://api.tokfai.com/v1
API Key: sk-tokfai_xxx
Model: ${DEFAULT_MODEL}
Test prompt: ${TOKFAI_CLIENT_TEST_PROMPT}`;

const SETUP_FLOW_STEP_KEYS = [
  "docs.setupStep1",
  "docs.setupStep2",
  "docs.setupStep3",
  "docs.setupStep4",
] as const;

type ClientIntegrationErrorRow = {
  status: string;
  code: string;
  meaningKey: string;
  fixKey: string;
};

function clientIntegrationErrors(
  prefix: "cherryStudio" | "cursor",
): ClientIntegrationErrorRow[] {
  return [
    {
      status: "401",
      code: "invalid_token",
      meaningKey: "docs.error401",
      fixKey: `docs.${prefix}Error401`,
    },
    {
      status: "402",
      code: "insufficient_credits",
      meaningKey: "docs.error402",
      fixKey: `docs.${prefix}Error402`,
    },
    {
      status: "404",
      code: "model_not_found",
      meaningKey: "docs.error404Model",
      fixKey: `docs.${prefix}Error404`,
    },
    {
      status: "500",
      code: "upstream_error",
      meaningKey: "docs.error500",
      fixKey: `docs.${prefix}Error500`,
    },
  ];
}

const THREE_MINUTE_SETUP_ROWS = [
  { id: "base-url", labelKey: "docs.baseUrlTitle", value: BASE_URL },
  { id: "api-key", labelKey: "docs.apiKeyFormatTitle", value: TOKFAI_API_KEY_FORMAT },
  {
    id: "model",
    labelKey: "docs.recommendedModelTitle",
    value: DEFAULT_MODEL,
  },
] as const;

const WORKS_WITH_CLIENTS = [
  "docs.compatCursor",
  "docs.compatCherryStudio",
  "docs.compatOpenAiSdk",
  "docs.compatCustomApp",
] as const;

const CLIENT_CONFIG_ROWS = [
  { id: "base-url", labelKey: "docs.baseUrlTitle", value: BASE_URL },
  { id: "api-key", labelKey: "docs.clientIntegrationApiKeyLabel", value: API_KEY_PLACEHOLDER },
  { id: "model-id", labelKey: "docs.clientIntegrationModelLabel", value: DEFAULT_MODEL },
  {
    id: "test-prompt",
    labelKey: "docs.clientIntegrationTestPromptLabel",
    value: TOKFAI_CLIENT_TEST_PROMPT,
  },
] as const;

type ErrorRow = {
  status: string;
  code: string;
  meaningKey: string;
};

const COMMON_HTTP_ERRORS: ErrorRow[] = [
  { status: "401", code: "invalid_token", meaningKey: "docs.error401" },
  { status: "402", code: "insufficient_credits", meaningKey: "docs.error402" },
  { status: "404", code: "model_not_found", meaningKey: "docs.error404Model" },
  { status: "404", code: "route_not_found", meaningKey: "docs.error404Route" },
  { status: "429", code: "upstream_rate_limited", meaningKey: "docs.error429" },
  { status: "500", code: "upstream_error", meaningKey: "docs.error500" },
];

const OTHER_ERROR_CODES: ErrorRow[] = [
  { status: "400", code: "invalid_prompt", meaningKey: "docs.errorInvalidPrompt" },
  { status: "400", code: "invalid_image_url", meaningKey: "docs.errorInvalidImageUrl" },
  {
    status: "400",
    code: "image_url_unreachable",
    meaningKey: "docs.errorImageUrlUnreachable",
  },
  {
    status: "400",
    code: "unsupported_image_content_type",
    meaningKey: "docs.errorUnsupportedContentType",
  },
  { status: "400", code: "image_too_large", meaningKey: "docs.errorImageTooLarge" },
  { status: "504", code: "upstream_timeout", meaningKey: "docs.errorUpstreamTimeout" },
];

export function DocsContent({
  showDashboardLinks = true,
}: {
  showDashboardLinks?: boolean;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const isLoggedIn = Boolean(user);

  function dashHref(path: string): string {
    if (showDashboardLinks || isLoggedIn) {
      return path;
    }
    return dashboardCtaHref(path, false);
  }

  async function copyText(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("docs.pageTitle")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {TOKFAI_PRODUCT_TAGLINE} {t("docs.pageSubtitle")}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={dashHref("/dashboard/api-keys")}>{t("docs.createApiKey")}</Link>
        </Button>
      </div>

      <Card id="three-minute-setup">
        <CardHeader>
          <CardTitle>{t("docs.threeMinuteSetupTitle")}</CardTitle>
          <CardDescription>{t("docs.threeMinuteSetupDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            {SETUP_FLOW_STEP_KEYS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ol>
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {t("docs.setupPlaygroundHint")}
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <tbody>
                {THREE_MINUTE_SETUP_ROWS.map((row) => {
                  const copyId = `three-minute-${row.id}`;
                  return (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                        {t(row.labelKey)}
                      </td>
                      <td className="min-w-0 px-4 py-3">
                        <code className="break-all font-mono text-xs text-muted-foreground">
                          {row.value}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <CopyButton
                          copied={copiedId === copyId}
                          onCopy={() => copyText(copyId, row.value)}
                          copyLabel={t("docs.copy")}
                          copiedLabel={t("docs.copied")}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {t("docs.worksWithLabel")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {WORKS_WITH_CLIENTS.map((key) => (
                <span
                  key={key}
                  className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-foreground"
                >
                  {t(key)}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={dashHref("/dashboard/api-keys")}>{t("docs.createApiKey")}</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={dashHref("/dashboard/playground")}>
                {t("docs.quickstartLinksPlayground")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={dashHref("/dashboard/image-playground")}>
                {t("docs.quickstartLinksImagePlayground")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="#client-integrations">{t("docs.sectionClientIntegrations")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card id="quickstart">
        <CardHeader>
          <CardTitle>{t("docs.quickstartTitle")}</CardTitle>
          <CardDescription>{t("docs.quickstartDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>{t("docs.quickstartStep1")}</li>
            <li>{t("docs.quickstartStep2")}</li>
            <li>{t("docs.quickstartStep3")}</li>
            <li>{t("docs.quickstartStep4")}</li>
          </ol>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("docs.quickstartFirstCallTitle")}</h3>
            <CodeBlock
              id="quickstart-first-call"
              label="curl"
              code={CHAT_COMPLETIONS_CURL}
              copied={copiedId === "quickstart-first-call"}
              onCopy={copyText}
              copyLabel={t("docs.copy")}
              copiedLabel={t("docs.copied")}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={dashHref("/dashboard/api-keys")}>
                {t("docs.quickstartLinksApiKeys")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={dashHref("/dashboard/credits")}>
                {t("docs.quickstartLinksCredits")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={dashHref("/dashboard/playground")}>
                {t("docs.quickstartLinksPlayground")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={dashHref("/dashboard/image-playground")}>
                {t("docs.quickstartLinksImagePlayground")}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card id="external-verification">
        <CardHeader>
          <CardTitle>{t("docs.externalVerificationTitle")}</CardTitle>
          <CardDescription>{t("docs.externalVerificationDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {t("docs.externalVerificationHint")}
          </p>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("docs.externalVerifyHealthTitle")}</h3>
            <CodeBlock
              id="health-curl"
              label="curl"
              code={HEALTH_CURL}
              copied={copiedId === "health-curl"}
              onCopy={copyText}
              copyLabel={t("docs.copy")}
              copiedLabel={t("docs.copied")}
            />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("docs.externalVerifyModelsTitle")}</h3>
            <CodeBlock
              id="external-models-curl"
              label="curl"
              code={MODELS_CURL}
              copied={copiedId === "external-models-curl"}
              onCopy={copyText}
              copyLabel={t("docs.copy")}
              copiedLabel={t("docs.copied")}
            />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("docs.externalVerifyChatTitle")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("docs.externalVerificationModelNote")}
            </p>
            <CodeBlock
              id="external-chat-curl"
              label="curl"
              code={CHAT_COMPLETIONS_CURL}
              copied={copiedId === "external-chat-curl"}
              onCopy={copyText}
              copyLabel={t("docs.copy")}
              copiedLabel={t("docs.copied")}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("docs.sectionNavTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <nav className="flex flex-wrap gap-2 text-sm">
            <DocsSectionLink
              href="#three-minute-setup"
              label={t("docs.threeMinuteSetupTitle")}
            />
            <DocsSectionLink
              href="#external-verification"
              label={t("docs.externalVerificationTitle")}
            />
            <DocsSectionLink href="#authentication" label={t("docs.sectionAuthentication")} />
            <DocsSectionLink href="#chat-completions" label={t("docs.sectionChatCompletions")} />
            <DocsSectionLink href="#image-generations" label={t("docs.sectionImageGenerations")} />
            <DocsSectionLink
              href="#client-integrations"
              label={t("docs.sectionClientIntegrations")}
            />
            <DocsSectionLink href="#errors-billing" label={t("docs.sectionErrorsBilling")} />
          </nav>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <CopyableCard
          id="base-url"
          title={t("docs.baseUrlTitle")}
          description={t("docs.baseUrlDesc")}
          value={BASE_URL}
          copied={copiedId === "base-url"}
          onCopy={copyText}
          copyLabel={t("docs.copy")}
          copiedLabel={t("docs.copied")}
          monospace
        />
        <CopyableCard
          id="api-key-format"
          title={t("docs.apiKeyFormatTitle")}
          description={t("docs.apiKeyFormatDesc")}
          value={TOKFAI_API_KEY_FORMAT}
          copied={copiedId === "api-key-format"}
          onCopy={copyText}
          copyLabel={t("docs.copy")}
          copiedLabel={t("docs.copied")}
        />
        <CopyableCard
          id="models-endpoint"
          title={t("docs.modelsEndpointTitle")}
          description={t("docs.modelsEndpointDesc")}
          value={TOKFAI_MODELS_ENDPOINT}
          copied={copiedId === "models-endpoint"}
          onCopy={copyText}
          copyLabel={t("docs.copy")}
          copiedLabel={t("docs.copied")}
          labelOnly
        />
        <CopyableCard
          id="chat-endpoint"
          title={t("docs.chatEndpointTitle")}
          description={t("docs.chatEndpointDesc")}
          value={TOKFAI_CHAT_COMPLETIONS_ENDPOINT}
          copied={copiedId === "chat-endpoint"}
          onCopy={copyText}
          copyLabel={t("docs.copy")}
          copiedLabel={t("docs.copied")}
          labelOnly
        />
        <CopyableCard
          id="images-endpoint"
          title={t("docs.imagesEndpointTitle")}
          description={t("docs.imagesEndpointDesc")}
          value={TOKFAI_IMAGES_GENERATIONS_FULL_PATH}
          copied={copiedId === "images-endpoint"}
          onCopy={copyText}
          copyLabel={t("docs.copy")}
          copiedLabel={t("docs.copied")}
          labelOnly
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("docs.modelsTitle")}</CardTitle>
          <CardDescription>
            {t("docs.modelsDescPrefix")}{" "}
            <Link
              href={dashHref("/dashboard/models")}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {t("docs.modelsLink")}
            </Link>
            . {t("docs.modelsDescMiddle")}{" "}
            <Link
              href={dashHref("/dashboard/image-playground")}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {t("docs.imagePlaygroundLink")}
            </Link>
            . {t("docs.modelsDescChatMiddle")}{" "}
            <Link
              href={dashHref("/dashboard/playground")}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {t("docs.chatPlaygroundLink")}
            </Link>
            . {TOKFAI_PLAYGROUND_POLICY}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("docs.recommendedModelTitle")}</CardTitle>
          <CardDescription>{t("docs.recommendedModelDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <CopyableCard
            id="recommended-model"
            title={t("docs.modelIdLabel")}
            description=""
            value={DEFAULT_MODEL}
            copied={copiedId === "recommended-model"}
            onCopy={copyText}
            copyLabel={t("docs.copy")}
            copiedLabel={t("docs.copied")}
            compact
          />
        </CardContent>
      </Card>

      <Card id="authentication">
        <CardHeader>
          <CardTitle>{t("docs.sectionAuthentication")}</CardTitle>
          <CardDescription>{t("docs.authSectionDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <CopyableCard
            id="auth"
            title={t("docs.authHeaderTitle")}
            description={t("docs.authHeaderDesc")}
            value={AUTH_HEADER}
            copied={copiedId === "auth"}
            onCopy={copyText}
            copyLabel={t("docs.copy")}
            copiedLabel={t("docs.copied")}
            compact
          />
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("docs.authVerifyTitle")}</h3>
            <CodeBlock
              id="models-curl"
              label="curl"
              code={MODELS_CURL}
              copied={copiedId === "models-curl"}
              onCopy={copyText}
              copyLabel={t("docs.copy")}
              copiedLabel={t("docs.copied")}
            />
          </div>
        </CardContent>
      </Card>

      <Card id="chat-completions">
        <CardHeader>
          <CardTitle>{t("docs.sectionChatCompletions")}</CardTitle>
          <CardDescription>{t("docs.chatCompletionsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <CodeBlock
            id="chat-completions-curl"
            label="curl"
            code={CHAT_COMPLETIONS_CURL}
            copied={copiedId === "chat-completions-curl"}
            onCopy={copyText}
            copyLabel={t("docs.copy")}
            copiedLabel={t("docs.copied")}
          />
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("docs.chatSdkJsTitle")}</h3>
            <p className="text-sm text-muted-foreground">{t("docs.chatSdkDesc")}</p>
            <CodeBlock
              id="openai-js"
              label="javascript"
              code={OPENAI_JS_EXAMPLE}
              copied={copiedId === "openai-js"}
              onCopy={copyText}
              copyLabel={t("docs.copy")}
              copiedLabel={t("docs.copied")}
            />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("docs.chatSdkPythonTitle")}</h3>
            <p className="text-sm text-muted-foreground">{t("docs.chatSdkDesc")}</p>
            <CodeBlock
              id="openai-python"
              label="python"
              code={OPENAI_PYTHON_EXAMPLE}
              copied={copiedId === "openai-python"}
              onCopy={copyText}
              copyLabel={t("docs.copy")}
              copiedLabel={t("docs.copied")}
            />
          </div>
        </CardContent>
      </Card>

      <Card id="image-generations">
        <CardHeader>
          <CardTitle>{t("docs.sectionImageGenerations")}</CardTitle>
          <CardDescription>{t("docs.imageGenerationsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <dl className="grid gap-3 text-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
              <dt className="shrink-0 font-medium text-foreground sm:w-28">
                {t("docs.imageEndpointLabel")}
              </dt>
              <dd>
                <EndpointInlineCode value={TOKFAI_IMAGES_GENERATIONS_FULL_PATH} />
              </dd>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
              <dt className="shrink-0 font-medium text-foreground sm:w-28">
                {t("docs.imageModesLabel")}
              </dt>
              <dd className="text-muted-foreground">
                <ul className="list-disc space-y-1 pl-4">
                  <li>{t("docs.imageTextToImageMode")}</li>
                  <li>{t("docs.imageImageToImageMode")}</li>
                </ul>
              </dd>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
              <dt className="shrink-0 font-medium text-foreground sm:w-28">
                {t("docs.imageUrlsLabel")}
              </dt>
              <dd className="text-muted-foreground">
                {t("docs.imageUrlsDescPrefix")}{" "}
                <Link
                  href={dashHref("/dashboard/image-playground")}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {t("docs.imagePlaygroundLink")}
                </Link>{" "}
                {t("docs.imageUrlsDescSuffix")}
              </dd>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
              <dt className="shrink-0 font-medium text-foreground sm:w-28">
                {t("docs.imageBillingLabel")}
              </dt>
              <dd className="text-muted-foreground">{t("docs.imageApiBilling")}</dd>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
              <dt className="shrink-0 font-medium text-foreground sm:w-28">
                {t("docs.imagePlaygroundLabel")}
              </dt>
              <dd className="text-muted-foreground">{t("docs.imagePlaygroundDesc")}</dd>
            </div>
          </dl>

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("docs.imageTextToImageTitle")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("docs.imageTextToImageRequired")}
            </p>
            <CodeBlock
              id="image-text-to-image-curl"
              label="curl"
              code={IMAGE_TEXT_TO_IMAGE_CURL}
              copied={copiedId === "image-text-to-image-curl"}
              onCopy={copyText}
              copyLabel={t("docs.copy")}
              copiedLabel={t("docs.copied")}
            />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("docs.imageImageToImageTitle")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("docs.imageImageToImageDesc")}
            </p>
            <CodeBlock
              id="image-to-image-curl"
              label="curl"
              code={IMAGE_TO_IMAGE_CURL}
              copied={copiedId === "image-to-image-curl"}
              onCopy={copyText}
              copyLabel={t("docs.copy")}
              copiedLabel={t("docs.copied")}
            />
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("docs.imageSdkJsTitle")}</h3>
            <p className="text-sm text-muted-foreground">{t("docs.imageSdkDesc")}</p>
            <CodeBlock
              id="openai-js-image"
              label="javascript"
              code={OPENAI_JS_IMAGE_EXAMPLE}
              copied={copiedId === "openai-js-image"}
              onCopy={copyText}
              copyLabel={t("docs.copy")}
              copiedLabel={t("docs.copied")}
            />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("docs.imageSdkPythonTitle")}</h3>
            <p className="text-sm text-muted-foreground">{t("docs.imageSdkDesc")}</p>
            <CodeBlock
              id="openai-python-image"
              label="python"
              code={OPENAI_PYTHON_IMAGE_EXAMPLE}
              copied={copiedId === "openai-python-image"}
              onCopy={copyText}
              copyLabel={t("docs.copy")}
              copiedLabel={t("docs.copied")}
            />
          </div>
        </CardContent>
      </Card>

      <Card id="client-integrations">
        <CardHeader>
          <CardTitle>{t("docs.clientIntegrationsTitle")}</CardTitle>
          <CardDescription>{t("docs.clientIntegrationsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <CodeBlock
            id="compat-config"
            label="config"
            code={COMPAT_CLIENT_CONFIG}
            copied={copiedId === "compat-config"}
            onCopy={copyText}
            copyLabel={t("docs.copy")}
            copiedLabel={t("docs.copied")}
          />

          <ClientIntegrationPanel
            id="cherry-studio"
            title={t("docs.cherryStudioLabel")}
            steps={t("docs.cherryStudioSteps")}
            errors={clientIntegrationErrors("cherryStudio")}
            copiedId={copiedId}
            onCopy={copyText}
            t={t}
          />

          <ClientIntegrationPanel
            id="cursor"
            title={t("docs.cursorLabel")}
            steps={t("docs.cursorSteps")}
            errors={clientIntegrationErrors("cursor")}
            copiedId={copiedId}
            onCopy={copyText}
            t={t}
          />

          <OpenAiSdkIntegrationPanel
            copiedId={copiedId}
            onCopy={copyText}
            t={t}
          />

          <p className="text-sm text-muted-foreground">
            {t("docs.clientApiKeyHintPrefix")}{" "}
            <Link
              href={dashHref("/dashboard/api-keys")}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {t("docs.clientApiKeyHintLink")}
            </Link>
            {t("docs.clientApiKeyHintSuffix")}
          </p>
        </CardContent>
      </Card>

      <Card id="errors-billing">
        <CardHeader>
          <CardTitle>{t("docs.sectionErrorsBilling")}</CardTitle>
          <CardDescription>{t("docs.billingRatesDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/30">
            <div className="flex items-start gap-2 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-amber-950 dark:text-amber-50">
                {formatMessage(t("docs.billingPolicyNotice"), {
                  policy: TOKFAI_BILLING_POLICY,
                  starter: TOKFAI_STARTER_PLAN,
                })}{" "}
                <Link
                  href="/pricing"
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {t("docs.pricingLink")}
                </Link>
                .
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 text-sm text-muted-foreground">
            <div>
              <h3 className="font-medium text-foreground">
                {t("docs.billingCreditsTitle")}
              </h3>
              <p className="mt-1">{t("docs.billingCreditsDesc")}</p>
            </div>
            <div>
              <h3 className="font-medium text-foreground">{t("docs.chatBillingTitle")}</h3>
              <p className="mt-1">{t("docs.chatBillingDesc")}</p>
            </div>
            <div>
              <h3 className="font-medium text-foreground">{t("docs.imageBillingTitle")}</h3>
              <p className="mt-1">{t("docs.imageBillingDesc")}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={dashHref("/dashboard/credits")}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {t("docs.dashboardCreditsLink")}
              </Link>
              <Link
                href={dashHref("/dashboard/usage")}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {t("docs.dashboardUsageLink")}
              </Link>
              <Link
                href="/pricing"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {t("docs.viewModelRates")}
              </Link>
              <Link
                href={dashHref("/dashboard/models")}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {t("docs.viewModelsPage")}
              </Link>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">{t("docs.commonErrorsTitle")}</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              {t("docs.commonErrorsDesc")}
            </p>
            <ErrorCodeTable errors={COMMON_HTTP_ERRORS} t={t} />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">{t("docs.otherErrorsTitle")}</h3>
            <p className="mb-4 text-sm text-muted-foreground">{t("docs.errorCodesDesc")}</p>
            <ErrorCodeTable errors={OTHER_ERROR_CODES} t={t} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DocsSectionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-md border bg-muted/40 px-3 py-1.5 font-medium text-foreground underline-offset-4 hover:bg-muted hover:underline"
    >
      {label}
    </Link>
  );
}

function OpenAiSdkIntegrationPanel({
  copiedId,
  onCopy,
  t,
}: {
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  t: (key: string) => string;
}) {
  return (
    <div id="openai-sdk" className="rounded-lg border bg-muted/20 p-4 sm:p-5">
      <h3 className="text-base font-semibold text-foreground">
        {t("docs.openAiSdkLabel")}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">{t("docs.openAiSdkSteps")}</p>

      <div className="mt-4">
        <h4 className="text-sm font-medium text-foreground">
          {t("docs.clientIntegrationConfigTitle")}
        </h4>
        <div className="mt-2 overflow-x-auto rounded-lg border bg-background">
          <table className="w-full text-sm">
            <tbody>
              {CLIENT_CONFIG_ROWS.map((row) => {
                const copyId = `openai-sdk-${row.id}`;
                return (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                      {t(row.labelKey)}
                    </td>
                    <td className="min-w-0 px-4 py-3">
                      <code className="break-all font-mono text-xs text-muted-foreground">
                        {row.value}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <CopyButton
                        copied={copiedId === copyId}
                        onCopy={() => onCopy(copyId, row.value)}
                        copyLabel={t("docs.copy")}
                        copiedLabel={t("docs.copied")}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        {t("docs.openAiSdkExamplesHint")}{" "}
        <Link
          href="#chat-completions"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {t("docs.sectionChatCompletions")}
        </Link>
        {" · "}
        <Link
          href="#image-generations"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {t("docs.sectionImageGenerations")}
        </Link>
      </p>
    </div>
  );
}

function ClientIntegrationPanel({
  id,
  title,
  steps,
  errors,
  copiedId,
  onCopy,
  t,
}: {
  id: string;
  title: string;
  steps: string;
  errors: ClientIntegrationErrorRow[];
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  t: (key: string) => string;
}) {
  return (
    <div id={id} className="rounded-lg border bg-muted/20 p-4 sm:p-5">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{steps}</p>

      <div className="mt-4">
        <h4 className="text-sm font-medium text-foreground">
          {t("docs.clientIntegrationConfigTitle")}
        </h4>
        <div className="mt-2 overflow-x-auto rounded-lg border bg-background">
          <table className="w-full text-sm">
            <tbody>
              {CLIENT_CONFIG_ROWS.map((row) => {
                const copyId = `${id}-${row.id}`;
                return (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                      {t(row.labelKey)}
                    </td>
                    <td className="min-w-0 px-4 py-3">
                      <code className="break-all font-mono text-xs text-muted-foreground">
                        {row.value}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <CopyButton
                        copied={copiedId === copyId}
                        onCopy={() => onCopy(copyId, row.value)}
                        copyLabel={t("docs.copy")}
                        copiedLabel={t("docs.copied")}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4">
        <h4 className="text-sm font-medium text-foreground">
          {t("docs.clientIntegrationErrorsTitle")}
        </h4>
        <div className="mt-2">
          <ClientIntegrationErrorsTable errors={errors} t={t} />
        </div>
      </div>
    </div>
  );
}

function ClientIntegrationErrorsTable({
  errors,
  t,
}: {
  errors: ClientIntegrationErrorRow[];
  t: (key: string) => string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pl-4 pr-4 font-medium">{t("docs.httpColumn")}</th>
            <th className="py-2 pr-4 font-medium">{t("docs.codeColumn")}</th>
            <th className="py-2 pr-4 font-medium">{t("docs.meaningColumn")}</th>
            <th className="py-2 pr-4 font-medium">
              {t("docs.clientIntegrationFixColumn")}
            </th>
          </tr>
        </thead>
        <tbody>
          {errors.map((error) => (
            <tr key={`${error.status}-${error.code}`} className="border-b last:border-0">
              <td className="py-3 pl-4 pr-4 font-mono text-xs">{error.status}</td>
              <td className="py-3 pr-4 font-mono text-xs">{error.code}</td>
              <td className="py-3 pr-4 text-muted-foreground">{t(error.meaningKey)}</td>
              <td className="py-3 pr-4 text-muted-foreground">{t(error.fixKey)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ErrorCodeTable({
  errors,
  t,
}: {
  errors: ErrorRow[];
  t: (key: string) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-4 font-medium">{t("docs.httpColumn")}</th>
            <th className="py-2 pr-4 font-medium">{t("docs.codeColumn")}</th>
            <th className="py-2 pr-4 font-medium">{t("docs.meaningColumn")}</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((error) => (
            <tr key={`${error.status}-${error.code}`} className="border-b last:border-0">
              <td className="py-3 pr-4 font-mono text-xs">{error.status}</td>
              <td className="py-3 pr-4 font-mono text-xs">{error.code}</td>
              <td className="py-3 pr-4 text-muted-foreground">{t(error.meaningKey)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CopyableCard({
  id,
  title,
  description,
  value,
  copied,
  onCopy,
  copyLabel,
  copiedLabel,
  compact = false,
  monospace = false,
  labelOnly = false,
}: {
  id: string;
  title: string;
  description: string;
  value: string;
  copied: boolean;
  onCopy: (id: string, value: string) => void;
  copyLabel: string;
  copiedLabel: string;
  compact?: boolean;
  monospace?: boolean;
  labelOnly?: boolean;
}) {
  const valueClassName = monospace
    ? "block w-max max-w-full whitespace-nowrap font-mono text-xs sm:text-sm"
    : "block w-max max-w-full whitespace-nowrap text-sm";

  const valueNode = labelOnly ? null : (
    <div className="min-w-0 flex-1 overflow-x-auto">
      <code className={`rounded bg-muted px-2 py-1 ${valueClassName}`}>{value}</code>
    </div>
  );

  if (compact) {
    return (
      <div className="flex items-start justify-between gap-3">
        {valueNode}
        <CopyButton
          copied={copied}
          onCopy={() => onCopy(id, value)}
          copyLabel={copyLabel}
          copiedLabel={copiedLabel}
        />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent
        className={
          labelOnly
            ? "flex items-center justify-end"
            : "flex items-start justify-between gap-3"
        }
      >
        {valueNode}
        <CopyButton
          copied={copied}
          onCopy={() => onCopy(id, value)}
          copyLabel={copyLabel}
          copiedLabel={copiedLabel}
        />
      </CardContent>
    </Card>
  );
}

function EndpointInlineCode({ value }: { value: string }) {
  return (
    <div className="overflow-x-auto">
      <code className="inline-block whitespace-nowrap rounded bg-muted px-2 py-1 font-mono text-xs">
        {value}
      </code>
    </div>
  );
}

function CopyButton({
  copied,
  onCopy,
  copyLabel,
  copiedLabel,
}: {
  copied: boolean;
  onCopy: () => void;
  copyLabel: string;
  copiedLabel: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 shrink-0"
      onClick={onCopy}
    >
      {copied ? (
        <>
          <Check className="h-4 w-4" />
          {copiedLabel}
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          {copyLabel}
        </>
      )}
    </Button>
  );
}

function CodeBlock({
  id,
  label,
  code,
  copied,
  onCopy,
  copyLabel,
  copiedLabel,
}: {
  id: string;
  label: string;
  code: string;
  copied: boolean;
  onCopy: (id: string, value: string) => void;
  copyLabel: string;
  copiedLabel: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-muted">
      <div className="flex items-center justify-between border-b bg-background/70 px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => onCopy(id, code)}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              {copiedLabel}
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              {copyLabel}
            </>
          )}
        </Button>
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
