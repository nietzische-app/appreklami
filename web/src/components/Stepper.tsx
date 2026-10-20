import type { Dict } from "../i18n";
import type { Job } from "../types";
import { cx } from "./ui";

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
    <ol className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-4">
      {t.steps.map((label, i) => {
        const s = stateOf(i);
        return (
          <li key={label} className={cx("flex items-center gap-2.5 text-sm font-medium", s === "todo" ? "text-fog" : "text-white")}>
            <span
              className={cx(
                "grid h-6 w-6 flex-none place-items-center rounded-full border text-xs transition-all duration-200",
                s === "done" && "border-white bg-white text-black",
                s === "active" && "border-white text-white animate-pulse-ring",
                s === "todo" && "border-white/15",
              )}
            >
              {s === "done" ? "✓" : i + 1}
            </span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
};
