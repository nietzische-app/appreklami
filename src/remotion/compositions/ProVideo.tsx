import React from "react";
import type { VideoProps } from "../../shared/types";
import { PromoComposition } from "../components/Composition";

/** Option 3: the chosen theme at full strength (camera, shake, every sound), rendered larger and without a watermark. */
export const ProVideo: React.FC<VideoProps> = (p) => <PromoComposition {...p} tier="pro" />;
