/**
 * Hash-based location + search hooks for wouter.
 *
 * wouter's stock `useHashLocation` returns the entire hash — including any
 * `?query` string — as the location. wouter then matches that whole string
 * against route patterns, so `#/places?q=Albany` never matches
 * `<Route path="/places">` and falls through to the 404 page. That broke every
 * query-string link in the app (place/people filters, Relate, tree focus, and
 * the map popups).
 *
 * Stock hash `navigate` has a second trap: it splits `to` on `?` and writes the
 * query onto `window.location.search` (`/?q=Walsh#/people`). This site is
 * hash-routed only, so programmatic `setLocation("/people?q=Walsh")` must keep
 * the query inside the fragment (`#/people?q=Walsh`).
 *
 * These wrappers reuse wouter's battle-tested hash subscription but:
 *   - `useHashLocation`  → path only, for the Router's route matching
 *   - navigate           → always writes path + query into the hash
 *   - `useHashSearch`    → the `?query` string, wired as the Router's searchHook
 *     so `useSearch()` works on every page.
 */
import { useCallback } from "react";
import { useHashLocation as useWouterHashLocation } from "wouter/use-hash-location";

function splitSearch(loc: string): { path: string; search: string } {
  const qi = loc.indexOf("?");
  if (qi === -1) return { path: loc || "/", search: "" };
  return { path: loc.slice(0, qi) || "/", search: loc.slice(qi + 1) };
}

function navigateHash(to: string, options?: { replace?: boolean }) {
  const raw = to.startsWith("#") ? to.slice(1) : to;
  const hash = raw.startsWith("/") ? raw : `/${raw}`;
  const url = new URL(window.location.href);
  // Never leak archive query strings onto the document URL — static hosts
  // and the iframe sandbox only honor the hash.
  url.search = "";
  url.hash = hash;
  const next = url.href;
  if (next === window.location.href) return;
  if (options?.replace) {
    history.replaceState(history.state, "", next);
  } else {
    history.pushState(history.state, "", next);
  }
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function useHashLocation(): [string, (to: string, options?: { replace?: boolean }) => void] {
  const [loc] = useWouterHashLocation();
  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    navigateHash(to, options);
  }, []);
  return [splitSearch(loc).path, navigate];
}

useHashLocation.hrefs = (href: string) => (href.startsWith("#") ? href : `#${href}`);

export function useHashSearch(): string {
  const [loc] = useWouterHashLocation();
  return splitSearch(loc).search;
}
