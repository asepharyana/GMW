import { getRecordings } from "@/lib/api/server";
import { RecordingsView } from "./view";

export const dynamic = "force-dynamic";

export default async function RecordingsPage() {
  let recordings = undefined;
  try {
    recordings = await getRecordings(50);
  } catch {
    /* client hooks surface errors */
  }
  return <RecordingsView initialItems={recordings?.items} />;
}
