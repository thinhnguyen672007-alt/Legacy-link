import { useSyncExternalStore } from "react";
import { english } from "./translations";

export type Language = "vi" | "en";
const storageKey = "legacy-link.language";
function readLanguage(): Language {
  try {
    return localStorage.getItem(storageKey) === "en" ? "en" : "vi";
  } catch {
    return "vi";
  }
}
let language = readLanguage();
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function updateDocument() {
  document.documentElement.lang = language;
}
updateDocument();
export function setLanguage(next: Language) {
  language = next;
  try {
    localStorage.setItem(storageKey, next);
  } catch {
    /* Language switching still works without storage. */
  }
  updateDocument();
  listeners.forEach((listener) => listener());
}
window.addEventListener("storage", (event) => {
  if (event.key !== storageKey && event.key !== null) return;
  language = readLanguage();
  updateDocument();
  listeners.forEach((listener) => listener());
});
export function useLanguage() {
  return useSyncExternalStore(subscribe, () => language);
}
export function locale() {
  return language === "vi" ? "vi-VN" : "en-GB";
}

// Templates also translate stored API errors without changing their original details.
const templates = Object.entries(english)
  .filter(([source]) => /\{\d+\}/.test(source))
  .map(([source, target]) => ({
    pattern: new RegExp(
      "^" +
        source
          .split(/(\{\d+\})/)
          .map((part) =>
            /^\{\d+\}$/.test(part)
              ? "(.*?)"
              : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          )
          .join("") +
        "$",
    ),
    target,
  }));
export function tr(source: string, ...values: unknown[]): string {
  let text = source;
  if (language === "en") {
    const key = source.trim();
    if (Object.hasOwn(english, key)) {
      text = source.replace(key, () => english[key]);
    } else {
      for (const { pattern, target } of templates) {
        const match = pattern.exec(source);
        if (match) {
          text = target.replace(/\{(\d+)\}/g, (_, index: string) => {
            const value = match[Number(index) + 1];
            return Object.hasOwn(english, value) ? english[value] : value;
          });
          break;
        }
      }
      if (text === source) {
        // Unknown server details stay intact after a translated API summary.
        const summary = Object.keys(english).find(
          (candidate) =>
            candidate.endsWith(".") && source.startsWith(candidate + " "),
        );
        if (summary) text = english[summary] + source.slice(summary.length);
      }
    }
  }
  return text.replace(/\{(\d+)\}/g, (placeholder, index: string) =>
    Number(index) < values.length ? String(values[Number(index)]) : placeholder,
  );
}
