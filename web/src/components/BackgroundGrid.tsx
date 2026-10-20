export const BackgroundGrid: React.FC = () => (
  <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-ink">
    <div className="absolute inset-0 bg-grid-lines bg-grid [mask-image:radial-gradient(ellipse_75%_60%_at_50%_0%,#000_25%,transparent_80%)]" />
    <div className="absolute left-1/2 top-[-22rem] h-[44rem] w-[64rem] max-w-[160vw] -translate-x-1/2 rounded-full bg-glow-radial opacity-80 animate-glow-pulse" />
    <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black to-transparent" />
  </div>
);
