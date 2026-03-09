# Region Fill Tool — Implementation Task (M6.3)

## Context
Parchment Studios is an AI-powered fantasy map editor built with Elixir/Phoenix LiveView + TypeScript + CanvasKit (Skia WASM).

All milestones M0–M6.2 are complete (79 Elixir + 107 TS tests green). Now build the **Region Fill Tool** — draw closed polygon regions (kingdoms, forests, danger zones) with fill styles.

Read these files first:
- `docs/PRD.md`
- `assets/js/map/types.ts`
- `assets/js/map/hook.ts`
- `assets/js/map/commands.ts`
- `assets/js/map/renderer.ts`
- `lib/parchment_studios_web/live/map_editor_live.ex`
- `lib/parchment_studios/lore.ex`

Note: Tests use **Vitest** (not Jest). Run: `cd assets && npm test`

---

## What to Build

**Region Tool**: Click to place polygon vertices → double-click to close the polygon. Region fills with a visual style (hatching, watercolor wash, or solid). Regions link to LoreEntry (the kingdom IS the region). Click inside a closed region → opens its lore panel.

---

## Core Behavior

### Tool Mode
- Add `'region'` to `ToolMode` type in types.ts (currently: `'select' | 'pan' | 'stamp' | 'pattern' | 'path' | 'brush' | 'text'`)
- Keyboard shortcut: `'g'` (for region/ground area — wire in radial wheel too)
- Add region icon to radial wheel in hook.ts (use `R⬡` text or similar unicode: `⬡` or `▭`)

### Region Drawing Flow
1. `'region'` tool active → click canvas → place first vertex (small circle indicator)
2. Continue clicking → each click adds a vertex, preview polygon updates
3. Move mouse → ghost segment follows cursor (preview next vertex)
4. **Double-click** to close polygon (connects last vertex to first, finalizes, pushes to history)
5. **Escape** cancels in-progress region (clears vertices, no history entry)
6. Minimum viable region: 3 vertices

### RegionObject Type
Add to types.ts (note: `'region'` is already in `MapObjectType`, just needs the extended interface):
```typescript
export type RegionFillStyle = 'none' | 'hatching' | 'watercolor' | 'crosshatch' | 'solid';

// Add to MapObject.data shape (use data field, similar to PathObject approach)
// OR add dedicated fields — use dedicated fields for clarity:
// MapObject.data.regionVertices, regionFillStyle, regionFillColor
// Actually: extend MapObject with discriminated approach via data field:
```

Since `MapObject` is a flat interface (not discriminated union), store region-specific data in the `data` field:
```typescript
// When type === 'region':
// obj.data.vertices: { x: number; y: number }[]  (the polygon vertices)
// obj.data.fillStyle: RegionFillStyle
// obj.data.fillColor: string  (hex color, e.g. '#2d5a2780' with alpha)
// obj.data.strokeColor: string  (border color)
// obj.data.strokeWidth: number
```

Export `RegionFillStyle` type from types.ts.

### In-Progress State (hook.ts)
```typescript
private _regionVertices: { x: number; y: number }[] = [];
private _regionInProgress = false;
private _regionFillStyle: RegionFillStyle = 'hatching';
private _regionFillColor = '#2d5a27';  // forest green default
private _regionMouseX = 0;
private _regionMouseY = 0;
```

On `pointerdown` (when tool === 'region'):
- Convert screen → world coords
- Single click: push vertex, set `_regionInProgress = true`
- Re-render

On `pointermove` (when tool === 'region'):
- Track `_regionMouseX/Y` in world coords
- Re-render to show ghost edge

On `dblclick` (when tool === 'region'):
- If `_regionVertices.length >= 3`:
  - Create MapObject with type='region', data.vertices, data.fillStyle, data.fillColor, data.strokeColor='#1a1a1a', data.strokeWidth=2
  - x/y = centroid of vertices (for click-detection anchor), width/height=0 (polygon, not rect)
  - Push `AddObjectCommand`, execute, push to history
  - Push `region_placed` event to LiveView: `{ fill_style: ..., vertex_count: N }`
  - LiveView: create a LoreEntry for this region (type=place), push `lore_entry_created` event back
  - Reset `_regionVertices = []`, `_regionInProgress = false`
