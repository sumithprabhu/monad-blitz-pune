"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ShieldAlert, KeyRound, Bot } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { HeroVisual } from "@/components/landing/HeroVisual";
import { PillarCard } from "@/components/landing/PillarCard";
import { pillars } from "@/components/landing/FeatureGrid";

function SlideShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col justify-center px-8">{children}</div>
  );
}

function WhatSlide() {
  return (
    <SlideShell>
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div className="flex flex-col items-start gap-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-overlay/10 bg-overlay/5 px-3 py-1 font-mono text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Built for Monad Testnet
          </span>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-ink md:text-6xl">
            What is
            <br />
            <span className="bg-gradient-to-r from-primary to-primary-2 bg-clip-text text-transparent">
              Leash Protocol?
            </span>
          </h1>
          <p className="max-w-xl text-lg text-muted">
            An on-chain spend-authorization layer for autonomous agents. One vault, one pooled
            balance, every user tracked separately - agents can execute payments on your
            behalf, but only ever within the exact limits, recipients, and oversight you set.
            Funds never leave your tracked balance; the agent only ever holds permission.
          </p>
        </div>
        <div className="hidden lg:block">
          <HeroVisual />
        </div>
      </div>
    </SlideShell>
  );
}

function WhySlide() {
  const points = [
    {
      icon: KeyRound,
      title: "Agent wallets are all-or-nothing",
      body: "Give an agent its own private key and a single leak, bug, or prompt injection means a total, irreversible drain. There's no in-between.",
    },
    {
      icon: Bot,
      title: "Agents are getting real spending power",
      body: "AI agents already pay for compute, data feeds, APIs, and infra autonomously - today, usually with a raw hot wallet and no guardrails.",
    },
    {
      icon: ShieldAlert,
      title: "Session keys answer \"who\", not \"how much\"",
      body: "ERC-4337 session keys and scoped permissions control who can sign. They don't cap amounts, enforce recipients, queue anomalies, or give you a kill switch.",
    },
  ];
  return (
    <SlideShell>
      <p className="font-mono text-xs uppercase tracking-widest text-faint">The problem</p>
      <h2 className="mt-2 max-w-2xl text-3xl font-semibold leading-tight text-ink md:text-5xl">
        Agents can execute. They shouldn&apos;t hold your money.
      </h2>
      <div className="mt-10 grid gap-5 sm:grid-cols-3">
        {points.map((p) => (
          <div key={p.title} className="rounded-2xl border border-overlay/8 bg-surface p-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <p.icon size={20} strokeWidth={2} />
            </div>
            <h3 className="mt-4 text-base font-semibold text-ink">{p.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
          </div>
        ))}
      </div>
    </SlideShell>
  );
}

function FeaturesSlide() {
  return (
    <SlideShell>
      <p className="font-mono text-xs uppercase tracking-widest text-faint">The solution</p>
      <h2 className="mt-2 max-w-2xl text-3xl font-semibold leading-tight text-ink md:text-5xl">
        A leaked agent key is bounded damage, by design.
      </h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pillars.map((p) => (
          <PillarCard key={p.index} {...p} />
        ))}
      </div>
    </SlideShell>
  );
}

const slides = [
  { label: "What", render: WhatSlide },
  { label: "Why", render: WhySlide },
  { label: "Features", render: FeaturesSlide },
];

export function PitchDeck() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") setIndex((i) => Math.min(i + 1, slides.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const Slide = slides[index].render;

  return (
    <div className="relative h-screen overflow-hidden bg-bg">
      <div className="pointer-events-none absolute inset-0 bg-grid-fade" />

      <div className="relative flex items-center justify-between px-8 py-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink">
          <ArrowLeft size={16} />
          Back to site
        </Link>
        <Logo />
        <span className="font-mono text-xs text-faint">
          {index + 1} / {slides.length}
        </span>
      </div>

      <div className="relative" style={{ height: "calc(100vh - 88px)" }}>
        <Slide />
      </div>

      <div className="absolute inset-x-0 bottom-8 flex items-center justify-center gap-6">
        <button
          onClick={() => setIndex((i) => Math.max(i - 1, 0))}
          disabled={index === 0}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-overlay/10 text-muted transition-colors hover:text-ink disabled:opacity-30"
          aria-label="Previous slide"
        >
          <ArrowLeft size={16} />
        </button>

        <div className="flex items-center gap-2">
          {slides.map((s, i) => (
            <button
              key={s.label}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-6 bg-primary" : "w-1.5 bg-overlay/15 hover:bg-overlay/25"
              }`}
              aria-label={`Go to slide ${i + 1}: ${s.label}`}
            />
          ))}
        </div>

        <button
          onClick={() => setIndex((i) => Math.min(i + 1, slides.length - 1))}
          disabled={index === slides.length - 1}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-overlay/10 text-muted transition-colors hover:text-ink disabled:opacity-30"
          aria-label="Next slide"
        >
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
