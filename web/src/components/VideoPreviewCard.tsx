import { assetUrl } from "../api";
import type { Dict } from "../i18n";
import type { Video } from "../types";
import { Badge, ButtonLink, Button, cx } from "./ui";

const Ring: React.FC<{ value: number; size?: number }> = ({ value, size = 84 }) => {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`${value}%`} className="block">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={6} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#fff"
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="drop-shadow-[0_0_6px_rgba(255,255,255,0.6)] transition-[stroke-dashoffset] duration-500"
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-white text-[18px] font-semibold">
        {value}%
      </text>
    </svg>
  );
};

const LockIcon: React.FC = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="4" y="11" width="16" height="10" rx="2.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

const ScreenMessage: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cx("flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-fog", className)}>{children}</div>
);

export const VideoPreviewCard: React.FC<{ video: Video; t: Dict }> = ({ video, t }) => {
  const idx = video.option - 1;
  const locked = video.status === "skipped";
  const pro = video.tier === "pro";
  const done = video.status === "completed" && !!video.url;

  return (
    <article
      className={cx(
        "group relative flex flex-col gap-4 overflow-hidden rounded-panel border bg-white/[0.03] p-5 backdrop-blur-sm transition-all duration-300 hover:bg-white/[0.05] hover:shadow-glow",
        pro ? "border-white/[0.14]" : "border-white/[0.08]",
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      <header className="flex items-center gap-2.5">
        <Badge tone={pro ? "pro" : "neutral"} className="py-0.5 font-medium uppercase tracking-wider">
          {pro ? t.pro : t.free}
        </Badge>
        <h3 className="text-base font-medium tracking-tight">
          {t.optionNames[idx]} <small className="font-normal text-fog">#{video.option}</small>
        </h3>
      </header>

      <div className="relative mx-auto aspect-[9/16] w-full max-w-[250px] rounded-phone border border-white/15 bg-zinc-950 p-[7px] shadow-glow transition-shadow duration-300 group-hover:shadow-glow-lg">
        <div className="absolute left-1/2 top-3 z-10 h-3.5 w-16 -translate-x-1/2 rounded-full bg-black" />
        <div className="relative h-full w-full overflow-hidden rounded-[1.75rem] bg-gradient-to-b from-zinc-900 to-ink">
          {done ? (
            <video src={`${assetUrl(video.url!)}#t=2`} controls playsInline loop preload="metadata" className="h-full w-full bg-black object-cover" />
          ) : locked ? (
            <ScreenMessage className="relative bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.08),transparent_65%)]">
              <span className="grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-white/5 text-white shadow-glow">
                <LockIcon />
              </span>
              <Badge tone="pro" className="font-medium tracking-widest">PRO</Badge>
              <strong className="text-sm font-medium text-white">{t.locked}</strong>
              <small className="text-xs">{t.lockedSub}</small>
              <Button type="button" variant="pro" size="sm">{t.upgrade}</Button>
            </ScreenMessage>
          ) : video.status === "cancelled" ? (
            <ScreenMessage>
              <strong className="text-sm font-medium text-white">{t.cancelledShort}</strong>
            </ScreenMessage>
          ) : video.status === "failed" ? (
            <ScreenMessage>
              <strong className="text-sm font-medium text-red-400">{t.error}</strong>
              <small className="break-words text-xs">{video.error?.slice(0, 140)}</small>
            </ScreenMessage>
          ) : (
            <ScreenMessage>
              {video.status === "rendering" ? <Ring value={video.progress} /> : <div className="h-2.5 w-2.5 rounded-full bg-zinc-500 animate-blink" />}
              <small className="text-xs">{video.status === "rendering" ? t.renderingShort : t.pending}</small>
            </ScreenMessage>
          )}
        </div>
      </div>

      <p className="min-h-[2.7em] text-center text-sm text-fog">{t.optionDescs[idx]}</p>
      <footer className="flex min-h-9 items-center justify-between gap-2">
        <span className="text-xs text-fog">
          {video.resolution} · {video.watermark ? t.watermark : t.noWatermark}
        </span>
        {done ? (
          <ButtonLink variant="secondary" size="sm" href={assetUrl(video.url!)} download>
            {t.download}
          </ButtonLink>
        ) : null}
      </footer>
    </article>
  );
};
