import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Mono, Atkinson_Hyperlegible_Next } from "next/font/google";

import "./globals.css";

// Designed by the Braille Institute for low-vision readers: letters that are hard to confuse
// (Il1, O0) matter on a medication record.
// next/font has no metrics for these to size a fallback, so none is generated.
const sans = Atkinson_Hyperlegible_Next({
  variable: "--font-sans",
  subsets: ["latin"],
  adjustFontFallback: false,
  fallback: ["system-ui", "sans-serif"],
});
const mono = Atkinson_Hyperlegible_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  adjustFontFallback: false,
  fallback: ["ui-monospace", "monospace"],
});

export const metadata: Metadata = {
  title: { default: "CareDesk", template: "%s · CareDesk" },
  description:
    "Natural-language access to live resident records for Willowbrook Care. A demonstration built on synthetic data.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      {/* Browser extensions (ColorZilla, Grammarly) add attributes to <body> before React hydrates;
          the flag silences that one element's attribute mismatches and nothing else. */}
      <body className="min-h-full" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
