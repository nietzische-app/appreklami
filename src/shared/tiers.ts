import type { TierConfig } from "./types";

import { VIDEO_HEIGHT, VIDEO_WIDTH } from "./video";

export * from "./video";

/**
 * The three product tiers. Free tiers render at 1080x1920 with a watermark,
 * the PRO tier renders at 2160x3840 (scale 2) without a watermark.
 */
export const TIERS: TierConfig[] = [
  {
    id: "basic",
    option: 1,
    label: "Free - Basic",
    compositionId: "promo-basic",
    scale: 1,
    watermark: true,
    premium: false,
    crf: 23,
  },
  {
    id: "dynamic",
    option: 2,
    label: "Free - Dynamic",
    compositionId: "promo-dynamic",
    scale: 1,
    watermark: true,
    premium: false,
    crf: 21,
  },
  {
    id: "pro",
    option: 3,
    label: "PRO - Premium",
    compositionId: "promo-pro",
    scale: Number(process.env.PRO_RENDER_SCALE ?? 2),
    watermark: false,
    premium: true,
    crf: 16,
  },
];

export const outputFileName = (tier: TierConfig) => `option-${tier.option}-${tier.id}.mp4`;

export const resolutionOf = (tier: TierConfig) =>
  `${Math.round(VIDEO_WIDTH * tier.scale)}x${Math.round(VIDEO_HEIGHT * tier.scale)}`;
