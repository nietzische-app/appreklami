import React from "react";
import type { VideoProps } from "../../shared/types";
import { PromoComposition } from "../components/Composition";

/** Option 2: the chosen theme with kinetic captions and the theme's accent sounds. */
export const DynamicVideo: React.FC<VideoProps> = (p) => <PromoComposition {...p} tier="dynamic" />;
