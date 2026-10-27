"use client";
import { useSyncExternalStore } from "react";
import { GROQ_MODELS } from "./types";

export interface Settings {
  apiKey: string;
  model: string;
}

export const SETTINGS_KEY = "ipc-navigator.settings.v1";
const DEFAULT: Settings = { apiKey: "", model: GROQ_MODELS[0].id };
const listeners = new Set<() => void>();
let cache: Settings | null = null;
let cacheRaw: string | null | undefined;

function read(): Settings {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SETTINGS_KEY);
  } catch {}
  if (cache && raw === cacheRaw) return cache;
  cacheRaw = raw;
  try {
    const s = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    cache = { apiKey: s.apiKey ?? "", model: s.model ?? DEFAULT.model };
  } catch {
    cache = DEFAULT;
  }
  return cache;
}

export function writeSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    cache = s; // storage blocked: keep in memory for this tab
    cacheRaw = undefined;
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === SETTINGS_KEY && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Returns null during SSR / first hydration pass, then the stored settings. */
export function useSettings(): Settings | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
