import { PageTransition } from "@/components/shared";
import { getGlossary } from "@/lib/api/server";
import type { GlossaryRow } from "@/lib/types";
import { GlossaryView } from "./view";

export const dynamic = "force-dynamic";

export default async function GlossaryPage() {
  let terms: GlossaryRow[] | undefined;
  try {
    terms = await getGlossary(100);
  } catch {
    terms = undefined;
  }
  return (
    <PageTransition>
      <GlossaryView initialTerms={terms} />
    </PageTransition>
  );
}
