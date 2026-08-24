// The root layout is a SERVER component, and that is where the stylesheet
// belongs: one import for the whole app, no duplication per route, and no
// flash of unstyled grid.
//
// Importing CSS from a package is not a client-only operation — it is handled
// at build time — so no "use client" is needed here.

import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@nexgrid/react/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "NexGrid — Next.js App Router example",
  description: "A server page, a client grid, and a route handler that speaks NexGrid's wire format.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
