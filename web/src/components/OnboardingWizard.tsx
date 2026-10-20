import type { FormEvent } from "react";
import type { Dict } from "../i18n";
import type { ThemeId, Tone } from "../types";
import { Button, cx, fieldClass } from "./ui";

export interface IntentDraft {
  description: string;
  keyFeature: string;
  tone: Tone | null;
  theme: ThemeId | null;
}

export type SourceMode = "github" | "local";

interface Props {
  t: Dict;
  mode: SourceMode;
  onModeChange: (mode: SourceMode) => void;
  localSources: boolean;
  value: string;
  onValueChange: (value: string) => void;
  draft: IntentDraft;
  onDraftChange: (patch: Partial<IntentDraft>) => void;
  stepsOpen: boolean;
  working: boolean;
  error: string | null;
  examples: string[];
  onSubmit: (e: FormEvent) => void;
}

const StepLabel: React.FC<{ n: number; htmlFor?: string; id?: string; children: string }> = ({ n, htmlFor, id, children }) => {
  const body = (
    <>
      <span className="grid h-5 w-5 flex-none place-items-center rounded-full border border-white/15 bg-white/5 text-[11px] text-zinc-300">{n}</span>
      {children}
    </>
  );
  const cls = "mt-2 flex items-center gap-2.5 text-sm font-medium text-white";
  return htmlFor ? (
    <label htmlFor={htmlFor} className={cls}>{body}</label>
  ) : (
    <span id={id} className={cls}>{body}</span>
  );
};

export const OnboardingWizard: React.FC<Props> = ({ t, mode, onModeChange, localSources, value, onValueChange, draft, onDraftChange, stepsOpen, working, error, examples, onSubmit }) => (
  <form className="flex w-full max-w-[720px] flex-col gap-3 text-left" onSubmit={onSubmit}>
    {localSources ? (
      <div role="tablist" className="flex self-center rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
        {(["github", "local"] as const).map((m) => (
          <button
            type="button"
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => onModeChange(m)}
            className={cx("rounded-md px-4 py-1.5 text-sm font-medium transition-all duration-200", mode === m ? "bg-white/10 text-white" : "text-fog hover:text-white")}
          >
            {t[m]}
          </button>
        ))}
      </div>
    ) : null}

    <div className="flex flex-col gap-2 rounded-card border border-white/10 bg-white/[0.03] p-2 shadow-glow backdrop-blur-md transition-all duration-200 focus-within:border-white/25 focus-within:shadow-glow-lg sm:flex-row">
      <input
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={mode === "github" ? t.placeholderGithub : t.placeholderLocal}
        aria-label={t[mode]}
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-3.5 py-2.5 text-[15px] text-white outline-none placeholder:text-zinc-600"
      />
      <Button variant="primary" disabled={working} className="w-full sm:w-auto">
        {working ? t.working : t.generate}
      </Button>
    </div>

    {stepsOpen ? (
      <fieldset className="m-0 flex min-w-0 flex-col gap-2.5 rounded-panel border border-white/[0.08] bg-white/[0.03] p-5 shadow-glow backdrop-blur-md animate-fade-up-fast">
        <legend className="px-1.5 text-sm font-semibold text-white">{t.wizTitle}</legend>
        <p className="-mt-1 mb-1 text-sm text-fog">{t.wizHint}</p>

        <StepLabel n={1} htmlFor="projectDescription">{t.wizDescLabel}</StepLabel>
        <textarea
          id="projectDescription"
          name="projectDescription"
          rows={2}
          maxLength={300}
          value={draft.description}
          onChange={(e) => onDraftChange({ description: e.target.value })}
          placeholder={t.wizDescPlaceholder}
          className={cx(fieldClass, "resize-y")}
        />

        <StepLabel n={2} htmlFor="keyFeature">{t.wizKeyLabel}</StepLabel>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t.wizKeyLabel}>
          {t.wizKeyPresets.map((p) => {
            const on = draft.keyFeature === p;
            return (
              <button
                type="button"
                key={p}
                aria-pressed={on}
                onClick={() => onDraftChange({ keyFeature: on ? "" : p })}
                className={cx(
                  "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-200",
                  on ? "border-white/60 bg-white text-black shadow-glow" : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/25 hover:bg-white/10 hover:text-white",
                )}
              >
                {p}
              </button>
            );
          })}
        </div>
        <input
          id="keyFeature"
          name="keyFeature"
          maxLength={60}
          value={draft.keyFeature}
          onChange={(e) => onDraftChange({ keyFeature: e.target.value })}
          placeholder={t.wizKeyPlaceholder}
          className={fieldClass}
        />

        <StepLabel n={3} id="tone-label">{t.wizToneLabel}</StepLabel>
        <div role="radiogroup" aria-labelledby="tone-label" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {t.wizTones.map((o) => {
            const on = draft.tone === o.id;
            return (
              <label
                key={o.id}
                className={cx(
                  "relative flex cursor-pointer flex-col gap-0.5 rounded-card border p-3.5 transition-all duration-200 focus-within:ring-2 focus-within:ring-white/50",
                  on ? "border-white/40 bg-white/[0.08] shadow-glow" : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.05]",
                )}
              >
                <input type="radio" name="targetAudience" value={o.id} checked={on} onChange={() => onDraftChange({ tone: o.id as Tone })} className="pointer-events-none absolute opacity-0" />
                <span className={cx("absolute right-3 top-3 grid h-4 w-4 place-items-center rounded-full border text-[9px] transition-all duration-200", on ? "border-white bg-white text-black" : "border-white/20 text-transparent")}>✓</span>
                <strong className="pr-6 text-sm font-medium text-white">{o.name}</strong>
                <small className="text-xs text-fog">{o.desc}</small>
              </label>
            );
          })}
        </div>

        <StepLabel n={4} id="theme-label">{t.wizThemeLabel}</StepLabel>
        <div role="radiogroup" aria-labelledby="theme-label" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[{ id: "", name: t.wizThemeAuto, desc: t.wizThemeAutoDesc }, ...t.wizThemes].map((o) => {
            const on = (draft.theme ?? "") === o.id;
            return (
              <label
                key={o.id || "auto"}
                className={cx(
                  "relative flex cursor-pointer flex-col gap-0.5 rounded-card border p-3.5 transition-all duration-200 focus-within:ring-2 focus-within:ring-white/50",
                  on ? "border-white/40 bg-white/[0.08] shadow-glow" : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.05]",
                )}
              >
                <input type="radio" name="theme" value={o.id} checked={on} onChange={() => onDraftChange({ theme: o.id ? (o.id as ThemeId) : null })} className="pointer-events-none absolute opacity-0" />
                <span className={cx("absolute right-3 top-3 grid h-4 w-4 place-items-center rounded-full border text-[9px] transition-all duration-200", on ? "border-white bg-white text-black" : "border-white/20 text-transparent")}>✓</span>
                <strong className="pr-6 text-sm font-medium text-white">{o.name}</strong>
                <small className="text-xs text-fog">{o.desc}</small>
              </label>
            );
          })}
        </div>
      </fieldset>
    ) : null}

    {error ? (
      <p role="alert" className="text-sm text-red-400">
        {error}
      </p>
    ) : null}

    {mode === "github" ? (
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-fog">
        <span>{t.examples}</span>
        {examples.map((ex) => (
          <button
            type="button"
            key={ex}
            onClick={() => onValueChange(ex)}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-400 transition-all duration-200 hover:border-white/25 hover:bg-white/10 hover:text-white"
          >
            {ex.replace("https://github.com/", "")}
          </button>
        ))}
      </div>
    ) : null}
  </form>
);
