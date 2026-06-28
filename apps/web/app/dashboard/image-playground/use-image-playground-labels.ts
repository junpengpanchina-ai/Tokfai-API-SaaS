"use client";

import { useEffect, useState } from "react";

import {
  formatImagePlaygroundLabel,
  imagePlaygroundLabel,
  readImagePlaygroundLocale,
  type ImagePlaygroundLocale,
} from "./image-playground-labels";

export function useImagePlaygroundLabels() {
  const [locale, setLocale] = useState<ImagePlaygroundLocale>("en");

  useEffect(() => {
    setLocale(readImagePlaygroundLocale());
  }, []);

  const t = (key: string) => imagePlaygroundLabel(key, locale);

  const formatMessage = (
    template: string,
    vars: Record<string, string | number>
  ) => formatImagePlaygroundLabel(template, vars);

  return { locale, t, formatMessage };
}
