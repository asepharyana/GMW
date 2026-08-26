"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Hash, Search, Sparkles, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import { Avatar, Badge, GlassPanel, Input } from "@/components/primitives";
import { EmptyState, SectionHeader, SkeletonRows } from "@/components/shared";
import { useChannels, useMessageSearch, useTopReactors } from "@/hooks";
import { useStaggerReveal } from "@/hooks/use-gsap-animation";
import { aiTone } from "@/lib/ai-status";
import {
  formatDuration,
  getMessageChannelLabel,
  renderMessageContent,
} from "@/lib/format";

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP);
}

export function AnalysisView() {
  const [query, setQuery] = useState("");
  const search = useMessageSearch(query, query.trim().length >= 2);
  const { data: reactors } = useTopReactors();
  const { data: channels } = useChannels();
  const ambient = useAmbient();

  const reactorsRef = useRef<HTMLDivElement>(null);
  const channelsRef = useRef<HTMLDivElement>(null);

  const resultsRef = useStaggerReveal<HTMLDivElement>(".search-result-card", {
    stagger: 0.03,
    y: 8,
    dependencies: [search.data?.length, query],
  });

  useEffect(() => {
    ambient.set(
      query ? "amber" : "signal",
      0.3,
      query ? "analyzing" : "search",
    );
  }, [query, ambient]);

  // Count-up + bar-fill reveal for the reactor leaderboard — HUD gauge motif.
  useGSAP(
    () => {
      if (!reactorsRef.current) return;
      const bars = reactorsRef.current.querySelectorAll(".reactor-bar-fill");
      const counters = reactorsRef.current.querySelectorAll(".reactor-count");
      if (bars.length === 0) return;
      const prefersReduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (prefersReduced) {
        gsap.set(bars, { scaleX: 1 });
        return;
      }
      gsap.fromTo(
        bars,
        { scaleX: 0 },
        {
          scaleX: 1,
          duration: 0.7,
          stagger: 0.06,
          ease: "power2.out",
          transformOrigin: "left center",
        },
      );
      counters.forEach((el) => {
        const target = Number(el.getAttribute("data-target") ?? "0");
        const obj = { val: 0 };
        gsap.to(obj, {
          val: target,
          duration: 0.8,
          ease: "power2.out",
          onUpdate: () => {
            el.textContent = `+${Math.round(obj.val)}`;
          },
        });
      });
    },
    { scope: reactorsRef, dependencies: [reactors] },
  );

  useGSAP(
    () => {
      if (!channelsRef.current) return;
      const rows = channelsRef.current.querySelectorAll(".channel-row");
      if (rows.length === 0) return;
      const prefersReduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (prefersReduced) {
        gsap.set(rows, { opacity: 1, x: 0 });
        return;
      }
      gsap.fromTo(
        rows,
        { opacity: 0, x: -10 },
        {
          opacity: 1,
          x: 0,
          duration: 0.35,
          stagger: 0.04,
          ease: "power2.out",
          clearProps: "transform",
        },
      );
    },
    { scope: channelsRef, dependencies: [channels] },
  );

  return (
    <div className="space-y-4">
      {/* Tactical HUD Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-[#7170ff] shadow-[0_0_8px_#7170ff]" />
          <h1 className="font-mono text-xs font-semibold tracking-wide text-[#f7f8f8] uppercase">
            Deep Scan · Semantic Search & Telemetry Analysis
          </h1>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-[#8a8f98]">
          <span>ENGINE:</span>
          <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-medium text-[#7170ff] border border-white/[0.06]">
            {query.trim().length >= 2 ? "SCANNING" : "STANDBY"}
          </span>
        </div>
      </div>

      {/* Hero Query Stage */}
      <GlassPanel className="p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-[6px] border border-white/[0.08] bg-[#7170ff]/10 text-[#7170ff]">
            <Sparkles className="size-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-ink">
              Cross-Guild Archive Intelligence
            </h2>
            <p className="font-mono text-[11px] text-[#8a8f98]">
              Query vectorized messages, heuristic flags, and user behavior
            </p>
          </div>
        </div>
        <div className="relative mt-4">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            className="h-10 pl-10 text-xs text-ink"
            placeholder="Search keywords, behavioral patterns, infraction terms..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
      </GlassPanel>

      <div className="grid gap-3 lg:grid-cols-5">
        {/* Search Results Column */}
        <GlassPanel className="lg:col-span-3">
          <SectionHeader
            eyebrow="search output"
            title="Matched Log Packets"
            action={
              <span className="mono text-xs text-[#8a8f98]">
                {(search.data ?? []).length} results
              </span>
            }
          />
          {query.trim().length >= 2 && search.isLoading && (
            <SkeletonRows rows={6} />
          )}
          {(search.data ?? []).length === 0 && !search.isLoading ? (
            <EmptyState
              icon={<Search className="size-7" />}
              title="No packets matched"
              description="Enter a query string above to scan across all captured guild communication."
            />
          ) : (
            <div ref={resultsRef} className="space-y-1.5 mt-3">
              {(search.data ?? []).map((m) => (
                <div
                  key={m.id}
                  className="search-result-card flex items-start gap-3 rounded-[6px] border border-white/[0.06] bg-white/[0.02] p-3 transition-all hover:border-white/[0.12] hover:bg-white/[0.04]"
                >
                  <Avatar src={m.avatar_url} name={m.username} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-ink">
                        {m.username}
                      </span>
                      <span className="font-mono text-[10px] text-ink-faint">
                        {getMessageChannelLabel(m)}
                      </span>
                      {m.ai_status && (
                        <Badge
                          tone={aiTone(m.ai_status)}
                          className="ml-auto font-mono text-[9px]"
                        >
                          {m.ai_analysis_duration_ms &&
                          m.ai_analysis_duration_ms > 0
                            ? `${m.ai_status} · ${formatDuration(m.ai_analysis_duration_ms)}`
                            : m.ai_status}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-ink-soft leading-relaxed">
                      {renderMessageContent(m.content, m.metadata) || "(embed)"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>

        {/* Culture & Leaderboard Side Column */}
        <div className="space-y-3 lg:col-span-2">
          <GlassPanel>
            <SectionHeader
              eyebrow="engagement"
              title={
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="size-3.5 text-[#7170ff]" /> Top
                  Reactors
                </span>
              }
            />
            <div ref={reactorsRef} className="space-y-2 mt-3">
              {(reactors ?? []).slice(0, 6).map((r, i) => {
                const maxNet = reactors?.[0]?.net_count || 1;
                const pct = Math.max(
                  4,
                  Math.round((r.net_count / maxNet) * 100),
                );
                return (
                  <div
                    key={r.user_id}
                    className="flex items-center gap-3 text-xs"
                  >
                    <span className="font-mono w-4 text-[10px] text-ink-faint">
                      0{i + 1}
                    </span>
                    <span className="w-24 shrink-0 truncate font-mono text-xs text-ink sm:w-32">
                      {r.username}
                    </span>
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="reactor-bar-fill h-full rounded-full bg-gradient-to-r from-[#5e6ad2] to-[#7170ff]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span
                      className="reactor-count font-mono w-10 text-right text-[11px] font-semibold text-[#7170ff]"
                      data-target={r.net_count}
                    >
                      +0
                    </span>
                  </div>
                );
              })}
              {(reactors ?? []).length === 0 && (
                <div className="py-4 text-center font-mono text-xs text-ink-faint">
                  NO REACTOR DATA
                </div>
              )}
            </div>
          </GlassPanel>

          <GlassPanel>
            <SectionHeader
              eyebrow="volume"
              title={
                <span className="flex items-center gap-1.5">
                  <Hash className="size-3.5 text-[#7170ff]" /> Top Active
                  Channels
                </span>
              }
            />
            <div ref={channelsRef} className="space-y-2 mt-3">
              {(channels ?? []).slice(0, 6).map((c) => (
                <div
                  key={c.channel_id}
                  className="channel-row flex items-center justify-between rounded-[6px] border border-white/[0.04] bg-white/[0.01] p-2 text-xs hover:bg-white/[0.03]"
                >
                  <span className="flex items-center gap-1.5 truncate font-mono text-xs text-ink">
                    <Hash className="size-3 text-[#7170ff]" />
                    {c.channel_name ?? c.channel_id.slice(0, 10)}
                  </span>
                  <span className="font-mono text-[10px] text-[#8a8f98]">
                    {c.total_messages.toLocaleString()} msgs
                  </span>
                </div>
              ))}
              {(channels ?? []).length === 0 && (
                <div className="py-4 text-center font-mono text-xs text-ink-faint">
                  NO CHANNEL DATA
                </div>
              )}
            </div>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
