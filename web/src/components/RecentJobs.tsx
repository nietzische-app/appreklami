import type { Dict, Lang } from "../i18n";
import { SectionTitle } from "./ui";

export interface HistoryItem {
  jobId: string;
  name: string;
  at: number;
}

interface Props {
  items: HistoryItem[];
  t: Dict;
  lang: Lang;
  onOpen: (jobId: string) => void;
  onClear: () => void;
}

const tile = "flex min-w-[10.5rem] flex-col gap-0.5 rounded-card border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-left transition-all duration-200 hover:border-white/20 hover:bg-white/[0.06] hover:shadow-glow";

export const RecentJobs: React.FC<Props> = ({ items, t, lang, onOpen, onClear }) =>
  items.length ? (
    <section className="mt-10">
      <SectionTitle>{t.recent}</SectionTitle>
      <div className="flex flex-wrap gap-2.5">
        {items.map((h) => (
          <button key={h.jobId} onClick={() => onOpen(h.jobId)} className={tile}>
            <strong className="text-sm font-medium">{h.name}</strong>
            <small className="text-xs text-fog">{new Date(h.at).toLocaleString(lang)}</small>
            <span className="mt-1 text-xs font-medium text-zinc-300">{t.open} →</span>
          </button>
        ))}
        <button onClick={onClear} className={`${tile} min-w-0 items-center justify-center text-sm text-fog hover:text-white`}>
          {t.clear}
        </button>
      </div>
    </section>
  ) : null;
