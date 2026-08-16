import { NavRail } from "./nav-rail";
import { TopBar } from "./topbar";

/**
 * App chrome: slim nav rail + sticky top bar + scrollable content region.
 * Sits above the fixed AmbientCanvas. Providers (Ambient + WS) are mounted in
 * the route layout so every page shares one live link and signal context.
 */
export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 sm:px-5">
          {children}
        </main>
      </div>
    </div>
  );
}
