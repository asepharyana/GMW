import { useEffect, useState } from "react";

/**
 * Returns true once the component has mounted on the client. Charts wrapped
 * in ResponsiveContainer measure their parent during the first layout — if
 * the container has no size yet (hydration/flex/grid), Recharts logs
 * "width(-1) and height(-1)" warnings. Deferring the chart render until after
 * mount guarantees the container has real dimensions.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
