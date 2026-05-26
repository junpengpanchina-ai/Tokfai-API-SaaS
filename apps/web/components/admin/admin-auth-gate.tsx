"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AdminApiError,
  fetchAdminMe,
} from "@/lib/admin/client";
import { useI18n } from "@/lib/i18n/i18n-provider";

type GateState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "session_expired" }
  | { status: "forbidden" }
  | { status: "error"; message: string };

export function AdminAuthGate({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [state, setState] = useState<GateState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function verifyAdminSession() {
      try {
        const me = await fetchAdminMe();
        if (cancelled) return;

        if (!me.is_admin) {
          setState({ status: "forbidden" });
          return;
        }

        setState({ status: "ready" });
      } catch (error) {
        if (cancelled) return;

        if (error instanceof AdminApiError && error.isSessionExpired) {
          setState({ status: "session_expired" });
          return;
        }

        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : t("admin.common.adminVerifyFailed"),
        });
      }
    }

    void verifyAdminSession();

    return () => {
      cancelled = true;
    };
  }, [t]);

  if (state.status === "loading") {
    return (
      <Card className="border-muted bg-muted/20">
        <CardHeader>
          <CardTitle className="text-base">{t("admin.common.verifyingAccess")}</CardTitle>
          <CardDescription>{t("admin.common.verifyingAccessDesc")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (state.status === "session_expired") {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-base">{t("admin.common.sessionExpiredTitle")}</CardTitle>
          <CardDescription>{t("admin.common.sessionExpired")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <Link href="/login?redirect=/admin">{t("admin.common.signInAgain")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state.status === "forbidden") {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-base">{t("admin.common.accessDenied")}</CardTitle>
          <CardDescription>{t("admin.common.notAuthorized")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">{t("admin.nav.backToDashboard")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state.status === "error") {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-base">{t("admin.debug.adminError")}</CardTitle>
          <CardDescription>{state.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return <>{children}</>;
}
