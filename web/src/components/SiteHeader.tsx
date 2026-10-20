import type { Lang } from "../i18n";
import { cx } from "./ui";

export const SiteHeader: React.FC<{ lang: Lang; onLang: (l: Lang) => void }> = ({ lang, onLang }) => (
  <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
    <a href="/" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-white no-underline">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-[10px] text-black shadow-glow">▶</span>
      AppReklami
    </a>
    <div role="group" aria-label="Language" className="flex rounded-full border border-white/10 bg-white/[0.03] p-0.5 backdrop-blur-md">
      {(["tr", "en"] as Lang[]).map((l) => (
        <button
          key={l}
          onClick={() => onLang(l)}
          aria-pressed={l === lang}
          className={cx("rounded-full px-3 py-1 text-xs font-medium transition-all duration-200", l === lang ? "bg-white text-black" : "text-fog hover:text-white")}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  </header>
);
