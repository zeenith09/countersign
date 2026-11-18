"use client";

import { useContext } from "react";
import { ConsoleContext } from "../contexts/ConsoleContext";

export function useConsoleData() {
  const context = useContext(ConsoleContext);
  if (!context) {
    throw new Error("Console data is unavailable outside the console layout.");
  }
  return context;
}
