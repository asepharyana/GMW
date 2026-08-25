"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Hash, Search, Sparkles, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import { Avatar, Badge, GlassPanel, Input } from "@/components/primitives";
import { EmptyState, SectionHeader, SkeletonRows } from "@/components/shared";
import { useChannels, useMessageSearch, useTopReactors } from "@/hooks";
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3">
        <div className="flex items-center gap-3">
          <div className="relative flex size-3 items-center justify-center">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-signal opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-signal" />
          </div>
          <h1 className="font-mono text-xs font-semibold tracking-widest text-ink uppercase">
            ANALYSIS ENGINE · DEEP_SCAN
          </h1>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-sm bg-surface px-2 py-0.5 font-mono text-[11px] text-ink-soft">
          <span className="text-ink-faint">MODE:</span>
          <span className="font-bold text-signal">
            {query.trim().length >= 2 ? "SEARCHING" : "IDLE"}
          </span>
        </div>
      </div>

      <GlassPanel glow className="relative overflow-hidden">
        <div className="scan-line absolute inset-x-0 top-0" />
        <div className="flex items-center gap-3">
          <Sparkles className="size-5 text-signal" />
          <div>
            <div className="eyebrow">Semantic search</div>
            <h2 className="display text-balance text-2xl text-ink">
              Search the archive
            </h2>
          </div>
        </div>
        <div className="relative mt-4">
          <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-faint" />
          <Input
            className="h-12 pl-12 text-base"
            placeholder="Find messages, patterns, flags…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        {query.trim().length > 0 && query.trim().length < 2 && (
          <div className="mono mt-2 text-xs text-ink-faint">
            Type at least 2 characters…
          </div>
        )}
      </GlassPanel>

      <div className="grid gap-5 lg:grid-cols-5">
        <GlassPanel className="lg:col-span-3">
          <SectionHeader
            eyebrow="results"
            title="Matches"
            action={
              <span className="mono text-xs text-ink-faint">
                {(search.data ?? []).length}
              </span>
            }
          />
          {query.trim().length >= 2 && search.isLoading && (
            <SkeletonRows rows={6} />
          )}
          {(search.data ?? []).length === 0 ? (
            <EmptyState
              icon={<Search className="size-7" />}
              title="No matches yet"
              description="Run a search to surface messages across the guild."
            />
          ) : (
            <div className="space-y-1.5">
              {(search.data ?? []).map((m) => (
                <div
                  key={m.id}
                  className="flex items-start gap-3 rounded-[12px] border border-hairline bg-white/[0.03] p-3"
                >
                  <Avatar src={m.avatar_url} name={m.username} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink">
                        {m.username}
                      </span>
                      <span className="mono text-[0.65rem] text-ink-faint">
                        {getMessageChannelLabel(m)}
                      </span>
                      {m.ai_status && (
                        <Badge tone={aiTone(m.ai_status)} className="ml-auto">
                          {m.ai_analysis_duration_ms &&
                          m.ai_analysis_duration_ms > 0
                            ? `${m.ai_status} · ${formatDuration(m.ai_analysis_duration_ms)}`
                            : m.ai_status}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-sm text-ink-soft">
                      {renderMessageContent(m.content, m.metadata) || "(embed)"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>

        <div className="space-y-5 lg:col-span-2">
          <GlassPanel>
            <SectionHeader
              eyebrow="culture"
              title={
                <span className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-signal" /> Top reactors
                </span>
              }
            />
            <div ref={reactorsRef} className="space-y-2">
              {(reactors ?? []).slice(0, 6).map((r, i) => {
                const maxNet = reactors?.[0]?.net_count || 1;
                const pct = Math.max(
                  4,
                  Math.round((r.net_count / maxNet) * 100),
                );
                return (
                  <div
                    key={r.user_id}
                    className="flex items-center gap-3 text-sm"
                  >
                    <span className="mono w-5 text-ink-faint">{i + 1}</span>
                    <span className="w-28 shrink-0 truncate text-ink-soft sm:w-40">
                      {r.username}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
                      <div
                        className="reactor-bar-fill h-full rounded-full bg-signal/70"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span
                      className="reactor-count mono w-12 text-right text-xs text-signal"
                      data-target={r.net_count}
                    >
                      +0
                    </span>
                  </div>
                );
              })}
              {(reactors ?? []).length === 0 && (
                <div className="py-4 text-center text-xs text-ink-faint">
                  No data
                </div>
              )}
            </div>
          </GlassPanel>

          <GlassPanel>
            <SectionHeader
              eyebrow="channels"
              title={
                <span className="flex items-center gap-2">
                  <Hash className="size-4 text-signal" /> Top channels
                </span>
              }
            />
            <div ref={channelsRef} className="space-y-2">
              {(channels ?? []).slice(0, 6).map((c) => (
                <div
                  key={c.channel_id}
                  className="channel-row flex items-center gap-3 text-sm"
                >
                  <span className="flex-1 truncate text-ink-soft">
                    {c.channel_name ?? c.channel_id.slice(0, 8)}
                  </span>
                  <span className="mono text-xs text-ink-faint">
                    {c.total_messages}
                  </span>
                </div>
              ))}
              {(channels ?? []).length === 0 && (
                <div className="py-4 text-center text-xs text-ink-faint">
                  No data
                </div>
              )}
            </div>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
