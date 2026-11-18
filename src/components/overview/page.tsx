"use client";

import { useRouter } from "next/navigation";
import { useConsoleData } from "../../hooks/use-console-data";
import { consolePagePaths } from "../../lib/console/routes";
import type { ConsolePage } from "../../lib/console/view-model";
import type { ConsoleStatus } from "../../lib/console/contract";
import { getConsoleCounts } from "../../lib/console/view-model";
import { OverviewPage } from "./OverviewContent";

export default function OverviewRoute() {
  const router = useRouter();
  const { snapshot, setActivityFilter } = useConsoleData();

  function navigate(page: ConsolePage) {
    router.push(consolePagePaths[page]);
  }

  function showActivityStatus(status: ConsoleStatus) {
    setActivityFilter(status);
    router.push(consolePagePaths.activity);
  }

  return (
    <OverviewPage
      counts={getConsoleCounts(snapshot)}
      activity={snapshot?.activity ?? []}
      loaded={snapshot !== null}
      onNavigate={navigate}
      onStatusClick={showActivityStatus}
    />
  );
}
