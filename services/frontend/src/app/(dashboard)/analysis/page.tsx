import { PageTransition } from "@/components/shared";
import { AnalysisView } from "./view";

export const dynamic = "force-dynamic";

export default function AnalysisPage() {
  return (
    <PageTransition>
      <AnalysisView />
    </PageTransition>
  );
}
