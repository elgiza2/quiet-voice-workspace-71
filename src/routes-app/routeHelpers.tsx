import { useEffect, useState, useTransition, useDeferredValue } from "react";
import { Routes, Navigate, useLocation, useNavigate } from "react-router-dom";
import PageTransition from "@/components/common/PageTransition";
import { useTrackInAppNavigation } from "@/hooks/useSmartBack";
import { pathForZone } from "@/lib/zoneRouting";
import { prefetchNextHop } from "@/lib/nextHop";
import { bootstrapAuth, getAuthState, subscribeAuthState } from "@/lib/authStore";

/**
 * No loading screen, ever. The next screen is prefetched from the current one
 * (`@/lib/nextHop`) and `DeferredRoutes` keeps the previous page painted while a
 * chunk resolves, so a visible fallback would only ever be a flash of nothing.
 */
export const LazyFallback = () => null;

// Route rendering with a deferred location. While the next route's lazy chunk
// (or data) is still loading, React keeps the PREVIOUS page painted instead of
// unmounting it and falling back to an empty Suspense boundary — which is what
// produced the black flash between pages. A thin top progress bar signals the
// pending navigation so the app still feels responsive.
export const DeferredRoutes = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const deferredLocation = useDeferredValue(location);
  const isPending = deferredLocation !== location;
  useTrackInAppNavigation();

  // Warm the screens reachable from this one, so the next tap has nothing to
  // download. Runs per navigation and is a no-op on 2G / data-saver.
  useEffect(() => {
    prefetchNextHop(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    const root = document.documentElement;
    if (isPending) root.setAttribute("data-nav-pending", "true");
    else root.removeAttribute("data-nav-pending");
    return () => root.removeAttribute("data-nav-pending");
  }, [isPending]);

  return (
    <PageTransition location={deferredLocation}>
      <Routes location={deferredLocation}>{children}</Routes>
    </PageTransition>
  );
};


// Next-hop prefetch is the single warm-up scheduler; no independent startup storm.

// Scroll to top on every route change
export const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    // Safety net: clear any stale scroll-locks left behind by dialogs/drawers
    // (Radix/vaul set these on <body>; if a modal was open during navigation
    // the page can arrive with scrolling frozen, especially on mobile).
    const b = document.body;
    if (b.style.overflow === "hidden") b.style.overflow = "";
    if (b.style.position === "fixed") {
      b.style.position = "";
      b.style.top = "";
    }
    if (b.style.touchAction) b.style.touchAction = "";
    if (b.style.pointerEvents === "none") b.style.pointerEvents = "";
    b.removeAttribute("data-scroll-locked");
    const h = document.documentElement;
    if (h.style.overflow === "hidden") h.style.overflow = "";
    if (h.style.touchAction) h.style.touchAction = "";
    if (h.style.pointerEvents === "none") h.style.pointerEvents = "";
    h.classList.remove("lenis-stopped");
  }, [pathname]);
  return null;
};

export const InternalLinkInterceptor = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [, startNav] = useTransition();

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;

      const rawHref = anchor.getAttribute("href");
      if (
        !rawHref ||
        rawHref.startsWith("#") ||
        rawHref.startsWith("mailto:") ||
        rawHref.startsWith("tel:") ||
        rawHref.startsWith("javascript:") ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")
      ) {
        return;
      }

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;

      const nextPath = `${url.pathname}${url.search}${url.hash}`;
      const currentPath = `${location.pathname}${location.search}${location.hash}`;
      if (nextPath === currentPath) return;

      event.preventDefault();
      startNav(() => navigate(nextPath));
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [location.hash, location.pathname, location.search, navigate, startNav]);

  return null;
};

export const ProtectedRoute = ({ children, guestEntry }: { children: React.ReactNode; guestEntry?: string }) => {
  bootstrapAuth();
  const [state, setState] = useState(getAuthState);

  useEffect(() => {
    setState(getAuthState());
    const unsubscribe = subscribeAuthState(setState);
    return () => {
      unsubscribe();
    };
  }, []);

  const location = useLocation();

  if (!state.resolved) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm space-y-3" aria-label="Loading your session" role="status">
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          <div className="h-3 w-full animate-pulse rounded bg-muted/70" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-muted/70" />
        </div>
      </div>
    );
  }
  if (!state.authenticated) {
    if (guestEntry) return <Navigate to={guestEntry} replace />;
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    const authPath = pathForZone("/auth", location.pathname);
    return <Navigate to={`${authPath}?redirect=${encodeURIComponent(returnTo)}`} replace />;
  }
  return <>{children}</>;
};
