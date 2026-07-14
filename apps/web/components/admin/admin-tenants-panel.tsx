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
import {
  addAdminTenantAdminUser,
  addAdminTenantDomain,
  createAdminTenant,
  fetchAdminTenant,
  fetchAdminTenantEconomics,
  fetchAdminTenants,
  fetchAdminTenantUsage,
  fetchAdminTenantUsers,
  updateAdminTenant,
  updateAdminTenantDomain,
  upsertAdminTenantModelSetting,
  upsertAdminTenantPricingRule,
  type AdminTenantDetail,
  type AdminTenantEconomics,
  type AdminTenantListItem,
} from "@/lib/admin/client";
import { formatDateTime, formatInt } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

type Tab = "list" | "detail" | "create";

export function AdminTenantsPanel() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("list");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tenants, setTenants] = useState<AdminTenantListItem[]>([]);
  const [detail, setDetail] = useState<AdminTenantDetail | null>(null);
  const [economics, setEconomics] = useState<AdminTenantEconomics | null>(null);
  const [users, setUsers] = useState<unknown[]>([]);
  const [usage, setUsage] = useState<unknown[]>([]);
  const [busy, setBusy] = useState(false);

  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [createMultiplier, setCreateMultiplier] = useState("1");

  const [domainInput, setDomainInput] = useState("");
  const [modelId, setModelId] = useState("");
  const [modelEnabled, setModelEnabled] = useState(true);
  const [ruleModelId, setRuleModelId] = useState("");
  const [ruleMultiplier, setRuleMultiplier] = useState("1.2");
  const [adminEmail, setAdminEmail] = useState("");
  const [baseMultiplier, setBaseMultiplier] = useState("1");

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminTenants();
      setTenants(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.tenants.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const openDetail = useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);
      try {
        const [d, eco, u, usg] = await Promise.all([
          fetchAdminTenant(id),
          fetchAdminTenantEconomics(id),
          fetchAdminTenantUsers(id),
          fetchAdminTenantUsage(id),
        ]);
        setDetail(d);
        setEconomics(eco);
        setUsers(u);
        setUsage(usg);
        setBaseMultiplier(String(d.tenant.base_price_multiplier));
        setTab("detail");
      } catch (err) {
        setError(err instanceof Error ? err.message : t("admin.tenants.loadFailed"));
      } finally {
        setBusy(false);
      }
    },
    [t]
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await createAdminTenant({
        name: createName.trim(),
        slug: createSlug.trim().toLowerCase(),
        base_price_multiplier: Number(createMultiplier) || 1,
      });
      setCreateName("");
      setCreateSlug("");
      setCreateMultiplier("1");
      await loadList();
      setDetail(created);
      setEconomics(await fetchAdminTenantEconomics(created.tenant.id));
      setUsers(await fetchAdminTenantUsers(created.tenant.id));
      setUsage(await fetchAdminTenantUsage(created.tenant.id));
      setBaseMultiplier(String(created.tenant.base_price_multiplier));
      setTab("detail");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.tenants.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function saveBaseMultiplier() {
    if (!detail) return;
    setBusy(true);
    try {
      const updated = await updateAdminTenant(detail.tenant.id, {
        base_price_multiplier: Number(baseMultiplier) || 1,
      });
      setDetail(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.tenants.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onAddDomain(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;
    setBusy(true);
    try {
      await addAdminTenantDomain(detail.tenant.id, {
        domain: domainInput.trim().toLowerCase(),
        domain_type: "custom_domain",
        status: "pending",
      });
      setDomainInput("");
      await openDetail(detail.tenant.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.tenants.saveFailed"));
      setBusy(false);
    }
  }

  async function markDomainActive(domainId: string) {
    if (!detail) return;
    setBusy(true);
    try {
      await updateAdminTenantDomain(detail.tenant.id, domainId, {
        status: "active",
        ssl_status: "active",
        dns_status: "active",
      });
      await openDetail(detail.tenant.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.tenants.saveFailed"));
      setBusy(false);
    }
  }

  async function onModelSetting(e: FormEvent) {
    e.preventDefault();
    if (!detail || !modelId.trim()) return;
    setBusy(true);
    try {
      await upsertAdminTenantModelSetting(detail.tenant.id, {
        model_id: modelId.trim(),
        enabled: modelEnabled,
      });
      setModelId("");
      await openDetail(detail.tenant.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.tenants.saveFailed"));
      setBusy(false);
    }
  }

  async function onPricingRule(e: FormEvent) {
    e.preventDefault();
    if (!detail || !ruleModelId.trim()) return;
    setBusy(true);
    try {
      await upsertAdminTenantPricingRule(detail.tenant.id, {
        model_id: ruleModelId.trim(),
        price_multiplier: Number(ruleMultiplier) || 1,
      });
      setRuleModelId("");
      await openDetail(detail.tenant.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.tenants.saveFailed"));
      setBusy(false);
    }
  }

  async function onAddAdmin(e: FormEvent) {
    e.preventDefault();
    if (!detail || !adminEmail.trim()) return;
    setBusy(true);
    try {
      await addAdminTenantAdminUser(detail.tenant.id, {
        email: adminEmail.trim(),
      });
      setAdminEmail("");
      await openDetail(detail.tenant.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.tenants.saveFailed"));
      setBusy(false);
    }
  }

  if (loading && tab === "list") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("admin.tenants.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={tab === "list" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setTab("list");
            void loadList();
          }}
        >
          {t("admin.tenants.list")}
        </Button>
        <Button
          type="button"
          variant={tab === "create" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("create")}
        >
          {t("admin.tenants.create")}
        </Button>
        {detail ? (
          <Button
            type="button"
            variant={tab === "detail" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("detail")}
          >
            {detail.tenant.name}
          </Button>
        ) : null}
      </div>

      {tab === "create" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.tenants.createTitle")}</CardTitle>
            <CardDescription>{t("admin.tenants.createDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid max-w-lg gap-4" onSubmit={onCreate}>
              <div className="space-y-2">
                <Label htmlFor="tenant-name">{t("admin.tenants.name")}</Label>
                <Input
                  id="tenant-name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tenant-slug">{t("admin.tenants.slug")}</Label>
                <Input
                  id="tenant-slug"
                  value={createSlug}
                  onChange={(e) => setCreateSlug(e.target.value)}
                  placeholder="houde"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {t("admin.tenants.slugHint")}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tenant-mult">
                  {t("admin.tenants.baseMultiplier")}
                </Label>
                <Input
                  id="tenant-mult"
                  value={createMultiplier}
                  onChange={(e) => setCreateMultiplier(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t("admin.tenants.create")}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {tab === "list" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.tenants.tableTitle")}</CardTitle>
            <CardDescription>{t("admin.tenants.tableDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {tenants.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("admin.tenants.empty")}
              </p>
            ) : (
              tenants.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left hover:bg-muted/40"
                  onClick={() => void openDetail(row.id)}
                >
                  <div>
                    <div className="font-medium">{row.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.slug} · {row.primary_domain ?? "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={row.status === "active" ? "default" : "secondary"}>
                      {row.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      ×{row.base_price_multiplier}
                    </span>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "detail" && detail ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{detail.tenant.name}</CardTitle>
              <CardDescription>
                {detail.tenant.slug} · {detail.tenant.primary_domain}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("admin.tenants.baseMultiplier")}</Label>
                <div className="flex gap-2">
                  <Input
                    value={baseMultiplier}
                    onChange={(e) => setBaseMultiplier(e.target.value)}
                  />
                  <Button type="button" onClick={() => void saveBaseMultiplier()} disabled={busy}>
                    {t("admin.tenants.save")}
                  </Button>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                <div>{t("admin.tenants.cnameTarget")}</div>
                <code className="text-foreground">{detail.dns.cname_target}</code>
                <p className="mt-1 text-xs">{detail.dns.note}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("admin.tenants.domains")}</CardTitle>
              <CardDescription>{t("admin.tenants.domainsDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {detail.domains.map((d) => (
                <div
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div>
                    <div className="font-medium">{d.domain}</div>
                    <div className="text-xs text-muted-foreground">
                      {d.domain_type} · DNS {d.dns_status} · SSL {d.ssl_status}
                    </div>
                    {d.dns_instructions ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        CNAME → {d.dns_instructions.cname_target}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{d.status}</Badge>
                    {d.status !== "active" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void markDomainActive(d.id)}
                      >
                        {t("admin.tenants.markActive")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
              <form className="flex flex-wrap gap-2" onSubmit={onAddDomain}>
                <Input
                  className="max-w-sm"
                  placeholder="api.example.com"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  required
                />
                <Button type="submit" disabled={busy}>
                  {t("admin.tenants.bindDomain")}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("admin.tenants.modelSettings")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1 text-sm">
                  {detail.model_settings.map((s) => (
                    <li key={s.id}>
                      {s.model_id}: {s.enabled ? "on" : "off"}
                    </li>
                  ))}
                </ul>
                <form className="flex flex-wrap items-end gap-2" onSubmit={onModelSetting}>
                  <Input
                    placeholder="model id"
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={modelEnabled}
                      onChange={(e) => setModelEnabled(e.target.checked)}
                    />
                    enabled
                  </label>
                  <Button type="submit" size="sm" disabled={busy}>
                    {t("admin.tenants.save")}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("admin.tenants.pricingRules")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1 text-sm">
                  {detail.pricing_rules.map((r) => (
                    <li key={r.id}>
                      {r.model_id}: ×{r.price_multiplier}
                    </li>
                  ))}
                </ul>
                <form className="flex flex-wrap gap-2" onSubmit={onPricingRule}>
                  <Input
                    placeholder="model id"
                    value={ruleModelId}
                    onChange={(e) => setRuleModelId(e.target.value)}
                  />
                  <Input
                    className="w-24"
                    value={ruleMultiplier}
                    onChange={(e) => setRuleMultiplier(e.target.value)}
                  />
                  <Button type="submit" size="sm" disabled={busy}>
                    {t("admin.tenants.save")}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("admin.tenants.admins")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-1 text-sm">
                {detail.admins.map((a) => (
                  <li key={a.id}>
                    {a.email} · {a.status}
                  </li>
                ))}
              </ul>
              <form className="flex flex-wrap gap-2" onSubmit={onAddAdmin}>
                <Input
                  type="email"
                  placeholder="admin@example.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  required
                />
                <Button type="submit" size="sm" disabled={busy}>
                  {t("admin.tenants.addAdmin")}
                </Button>
              </form>
            </CardContent>
          </Card>

          {economics ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("admin.tenants.economics")}</CardTitle>
                <CardDescription>{economics.note}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3 text-sm">
                <div>
                  <div className="text-muted-foreground">{t("admin.tenants.usageRequests")}</div>
                  <div className="text-lg font-semibold">
                    {formatInt(economics.usage_requests)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">{t("admin.tenants.usageCredits")}</div>
                  <div className="text-lg font-semibold">
                    {economics.usage_credits_charged}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">{t("admin.tenants.estCost")}</div>
                  <div className="text-lg font-semibold">
                    {economics.estimated_cost_credits}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">{t("admin.tenants.paidOrders")}</div>
                  <div className="text-lg font-semibold">
                    ¥{(economics.paid_order_amount_cents / 100).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">{t("admin.tenants.estMargin")}</div>
                  <div className="text-lg font-semibold">
                    {economics.estimated_gross_margin_credits}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("admin.tenants.users")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {users.length === 0 ? (
                  <p className="text-muted-foreground">{t("admin.tenants.noUsers")}</p>
                ) : (
                  users.slice(0, 50).map((u) => {
                    const row = u as {
                      id: string;
                      email?: string | null;
                      created_at?: string;
                    };
                    return (
                      <div key={row.id} className="flex justify-between border-b py-1">
                        <span>{row.email ?? row.id}</span>
                        <span className="text-muted-foreground">
                          {row.created_at ? formatDateTime(row.created_at) : ""}
                        </span>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("admin.tenants.usage")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {usage.length === 0 ? (
                  <p className="text-muted-foreground">{t("admin.tenants.noUsage")}</p>
                ) : (
                  usage.slice(0, 30).map((u) => {
                    const row = u as {
                      id: string;
                      model?: string | null;
                      credits_charged?: number | string | null;
                      created_at?: string;
                      status?: string | null;
                    };
                    return (
                      <div key={row.id} className="flex justify-between border-b py-1 gap-2">
                        <span className="truncate">
                          {row.model} · {row.status}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {row.credits_charged ?? 0}
                        </span>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
