import React from "react";
import type { VideoProps } from "../../shared/types";
import { PromoComposition } from "../components/Composition";

/** Option 1: the chosen theme, calmly. Fades, no camera, a few soft sounds from the theme. */
export const BasicVideo: React.FC<VideoProps> = (p) => <PromoComposition {...p} tier="basic" />;
