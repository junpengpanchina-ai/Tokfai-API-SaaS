"use client";

import { useEffect, useState } from "react";

import {
  formatPlaygroundLabel,
  playgroundLabel,
  readPlaygroundLocale,
  type PlaygroundLocale,
} from "./playground-labels";

export function usePlaygroundLabels() {
  const [locale, setLocale] = useState<PlaygroundLocale>("en");

  useEffect(() => {
    setLocale(readPlaygroundLocale());
  }, []);

  const t = (key: string) => playgroundLabel(key, locale);

  const formatMessage = (
    template: string,
    vars: Record<string, string | number>
  ) => formatPlaygroundLabel(template, vars);

  return { locale, t, formatMessage };
}
