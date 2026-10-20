import { useCallback, useEffect, useRef, useState } from "react";
import { cancelJob, createJob, getConfig, getJob, watchJob } from "./api";
import { BackgroundGrid } from "./components/BackgroundGrid";
import { HeroSection } from "./components/HeroSection";
import { JobStatusCard } from "./components/JobStatusCard";
import { LandingPage } from "./components/LandingPage";
import { OnboardingWizard, type IntentDraft, type SourceMode } from "./components/OnboardingWizard";
import { RecentJobs, type HistoryItem } from "./components/RecentJobs";
import { SiteHeader } from "./components/SiteHeader";
import { StoryboardPanel } from "./components/StoryboardPanel";
import { VideoPreviewCard } from "./components/VideoPreviewCard";
import { detectLang, messages, type Lang } from "./i18n";
import type { Intent, Job, ServerConfig } from "./types";

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
  const [mode, setMode] = useState<SourceMode>("github");
  const [value, setValue] = useState("");
  const [draft, setDraft] = useState<IntentDraft>({ description: "", keyFeature: "", tone: null });
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

  const wizardOpen = mode === "github" && GITHUB_RE.test(value.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (mode === "github" && !GITHUB_RE.test(v)) return setError(t.errorInvalid);
    if (!v) return setError(t.errorInvalid);
    setError(null);
    setBusy(true);
    try {
      const intent: Intent | undefined = wizardOpen
        ? {
            ...(draft.description.trim() ? { projectDescription: draft.description.trim() } : {}),
            ...(draft.keyFeature.trim() ? { keyFeature: draft.keyFeature.trim() } : {}),
            ...(draft.tone ? { targetAudience: draft.tone } : {}),
          }
        : undefined;
      const created = await createJob(mode === "github" ? { type: "github", url: v } : { type: "local", path: v }, intent && Object.keys(intent).length ? intent : undefined);
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
      <BackgroundGrid />
      <SiteHeader lang={lang} onLang={setLang} />

      <main className="mx-auto max-w-6xl px-5 pb-16">
        <HeroSection t={t}>
          <OnboardingWizard
            t={t}
            mode={mode}
            onModeChange={setMode}
            localSources={!!serverCfg?.localSources}
            value={value}
            onValueChange={setValue}
            draft={draft}
            onDraftChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            stepsOpen={wizardOpen}
            working={busy || !!running}
            error={error}
            examples={EXAMPLES}
            onSubmit={submit}
          />
        </HeroSection>

        {job ? (
          <section ref={resultRef} className="flex scroll-mt-4 flex-col gap-6 animate-fade-up">
            <JobStatusCard job={job} t={t} running={!!running} cancelling={cancelling} onCancel={cancel} onReset={reset} />
            <div className="mx-auto grid w-full max-w-md grid-cols-1 gap-5 md:max-w-none md:grid-cols-3">
              {job.videos.map((v) => (
                <VideoPreviewCard key={v.tier} video={v} t={t} />
              ))}
            </div>
            {job.analysis ? <StoryboardPanel stories={job.analysis.storyboards} t={t} /> : null}
          </section>
        ) : (
          <LandingPage t={t} />
        )}

        <RecentJobs
          items={history}
          t={t}
          lang={lang}
          onOpen={openHistory}
          onClear={() => {
            localStorage.removeItem(HISTORY_KEY);
            setHistory([]);
          }}
        />
      </main>
      <footer className="mx-auto max-w-6xl border-t border-white/[0.08] px-5 pb-12 pt-8 text-center text-sm text-fog">{t.footer}</footer>
    </>
  );
};
