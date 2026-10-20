import { FPS } from "../shared/video";

/** Scene layout of the 18s promo (540 frames @ 30fps). */
export const HOOK = { from: 0, duration: 5 * FPS };
export const FEATURE_DURATION = 3 * FPS;
export const FEATURES_FROM = HOOK.duration;
export const featureScene = (i: number) => ({ from: FEATURES_FROM + i * FEATURE_DURATION, duration: FEATURE_DURATION });
export const OUTRO = { from: FEATURES_FROM + 3 * FEATURE_DURATION, duration: 4 * FPS };
