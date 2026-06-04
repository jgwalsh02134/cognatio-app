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
 * These wrappers reuse wouter's battle-tested hash hook (correct subscription +
 * navigate that fires on in-app navigation) but split path from search:
 *   - `useHashLocation`  → path only, for the Router's route matching
 *   - `useHashSearch`    → the `?query` string, wired as the Router's searchHook
 *     so `useSearch()` works on every page.
 */
import { useHashLocation as useWouterHashLocation } from "wouter/use-hash-location";

function splitSearch(loc: string): { path: string; search: string } {
  const qi = loc.indexOf("?");
  if (qi === -1) return { path: loc || "/", search: "" };
  return { path: loc.slice(0, qi) || "/", search: loc.slice(qi + 1) };
}

export function useHashLocation(): [string, (to: string, options?: { replace?: boolean }) => void] {
  const [loc, navigate] = useWouterHashLocation();
  return [splitSearch(loc).path, navigate];
}

export function useHashSearch(): string {
  const [loc] = useWouterHashLocation();
  return splitSearch(loc).search;
}
