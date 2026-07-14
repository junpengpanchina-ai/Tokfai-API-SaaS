"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

import {
  MAIN_TENANT,
  type PublicTenantConfig,
} from "@/lib/tenant/resolve";

const TenantContext = createContext<PublicTenantConfig>(MAIN_TENANT);

export function TenantProvider({
  tenant,
  children,
}: {
  tenant: PublicTenantConfig;
  children: ReactNode;
}) {
  return (
    <TenantContext.Provider value={tenant}>{children}</TenantContext.Provider>
  );
}

export function useTenant(): PublicTenantConfig {
  return useContext(TenantContext);
}
