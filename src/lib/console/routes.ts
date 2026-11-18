import type { ConsolePage } from "./view-model";

export const consolePagePaths: Record<ConsolePage, string> = {
  overview: "/",
  queue: "/approval",
  activity: "/history",
  audit: "/log",
};
