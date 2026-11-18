import type { ReactNode } from "react";
import { ConsoleLayout } from "../../components/layout/ConsoleLayout";
import "../../components/layout/console-layout.css";
import "../../components/header/header.css";
import "../../components/ui/console-controls.css";
import "../../components/dialogs/action-dialogs.css";
import "../../components/dialogs/generator-dialog.css";
import "../../components/dialogs/reviewer-profile-dialog.css";

export default function ConsoleRouteLayout({ children }: { children: ReactNode }) {
  return <ConsoleLayout>{children}</ConsoleLayout>;
}
