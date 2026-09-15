import { Link, useSearch } from "wouter";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  familiesById,
  fullDisplayName,
  getPerson,
  getRootPerson,
  initials,
  lifespan,
  parseYear,
  type Person,
} from "@/lib/family";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Maximize2,
  Search as SearchIcon,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { searchPeople } from "@/lib/family";
import { useIsMobile } from "@/hooks/use-mobile";

type Direction = "ancestors" | "descendants" | "both";

interface NodeLayout {
  id: string;
  person: Person | null;
  generation: number;
  x: number;
  y: number;
  isUnion?: boolean;
  unionWith?: string;
}

interface EdgeLayout {
  from: string;
  to: string;
  kind: "parent" | "spouse";
}

// Desktop defaults; mobile/compact sizes are computed inside TreeView and passed in.
const NODE_W = 188;
const NODE_H = 64;
const GEN_GAP_X = 58;
const SIBLING_GAP = 16;

function buildAncestorLayout(rootId: string, depth: number, sizes?: { w?: number; h?: number; g?: number; s?: number }) {
  const NW = sizes?.w ?? NODE_W;
  const NH = sizes?.h ?? NODE_H;
  const GG = sizes?.g ?? GEN_GAP_X;
  const SG = sizes?.s ?? SIBLING_GAP;

  // Pedigree-style: root on left, ancestors expand to the right.
  // Wait — convention for ancestors: root on left, parents to right.
  // We'll do top-down: root at top, parents above.
  // Easier: root at center, ancestors above (y decreasing), descendants below.
  // For ancestors view alone, root at bottom.
  const nodes: NodeLayout[] = [];
  const edges: EdgeLayout[] = [];

  // Generation 0 has 1 person, gen 1 has 2, etc. Position symmetrically.
  function place(personId: string | null, gen: number, slotMin: number, slotMax: number): NodeLayout | null {
    const p = (personId ? getPerson(personId) : null) ?? null;
    const x = (slotMin + slotMax) / 2;
    const y = -gen; // upward
    const id = personId || `unknown:${gen}:${slotMin}`;
    const node: NodeLayout = { id, person: p, generation: gen, x, y };
    nodes.push(node);
    if (gen >= depth) return node;
    if (!p) return node;

    // Find father and mother by looking at family-of-child
    let father: Person | null = null;
    let mother: Person | null = null;
    for (const fid of p.family_child_ids) {
      const f = familiesById[fid];
      if (!f) continue;
      const h = f.husband_id ? getPerson(f.husband_id) : null;
      const w = f.wife_id ? getPerson(f.wife_id) : null;
      father = father ?? h ?? null;
      mother = mother ?? w ?? null;
    }
    if (!father || !mother) {
      for (const pid of p.parent_ids) {
        const par = getPerson(pid);
        if (!par) continue;
        if (par.sex === "M" && !father) father = par;
        else if (par.sex === "F" && !mother) mother = par;
        else if (!father) father = par;
        else if (!mother) mother = par;
      }
    }
    const mid = (slotMin + slotMax) / 2;
    const fatherNode = place(father?.id ?? null, gen + 1, slotMin, mid);
    const motherNode = place(mother?.id ?? null, gen + 1, mid, slotMax);
    if (fatherNode && fatherNode.person) edges.push({ from: fatherNode.id, to: id, kind: "parent" });
    if (motherNode && motherNode.person) edges.push({ from: motherNode.id, to: id, kind: "parent" });

    return node;
  }

  // Total slots = 2^depth × NW (with gap)
  const slotCount = Math.pow(2, depth);
  const totalWidth = slotCount * (NW + SG);
  place(rootId, 0, 0, totalWidth);

  // Convert grid coords (x in pixels, y in generations) to screen coords
  const positionedNodes = nodes.map((n) => ({
    ...n,
    x: n.x,
    y: -n.y * (NH + GG),
  }));

  return { nodes: positionedNodes, edges };
}

