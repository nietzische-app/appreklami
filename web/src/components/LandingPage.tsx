import type { Dict } from "../i18n";
import { Badge, Card, SectionTitle, cx } from "./ui";

const HowItWorks: React.FC<{ t: Dict }> = ({ t }) => (
  <section className="mb-12">
    <SectionTitle>{t.howTitle}</SectionTitle>
    <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      {(
        [
          [t.how1, t.how1d],
          [t.how2, t.how2d],
          [t.how3, t.how3d],
        ] as const
      ).map(([title, desc], i) => (
        <Card key={title} className="group p-6 transition-all duration-200 hover:border-white/15 hover:bg-white/[0.05] hover:shadow-glow">
          <span className="mb-4 grid h-8 w-8 place-items-center rounded-lg border border-white/15 bg-btn-dark text-sm font-medium shadow-inset">{i + 1}</span>
          <h3 className="text-base font-medium tracking-tight">{title}</h3>
          <p className="mt-1.5 text-sm text-fog">{desc}</p>
        </Card>
      ))}
    </div>
  </section>
);

const Tiers: React.FC<{ t: Dict }> = ({ t }) => (
  <section className="mb-12">
    <SectionTitle>{t.tiersTitle}</SectionTitle>
    <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      {t.optionNames.map((name, i) => {
        const pro = i === 2;
        return (
          <Card
            key={name}
            glow={pro}
            className={cx("relative overflow-hidden p-6 transition-all duration-200 hover:border-white/15 hover:bg-white/[0.05]", pro && "border-white/[0.16]")}
          >
            {pro ? <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" /> : null}
            <Badge tone={pro ? "pro" : "neutral"} className="py-0.5 font-medium uppercase tracking-wider">
              {pro ? t.pro : t.free}
            </Badge>
            <h3 className="mb-1.5 mt-3 text-lg font-medium tracking-tight">{name}</h3>
            <p className="text-sm text-fog">{t.optionDescs[i]}</p>
          </Card>
        );
      })}
    </div>
  </section>
);

export const LandingPage: React.FC<{ t: Dict }> = ({ t }) => (
  <div className="animate-fade-up">
    <HowItWorks t={t} />
    <Tiers t={t} />
  </div>
);
