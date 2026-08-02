"use client";

import { createContext, useContext } from "react";

export const InScrollRowContext = createContext(false);

export function useInScrollRow() {
  return useContext(InScrollRowContext);
}
