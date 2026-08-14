/**
 * Voice — Server Component.
 * Seeds authoritative voice status (shared active speakers snapshot) on the
 * server, then hands off to the client View for the 3D scene + WS live updates.
 */
import { getVoiceStatus } from "@/lib/api/server";
import type { VoiceStatus } from "@/lib/types";
import VoiceView from "./view";

export default async function VoicePage() {
  const status = await getVoiceStatus().catch(() => undefined);
  return <VoiceView initialStatus={status} />;
}
