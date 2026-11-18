"use client";

import { useConsoleData } from "../../hooks/use-console-data";
import { AuditPage } from "./AuditContent";

export default function LogRoute() {
  const { snapshot } = useConsoleData();
  return <AuditPage entries={snapshot?.audit ?? []} loaded={snapshot !== null} />;
}
