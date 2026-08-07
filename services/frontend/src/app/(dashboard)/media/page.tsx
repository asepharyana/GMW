/**
 * Media page — Server Component. Seeds the music player with the shared media
 * state fetched on the server (same state every user sees), then live-updates
 * over WS.
 */
import { getMediaStatus } from "@/lib/api/server";
import MediaView from "./view";

export default async function MediaPage() {
  const status = await getMediaStatus().catch(() => undefined);

  return <MediaView initialStatus={status} />;
}
