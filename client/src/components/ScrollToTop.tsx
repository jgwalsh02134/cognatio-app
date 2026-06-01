import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * On every route change, scroll the window to the top.
 * Wouter doesn't do this automatically — without it, navigating to a person
 * profile (or any link) keeps the previous scroll position.
 *
 * Must be rendered inside <Router hook={useHashLocation}>.
 */
export function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    // Use "instant" so users don't see a long smooth-scroll on every nav
    // (some browsers don't honor "instant"; fall back to default).
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    } catch {
      window.scrollTo(0, 0);
    }
    // Also reset the documentElement / body in case a layout uses them
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  }, [location]);

  return null;
}

export default ScrollToTop;
