"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/#capture", match: "/fraud", label: "Fraud check" },
  { href: "/#stock-research", match: "/stock", label: "Stock research" },
];

export function SiteNav() {
  const path = usePathname() ?? "";
  return (
    <nav className="siteNav" aria-label="Main">
      {ITEMS.map(i => (
        <Link key={i.href} href={i.href} aria-current={path.startsWith(i.match) ? "page" : undefined}>{i.label}</Link>
      ))}
    </nav>
  );
}
