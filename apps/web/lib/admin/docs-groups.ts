import type { DocsCategory, PublicBetaDoc } from "@/lib/docs/public-beta-docs-registry";

export type AdminDocsGroupId =
  | "quickstart"
  | "chat"
  | "responses"
  | "image"
  | "cherry-studio"
  | "billing"
  | "errors"
  | "faq";

export const ADMIN_DOCS_GROUP_ORDER: AdminDocsGroupId[] = [
  "quickstart",
  "chat",
  "responses",
  "image",
  "cherry-studio",
  "billing",
  "errors",
  "faq",
];

const CATEGORY_TO_GROUP: Record<DocsCategory, AdminDocsGroupId> = {
  quickstart: "quickstart",
  auth: "quickstart",
  chat: "chat",
  gemini: "chat",
  responses: "responses",
  image: "image",
  "cherry-studio": "cherry-studio",
  billing: "billing",
  errors: "errors",
  troubleshooting: "errors",
  faq: "faq",
};

export function groupAdminDocs(
  docs: PublicBetaDoc[]
): Array<{ id: AdminDocsGroupId; docs: PublicBetaDoc[] }> {
  const buckets = new Map<AdminDocsGroupId, PublicBetaDoc[]>();
  for (const doc of docs) {
    const groupId = CATEGORY_TO_GROUP[doc.category] ?? "faq";
    const list = buckets.get(groupId) ?? [];
    list.push(doc);
    buckets.set(groupId, list);
  }
  return ADMIN_DOCS_GROUP_ORDER.filter((id) => (buckets.get(id)?.length ?? 0) > 0).map(
    (id) => ({
      id,
      docs: buckets.get(id) ?? [],
    })
  );
}
