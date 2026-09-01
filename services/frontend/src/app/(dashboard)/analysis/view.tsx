"use client";

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

  // Bar-fill reveal for reactor leaderboard — CSS animation
  useEffect(() => {
    const container = reactorsRef.current;
    if (!container) return;
    const bars = container.querySelectorAll<HTMLElement>(".reactor-bar-fill");
    const counters = container.querySelectorAll<HTMLElement>(".reactor-count");
    if (bars.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      bars.forEach((el) => (el.style.transform = "scaleX(1)"));
      counters.forEach((el) => {
        el.textContent = `+${el.getAttribute("data-target") ?? "0"}`;
      });
      return;
    }

    bars.forEach((el, i) => {
      el.style.transformOrigin = "left center";
      el.style.animationFillMode = "forwards";
      el.style.animationTimingFunction = "ease-out";
      el.style.animationName = "bar-fill-in";
      el.style.animationDuration = "0.7s";
      el.style.animationDelay = `${i * 0.06}s`;
    });

    // Simple counter animation using rAF
    counters.forEach((el) => {
      const target = Number(el.getAttribute("data-target") ?? "0");
      const start = performance.now();
      const duration = 800;
      const step = (now: number) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - (1 - progress) ** 3;
        el.textContent = `+${Math.round(target * eased)}`;
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });

    return () => {
      bars.forEach((el) => {
        el.style.removeProperty("animation-name");
        el.style.removeProperty("animation-duration");
        el.style.removeProperty("animation-delay");
        el.style.removeProperty("animation-fill-mode");
        el.style.removeProperty("animation-timing-function");
        el.style.removeProperty("transform-origin");
      });
    };
  }, []);

  // Channel rows stagger slide-in — CSS animation
  useEffect(() => {
    const container = channelsRef.current;
    if (!container) return;
    const rows = container.querySelectorAll<HTMLElement>(".channel-row");
    if (rows.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    rows.forEach((el, i) => {
      el.style.opacity = "0";
      el.style.animationFillMode = "forwards";
      el.style.animationTimingFunction = "ease-out";
      el.style.animationName = "stagger-slide-in";
      el.style.animationDuration = "0.35s";
      el.style.animationDelay = `${i * 0.04}s`;
    });

    return () => {
      rows.forEach((el) => {
        el.style.removeProperty("opacity");
        el.style.removeProperty("animation-name");
        el.style.removeProperty("animation-duration");
        el.style.removeProperty("animation-delay");
        el.style.removeProperty("animation-fill-mode");
        el.style.removeProperty("animation-timing-function");
      });
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* Tactical HUD Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-signal glow-pulse" />
          <h1 className="font-mono text-xs font-semibold tracking-wide text-ink uppercase">
            Deep Scan · Semantic Search & Telemetry Analysis
          </h1>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-ink-muted">
          <span>ENGINE:</span>
          <span
            className="glitch-text rounded bg-signal/15 px-2 py-0.5 font-medium text-signal border border-signal/30"
            data-text={query.trim().length >= 2 ? "SCANNING" : "STANDBY"}
          >
            {query.trim().length >= 2 ? "SCANNING" : "STANDBY"}
          </span>
        </div>
      </div>

      {/* Hero Query Stage */}
      <GlassPanel className="p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-[6px] border border-signal/30 bg-signal/10 text-signal">
            <Sparkles className="size-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-ink">
              Cross-Guild Archive Intelligence
            </h2>
            <p className="font-mono text-[11px] text-ink-muted">
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
                  className="search-result-card hud-card flex items-start gap-3 p-3 transition-all"
                >
                  <Avatar
                    src={m.avatar_url}
                    name={m.server_nick ?? m.username}
                    size={32}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-ink">
                        {m.server_nick ?? m.username}
                      </span>
                      {m.server_nick && m.server_nick !== m.username && (
                        <span className="font-mono text-[10px] text-ink-muted">
                          @{m.username}
                        </span>
                      )}
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
                  <TrendingUp className="size-3.5 text-signal" /> Top Reactors
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
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="reactor-bar-fill h-full rounded-full bg-signal"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex shrink-0 flex-col items-end">
                      <span
                        className="reactor-count font-mono text-[11px] font-semibold text-signal"
                        data-target={r.net_count}
                      >
                        +0
                      </span>
                      <span className="font-mono text-[9px] text-ink-faint">
                        {r.messages_reacted} msgs · {r.emojis_used} emoji
                      </span>
                    </div>
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
                  <Hash className="size-3.5 text-signal" /> Top Active Channels
                </span>
              }
            />
            <div ref={channelsRef} className="space-y-2 mt-3">
              {(channels ?? []).slice(0, 6).map((c) => (
                <div
                  key={c.channel_id}
                  className="channel-row hud-card flex items-center justify-between p-2 text-xs"
                >
                  <span className="flex items-center gap-1.5 truncate font-mono text-xs text-ink">
                    <Hash className="size-3 text-signal" />
                    {c.channel_name ?? c.channel_id.slice(0, 10)}
                  </span>
                  <span className="font-mono text-[10px] text-ink-muted">
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
