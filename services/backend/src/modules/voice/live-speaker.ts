/**
 * Authoritative live-voice store.
 *
 * Single source of truth for who is present / speaking in voice. The backend
 * WebSocket server is the one relay every frontend client connects to, so it
 * is the correct place to aggregate the gateway's `voice_active_user` deltas
 * into a shared snapshot. A late-joining browser must be able to see the same
 * state as everyone else — this store makes that possible (seeded into the WS
 * initial states and served via GET /api/voice/status).
 */

export interface LiveSpeaker {
  userId: string;
  username: string;
  avatar?: string | null;
  speaking: boolean;
  /** Epoch ms of the most recent activity (start OR end of speech). */
  lastActiveAt: number;
}

const speakers = new Map<string, LiveSpeaker>();

const MAX_SPEAKERS = 200;

/**
 * Record a voice_active_user event. `speaking: true` upserts the speaker as
 * active; `speaking: false` marks them inactive while keeping them for the
 * activity timeline.
 */
/**
 * recordSpeaker(data) — apply a `voice_active_user` event. `speaking: true`
 * upserts the speaker as ACTIVE; `speaking: false` marks them inactive while
 * keeping them for the activity timeline.
 */
export function recordSpeaker(data: {
  userId: string;
  username?: string;
  avatar?: string | null;
  speaking: boolean;
}): void {
  const { userId, speaking } = data;
  const existing = speakers.get(userId);
  const speaker: LiveSpeaker = {
    userId,
    username: data.username ?? existing?.username ?? "Unknown",
    avatar: data.avatar ?? existing?.avatar ?? null,
    speaking,
    lastActiveAt: Date.now(),
  };

  if (speakers.size >= MAX_SPEAKERS && !existing) {
    // Drop the least-recently-active non-speaking speaker to stay bounded.
    let oldestId: string | null = null;
    let oldestTs = Infinity;
    for (const [id, s] of speakers) {
      if (!s.speaking && s.lastActiveAt < oldestTs) {
        oldestTs = s.lastActiveAt;
        oldestId = id;
      }
    }
    if (oldestId) speakers.delete(oldestId);
    else return;
  }

  speakers.set(userId, speaker);
}

/** All known speakers, most recently active first. */
export function getActiveSpeakers(): LiveSpeaker[] {
  return [...speakers.values()].sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

/** Only speakers currently flagged as speaking. */
export function getSpeakingSpeakers(): LiveSpeaker[] {
  return [...speakers.values()]
    .filter((s) => s.speaking)
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

/** Drop all tracked speakers (used on backend restart). */
export function resetLiveSpeakers(): void {
  speakers.clear();
}