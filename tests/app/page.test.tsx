// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Home from "../../src/app/(console)/page";

vi.mock("../../src/components/overview/page", () => ({
  default: () => <main>Console page</main>,
}));

describe("home page", () => {
  it("renders the console page", () => {
    render(<Home />);

    expect(screen.getByRole("main").textContent).toBe("Console page");
  });
});
