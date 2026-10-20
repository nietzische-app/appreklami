import type { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(" ");

export const fieldClass =
  "w-full rounded-lg border border-white/10 bg-black px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none transition-all duration-200 focus:border-white/30 focus:ring-1 focus:ring-white/30";

type BadgeTone = "neutral" | "pro" | "solid";
const badgeTones: Record<BadgeTone, string> = {
  neutral: "border-white/10 bg-white/5 text-zinc-400",
  pro: "border-amber-200/20 bg-amber-200/10 text-amber-200",
  solid: "border-white/80 bg-white text-black",
};

export const Badge: React.FC<{ tone?: BadgeTone; className?: string; children: ReactNode }> = ({ tone = "neutral", className, children }) => (
  <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs backdrop-blur-md", badgeTones[tone], className)}>{children}</span>
);

type ButtonVariant = "primary" | "secondary" | "danger" | "pro";
type ButtonSize = "md" | "sm";

const variants: Record<ButtonVariant, string> = {
  primary: "border-white/70 bg-btn-light text-black shadow-glow hover:shadow-glow-lg hover:brightness-95",
  secondary: "border-white/10 bg-btn-dark text-white shadow-inset hover:bg-white/10 hover:border-white/20 hover:shadow-glow",
  danger: "border-red-400/30 bg-red-400/10 text-red-300 hover:bg-red-400/20",
  pro: "border-amber-200/30 bg-amber-200/10 text-amber-200 hover:bg-amber-200/20",
};
const sizes: Record<ButtonSize, string> = {
  md: "px-5 py-2.5 text-sm",
  sm: "px-3.5 py-1.5 text-xs",
};

export const buttonClass = (variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string): string =>
  cx(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-medium transition-all duration-200 disabled:cursor-progress disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  );

export const Button: React.FC<ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }> = ({ variant, size, className, ...rest }) => (
  <button className={buttonClass(variant, size, className)} {...rest} />
);

export const ButtonLink: React.FC<AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant; size?: ButtonSize }> = ({ variant, size, className, ...rest }) => (
  <a className={buttonClass(variant, size, className)} {...rest} />
);

export const Card: React.FC<HTMLAttributes<HTMLDivElement> & { glow?: boolean }> = ({ glow, className, ...rest }) => (
  <div className={cx("rounded-panel border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm", glow && "shadow-glow", className)} {...rest} />
);

export const Chip: React.FC<{ children: ReactNode }> = ({ children }) => (
  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-zinc-300">{children}</span>
);

export const SectionTitle: React.FC<{ children: ReactNode }> = ({ children }) => (
  <h2 className="mb-5 bg-gradient-to-b from-white to-white/60 bg-clip-text text-xl font-semibold tracking-tight text-transparent">{children}</h2>
);
