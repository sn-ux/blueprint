"use client";

import Link from "next/link";
import SphereCanvas from "@/components/SphereCanvas";

export default function EscapePage() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col">

      {/* ── Wordmark ────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-10 pt-8">
        <Link
          href="/"
          className="text-xs tracking-[0.25em] uppercase text-zinc-600 hover:text-zinc-400 font-medium select-none transition-colors duration-300"
        >
          Blueprint
        </Link>
      </div>

      {/* ── Copy ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center text-center px-6 pt-20 pb-16 max-w-2xl mx-auto">
        <p className="text-xs tracking-[0.20em] uppercase text-zinc-600 mb-8 font-medium">
          The Escape
        </p>

        <h1 className="text-3xl md:text-4xl lg:text-[2.6rem] font-light leading-[1.2] text-white mb-10">
          You get past these constraints by exploring someone you trust.
        </h1>

        <div className="space-y-5 max-w-lg">
          <p className="text-base text-zinc-400 leading-relaxed">
            Discovery expands when you move through someone else&apos;s digital life.
            Someone with taste you respect.
            Someone closer to a scene.
            Someone who sees what you don&apos;t.
          </p>
          <p className="text-sm text-zinc-600 leading-relaxed">
            What you didn&apos;t know to look for becomes visible.
          </p>
        </div>
      </div>

      {/* ── Two spheres ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center gap-0 md:gap-8 px-4 pb-16 min-h-[420px]">

        {/* Left sphere — "you" */}
        <div className="relative w-[44vw] max-w-[420px] aspect-square flex-shrink-0">
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              background: "radial-gradient(circle at 50% 50%, transparent 38%, black 78%)",
            }}
          />
          <SphereCanvas
            className="w-full h-full"
            rotSpeed={0.0020}
            initialRotX={0.28}
            initialRotY={0.4}
          />
        </div>

        {/* Right sphere — "someone you trust" */}
        <div className="relative w-[44vw] max-w-[420px] aspect-square flex-shrink-0">
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              background: "radial-gradient(circle at 50% 50%, transparent 38%, black 78%)",
            }}
          />
          <SphereCanvas
            className="w-full h-full"
            rotSpeed={0.0018}
            initialRotX={0.22}
            initialRotY={2.2}
          />
        </div>

      </div>

    </main>
  );
}
