"use client";

import { useConsoleData } from "../../hooks/use-console-data";
import { ActivityPage } from "./HistoryContent";

export default function HistoryRoute() {
  const { activityFilter, setActivityFilter, snapshot } = useConsoleData();
  return (
    <ActivityPage
      activity={snapshot?.activity ?? []}
      loaded={snapshot !== null}
      filter={activityFilter}
      setFilter={setActivityFilter}
    />
  );
}
