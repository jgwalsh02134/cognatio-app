#!/usr/bin/env python3
# Offline geocoder: turns the archive's place strings into lat/lng coordinates
# baked into client/src/place_coords.json, so the in-app map needs NO runtime
# geocoding (the deployed site is static + sandboxed and can't call Nominatim).
#
# Uses OpenStreetMap's Nominatim with the required 1 req/sec rate limit and a
# descriptive User-Agent. Results are cached, so re-running only fetches new
# places. Unresolved places fall back to a small country/state centroid table.
#
# Run from project root:  python3 geocode_places.py
import json, time, urllib.parse, urllib.request
from pathlib import Path

DATA = Path("client/src/data.json")
OUT = Path("client/src/place_coords.json")
UA = "cognatio-family-archive/1.0 (private genealogy map; contact: family)"

# Coarse fallbacks when a specific place can't be resolved.
FALLBACK = {
    "ireland": [53.4129, -8.2439],
    "germany": [51.1657, 10.4515],
    "england": [52.3555, -1.1743],
    "scotland": [56.4907, -4.2026],
    "canada": [56.1304, -106.3468],
    "united states": [39.8283, -98.5795],
    "usa": [39.8283, -98.5795],
    "new york": [42.9, -75.5],
    "iowa": [42.0, -93.5],
    "vermont": [44.0, -72.7],
}


def distinct_places():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    seen = set()
    for p in data["individuals"]:
        for k in ("birth", "death", "burial"):
            ev = p.get(k)
            if ev and ev.get("place"):
                seen.add(ev["place"].strip())
        for r in (p.get("residences") or []):
            if r and r.get("place"):
                seen.add(r["place"].strip())
    return sorted(seen)


def nominatim(q):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": q, "format": "json", "limit": 1}
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as resp:
        rows = json.loads(resp.read().decode("utf-8"))
    if rows:
        return [round(float(rows[0]["lat"]), 5), round(float(rows[0]["lon"]), 5)]
    return None


def fallback_for(place):
    parts = [t.strip().lower() for t in place.split(",") if t.strip()]
    # Try the most specific token that has a centroid (state before country).
    for tok in reversed(parts):
        if tok in FALLBACK:
            return FALLBACK[tok]
    return None


def main():
    cache = json.loads(OUT.read_text()) if OUT.exists() else {}
    places = distinct_places()
    todo = [p for p in places if p not in cache]
    print(f"{len(places)} distinct places, {len(todo)} to geocode, {len(cache)} cached")

    for i, place in enumerate(todo, 1):
        coords = None
        try:
            coords = nominatim(place)
        except Exception as e:
            print(f"  ! {place}: {e}")
        if not coords:
            coords = fallback_for(place)
            tag = "fallback" if coords else "UNRESOLVED"
        else:
            tag = "ok"
        if coords:
            cache[place] = coords
        print(f"  [{i}/{len(todo)}] {tag:9s} {place} -> {coords}")
        OUT.write_text(json.dumps(cache, indent=0, ensure_ascii=False, sort_keys=True))
        time.sleep(1.1)  # Nominatim usage policy: <= 1 req/sec

    resolved = sum(1 for p in places if p in cache)
    print(f"\nDone. {resolved}/{len(places)} places have coordinates -> {OUT}")


if __name__ == "__main__":
    main()
