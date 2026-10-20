import { useState } from "react";
import type { Dict } from "../i18n";
import type { Storyboard } from "../types";
import { Badge, Card, SectionTitle, cx } from "./ui";

const Term: React.FC<{ children: string }> = ({ children }) => (
  <dt className="pt-1 text-[11px] font-medium uppercase tracking-widest text-fog">{children}</dt>
);

export const StoryboardPanel: React.FC<{ stories: Storyboard[]; t: Dict }> = ({ stories, t }) => {
  const [active, setActive] = useState(0);
  const s = stories[active];
  if (!s) return null;
  return (
    <Card className="p-6">
      <SectionTitle>{t.story}</SectionTitle>
      <div role="tablist" className="mb-6 flex flex-wrap gap-2">
        {stories.map((st, i) => (
          <button
            key={st.id}
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={cx(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-200",
              i === active ? "border-white/60 bg-white text-black shadow-glow" : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/25 hover:bg-white/10 hover:text-white",
            )}
          >
            #{i + 1} {st.angle}
          </button>
        ))}
      </div>
      <dl className="m-0 grid gap-x-6 gap-y-4 md:grid-cols-[110px_1fr]">
        <Term>{t.hook}</Term>
        <dd className="m-0 text-xl font-semibold tracking-tight">{s.hook}</dd>
        <Term>{t.features}</Term>
        <dd className="m-0">
          <ul className="m-0 grid list-none gap-2.5 p-0">
            {s.features.map((f) => (
              <li key={f.title} className="text-sm">
                <strong className="font-medium text-white">{f.title}</strong> <span className="text-fog">{f.description}</span>
              </li>
            ))}
          </ul>
        </dd>
        <Term>{t.outro}</Term>
        <dd className="m-0 flex flex-wrap items-center gap-3 text-xl font-semibold tracking-tight">
          {s.outro}
          <Badge tone="solid" className="font-medium">{s.cta}</Badge>
        </dd>
      </dl>
    </Card>
  );
};
