// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleHeader } from "../../../src/components/header/ConsoleHeader";

describe("ConsoleHeader interactions", () => {
  afterEach(cleanup);

  it("routes navigation and opens or closes the mobile navigation", () => {
    const onNavigate = vi.fn();
    const onMobileNavChange = vi.fn();
    const onOpenGenerator = vi.fn();
    const onOpenProfile = vi.fn();
    const { container, rerender } = render(
      <ConsoleHeader
        page="queue"
        mobileNav={false}
        hasSnapshot
        pendingCount={3}
        snapshotError=""
        reviewer="Alex"
        profileColor="#2c2782"
        onNavigate={onNavigate}
        onMobileNavChange={onMobileNavChange}
        onOpenGenerator={onOpenGenerator}
        onOpenProfile={onOpenProfile}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    fireEvent.click(screen.getByRole("button", { name: "New action" }));
    fireEvent.click(screen.getByRole("button", { name: "Reviewer profile: Alex" }));
    expect(onNavigate).toHaveBeenCalledWith("overview");
    expect(onMobileNavChange).toHaveBeenCalledWith(true);
    expect(onOpenGenerator).toHaveBeenCalledOnce();
    expect(onOpenProfile).toHaveBeenCalledOnce();
    expect(screen.getByText("Data loaded")).toBeTruthy();

    rerender(
      <ConsoleHeader
        page="queue"
        mobileNav
        hasSnapshot={false}
        pendingCount={0}
        snapshotError="unavailable"
        reviewer=""
        profileColor="#ffffff"
        onNavigate={onNavigate}
        onMobileNavChange={onMobileNavChange}
        onOpenGenerator={onOpenGenerator}
        onOpenProfile={onOpenProfile}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Close navigation" })[0]);
    const backdrop = container.querySelector(".nav-backdrop");
    expect(backdrop).not.toBeNull();
    if (backdrop) fireEvent.click(backdrop);
    expect(onMobileNavChange).toHaveBeenCalledWith(false);
    expect(screen.getByText("Data unavailable")).toBeTruthy();
  });
});
