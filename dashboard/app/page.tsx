import Link from "next/link";
import { Nav } from "@/components/landing/Nav";
import { HeroVisual } from "@/components/landing/HeroVisual";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { Footer } from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-bg">
      <div className="pointer-events-none absolute inset-0 bg-grid-fade" />

      <Nav />

      <main className="relative mx-auto flex max-w-6xl flex-col gap-20 px-6 pb-24">
        <section className="grid min-h-screen items-center gap-10 pt-24 lg:grid-cols-2">
          <div className="flex flex-col items-start gap-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-overlay/10 bg-overlay/5 px-3 py-1 font-mono text-xs text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Built for Monad Testnet
            </span>

            <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-ink md:text-6xl">
              Agents can execute.
              <br />
              <span className="bg-gradient-to-r from-primary to-primary-2 bg-clip-text text-transparent">
                They shouldn&apos;t hold your money.
              </span>
            </h1>

            <p className="max-w-xl text-lg text-muted">
              Leash Protocol gives autonomous agents a cryptographic leash the owner holds.
              Funds never leave the owner&apos;s vault. Every spend is policy-checked
              on-chain, visible in real time, and revocable in one transaction.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href="/dashboard"
                className="rounded-lg bg-primary px-5 py-3 text-sm font-medium text-white shadow-glow transition-opacity hover:opacity-90"
              >
                Enter Dashboard
              </Link>
            </div>
          </div>

          <div className="hidden lg:block">
            <HeroVisual />
          </div>
        </section>

        <FeatureGrid />
      </main>

      <Footer />
    </div>
  );
}
