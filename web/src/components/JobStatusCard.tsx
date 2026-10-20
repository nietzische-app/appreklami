import type { Dict } from "../i18n";
import type { Job } from "../types";
import { Stepper } from "./Stepper";
import { Button, Card, Chip } from "./ui";

interface Props {
  job: Job;
  t: Dict;
  running: boolean;
  cancelling: boolean;
  onCancel: () => void;
  onReset: () => void;
}

export const JobStatusCard: React.FC<Props> = ({ job, t, running, cancelling, onCancel, onReset }) => (
  <Card glow className="p-6">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold tracking-tight">{t[job.status]}</h2>
        {job.analysis ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-fog">
            <strong className="font-medium text-white">{job.analysis.name}</strong>
            <span>·</span>
            <span>{t.detected}:</span> <Chip>{t.types[job.analysis.projectType]}</Chip>
            <span>{t.media}:</span> <Chip>{t.mediaOrigins[job.analysis.mediaOrigin]}</Chip>
            {job.intent?.keyFeature ? (
              <>
                <span>{t.focus}:</span> <Chip>{job.intent.keyFeature}</Chip>
              </>
            ) : null}
            {job.analysis.theme ? (
              <>
                <span>{t.theme}:</span> <Chip>{t.themes[job.analysis.theme] ?? job.analysis.theme}</Chip>
              </>
            ) : null}
            {job.analysis.copySource ? (
              <>
                <span>{t.copy}:</span> <Chip>{t.copySources[job.analysis.copySource]}</Chip>
              </>
            ) : null}
          </p>
        ) : null}
        {job.error ? <p className="mt-2 text-sm text-red-400">{job.error}</p> : null}
      </div>
      <div className="flex flex-none flex-col items-end gap-3">
        <div aria-live="polite" className="bg-gradient-to-b from-white to-white/60 bg-clip-text text-5xl font-semibold leading-none tracking-tighter text-transparent tabular-nums max-sm:text-4xl">
          {job.progress}
          <small className="ml-0.5 text-lg text-fog">%</small>
        </div>
        {running ? (
          <Button type="button" variant="danger" size="sm" onClick={onCancel} disabled={cancelling}>
            {cancelling ? t.cancelling : t.cancel}
          </Button>
        ) : (
          <Button type="button" variant="secondary" size="sm" onClick={onReset}>
            {t.newJob}
          </Button>
        )}
      </div>
    </div>
    <div
      role="progressbar"
      aria-valuenow={job.progress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={t.overall}
      className="my-5 h-1.5 overflow-hidden rounded-full bg-white/10"
    >
      <i
        style={{ width: `${job.progress}%` }}
        className="block h-full rounded-full bg-gradient-to-r from-white/40 via-white to-white/40 bg-[length:200%_100%] shadow-[0_0_12px_rgba(255,255,255,0.5)] transition-[width] duration-500 animate-shimmer"
      />
    </div>
    <Stepper job={job} t={t} />
  </Card>
);