function buildDescendantLayout(rootId: string, depth: number, sizes?: { w?: number; h?: number; g?: number; s?: number }) {
  const NW = sizes?.w ?? NODE_W;
  const NH = sizes?.h ?? NODE_H;
  const GG = sizes?.g ?? GEN_GAP_X;
  const SG = sizes?.s ?? SIBLING_GAP;

  const nodes: NodeLayout[] = [];
  const edges: EdgeLayout[] = [];
  let cursor = 0;

  function place(personId: string, gen: number): { id: string; centerX: number } | null {
    const p = getPerson(personId);
    if (!p) return null;
    if (gen >= depth) {
      const x = cursor;
      cursor += NW + SG;
      const node: NodeLayout = { id: p.id, person: p, generation: gen, x, y: gen * (NH + GG) };
      nodes.push(node);
      return { id: p.id, centerX: x };
    }

    // Group children by family
    const groups: { spouse: Person | null; children: Person[]; familyId: string | null }[] = [];
    if (p.family_spouse_ids.length === 0) {
      // No spouse families: just place this person
    } else {
      for (const fid of p.family_spouse_ids) {
        const fam = familiesById[fid];
        if (!fam) continue;
        const spouseId = fam.husband_id === p.id ? fam.wife_id : fam.husband_id;
        const spouse = spouseId ? getPerson(spouseId) ?? null : null;
        const children = fam.children_ids.map(getPerson).filter(Boolean) as Person[];
        groups.push({ spouse, children, familyId: fid });
      }
    }

    // Place all child subtrees first
    const childCenters: { id: string; centerX: number }[] = [];
    for (const grp of groups) {
      for (const child of grp.children) {
        const cc = place(child.id, gen + 1);
        if (cc) childCenters.push(cc);
      }
    }

    let centerX: number;
    if (childCenters.length > 0) {
      centerX = (childCenters[0].centerX + childCenters[childCenters.length - 1].centerX) / 2;
    } else {
      centerX = cursor;
      cursor += NW + SG;
    }
    const node: NodeLayout = { id: p.id, person: p, generation: gen, x: centerX, y: gen * (NH + GG) };
    nodes.push(node);

    // Place spouses next to person (offset slightly)
    for (let gi = 0; gi < groups.length; gi++) {
      const grp = groups[gi];
      if (grp.spouse) {
        const offsetX = centerX + (NW + 20) * (gi + 1);
        const spouseNode: NodeLayout = {
          id: `${p.id}::spouse::${grp.spouse.id}::${grp.familyId}`,
          person: grp.spouse,
          generation: gen,
          x: offsetX,
          y: gen * (NH + GG),
          isUnion: true,
          unionWith: p.id,
        };
        // Move cursor past spouse
        if (offsetX + NW + SG > cursor) cursor = offsetX + NW + SG;
        nodes.push(spouseNode);
        edges.push({ from: p.id, to: spouseNode.id, kind: "spouse" });
      }
      for (const child of grp.children) {
        edges.push({ from: p.id, to: child.id, kind: "parent" });
      }
    }

    return { id: p.id, centerX };
  }
  place(rootId, 0);
  return { nodes, edges };
}

