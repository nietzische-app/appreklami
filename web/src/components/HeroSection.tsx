import type { ReactNode } from "react";
import type { Dict } from "../i18n";
import { Badge } from "./ui";

export const HeroSection: React.FC<{ t: Dict; children?: ReactNode }> = ({ t, children }) => (
  <section className="flex flex-col items-center gap-6 pb-16 pt-10 text-center animate-fade-up">
    <Badge>
      <span className="h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_8px_2px_rgba(255,255,255,0.5)]" />
      {t.badge}
    </Badge>
    <h1 className="whitespace-pre-line bg-gradient-to-b from-white to-white/60 bg-clip-text pb-2 text-[clamp(2.4rem,7vw,4.6rem)] font-semibold leading-[1.05] tracking-tighter text-transparent">
      {t.heroTitle}
    </h1>
    <p className="max-w-xl text-base text-fog sm:text-lg">{t.heroSub}</p>
    {children}
  </section>
);
