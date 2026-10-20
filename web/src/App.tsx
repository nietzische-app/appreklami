import { useCallback, useEffect, useRef, useState } from "react";
import { cancelJob, createJob, getConfig, getJob, watchJob } from "./api";
import { PhoneCard, Stepper, StoryboardPanel } from "./components";
import { detectLang, messages, type Lang } from "./i18n";
import type { Job, ServerConfig } from "./types";

interface HistoryItem {
  jobId: string;
  name: string;
  at: number;
}
const HISTORY_KEY = "appreklami.history";
const loadHistory = (): HistoryItem[] => {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
};

const EXAMPLES = ["https://github.com/photonstorm/phaser", "https://github.com/expo/expo", "https://github.com/calcom/cal.com"];
const GITHUB_RE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+?(\.git)?\/?$/;

export const App: React.FC = () => {
  const [lang, setLang] = useState<Lang>(detectLang);
  const t = messages(lang);
  const [serverCfg, setServerCfg] = useState<ServerConfig | null>(null);
  const [mode, setMode] = useState<"github" | "local">("github");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);
  const stopRef = useRef<(() => void) | undefined>(undefined);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getConfig().then(setServerCfg).catch(() => setServerCfg(null));
  }, []);
  useEffect(() => localStorage.setItem("lang", lang), [lang]);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("job");
    if (id) void openHistory(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => stopRef.current?.(), []);

  const follow = useCallback((initial: Job) => {
    stopRef.current?.();
    setJob(initial);
    window.history.replaceState(null, "", `?job=${initial.jobId}`);
    stopRef.current = watchJob(initial.jobId, (j) => {
      setJob(j);
      if (j.analysis) {
        setHistory((h) => {
          const next = [{ jobId: j.jobId, name: j.analysis!.name, at: Date.now() }, ...h.filter((x) => x.jobId !== j.jobId)].slice(0, 6);
          localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
          return next;
        });
      }
    });
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (mode === "github" && !GITHUB_RE.test(v)) return setError(t.errorInvalid);
    if (!v) return setError(t.errorInvalid);
    setError(null);
    setBusy(true);
    try {
      const created = await createJob(mode === "github" ? { type: "github", url: v } : { type: "local", path: v });
      follow({ ...created, progress: 0 });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openHistory = async (id: string) => {
    try {
      follow(await getJob(id));
    } catch {
      setHistory((h) => h.filter((x) => x.jobId !== id));
    }
  };

  const [cancelling, setCancelling] = useState(false);
  const cancel = async () => {
    if (!job) return;
    setCancelling(true);
    try {
      setJob(await cancelJob(job.jobId));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCancelling(false);
    }
  };
  const reset = () => {
    stopRef.current?.();
    setJob(null);
    setError(null);
    window.history.replaceState(null, "", window.location.pathname);
  };

  const running = job && !["completed", "failed", "cancelled"].includes(job.status);

  return (
    <>
      <div className="bg" aria-hidden />
      <header className="nav">
        <a className="brand" href="/">
          <span className="logo">▶</span> AppReklami
        </a>
        <div className="lang" role="group" aria-label="Language">
          {(["tr", "en"] as Lang[]).map((l) => (
            <button key={l} className={l === lang ? "on" : ""} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <main>
        <section className="hero">
          <span className="badge">{t.badge}</span>
          <h1>{t.heroTitle}</h1>
          <p>{t.heroSub}</p>

          <form className="composer" onSubmit={submit}>
            {serverCfg?.localSources ? (
              <div className="seg" role="tablist">
                {(["github", "local"] as const).map((m) => (
                  <button type="button" key={m} role="tab" aria-selected={mode === m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
                    {t[m]}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="field">
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={mode === "github" ? t.placeholderGithub : t.placeholderLocal}
                aria-label={t[mode]}
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
              />
              <button className="btn btn-primary" disabled={busy || !!running}>
                {busy || running ? t.working : t.generate}
              </button>
            </div>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            {mode === "github" ? (
              <div className="examples">
                <span>{t.examples}</span>
                {EXAMPLES.map((ex) => (
                  <button type="button" key={ex} onClick={() => setValue(ex)}>
                    {ex.replace("https://github.com/", "")}
                  </button>
                ))}
              </div>
            ) : null}
          </form>
        </section>

        {job ? (
          <section className="result" ref={resultRef}>
            <div className="panel status">
              <div className="status-top">
                <div>
                  <h2>{t[job.status]}</h2>
                  {job.analysis ? (
                    <p className="muted">
                      <strong>{job.analysis.name}</strong> · {t.detected}: <span className="chip">{t.types[job.analysis.projectType]}</span> · {t.media}: <span className="chip">{t.mediaOrigins[job.analysis.mediaOrigin]}</span>{job.analysis.copySource ? (
                        <>
                          {" · "}{t.copy}: <span className="chip">{t.copySources[job.analysis.copySource]}</span>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                  {job.error ? <p className="form-error">{job.error}</p> : null}
                </div>
                <div className="status-side">
                  <div className="percent" aria-live="polite">{job.progress}<small>%</small></div>
                  {running ? (
                    <button type="button" className="btn btn-danger" onClick={cancel} disabled={cancelling}>
                      {cancelling ? t.cancelling : t.cancel}
                    </button>
                  ) : (
                    <button type="button" className="btn btn-small" onClick={reset}>{t.newJob}</button>
                  )}
                </div>
              </div>
              <div className="bar" role="progressbar" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100} aria-label={t.overall}>
                <i style={{ width: `${job.progress}%` }} />
              </div>
              <Stepper job={job} t={t} />
            </div>

            <div className="cards">
              {job.videos.map((v) => (
                <PhoneCard key={v.tier} video={v} t={t} />
              ))}
            </div>

            {job.analysis ? <StoryboardPanel stories={job.analysis.storyboards} t={t} /> : null}
          </section>
        ) : (
          <>
            <section className="how">
              <h2>{t.howTitle}</h2>
              <div className="how-grid">
                {[
                  [t.how1, t.how1d],
                  [t.how2, t.how2d],
                  [t.how3, t.how3d],
                ].map(([title, desc], i) => (
                  <div className="panel how-card" key={title}>
                    <span className="num">{i + 1}</span>
                    <h3>{title}</h3>
                    <p>{desc}</p>
                  </div>
                ))}
              </div>
            </section>
            <section className="how">
              <h2>{t.tiersTitle}</h2>
              <div className="how-grid">
                {t.optionNames.map((name, i) => (
                  <div className={`panel tier tier-${i}`} key={name}>
                    <span className={`pill ${i === 2 ? "pill-pro" : "pill-free"}`}>{i === 2 ? t.pro : t.free}</span>
                    <h3>{name}</h3>
                    <p>{t.optionDescs[i]}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {history.length ? (
          <section className="history">
            <h2>{t.recent}</h2>
            <div className="history-list">
              {history.map((h) => (
                <button key={h.jobId} onClick={() => openHistory(h.jobId)}>
                  <strong>{h.name}</strong>
                  <small>{new Date(h.at).toLocaleString(lang)}</small>
                  <span>{t.open} →</span>
                </button>
              ))}
              <button
                className="clear"
                onClick={() => {
                  localStorage.removeItem(HISTORY_KEY);
                  setHistory([]);
                }}
              >
                {t.clear}
              </button>
            </div>
          </section>
        ) : null}
      </main>
      <footer className="foot">{t.footer}</footer>
    </>
  );
};
