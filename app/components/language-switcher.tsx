"use client";

import { ChangeEvent, useEffect, useState } from "react";

const LANGUAGE_STORAGE_KEY = "fax-mail-locale";
const LANGUAGE_CHANGE_EVENT = "fax-mail-locale-change";
const LOCALES = ["ja", "en", "vi", "zh"] as const;

type Locale = (typeof LOCALES)[number];

const labels: Record<Locale, string> = {
  ja: "日本語",
  en: "English",
  vi: "Tiếng Việt",
  zh: "中文",
};

const isLocale = (value: string | null): value is Locale =>
  Boolean(value && LOCALES.includes(value as Locale));

const detectLocale = (): Locale => {
  if (typeof window === "undefined") return "ja";

  const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (isLocale(saved)) return saved;

  const language = window.navigator.language.toLowerCase();
  if (language.startsWith("en")) return "en";
  if (language.startsWith("vi")) return "vi";
  if (language.startsWith("zh")) return "zh";
  return "ja";
};

export default function LanguageSwitcher() {
  const [locale, setLocale] = useState<Locale>("ja");

  useEffect(() => {
    setLocale(detectLocale());
  }, []);

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextLocale = event.target.value;
    if (!isLocale(nextLocale)) return;

    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLocale);
    setLocale(nextLocale);
    window.dispatchEvent(
      new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: { locale: nextLocale } }),
    );
  };

  return (
    <div className="language-switcher" aria-label="Language selector">
      <label htmlFor="global-language-select">Language</label>
      <select id="global-language-select" value={locale} onChange={handleChange}>
        {LOCALES.map((item) => (
          <option key={item} value={item}>
            {labels[item]}
          </option>
        ))}
      </select>
    </div>
  );
}

export { LANGUAGE_CHANGE_EVENT, LANGUAGE_STORAGE_KEY, LOCALES };
