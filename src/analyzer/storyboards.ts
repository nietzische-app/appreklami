import type { Feature, ProjectType, Storyboard } from "../shared/types";

interface Copy {
  hooks: string[];
  featurePool: Feature[][];
  outros: string[];
  ctas: string[];
  angles: string[];
}

/**
 * Deterministic marketing copy per project type. Each type has three angles,
 * one per output video. Swap `buildStoryboards` for an LLM call later without
 * touching the rest of the pipeline - the output shape stays the same.
 */
const COPY: Record<ProjectType, Copy> = {
  game: {
    angles: ["Challenge hook", "Gameplay feature rush", "Community & replay"],
    hooks: [
      "Think you can beat {name}?",
      "Press START. {name} is live.",
      "One more run? {name} says yes.",
    ],
    featurePool: [
      [
        { title: "Fast, fair gameplay", description: "Easy to learn, hard to put down." },
        { title: "Levels that fight back", description: "Every stage raises the stakes." },
        { title: "Chase the high score", description: "Beat your best, then beat everyone." },
      ],
      [
        { title: "Instant action", description: "Zero waiting. Jump in and play." },
        { title: "Crisp visuals", description: "Style that pops on every screen." },
        { title: "Power-ups & surprises", description: "No two runs feel the same." },
      ],
      [
        { title: "Play with friends", description: "Share runs and trade bragging rights." },
        { title: "Always evolving", description: "New content shaped by players." },
        { title: "Open to everyone", description: "Hop in, no setup needed." },
      ],
    ],
    outros: ["Game on.", "Your next favorite game.", "See you on the leaderboard."],
    ctas: ["Play {name} now", "Download & play today", "Join the fun"],
  },
  "mobile-app": {
    angles: ["Problem / solution hook", "Everyday feature tour", "Social proof & download"],
    hooks: [
      "Your phone just got smarter.",
      "Meet {name}. Pocket-sized power.",
      "Why juggle apps? Try {name}.",
    ],
    featurePool: [
      [
        { title: "Set up in seconds", description: "Open the app and you're ready." },
        { title: "Built for one hand", description: "Smooth, thumb-friendly design." },
        { title: "Works wherever you are", description: "Fast on the go, even on weak signal." },
      ],
      [
        { title: "Everything in one place", description: "Less switching, more doing." },
        { title: "Smart notifications", description: "Only what matters, right when it matters." },
        { title: "Beautiful & fast", description: "Native feel with zero lag." },
      ],
      [
        { title: "Loved by early users", description: "Simple enough to recommend." },
        { title: "Private by design", description: "Your data stays yours." },
        { title: "Free to try", description: "Download and see for yourself." },
      ],
    ],
    outros: ["Get it on your phone.", "Download {name} today.", "Your new daily habit."],
    ctas: ["Get the app", "Download free", "Try {name} today"],
  },
  "saas-web": {
    angles: ["Pain-point hook", "Feature stack", "ROI & get started"],
    hooks: [
      "Still doing this the hard way?",
      "Ship faster with {name}.",
      "Meet {name}. Work, simplified.",
    ],
    featurePool: [
      [
        { title: "Launch in minutes", description: "Skip the setup, start with results." },
        { title: "One clear dashboard", description: "See everything that matters at a glance." },
        { title: "Automate the busywork", description: "Let {name} handle the repetitive parts." },
      ],
      [
        { title: "Powerful integrations", description: "Plays nicely with your existing stack." },
        { title: "API-first", description: "Build on top of {name} your way." },
        { title: "Built for teams", description: "Collaborate without friction." },
      ],
      [
        { title: "Save hours every week", description: "Less manual work, more momentum." },
        { title: "Secure by default", description: "Reliable and ready to scale." },
        { title: "Start free", description: "No credit card, no commitment." },
      ],
    ],
    outros: ["Work smarter.", "Grow with {name}.", "Your team will thank you."],
    ctas: ["Start free with {name}", "Try the demo", "Get started today"],
  },
};

/** First sentence if it is short enough, otherwise a word-boundary cut. */
const shorten = (text: string, max: number) => {
  const first = text.split(/(?<=[.!?])\s/)[0];
  if (first.length <= max) return first;
  const cut = text.slice(0, max).replace(/\s+\S*$/, "");
  return `${cut}…`;
};

const fill = (s: string, name: string) => s.replaceAll("{name}", name);

export function buildStoryboards(
  type: ProjectType,
  name: string,
  tagline: string,
  readmeFeatures: string[],
): Storyboard[] {
  const copy = COPY[type];
  const realFeatures: Feature[] = readmeFeatures.map((text) => {
    const [head, ...rest] = text.split(/\s[-:–—]\s|:\s/);
    const title = head.length > 42 ? `${head.slice(0, 40).trim()}…` : head;
    return { title, description: rest.join(" - ") || tagline.slice(0, 80) };
  });

  return [0, 1, 2].map((i) => {
    const template = copy.featurePool[i].map((f) => ({
      title: fill(f.title, name),
      description: fill(f.description, name),
    }));
    // Real README material first (rotated per video so the cuts differ); templates only fill the gaps.
    const real: Feature[] = [];
    for (let k = 0; k < Math.min(3, realFeatures.length); k++) real.push(realFeatures[(i + k) % realFeatures.length]);
    const blended = [...real, ...template.slice(real.length)];
    return {
      id: `story-${i + 1}`,
      angle: copy.angles[i],
      hook: i === 1 && tagline ? shorten(tagline, 70) : fill(copy.hooks[i], name),
      features: blended.slice(0, 3),
      outro: fill(copy.outros[i], name),
      cta: fill(copy.ctas[i], name),
    };
  });
}