export default function TreeView() {
  const initialFocus = new URLSearchParams(useSearch()).get("focus");

  const [focusId, setFocusId] = useState(initialFocus || getRootPerson().id);
  const [direction, setDirection] = useState<Direction>("ancestors");
  // Mobile: smaller default depth so the auto-fit doesn't shrink nodes to noise.
  const [depth, setDepth] = useState(
    typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches ? 3 : 4,
  );
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  // Pointer state for pan + pinch. We track each active pointer's last position.
  // When 1 pointer = pan, when 2 = pinch-zoom anchored to the midpoint.
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestureRef = useRef<{
    mode: "none" | "pan" | "pinch";
    startPan: { x: number; y: number };
    startZoom: number;
    startDist: number;
    startMid: { x: number; y: number };
    startPointer: { x: number; y: number };
    moved: boolean;
    pointerId: number;
  }>({
    mode: "none",
    startPan: { x: 0, y: 0 },
    startZoom: 1,
    startDist: 0,
    startMid: { x: 0, y: 0 },
    startPointer: { x: 0, y: 0 },
    moved: false,
    pointerId: -1,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  // Live refs mirror pan/zoom so gesture handlers don't depend on stale state.
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(0.85);
  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const isMobile = useIsMobile();
  // Compact mode for phones/tablets: smaller nodes + tighter spacing so fit-zoom keeps labels legible.
  const compact = !!isMobile || (typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches);
  const NODE_W = compact ? 124 : 188;
  const NODE_H = compact ? 48 : 64;
  const GEN_GAP_X = compact ? 40 : 58;
  const SIBLING_GAP = compact ? 8 : 16;

  // React to orientation / viewport changes: prefer lower depth on mobile but don't fight user choice.
  useEffect(() => {
    if (compact && depth > 3) setDepth(3);
  }, [compact]);

  const focusPerson = getPerson(focusId);

  const layout = useMemo(() => {
    if (!focusPerson) return { nodes: [], edges: [] };
    const sizes = { w: NODE_W, h: NODE_H, g: GEN_GAP_X, s: SIBLING_GAP };
    if (direction === "ancestors") return buildAncestorLayout(focusPerson.id, depth, sizes);
    if (direction === "descendants") return buildDescendantLayout(focusPerson.id, depth, sizes);
    // both: combine
    const a = buildAncestorLayout(focusPerson.id, depth, sizes);
    const d = buildDescendantLayout(focusPerson.id, depth, sizes);
    // shift descendants below the root
    const shifted = {
      nodes: d.nodes.map((n) => ({ ...n, id: n.id === focusPerson.id ? `${n.id}::dup` : n.id })),
      edges: d.edges.map((e) => ({
        ...e,
        from: e.from === focusPerson.id ? `${focusPerson.id}::dup` : e.from,
        to: e.to === focusPerson.id ? `${focusPerson.id}::dup` : e.to,
      })),
    };
    // Drop the duplicate root node from descendants
    const filteredNodes = shifted.nodes.filter((n) => n.id !== `${focusPerson.id}::dup`);
    const reroutedEdges = shifted.edges.map((e) => ({
      ...e,
      from: e.from === `${focusPerson.id}::dup` ? focusPerson.id : e.from,
      to: e.to === `${focusPerson.id}::dup` ? focusPerson.id : e.to,
    }));
    return {
      nodes: [...a.nodes, ...filteredNodes],
      edges: [...a.edges, ...reroutedEdges],
    };
  }, [focusPerson, direction, depth, compact]);

  const bounds = useMemo(() => {
    if (layout.nodes.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of layout.nodes) {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x + NODE_W);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y + NODE_H);
    }
    return { minX, maxX, minY, maxY };
  }, [layout.nodes, NODE_W, NODE_H]);

  // Auto-fit when layout changes (focus, direction, or depth)
  useEffect(() => {
    if (!containerRef.current) return;
    if (layout.nodes.length === 0) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    if (w === 0 || h === 0) return;
    // Tighter pad + higher min zoom on compact so text stays legible; don't force tiny "see everything".
    const padX = compact ? 20 : (cw < 640 ? 32 : 80);
    const padY = compact ? 20 : (cw < 640 ? 32 : 80);
    const z = Math.max(compact ? 0.58 : 0.32, Math.min(cw / (w + padX), ch / (h + padY), 1.15));
    setZoom(z);
    setPan({
      x: cw / 2 - (bounds.minX + w / 2) * z,
      y: ch / 2 - (bounds.minY + h / 2) * z,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, direction, depth, layout.nodes.length, compact]);

  const TAP_SLOP = 6; // px — pointer movement under this counts as a tap, not a drag.
  const Z_MIN = 0.2;
  const Z_MAX = 2.5;

  function clampZoom(z: number) { return Math.max(Z_MIN, Math.min(Z_MAX, z)); }

  function onPointerDown(e: React.PointerEvent) {
    // Let interactive children (node cards, links) get the click.
    if ((e.target as HTMLElement).closest("[data-tree-node]")) return;
    e.preventDefault();
    const el = containerRef.current;
    el?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      gestureRef.current = {
        mode: "pan",
        startPan: { ...panRef.current },
        startZoom: zoomRef.current,
        startDist: 0,
        startMid: { x: 0, y: 0 },
        startPointer: { x: e.clientX, y: e.clientY },
        moved: false,
        pointerId: e.pointerId,
      };
    } else if (pointers.current.size === 2) {
      const pts = Array.from(pointers.current.values());
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const dist = Math.hypot(dx, dy) || 1;
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      gestureRef.current = {
        mode: "pinch",
        startPan: { ...panRef.current },
        startZoom: zoomRef.current,
        startDist: dist,
        startMid: mid,
        startPointer: mid,
        moved: true,
        pointerId: -1,
      };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gestureRef.current;

    if (g.mode === "pan" && pointers.current.size === 1) {
      const dx = e.clientX - g.startPointer.x;
      const dy = e.clientY - g.startPointer.y;
      if (!g.moved && Math.hypot(dx, dy) > TAP_SLOP) g.moved = true;
      if (g.moved) {
        setPan({ x: g.startPan.x + dx, y: g.startPan.y + dy });
      }
    } else if (g.mode === "pinch" && pointers.current.size >= 2) {
      const pts = Array.from(pointers.current.values()).slice(0, 2);
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const dist = Math.hypot(dx, dy) || 1;
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const newZoom = clampZoom(g.startZoom * (dist / g.startDist));
      // Anchor zoom to the original midpoint relative to the container.
      const anchorX = g.startMid.x - rect.left;
      const anchorY = g.startMid.y - rect.top;
      // World point under original midpoint:
      //   worldX = (anchorX - startPan.x) / startZoom
      // We want: anchorX (translated by mid drift) = worldX * newZoom + newPanX
      const worldX = (anchorX - g.startPan.x) / g.startZoom;
      const worldY = (anchorY - g.startPan.y) / g.startZoom;
      const midDriftX = mid.x - g.startMid.x;
      const midDriftY = mid.y - g.startMid.y;
      setZoom(newZoom);
      setPan({
        x: anchorX - worldX * newZoom + midDriftX,
        y: anchorY - worldY * newZoom + midDriftY,
      });
    }
  }

  function onPointerEnd(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    const g = gestureRef.current;
    if (pointers.current.size === 0) {
      gestureRef.current = { ...g, mode: "none" };
    } else if (pointers.current.size === 1 && g.mode === "pinch") {
      // Drop back to pan from the surviving finger.
      const [pid, pos] = Array.from(pointers.current.entries())[0];
      gestureRef.current = {
        mode: "pan",
        startPan: { ...panRef.current },
        startZoom: zoomRef.current,
        startDist: 0,
        startMid: { x: 0, y: 0 },
        startPointer: { x: pos.x, y: pos.y },
        moved: true,
        pointerId: pid,
      };
    }
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const anchorX = e.clientX - rect.left;
    const anchorY = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0018);
    const newZoom = clampZoom(zoomRef.current * factor);
    const worldX = (anchorX - panRef.current.x) / zoomRef.current;
    const worldY = (anchorY - panRef.current.y) / zoomRef.current;
    setZoom(newZoom);
    setPan({ x: anchorX - worldX * newZoom, y: anchorY - worldY * newZoom });
  }

  function fit() {
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    if (w === 0 || h === 0) return;
    const pad = compact ? 18 : 60;
    const z = Math.max(compact ? 0.58 : 0.30, Math.min(cw / (w + pad), ch / (h + pad), 1.3));
    setZoom(z);
    setPan({
      x: cw / 2 - (bounds.minX + w / 2) * z,
      y: ch / 2 - (bounds.minY + h / 2) * z,
    });
  }

  const searchResults = useMemo(() => searchPeople(searchQuery, 8), [searchQuery]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Toolbar */}
      <div className="border-b bg-card/60 backdrop-blur-md">
        <div className="mx-auto max-w-7xl flex flex-wrap items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 sm:py-2.5">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 rounded-md border bg-background px-2 sm:px-3 py-1 sm:py-1.5 text-sm hover-elevate active-elevate-2 w-full sm:w-auto sm:min-w-[12rem] min-w-0"
            data-testid="button-tree-focus"
          >
            <SearchIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{focusPerson ? fullDisplayName(focusPerson) : "Choose…"}</span>
          </button>

          <div className="flex gap-1 rounded-md border bg-card p-0.5">
            <DirBtn label="Ancestors" icon={<ArrowUpToLine className="h-3.5 w-3.5" />} active={direction === "ancestors"} onClick={() => setDirection("ancestors")} />
            <DirBtn label="Descendants" icon={<ArrowDownToLine className="h-3.5 w-3.5" />} active={direction === "descendants"} onClick={() => setDirection("descendants")} />
            <DirBtn label="Both" active={direction === "both"} onClick={() => setDirection("both")} />
          </div>

          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Depth</span>
            <div className="flex rounded-md border bg-card overflow-hidden">
              {[2, 3, 4, 5].map((d) => (
                <button
                  key={d}
                  onClick={() => setDepth(d)}
                  className={`px-2 py-0.5 text-[10px] sm:text-xs sm:px-2.5 sm:py-1 hover-elevate active-elevate-2 ${depth === d ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                  data-testid={`depth-${d}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <Button variant="outline" size="icon" onClick={() => setZoom((z) => Math.max(0.25, z / 1.15))} aria-label="Zoom out" data-testid="zoom-out" className="h-7 w-7 sm:h-8 sm:w-8">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-[10px] text-muted-foreground tabular-nums w-7 sm:w-9 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="outline" size="icon" onClick={() => setZoom((z) => Math.min(2, z * 1.15))} aria-label="Zoom in" data-testid="zoom-in" className="h-7 w-7 sm:h-8 sm:w-8">
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={fit} aria-label="Fit to screen" data-testid="zoom-fit" className="h-7 w-7 sm:h-8 sm:w-8">
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-[hsl(var(--muted)/0.4)] cursor-grab active:cursor-grabbing touch-none select-none"
        style={{ touchAction: "none", overscrollBehavior: "contain" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={onPointerEnd}
        onWheel={onWheel}
        data-testid="tree-canvas"
      >
        {/* Grid background */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.18]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, hsl(var(--foreground)/0.4) 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
        <div
          className="absolute"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            willChange: "transform",
            transition: gestureRef.current.mode === "none"
              ? "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)"
              : "none",
          }}
        >
          <svg
            style={{
              position: "absolute",
              left: bounds.minX - 100,
              top: bounds.minY - 100,
              width: bounds.maxX - bounds.minX + 200,
              height: bounds.maxY - bounds.minY + 200,
              pointerEvents: "none",
            }}
          >
            {layout.edges.map((e, i) => {
              const from = layout.nodes.find((n) => n.id === e.from);
              const to = layout.nodes.find((n) => n.id === e.to);
              if (!from || !to) return null;
              const fx = from.x + NODE_W / 2 - (bounds.minX - 100);
              const fy = from.y + NODE_H / 2 - (bounds.minY - 100);
              const tx = to.x + NODE_W / 2 - (bounds.minX - 100);
              const ty = to.y + NODE_H / 2 - (bounds.minY - 100);

              if (e.kind === "spouse") {
                return (
                  <line
                    key={i}
                    x1={fx}
                    y1={fy}
                    x2={tx}
                    y2={ty}
                    stroke="hsl(var(--primary)/0.55)"
                    strokeWidth={1.5}
                    strokeDasharray="3 4"
                  />
                );
              }
              const dy = ty - fy;
              const path = `M ${fx} ${fy + NODE_H / 2 - 1} C ${fx} ${fy + dy / 2}, ${tx} ${fy + dy / 2}, ${tx} ${ty - NODE_H / 2 + 1}`;
              return (
                <path
                  key={i}
                  d={path}
                  fill="none"
                  stroke="hsl(var(--foreground)/0.32)"
                  strokeWidth={1.4}
                />
              );
            })}
          </svg>

          {layout.nodes.map((n) => (
            <TreeNode
              key={n.id}
              node={n}
              isFocus={n.person?.id === focusId}
              onSelect={(p) => setFocusId(p.id)}
              nodeW={NODE_W}
              nodeH={NODE_H}
              compact={compact}
            />
          ))}
        </div>

        {/* Help hint */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none text-[10px] sm:text-[11px] text-muted-foreground bg-background/85 backdrop-blur rounded-full px-3 py-1 border border-border/60 whitespace-nowrap">
          <span className="hidden sm:inline">Click a person to recenter · drag to pan · scroll to zoom</span>
          <span className="sm:hidden">Tap to recenter · drag to pan · pinch to zoom</span>
        </div>
      </div>

      {/* Search overlay */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border bg-card shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <SearchIcon className="h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find a person to focus on…"
                autoFocus
                className="border-0 shadow-none focus-visible:ring-0 px-0"
                data-testid="input-tree-search"
              />
              <Button variant="ghost" size="icon" onClick={() => setSearchOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto scrollbar-thin">
              {searchQuery && searchResults.length === 0 && (
                <div className="px-6 py-6 text-sm text-muted-foreground">No matches.</div>
              )}
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setFocusId(p.id);
                    setSearchOpen(false);
                    setSearchQuery("");
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-left hover-elevate active-elevate-2"
                  data-testid={`tree-search-result-${p.id}`}
                >
                  <div className="h-8 w-8 rounded-full bg-muted text-foreground flex items-center justify-center text-xs font-semibold">
                    {initials(p)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{fullDisplayName(p)}</div>
                    <div className="text-xs text-muted-foreground truncate">{lifespan(p)}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DirBtn({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-[10px] sm:text-xs hover-elevate active-elevate-2 ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground"
      }`}
      data-testid={`dir-${label.toLowerCase()}`}
    >
      {icon}
      {label}
    </button>
  );
}

function TreeNode({
  node,
  isFocus,
  onSelect,
  nodeW = NODE_W,
  nodeH = NODE_H,
  compact = false,
}: {
  node: NodeLayout;
  isFocus: boolean;
  onSelect: (p: Person) => void;
  nodeW?: number;
  nodeH?: number;
  compact?: boolean;
}) {
  const isCompact = compact || nodeW < 150;
  if (!node.person) {
    return (
      <div
        data-tree-node
        style={{ left: node.x, top: node.y, width: nodeW, height: nodeH, position: "absolute" }}
        className="rounded-md border border-dashed border-border/50 bg-card/40 flex items-center justify-center text-[10px] text-muted-foreground/60"
      >
        unknown
      </div>
    );
  }
  const p = node.person;
  const sex = (p.sex || "X").toUpperCase();
  // Classic blue / pink stripe + chip. Cards stay neutral so 100+ nodes don't overwhelm.
  const stripe =
    sex === "M"
      ? "bg-[hsl(212_82%_46%)] dark:bg-[hsl(212_72%_60%)]"
      : sex === "F"
      ? "bg-[hsl(338_70%_56%)] dark:bg-[hsl(338_68%_66%)]"
      : "bg-[hsl(220_12%_64%)] dark:bg-[hsl(220_12%_44%)]";
  const chip =
    sex === "M"
      ? "bg-[hsl(212_82%_46%)] text-white dark:bg-[hsl(212_72%_56%)]"
      : sex === "F"
      ? "bg-[hsl(338_70%_56%)] text-white dark:bg-[hsl(338_68%_64%)]"
      : "bg-[hsl(220_14%_82%)] text-[hsl(220_22%_22%)] dark:bg-[hsl(220_14%_28%)] dark:text-[hsl(220_14%_88%)]";
  const by = parseYear(p.birth?.date);
  const dy = parseYear(p.death?.date);
  return (
    <div
      data-tree-node
      style={{ left: node.x, top: node.y, width: nodeW, height: nodeH, position: "absolute" }}
      className={`relative overflow-hidden rounded-md border bg-card px-1.5 py-1 pl-2 cursor-pointer transition-shadow shadow-sm hover:shadow-md ${
        isFocus ? "ring-2 ring-primary border-primary" : "border-card-border"
      }`}
      onClick={() => onSelect(p)}
      data-testid={`tree-node-${p.id}`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${stripe}`} aria-hidden="true" />
      <div className="flex items-start gap-1.5 h-full">
        <div className={`shrink-0 mt-0.5 rounded-full ${chip} flex items-center justify-center font-semibold ${isCompact ? "h-5 w-5 text-[8px]" : "h-6 w-6 text-[9px]"}`}>
          {initials(p)}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className={`${isCompact ? "text-[10px]" : "text-[11px]"} font-semibold truncate text-foreground`}>{fullDisplayName(p)}</div>
          <div className={`${isCompact ? "text-[8px]" : "text-[9px]"} text-foreground/80 truncate tabular-nums`}>
            {by || "?"}{by || dy ? " – " : ""}{dy || (by && !p.death?.date ? "" : "?")}
          </div>
          {!isCompact && p.birth?.place && (
            <div className="text-[8px] text-foreground/60 truncate">{p.birth.place}</div>
          )}
        </div>
      </div>
      <Link
        href={`/person/${encodeURIComponent(p.id)}`}
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0.5 top-0.5 p-1 -m-1 text-[9px] text-foreground/60 hover:text-foreground"
        data-testid={`tree-node-link-${p.id}`}
      >
        ↗
      </Link>
    </div>
  );
}
