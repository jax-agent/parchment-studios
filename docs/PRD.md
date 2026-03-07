# Parchment Studios — Product Requirements Document
_Last updated: 2026-03-07 | Sterling + Jax_

---

## Vision

**Parchment Studios is the living creative studio for fantasy worldbuilders.**

It connects map, lore, and world state in one tool — so that placing a city on a map generates its story, and writing a character's history marks their home on the map. The world builds itself as you work.

**Not a map image generator. A world engine.**

---

## Target Users

1. **Fantasy authors** — building a world for a novel, series, or game design doc. No players. Pure creative worldbuilding.
2. **TTRPG dungeon masters** — running campaigns, tracking session events, evolving the world live with players.
3. **Game designers** — building world bibles, exporting to other tools (Foundry, Roll20, Unity, PDF).

**Beachhead: the solo author.** Biggest underserved market. Inkarnate's power users are mostly authors, not DMs.

---

## Core Loop

```
Place stamp → AI generates lore seed
Edit lore → world enriches
Lore links to map → bidirectional navigation
World state changes → stamp layers reflect it
```

The map and the book are one document. Not two tools with an export step.

---

## Phase 1: Map + Lore Foundation

### Map Style: Classic Fantasy Cartography ONLY

One style, nailed deeply. Hand-drawn ink on aged parchment. Tolkien / medieval atlas aesthetic.

Future styles (dungeon, nautical, political, hex grid) are separate themes — Phase 3+. Do not design for them now. Do design the system so adding them later is additive, not a rewrite.

---

### Map Layer System

Two distinct layer concepts (do not conflate):

**Map Layers** — the z-ordered canvas stack every map has:
| Z | Layer | What lives here |
|---|-------|-----------------|
| 0 | Parchment | base texture, always visible |
| 1 | Terrain Paint | painted biomes, elevation tinting |
| 2 | Water | rivers, lakes, ocean fills |
| 3 | Features | stamps (mountains, forests, buildings) |
| 4 | Labels | city names, region names, text |
| 5 | Effects | fog of war, vignette, overlays |

Each layer:
- Visible/hidden toggle
- Opacity slider
- Lock toggle (prevent accidental edits)

**Stamp Internal Layers** — compositing stack within a single stamp asset:
```
StampAsset {
  id: "stone_city"
  layers: [
    { type: "BASE",   blend: "normal",   frames: ["base.png"] },
    { type: "SHADOW", blend: "multiply", keyed_to: "global_light_angle" },
    { type: "LIGHT",  blend: "screen",   keyed_to: "global_light_angle" },
    { type: "DECAY",  blend: "overlay",  driven_by: "damage_level" },
    { type: "STATE",  blend: "normal",   toggle: "winter", frames: ["snow.png"] },
    { type: "STATE",  blend: "screen",   toggle: "burning", frames: ["fire_01.png", "fire_02.png", ...], fps: 12 },
  ]
}
```

Animation is supported from day one in the schema (frames array + fps). Static = 1 frame, fps 0.

**Global map properties affect all stamps:**
- `lightAngle: number` — shadows and highlights shift across all stamps
- `season: "summer" | "autumn" | "winter" | "spring"` — toggles season layers globally
- `worldState: string[]` — active state toggles ("at_war", "plague", etc.)

---

### Painting System

Brush tool paints directly onto **painting layers** (Terrain Paint, Water, Effects). These are raster layers — actual pixel painting using CanvasKit's path/paint system.

Brushes have:
- Size, opacity, hardness
- Blend mode (normal, multiply, overlay for terrain blending)
- Color (or texture stamp for terrain brushes)

**Terrain brushes** look like painted watercolor washes — forests painted green, mountains painted gray, deserts painted ochre. Underneath is always the parchment texture.

---

### Asset Pack System

Assets are organized into **themed packs**, not individual images.

```
Pack {
  id: "classic_fantasy"
  name: "Classic Fantasy"
  style: "hand_drawn_ink"  // matches map style
  free: true
  contents: {
    stamps: [...],          // buildings, terrain features
    terrain_brushes: [...], // forest, grassland, mountain, desert, water
    parchment_variants: [...], // aged, burnt, water-stained
    fonts: [...],           // serif fonts for labels
  }
}
```

Starter content: one free pack — **Classic Fantasy**. Covers: settlements (village, town, city, capital, ruin), terrain (mountain, forest, hills, desert, swamp, jungle), water (river, lake, ocean coast), special (dungeon entrance, temple, tower, cave).

Future paid packs: Desert, Arctic, Volcanic, Coastal/Nautical, Dark Realm, etc.

**Asset generation pipeline (nano-banana-pro):**
Each stamp generated as separate PNG layers:
1. Base (transparent background, ink on parchment style)
2. Shadow (grayscale multiply mask)
3. Light (grayscale screen mask)
4. State layers as needed (snow, fire, flood, decay)

---

### Infinite Canvas

