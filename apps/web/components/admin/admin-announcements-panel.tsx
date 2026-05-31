"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ANNOUNCEMENT_TYPE_OPTIONS } from "@/lib/announcements";
import {
  AdminApiError,
  createAdminAnnouncement,
  fetchAdminAnnouncements,
  updateAdminAnnouncement,
  type AdminAnnouncementListItem,
  type AdminAnnouncementType,
} from "@/lib/admin/client";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

type PanelMode = "list" | "create" | "edit";

type AnnouncementDraft = {
  title: string;
  slug: string;
  summary: string;
  content: string;
  type: AdminAnnouncementType;
  priority: string;
  enabled: boolean;
  pinned: boolean;
  visible_from: string;
  visible_until: string;
};

function emptyDraft(): AnnouncementDraft {
  return {
    title: "",
    slug: "",
    summary: "",
    content: "",
    type: "notice",
    priority: "100",
    enabled: true,
    pinned: false,
    visible_from: "",
    visible_until: "",
  };
}

function announcementToDraft(row: AdminAnnouncementListItem): AnnouncementDraft {
  return {
    title: row.title,
    slug: row.slug ?? "",
    summary: row.summary ?? "",
    content: row.content,
    type: row.type,
    priority: String(row.priority),
    enabled: row.enabled,
    pinned: row.pinned,
    visible_from: isoToDatetimeLocal(row.visible_from),
    visible_until: isoToDatetimeLocal(row.visible_until),
  };
}

function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoOrNull(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function draftToBody(draft: AnnouncementDraft, isCreate: boolean) {
  const priority = Number.parseInt(draft.priority, 10);
  if (!Number.isFinite(priority) || priority < 0) {
    throw new Error("invalid_priority");
  }

  const base = {
    title: draft.title.trim(),
    slug: draft.slug.trim() || undefined,
    summary: draft.summary.trim() || null,
    content: draft.content.trim(),
    type: draft.type,
    priority,
    enabled: draft.enabled,
    pinned: draft.pinned,
    visible_from: toIsoOrNull(draft.visible_from),
    visible_until: toIsoOrNull(draft.visible_until),
  };

  if (isCreate) return base;
  return base;
}

export function AdminAnnouncementsPanel() {
  const { t } = useI18n();
  const [rows, setRows] = useState<AdminAnnouncementListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AnnouncementDraft>(emptyDraft());
  const [formError, setFormError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchAdminAnnouncements();
      setRows(data);
    } catch (error) {
      if (error instanceof AdminApiError && error.isSessionExpired) {
        setLoadError(t("admin.common.sessionExpired"));
      } else if (error instanceof Error) {
        setLoadError(error.message);
      } else {
        setLoadError(t("admin.announcements.loadFailed"));
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  function openCreate() {
    setPanelMode("create");
    setEditingId(null);
    setDraft(emptyDraft());
    setFormError(null);
    setSavedMessage(null);
  }

  function openEdit(row: AdminAnnouncementListItem) {
    setPanelMode("edit");
    setEditingId(row.id);
    setDraft(announcementToDraft(row));
    setFormError(null);
    setSavedMessage(null);
  }

  function closeForm() {
    setPanelMode("list");
    setEditingId(null);
    setDraft(emptyDraft());
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSavedMessage(null);
    setSubmitting(true);

    try {
      const body = draftToBody(draft, panelMode === "create");
      if (!body.title || !body.content) {
        setFormError(t("admin.announcements.requiredFields"));
        return;
      }

      if (panelMode === "create") {
        await createAdminAnnouncement(body);
      } else if (editingId) {
        await updateAdminAnnouncement(editingId, body);
      }

      await loadRows();
      closeForm();
      setSavedMessage(t("dashboard.announcements.announcementSaved"));
    } catch (error) {
      if (error instanceof AdminApiError && error.isSessionExpired) {
        setFormError(t("admin.common.sessionExpired"));
      } else if (error instanceof Error) {
        setFormError(error.message);
      } else {
        setFormError(t("admin.announcements.saveFailed"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (panelMode !== "list") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {panelMode === "create"
              ? t("dashboard.announcements.newAnnouncement")
              : t("dashboard.announcements.editAnnouncement")}
          </CardTitle>
          <CardDescription>{t("admin.announcements.formDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="ann-title">
                {t("dashboard.announcements.announcementTitle")}
              </Label>
              <Input
                id="ann-title"
                value={draft.title}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, title: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ann-slug">Slug</Label>
              <Input
                id="ann-slug"
                value={draft.slug}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, slug: e.target.value }))
                }
                placeholder="my-announcement"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ann-summary">Summary</Label>
              <Input
                id="ann-summary"
                value={draft.summary}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, summary: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ann-content">
                {t("dashboard.announcements.announcementContent")}
              </Label>
              <textarea
                id="ann-content"
                value={draft.content}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, content: e.target.value }))
                }
                rows={12}
                required
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ann-type">
                  {t("dashboard.announcements.announcementType")}
                </Label>
                <select
                  id="ann-type"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={draft.type}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      type: e.target.value as AdminAnnouncementType,
                    }))
                  }
                >
                  {ANNOUNCEMENT_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {t(`dashboard.announcements.types.${opt}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ann-priority">Priority</Label>
                <Input
                  id="ann-priority"
                  type="number"
                  min={0}
                  value={draft.priority}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, priority: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, enabled: e.target.checked }))
                  }
                />
                {t("dashboard.announcements.enabled")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.pinned}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, pinned: e.target.checked }))
                  }
                />
                {t("dashboard.announcements.pinned")}
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ann-from">
                  {t("dashboard.announcements.visibleFrom")}
                </Label>
                <Input
                  id="ann-from"
                  type="datetime-local"
                  value={draft.visible_from}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, visible_from: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ann-until">
                  {t("dashboard.announcements.visibleUntil")}
                </Label>
                <Input
                  id="ann-until"
                  type="datetime-local"
                  value={draft.visible_until}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, visible_until: e.target.value }))
                  }
                />
              </div>
            </div>
            {formError ? (
              <p className="text-sm text-destructive">{formError}</p>
            ) : null}
            {savedMessage ? (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                {savedMessage}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    …
                  </>
                ) : (
                  "Save"
                )}
              </Button>
              <Button type="button" variant="outline" onClick={closeForm}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("dashboard.announcements.announcements")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("admin.announcements.subtitle")}
          </p>
        </div>
        <Button onClick={openCreate}>
          {t("dashboard.announcements.newAnnouncement")}
        </Button>
      </div>

      {savedMessage ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          {savedMessage}
        </p>
      ) : null}

      {loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("admin.common.refreshing")}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t("dashboard.announcements.noAnnouncements")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">
                      {t("dashboard.announcements.enabled")}
                    </th>
                    <th className="px-4 py-3 font-medium">
                      {t("dashboard.announcements.pinned")}
                    </th>
                    <th className="px-4 py-3 font-medium">Priority</th>
                    <th className="px-4 py-3 font-medium">Updated</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{row.title}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">
                          {t(`dashboard.announcements.types.${row.type}`)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {row.enabled ? "Yes" : "No"}
                      </td>
                      <td className="px-4 py-3">
                        {row.pinned ? "Yes" : "No"}
                      </td>
                      <td className="px-4 py-3">{row.priority}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDateTime(row.updated_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(row)}
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
