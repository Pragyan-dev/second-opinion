import type { Metadata } from "next";
import Link from "next/link";
import { Bodoni_Moda, Public_Sans } from "next/font/google";
import { SiteNav } from "@/components/shared/SiteNav";
import { RosetteGlyph } from "@/components/shared/RosetteGlyph";
import "./globals.css";

const bodoni = Bodoni_Moda({ subsets: ["latin"], variable: "--font-bodoni", style: ["normal", "italic"], axes: ["opsz"], display: "swap", adjustFontFallback: false });
const publicSans = Public_Sans({ subsets: ["latin"], variable: "--font-public", display: "swap" });

export const metadata: Metadata = {
  title: "Second Opinion",
  description: "Check the pitch before you believe it. Research the stock before you buy it. The final click is yours.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bodoni.variable} ${publicSans.variable}`}>
      <body>
        <a className="skip" href="#main">Skip to main content</a>
        <header className="siteHeader">
          <div className="siteHeaderInner">
            <Link href="/" className="wordmark"><RosetteGlyph />Second Opinion</Link>
            <SiteNav />
          </div>
        </header>
        <aside className="demoNotice"><p>Demo data. Brightwater Capital Advisors and BRWT are fictional.</p></aside>
        <main id="main" className="page">{children}</main>
        <footer className="siteFooter">
          <p>Not financial advice. Second Opinion never places trades. Likelihoods are estimates with hand-set weights.</p>
        </footer>
      </body>
    </html>
  );
}
