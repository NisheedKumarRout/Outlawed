import type { Metadata } from "next";
import { Reddit_Sans } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/ui/ThemeToggle";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "LegalCompass",
    template: "%s · LegalCompass",
  },
  description: "Verified knowledge-to-action for legal-aid organizations.",
};

const redditSans = Reddit_Sans({
  subsets: ["latin"],
  variable: "--font-reddit-sans",
  display: "swap",
});

const themeInitializer = `
  (function () {
    try {
      var savedTheme = window.localStorage.getItem("outlawed-otr-theme");
      var theme = savedTheme === "light" || savedTheme === "dark"
        ? savedTheme
        : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    } catch (_) {}
  })();
`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      data-theme="light"
      suppressHydrationWarning
    >
      <head>
        <Script
          id="outlawed-theme-initializer"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitializer }}
        />
      </head>
      <body className={redditSans.variable}>
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