Canvas has no fixed size. Map can be as large as needed.

**Rendering strategy:**
- World divided into spatial chunks (e.g. 512×512 world units)
- Frustum culling: only process chunks intersecting current viewport
- Spatial index (R-tree or simple grid) for hit testing without iterating all objects
- CanvasKit camera transform handles pan/zoom — viewport is the only "fixed" thing

**Export strategy (Skia Picture API):**
- All draw commands recorded via `SkPicture`
- Export: replay picture onto offscreen surface at target DPI
- Supports: 4K, 8K, 16K, 300DPI print — no memory ceiling
- Vector overlay (roads, borders, text) rendered as crisp vector at any scale
- Pixel layers (terrain painting, stamps) rendered at target resolution before compositing

**Hybrid pixel+vector rendering:**
| Element | Type | Why |
|---------|------|-----|
| Terrain paint | Pixel | Organic brushwork needs raster |
| Stamps | Pixel (layered) | Detail and layered states |
| Roads, rivers | Vector paths | Clean scaling |
| Region borders | Vector paths | Clean scaling |
| Text labels | Vector | Always sharp |

---

### Lore System — The Companion Book

Lore is a **living D&D book** that lives alongside the map. Not a sidebar. A full companion document.

**Lore Entry Types:**
- 📍 **Place** — city, region, dungeon, landmark (most link to map objects)
- 👤 **Character** — person, NPC, villain, hero
- 🐉 **Creature** — monsters, animals, races
- ⚔️ **Faction** — kingdoms, guilds, religions, cults
- 📖 **Event** — historical events, prophecies, current conflicts
- 🗡️ **Item** — artifacts, weapons, magical objects
- 🌍 **Cosmology** — world rules, magic system, gods

**Bidirectional linking:**
- Map stamp → `loreId` field links to a lore entry
- Lore entry → `mapPins: ObjectId[]` marks locations on map
- Clicking a stamp opens its lore entry
- Clicking a map pin in the lore book flies the map camera to that location

**AI generation on placement:**
When a stamp is placed and linked to a new lore entry:
```
City placed →
  AI generates seed:
    name: "Thornwall"
    type: "walled city"
    population: ~12,000
    founded: 340 years ago
    faction: "The Iron Compact"
    economy: "iron mining, weapons trade"
    current_ruler: "Governor Mira Ashford"
    hooks: [
      "The mines beneath the city have gone silent for 3 weeks",
      "The Governor's son was found dead with no wounds",
      "A stranger arrived claiming to carry a royal decree dissolving the city charter"
    ]
```

User owns this content — AI generates the seed, human expands and edits it.

**Lore navigation:**
- **Map → Book**: click stamp → lore entry opens
- **Book → Map**: click location link in lore → map flies to location and highlights stamp
- **Book browsing**: read the lore as a book, independent of map

---

## Phase 2: Campaign & Collaboration (DM Mode)
_Post Phase 1 launch_

- Session tracking: events attached to map locations, timestamped
- Map state history: "what did the map look like 3 sessions ago?"
- DM fog of war: hidden regions revealed as players explore
- Player view: separate read-only map view for players

---

## Phase 3: Export & Integration
_After Phase 2_

- **PDF atlas export** — beautiful formatted book with maps embedded
- **Foundry VTT export** — world package with scene maps
- **Roll20 export** — map images with metadata
- **API** — third-party game engines can query world state

---

## Technical Decisions

### Canvas Engine
CanvasKit (Skia WASM via `canvaskit-wasm`) — chosen for:
- Superior painting quality (anti-aliasing, blur, gradient blending)
- Path effects for hand-drawn aesthetics
- SkSL GPU shaders for terrain effects
- Picture API for resolution-independent export

### Stack
- Phoenix LiveView (Elixir) — server state, lore, persistence
- TypeScript — all canvas/map code (commands, layers, renderer, hook)
- CanvasKit WASM — canvas rendering
- SQLite (dev) → PostgreSQL (prod)
- Loro CRDT — undo history, future collaboration

### Command Pattern
All map mutations go through `CommandHistory`. Every action is undoable. This is non-negotiable — worldbuilders make mistakes constantly and Ctrl+Z is sacred.

---

## What NOT to Build Yet

- Dungeon builder / top-down battle maps
- Hex grid maps
- Procedural map generation (AI terrain generation)
- Real-time multiplayer (CRDT groundwork yes, live collab no)
- Mobile app
- Any style other than Classic Fantasy Cartography

---

## Open Questions

1. **Subscription model** — free tier (one world, starter pack) vs paid (unlimited worlds, premium packs)?
2. **Asset generation SLA** — who generates themed packs? Jax generates via nano-banana-pro? Or user-uploadable?
3. **Lore AI model** — which model for seed generation? Sonnet for quality, Flash for speed/cost?
4. **Canvas size limits** — what's the practical max before export quality degrades? Need to benchmark.
