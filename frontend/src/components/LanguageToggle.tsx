import { setLanguage, useLanguage } from "../language";

export function LanguageToggle() {
  const language = useLanguage();
  return (
    <div
      className="language-toggle"
      role="group"
      aria-label={
        language === "vi" ? "Ngôn ngữ giao diện" : "Interface language"
      }
    >
      {(["vi", "en"] as const).map((value) => (
        <button
          key={value}
          type="button"
          lang={value}
          aria-label={value === "vi" ? "Tiếng Việt" : "English"}
          aria-pressed={language === value}
          onClick={() => setLanguage(value)}
          title={value === "vi" ? "Tiếng Việt" : "English"}
        >
          {value.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
