import { useEffect, useRef, type ReactNode } from "react";
import type { Location } from "react-router-dom";
import { getAuthState } from "@/lib/authStore";
import { readPageState, writePageState } from "@/lib/pageStateCache";

/**
 * PageTransition — wraps route content.
 *
 * It deliberately does NOT re-key or animate the route container. Re-keying
 * unmounted and rebuilt the whole page on every section change, and the
 * container-level fade replayed on top of it — together they read as a full
 * browser refresh on every navigation. Navigation is now a plain swap; pages
 * keep their own local animations.
 */
const PageTransition = ({
  children,
  location,
}: {
  children: ReactNode;
  location?: Location;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current, path = location?.pathname;
    const owner = getAuthState().userId;
    if (!root || !path || location?.search || !owner) return;
    let scroller: HTMLElement | null = null;
    let frame: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => { if (scroller && getAuthState().userId === owner) writePageState(owner, path, { ...readPageState(owner, path), scrollTop: scroller.scrollTop }); };
    const onScroll = () => { clearTimeout(timer); timer = setTimeout(save, 200); };
    const attach = () => {
      const next = root.querySelector<HTMLElement>(".ceyo-scroll, .gx-apps-scroll, .hub-home-scroll, .subscription-content");
      if (next === scroller) return;
      if (frame !== undefined) cancelAnimationFrame(frame);
      clearTimeout(timer);
      save();
      scroller?.removeEventListener("scroll", onScroll);
      scroller = next;
      if (!next) return;
      const cached = readPageState(owner, path);
      frame = requestAnimationFrame(() => {
        if (getAuthState().userId === owner && cached?.scrollTop !== undefined) next.scrollTop = cached.scrollTop;
      });
      next.addEventListener("scroll", onScroll, { passive: true });
    };
    // Auth gates and lazy pages can insert/replace the scroller after this effect.
    const observer = new MutationObserver(attach);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    attach();
    return () => {
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
      clearTimeout(timer);
      scroller?.removeEventListener("scroll", onScroll);
      save();
    };
  }, [location?.pathname, location?.search]);
  return <div ref={ref} className="min-h-dvh">{children}</div>;
};

export default PageTransition;
