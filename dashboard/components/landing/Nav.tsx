import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export function Nav() {
  return (
    <header className="fixed inset-x-0 top-4 z-50 flex justify-center px-6">
      <div className="flex w-full max-w-6xl items-center justify-between rounded-full border border-overlay/8 bg-surface/80 px-6 py-3 shadow-lg shadow-overlay/5 backdrop-blur-md">
        <Logo />

        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="hidden text-sm font-medium text-muted transition-colors hover:text-ink sm:block">
            Sign in
          </Link>
          <Link
            href="/dashboard"
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Launch Dashboard
          </Link>
        </div>
      </div>
    </header>
  );
}
