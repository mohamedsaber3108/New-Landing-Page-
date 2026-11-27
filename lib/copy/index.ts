import { ar } from "./ar";
import { en } from "./en";
import type { SiteCopy } from "./types";

export type { LinkCopy, RouteDetail, SectionCopy, SiteCopy } from "./types";

/** Site-shell copy by locale. Both entries satisfy the same SiteCopy type. */
export const siteCopy: Record<"en" | "ar", SiteCopy> = { en, ar };
