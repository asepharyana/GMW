import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tracks incoming moderation_alert events and maintains a badge counter.
 * Clears when the user navigates to the messages tab.
 */
export function useNotificationBadge(activeTab: string) {
  const [count, setCount] = useState(0);
  const prevActiveTab = useRef(activeTab);

  // Clear badge when user switches TO messages tab
  useEffect(() => {
    if (activeTab === "messages" && prevActiveTab.current !== "messages") {
      setCount(0);
    }
    prevActiveTab.current = activeTab;
  }, [activeTab]);

  const increment = useCallback(() => {
    setCount((c) => c + 1);
  }, []);

  // Listen for moderation_alert custom events
  useEffect(() => {
    const handler = () => increment();
    window.addEventListener("moderation_alert", handler);
    return () => window.removeEventListener("moderation_alert", handler);
  }, [increment]);

  return { count, clear: () => setCount(0) };
}
