"use client";

import { useEffect, useState } from "react";

export type ProfileTheme = "system" | "light" | "dark";
export type ProfileTextSize = "normal" | "large" | "extra";

export type ProfilePreferences = {
  theme: ProfileTheme;
  textSize: ProfileTextSize;
  highContrast: boolean;
  reducedMotion: boolean;
};

export const DEFAULT_PROFILE_PREFERENCES: ProfilePreferences = {
  theme: "system",
  textSize: "normal",
  highContrast: false,
  reducedMotion: false,
};

function isPreferences(value: unknown): value is ProfilePreferences {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProfilePreferences>;
  return (
    ["system", "light", "dark"].includes(candidate.theme ?? "") &&
    ["normal", "large", "extra"].includes(candidate.textSize ?? "") &&
    typeof candidate.highContrast === "boolean" &&
    typeof candidate.reducedMotion === "boolean"
  );
}

function storageKey(email: string) {
  return `global-leads:preferences:${email.toLocaleLowerCase("pt-BR")}`;
}

export function useProfilePreferences(email: string) {
  const [preferences, setPreferences] = useState(DEFAULT_PROFILE_PREFERENCES);
  const [hydrated, setHydrated] = useState(false);
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => setSystemDark(media.matches);
    updateSystemTheme();
    media.addEventListener("change", updateSystemTheme);
    return () => media.removeEventListener("change", updateSystemTheme);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem(storageKey(email));
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          if (isPreferences(parsed)) setPreferences(parsed);
        }
      } catch {
        // A prévia continua com os padrões quando o navegador bloqueia storage.
      } finally {
        setHydrated(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [email]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey(email), JSON.stringify(preferences));
    } catch {
      // As preferências permanecem ativas durante a sessão.
    }
  }, [email, hydrated, preferences]);

  return {
    preferences,
    setPreferences,
    resetPreferences: () => setPreferences(DEFAULT_PROFILE_PREFERENCES),
    resolvedTheme:
      preferences.theme === "system"
        ? systemDark
          ? ("dark" as const)
          : ("light" as const)
        : preferences.theme,
  };
}
