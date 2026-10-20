import { useState } from "react";
import { assetUrl } from "./api";
import type { Dict } from "./i18n";
import type { Job, Storyboard, Video } from "./types";

export const Ring: React.FC<{ value: number; size?: number }> = ({ value, size = 84 }) => {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="ring" viewBox={`0 0 ${size} ${size}`} aria-label={`${value}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        className="ring-fg"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle">
        {value}%
      </text>
    </svg>
  );
};

export const PhoneCard: React.FC<{ video: Video; t: Dict }> = ({ video, t }) => {
  const idx = video.option - 1;
  const locked = video.status === "skipped";
  const pro = video.tier === "pro";
  return (
    <article className={`phone-card ${pro ? "is-pro" : ""}`}>
      <header>
        <span className={`pill ${pro ? "pill-pro" : "pill-free"}`}>{pro ? t.pro : t.free}</span>
        <h3>
          {t.optionNames[idx]} <small>#{video.option}</small>
        </h3>
      </header>
      <div className="phone">
        <div className="phone-notch" />
        <div className="phone-screen">
          {video.status === "completed" && video.url ? (
            <video src={`${assetUrl(video.url)}#t=2`} controls playsInline loop preload="metadata" />
          ) : locked ? (
            <div className="screen-msg locked">
              <span className="lock">PRO</span>
              <strong>{t.locked}</strong>
              <small>{t.lockedSub}</small>
              <button type="button" className="btn btn-ghost">{t.upgrade}</button>
            </div>
          ) : video.status === "cancelled" ? (
            <div className="screen-msg">
              <strong>{t.cancelledShort}</strong>
            </div>
          ) : video.status === "failed" ? (
            <div className="screen-msg failed">
              <strong>{t.error}</strong>
              <small>{video.error?.slice(0, 140)}</small>
            </div>
          ) : (
            <div className="screen-msg">
              {video.status === "rendering" ? <Ring value={video.progress} /> : <div className="idle-dot" />}
              <small>{video.status === "rendering" ? t.renderingShort : t.pending}</small>
            </div>
          )}
        </div>
      </div>
      <p className="desc">{t.optionDescs[idx]}</p>
      <footer>
        <span className="meta">
          {video.resolution} · {video.watermark ? t.watermark : t.noWatermark}
        </span>
        {video.status === "completed" && video.url ? (
          <a className="btn btn-small" href={assetUrl(video.url)} download>
            {t.download}
          </a>
        ) : null}
      </footer>
    </article>
  );
};

export const Stepper: React.FC<{ job: Job; t: Dict }> = ({ job, t }) => {
  const stateOf = (i: number): "done" | "active" | "todo" => {
    if (i === 0) return job.status === "queued" ? "todo" : job.status === "analyzing" ? "active" : "done";
    const v = job.videos[i - 1];
    if (v.status === "completed" || v.status === "skipped") return "done";
    if (v.status === "cancelled" || job.status === "cancelled") return "todo";
    if (v.status === "rendering") return "active";
    return "todo";
  };
  return (
    <ol className="stepper">
      {t.steps.map((label, i) => (
        <li key={label} className={`step step-${stateOf(i)}`}>
          <span className="step-dot">{stateOf(i) === "done" ? "✓" : i + 1}</span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
};

export const StoryboardPanel: React.FC<{ stories: Storyboard[]; t: Dict }> = ({ stories, t }) => {
  const [active, setActive] = useState(0);
  const s = stories[active];
  if (!s) return null;
  return (
    <section className="panel story">
      <h2>{t.story}</h2>
      <div className="tabs" role="tablist">
        {stories.map((st, i) => (
          <button key={st.id} role="tab" aria-selected={i === active} className={i === active ? "tab on" : "tab"} onClick={() => setActive(i)}>
            #{i + 1} {st.angle}
          </button>
        ))}
      </div>
      <dl>
        <dt>{t.hook}</dt>
        <dd className="big">{s.hook}</dd>
        <dt>{t.features}</dt>
        <dd>
          <ul>
            {s.features.map((f) => (
              <li key={f.title}>
                <strong>{f.title}</strong> <span>{f.description}</span>
              </li>
            ))}
          </ul>
        </dd>
        <dt>{t.outro}</dt>
        <dd className="big">
          {s.outro} <em>{s.cta}</em>
        </dd>
      </dl>
    </section>
  );
};