- Prevent default

On `keydown` Escape:
- If `_regionInProgress`: reset, re-render

### Rendering (renderer.ts)
Pass `_regionInProgress`, `_regionVertices`, `_regionMouseX/Y`, `_regionFillStyle` to renderer via `getRegionStateFn` callback.

**Rendering in-progress region** (drawn AFTER all layers, like path ghost):
- Draw filled polygon (50% opacity) showing preview fill
- Draw ghost edge from last vertex to mouse
- Draw small circles at each placed vertex
- Draw closing-edge preview (last vertex → first vertex in dashed style) when ≥3 vertices

**Rendering completed RegionObjects** (in the Features layer, before stamps):
Add case for `type === 'region'` in the render loop:

```typescript
private drawRegion(canvas: SkCanvas, obj: MapObject): void {
  const vertices = obj.data.vertices as { x: number; y: number }[];
  if (!vertices || vertices.length < 3) return;

  const path = this._ck.Path.Make();
  path.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    path.lineTo(vertices[i].x, vertices[i].y);
  }
  path.close();

  const fillStyle = obj.data.fillStyle as string;
  const fillColor = obj.data.fillColor as string || '#2d5a27';
  const strokeColor = obj.data.strokeColor as string || '#1a1a1a';
  const strokeWidth = obj.data.strokeWidth as number || 2;

  const paint = this._ck.Paint.Make();
  paint.setAntiAlias(true);

  // Fill
  if (fillStyle === 'solid') {
    paint.setStyle(this._ck.PaintStyle.Fill);
    // Parse hex to RGBA with 40% alpha
    const r = parseInt(fillColor.slice(1,3),16)/255;
    const g = parseInt(fillColor.slice(3,5),16)/255;
    const b = parseInt(fillColor.slice(5,7),16)/255;
    paint.setColor(this._ck.Color4f(r, g, b, 0.35));
    canvas.drawPath(path, paint);
  } else if (fillStyle === 'hatching' || fillStyle === 'crosshatch') {
    // Clip to region path and draw hatching lines
    canvas.save();
    canvas.clipPath(path, this._ck.ClipOp.Intersect, true);
    
    // Compute bounding box
    const xs = vertices.map(v => v.x);
    const ys = vertices.map(v => v.y);
    const minX = Math.min(...xs) - 10;
    const maxX = Math.max(...xs) + 10;
    const minY = Math.min(...ys) - 10;
    const maxY = Math.max(...ys) + 10;
    const span = Math.max(maxX - minX, maxY - minY);
    
    paint.setStyle(this._ck.PaintStyle.Stroke);
    const r = parseInt(fillColor.slice(1,3),16)/255;
    const g = parseInt(fillColor.slice(3,5),16)/255;
    const b = parseInt(fillColor.slice(5,7),16)/255;
    paint.setColor(this._ck.Color4f(r, g, b, 0.5));
    paint.setStrokeWidth(1);
    
    const spacing = 12;
    const hatchPath = this._ck.Path.Make();
    for (let d = -span; d <= span * 2; d += spacing) {
      hatchPath.moveTo(minX + d, minY);
      hatchPath.lineTo(minX + d - span, maxY);
    }
    if (fillStyle === 'crosshatch') {
      for (let d = -span; d <= span * 2; d += spacing) {
        hatchPath.moveTo(minX, minY + d);
        hatchPath.lineTo(maxX, minY + d + span);
      }
    }
    canvas.drawPath(hatchPath, paint);
    hatchPath.delete();
    canvas.restore();
  } else if (fillStyle === 'watercolor') {
    // Soft watercolor wash: filled + blurred border
    paint.setStyle(this._ck.PaintStyle.Fill);
    const r = parseInt(fillColor.slice(1,3),16)/255;
    const g = parseInt(fillColor.slice(3,5),16)/255;
    const b = parseInt(fillColor.slice(5,7),16)/255;
    paint.setColor(this._ck.Color4f(r, g, b, 0.25));
    const blur = this._ck.MaskFilter.MakeBlur(this._ck.BlurStyle.Normal, 6, false);
    paint.setMaskFilter(blur);
    canvas.drawPath(path, paint);
    paint.setMaskFilter(null);
    // Second pass: slightly more opaque center
    paint.setColor(this._ck.Color4f(r, g, b, 0.15));
    canvas.drawPath(path, paint);
  } else {
    // 'none' — no fill, just stroke
  }

  // Stroke (polygon border)
  paint.setStyle(this._ck.PaintStyle.Stroke);
  paint.setStrokeWidth(strokeWidth);
  const sr = parseInt(strokeColor.slice(1,3),16)/255;
  const sg = parseInt(strokeColor.slice(3,5),16)/255;
  const sb = parseInt(strokeColor.slice(5,7),16)/255;
  paint.setColor(this._ck.Color4f(sr, sg, sb, 0.8));
  // Dashed border for fantasy cartography feel
  const dashes = this._ck.PathEffect.MakeDash([6, 3], 0);
  paint.setPathEffect(dashes);
  canvas.drawPath(path, paint);
  paint.setPathEffect(null);
  paint.delete();
  path.delete();
}
```

