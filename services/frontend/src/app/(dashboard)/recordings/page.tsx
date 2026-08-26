import { getRecordings } from "@/lib/api/server";
import type { PaginatedRecordings } from "@/lib/types";
import { RecordingsView } from "./view";

export const dynamic = "force-dynamic";

export default async function RecordingsPage() {
  let recordings: PaginatedRecordings | undefined;
  try {
    recordings = await getRecordings(50);
  } catch {
    /* client hooks surface errors */
  }
  return <RecordingsView initialPage={recordings} />;
}
