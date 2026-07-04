"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { LayoutDashboard, Bot, Wallet, FileCode, PlayCircle, Settings } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";
import { requireVaultAddress, shortAddress, explorerAddressUrl } from "@/lib/config";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/agents", label: "Agents", icon: Bot },
  { href: "/dashboard/treasury", label: "Treasury", icon: Wallet },
  { href: "/dashboard/skills", label: "Skills.md", icon: FileCode },
  { href: "/dashboard/demo", label: "Demo", icon: PlayCircle },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const vaultAddress = requireVaultAddress();

  return (
    <aside className="sticky top-0 flex h-screen w-64 flex-shrink-0 flex-col overflow-y-auto border-r border-overlay/8 bg-surface px-4 py-5">
      <Link href="/" className="px-2">
        <Logo />
      </Link>

      <nav className="mt-8 flex flex-col gap-1">
        {navItems.map((item) => {
          const active = item.href === "/dashboard" ? pathname === item.href : pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-primary/10 text-primary" : "text-muted hover:bg-overlay/5 hover:text-ink"
              )}
            >
              <Icon size={17} strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <a
          href={explorerAddressUrl(vaultAddress)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-lg border border-overlay/8 bg-bg px-3 py-2 font-mono text-xs text-muted hover:text-ink"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          vault {shortAddress(vaultAddress)}
        </a>

        <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
      </div>
    </aside>
  );
}
