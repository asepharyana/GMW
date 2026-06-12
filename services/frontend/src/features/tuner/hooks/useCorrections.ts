import { useCallback, useEffect, useRef, useState } from "react";
import {
  type CorrectionEntry,
  type CorrectionStats,
  getCorrectionStats,
  listCorrections,
  submitCorrection,
} from "../../../shared/api/client";

// ─── Stats ──────────────────────────────────────────────────────────────────

export function useCorrectionStats() {
  const [stats, setStats] = useState<CorrectionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getCorrectionStats();
      setStats(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch().catch(() => undefined); }, [fetch]);

  return { stats, loading, error, refetch: fetch };
}

// ─── History ────────────────────────────────────────────────────────────────

export function useCorrectionHistory() {
  const [entries, setEntries] = useState<CorrectionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const hasMoreRef = useRef(true);

  const fetchInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listCorrections({ limit: 20 });
      setEntries(result.data);
      cursorRef.current = result.nextCursor;
      hasMoreRef.current = result.nextCursor !== null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load corrections");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!cursorRef.current || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await listCorrections({ limit: 20, cursor: cursorRef.current });
      setEntries((prev) => [...prev, ...result.data]);
      cursorRef.current = result.nextCursor;
      hasMoreRef.current = result.nextCursor !== null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore]);

  useEffect(() => { fetchInitial().catch(() => undefined); }, [fetchInitial]);

  return { entries, loading, loadingMore, error, hasMore: hasMoreRef.current, loadMore, refetch: fetchInitial };
}

// ─── Submit ─────────────────────────────────────────────────────────────────

export function useSubmitCorrection() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CorrectionEntry | null>(null);

  const submit = useCallback(async (data: {
    message_id: string;
    original_flags: string[];
    corrected_flags: string[];
    correction_notes?: string;
    content_snippet: string;
  }) => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await submitCorrection(data);
      setSuccess(result);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to submit correction";
      setError(msg);
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  return { submit, submitting, error, success, reset };
}
