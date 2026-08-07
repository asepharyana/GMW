/**
 * Recordings page — Server Component. Seeds the library from server-fetched
 * recordings; live `voice_recording_uploaded` events keep it fresh over WS.
 */
import { getRecordings } from "@/lib/api/server";
import RecordingsView from "./view";

export default async function RecordingsPage() {
  const data = await getRecordings(50).catch(() => undefined);

  return <RecordingsView initialRecordings={data?.items} />;
}
