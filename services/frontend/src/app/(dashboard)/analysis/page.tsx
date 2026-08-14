"use client";

import { SearchPanel } from "@/components/analysis/search-panel";

export default function AnalysisPage() {
  return (
    <div className="space-y-5" style={{ animation: "fade-up 0.4s ease both" }}>
      <SearchPanel />
    </div>
  );
}