### Hit Testing for Regions
In the hit test loop (for click-to-select), add region point-in-polygon check:
- For `type === 'region'`: use ray-casting algorithm to check if click is inside polygon
- If inside: select region, open lore panel (same as stamp)

Use a helper `pointInPolygon(x, y, vertices)` function (ray casting):
```typescript
function pointInPolygon(px: number, py: number, verts: {x:number,y:number}[]): boolean {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i].x, yi = verts[i].y;
    const xj = verts[j].x, yj = verts[j].y;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
```

### Region Fill Style Panel
Add a floating panel (appears when region tool active, similar to path/brush panels):
- 4 style options: ∅ None | ≡ Hatching | ≋ Crosshatch | ☁ Watercolor
- Color picker: 6 preset colors (forest green, kingdom gold, danger red, ocean blue, desert ochre, purple mystery)
- Handle client-side in hook.ts; push `set_region_style` event to LiveView for tracking

### Server Side (map_editor_live.ex)
```elixir
# Region placed — create a LoreEntry linked to this region
def handle_event("region_placed", %{"fill_style" => style, "vertex_count" => count, "object_id" => id}, socket) do
  {:ok, lore_entry} = Lore.create_lore_entry(%{
    project_id: socket.assigns.project.id,
    title: "Unnamed Region",
    type: "place",
    content: ""
  })
  {:noreply, push_event(socket, "lore_entry_created", %{object_id: id, lore_entry_id: lore_entry.id})}
end

def handle_event("set_region_style", _params, socket), do: {:noreply, socket}
```

Make sure `region_placed` sends `object_id` from hook.ts: after creating the MapObject, include its id in the push event.

### Radial Wheel Update
In hook.ts (wherever the radial wheel tools are defined), add region tool:
- Icon: `⬡` (hexagon outline, or use `▭`)
- Label: "Region"  
- Mode: `'region'`
- Shortcut: `'g'`

---

## Tests

### TypeScript (assets/js/map/__tests__/region.test.ts)
Write tests using **Vitest** (`import { describe, it, expect } from 'vitest'`):
- `RegionFillStyle` type includes all 5 styles
- `pointInPolygon` returns true for point inside, false for point outside
- MapObject with type='region' can be created with correct data shape
- AddObjectCommand works with region MapObject
- 3+ vertices required (test with 2 → should not create region)
- Centroid calculation: average of vertices x/y

### Elixir (test/parchment_studios_web/live/map_editor_live_test.exs)
Add 3 tests:
- `region_placed` event creates a LoreEntry and returns lore_entry_created push
- `region_placed` with correct vertex_count
- `set_region_style` returns noreply

---

## Acceptance Criteria
1. `mix precommit` passes (all Elixir + TS tests green)
2. Select Region tool (G key), click 4+ vertices → double-click → closed polygon appears with selected fill
3. Switch fill styles in panel → polygon fill updates (re-render on style change if needed)
4. Click inside a placed region → lore panel opens ("Unnamed Region")
5. Escape cancels in-progress region
6. Ctrl+Z removes entire placed region in one step
7. All existing tests still pass

## Commit
When done: `git add -A && git commit -m "feat(M6.3): Region Fill Tool — polygon regions with fill styles + lore link"`

Do NOT push. Do NOT open a PR. Just commit.
