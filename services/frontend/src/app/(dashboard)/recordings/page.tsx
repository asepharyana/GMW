import { PageTransition } from "@/components/shared";
import { getRecordings } from "@/lib/api/server";
import { RecordingsView } from "./view";

export const dynamic = "force-dynamic";

export default async function RecordingsPage() {
  let recordings:
    | import("@/lib/types/recording").PaginatedRecordings
    | undefined;
  try {
    recordings = await getRecordings(50);
  } catch {
    /* client hooks surface errors */
  }
  return (
    <PageTransition>
      <RecordingsView initialItems={recordings?.items} />
    </PageTransition>
  );
}
