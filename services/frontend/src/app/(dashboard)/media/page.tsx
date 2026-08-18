import { PageTransition } from "@/components/shared";
import { getMediaStatus } from "@/lib/api/server";
import { MediaView } from "./view";

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  let status: import("@/lib/types").MediaState | undefined;
  try {
    status = await getMediaStatus();
  } catch {
    /* client hooks surface errors */
  }
  return (
    <PageTransition>
      <MediaView initialStatus={status} />
    </PageTransition>
  );
}
