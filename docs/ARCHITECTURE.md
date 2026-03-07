# Parchment Studios — Architecture Research & Planning

## 1. What We're Actually Building

Not a map viewer (Leaflet). Not a whiteboard (Excalidraw). 

**Parchment Studios is a creative design tool for fantasy worldbuilding** — closer to Illustrator than Google Maps. Users compose worlds using:

- **Canvas** — infinite, zoomable surface where you paint terrain, place curated art stamps (mountains, castles, forests), draw coastlines, add labels
- **Book** — structured content linked to canvas elements (lore, history, NPCs, factions, magic systems)
- **AI** — a creative collaborator that can generate lore, suggest placements, create artwork, and compose commands just like the user does

The experience Sterling knows from building Inkarnate: **curated assets + composable design tools + beautiful output**.

## 2. Why Leaflet.js is Wrong

Leaflet is built for:
- Real-world geographic coordinate systems (lat/lng)
- Tile-based rendering of pre-rendered map images
- Markers on a fixed map

Parchment needs:
- Arbitrary coordinate space (not earth coordinates)
- Object-level manipulation (select, move, rotate, scale stamps)
- Layered rendering (terrain → features → labels → effects)
- Custom brush tools (paint terrain textures)
- Asset stamping (drag curated art onto canvas)
- Export at arbitrary resolution

## 3. Canvas Engine Options

### PixiJS (RECOMMENDED)
**What:** WebGL-powered 2D rendering engine. Used by Inkarnate-like tools.
- **Pros:** Fastest 2D renderer, handles thousands of sprites, tilemap support built-in, mature plugin ecosystem, GPU-accelerated filters/effects
- **Cons:** Lower-level than Konva (no built-in UI widgets), steeper learning curve
- **Why for Parchment:** This is what Inkarnate uses under the hood. GPU rendering means smooth pan/zoom with thousands of stamps. Tilemap plugin for terrain. Sprite batching for performance.

### Konva.js
**What:** Canvas 2D library focused on interactive shapes and design editors.
- **Pros:** Built-in drag/drop, selection, transforms, event system, serialization to JSON
- **Cons:** CPU-rendered (Canvas2D, not WebGL), slower with many objects (>500), no tilemap support
- **Why consider:** Faster to build a design editor. Has all the UI interactions built in.

### Fabric.js
**What:** Interactive canvas library, strong in image manipulation.
- **Pros:** Object selection, serialization, filters, rich text on canvas
- **Cons:** CPU-rendered, aging codebase, less active development
- **Not recommended:** Konva or PixiJS are better for this use case.

### tldraw
**What:** Infinite canvas SDK for React.
- **Pros:** Beautiful collaboration primitives, well-designed API, extensible shapes
- **Cons:** React-only (would need a React frontend alongside Phoenix), opinionated hand-drawn aesthetic
- **Interesting but:** Designed for whiteboarding, not design tools with curated assets.

### Recommendation
**PixiJS for rendering, with a custom interaction layer.** This matches what Inkarnate built. PixiJS handles the GPU rendering and sprite management. We build the tool system (select, stamp, brush, text) on top.

For faster MVP iteration, we could start with **Konva** (faster to prototype) and migrate to PixiJS when we need performance. But if we're building for scale, start with PixiJS.

## 4. Loro Extended + Command Pattern

### Why Loro Fits

Every action in the editor is a **command** — a serializable mutation:

```typescript
// Commands are just mutations to a Loro CRDT document
change(doc, (draft) => {
  draft.layers.stamps.push({
    assetId: "castle-01",
    x: 450, y: 320,
    scale: 1.2,
    rotation: 0,
    zIndex: 5
  });
});
```

This gives us:
1. **Undo/Redo** — Loro tracks version history natively
2. **Replay** — play back the creation process as a timelapse
3. **AI as peer** — AI generates lore/places stamps by writing commands to the same document
4. **Collaboration** — multiple users edit simultaneously, CRDT handles conflicts
5. **Offline** — works without internet, syncs when reconnected
6. **Persistence** — document state IS the save file

### Document Schema (Loro)

```typescript
const worldSchema = Shape.doc({
  // Project metadata
  meta: Shape.struct({
    name: Shape.text(),
    description: Shape.text(),
    createdAt: Shape.plain.string(),
  }),
  
  // Canvas state
  canvas: Shape.struct({
    width: Shape.plain.number(),
    height: Shape.plain.number(),
    backgroundColor: Shape.plain.string(),
    backgroundImage: Shape.plain.string(), // base texture URL
  }),
  
  // Layers (ordered, each contains objects)
  layers: Shape.movableList(
    Shape.struct({
      id: Shape.plain.string(),
      name: Shape.text(),
      visible: Shape.plain.boolean(),
      locked: Shape.plain.boolean(),
      opacity: Shape.plain.number(),
      objects: Shape.list(
        Shape.struct({
          id: Shape.plain.string(),
          type: Shape.plain.string(), // "stamp" | "text" | "path" | "region"
          x: Shape.plain.number(),
          y: Shape.plain.number(),
          width: Shape.plain.number(),
          height: Shape.plain.number(),
          rotation: Shape.plain.number(),
          scale: Shape.plain.number(),
          assetId: Shape.plain.string(), // reference to asset library
          data: Shape.plain.struct({}), // type-specific data
        })
      ),
    })
  ),
  
  // Locations (linked to canvas objects)
  locations: Shape.record(
    Shape.struct({
      name: Shape.text(),
      type: Shape.plain.string(),
      description: Shape.text(), // AI-generated, collaboratively editable
      lore: Shape.text(),
      canvasObjectId: Shape.plain.string(), // links to a canvas object
      stats: Shape.plain.struct({}), // population, government, etc.
      connections: Shape.list(Shape.plain.string()), // links to other locations
    })
  ),
  
  // Book content (the gazetteer / worldbuilding book)
  book: Shape.struct({
    chapters: Shape.movableList(
      Shape.struct({
        title: Shape.text(),
        type: Shape.plain.string(), // "gazetteer" | "bestiary" | "history" | "custom"
        content: Shape.text(), // rich text content
        locationRefs: Shape.list(Shape.plain.string()),
      })
    ),
  }),
});
```

### Command Flow

```
User clicks "Place Castle"
    → Tool creates Stamp command
    → Command writes to Loro document via change()
    → Loro broadcasts delta to all peers (other users, AI, server)
    → PixiJS renderer observes document changes → updates canvas
    → Phoenix server receives sync → persists to DB

AI generates lore for "Ironhaven"  
    → AI writes to Loro document: locations["ironhaven"].description
    → Same flow — all peers see the update in real-time
    → Text streams in character by character (Loro Text supports this)
```

## 5. Architecture: Phoenix + Loro + PixiJS

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser (Client)                          │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   PixiJS     │  │  Loro CRDT   │  │   Book Editor    │  │
│  │   Canvas     │←→│  Document    │←→│   (ProseMirror   │  │
│  │   Renderer   │  │  (local)     │  │    or Tiptap)    │  │
│  └──────────────┘  └──────┬───────┘  └──────────────────┘  │
│                           │                                  │
│                    WebSocket sync                            │
│                           │                                  │
├───────────────────────────┼──────────────────────────────────┤
│                    Phoenix Server                            │
│                           │                                  │
│  ┌──────────────┐  ┌──────┴───────┐  ┌──────────────────┐  │
│  │   Loro Sync  │  │  AI Engine   │  │   Asset Manager  │  │
│  │   Handler    │←→│  (LLM calls, │  │   (curated art   │  │
│  │  (WebSocket) │  │   generates  │  │    library)      │  │
│  │              │  │   commands)  │  │                    │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   PostgreSQL  │  │  R2/S3      │  │   Export Engine  │  │
│  │   (projects,  │  │  (images,   │  │   (PDF, PNG)     │  │
│  │    auth)      │  │   assets)   │  │                    │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Key Decision: LiveView vs SPA

**Option A: Phoenix LiveView + JS hooks (simpler)**
- LiveView handles routing, auth, project management
- PixiJS canvas runs as a LiveView JS hook
- Loro syncs via LiveView WebSocket (already connected)
- Book editor runs as another JS hook
- **Pro:** One connection, one framework, simpler deployment
- **Con:** LiveView's server-rendered model can conflict with client-heavy canvas

**Option B: Phoenix API + React/Svelte SPA (more flexible)**
- Phoenix provides REST/GraphQL API + WebSocket for Loro sync
- React frontend with PixiJS, Loro, ProseMirror
- More traditional SPA architecture
- **Pro:** Full client-side control, easier to hire frontend devs
- **Con:** Two codebases, more complexity

**Recommendation:** Start with **LiveView + hooks**. The canvas and book editor live in JS hooks, but all the routing, auth, project management, and AI orchestration stays in LiveView. If the client-side complexity grows too much, we can extract to SPA later.

## 6. Competitive Landscape (Updated 2026)

| Tool | Maps | AI | Book/Lore | Collab | CRDT | Parchment Advantage |
|------|------|----|-----------| -------|------|---------------------|
| Inkarnate | ✅ (best) | ❌ | ❌ | ❌ | ❌ | AI + lore + book view |
| World Anvil | Import | ❌ | ✅ (wiki) | Basic | ❌ | Canvas editor + AI |
| Campfire | Import | ❌ | ✅ | ❌ | ❌ | Maps + AI art |
| LegendKeeper | Import | ❌ | ✅ | ✅ | ❌ | Canvas + AI + CRDT |
| Summon Worlds | ❌ | ✅ | ✅ (chat) | ❌ | ❌ | Visual editor + maps |
| AI Dungeon | ❌ | ✅ | ❌ | ❌ | ❌ | Structured creation |
| **Parchment** | ✅ | ✅ | ✅ | ✅ | ✅ | **All of the above** |

### Niche Validation Signals
- r/worldbuilding: 2.5M members, constant "what tool should I use?" posts
- Inkarnate Pro: $7.99-14.99/mo, 500K+ users
- World Anvil: $6.50-25/mo, 500K+ users
- Campfire: $12.50/mo or $375 lifetime, strong indie following
- Summon Worlds: NEW (2025), AI-first but no canvas — just chat-based generation
- **Gap:** Nobody does AI + canvas editing + structured lore + CRDT collaboration

## 7. Asset Strategy

This is critical — Sterling knows from Inkarnate that **curated assets make or break the tool**.

### Phase 1: Bootstrap (MVP)
- License a free/CC0 fantasy icon set (game-icons.net has 4000+ icons)
- Use AI image generation for landscape art (Gemini Image Gen / SDXL)
- Basic stamp categories: terrain (mountains, forests, hills), settlements (city, town, village), landmarks (ruins, tower, temple), water (lake, river, coast)

### Phase 2: Curated Library
- Commission or AI-generate a consistent art style pack (50-100 stamps)
- Multiple perspectives: top-down regional, isometric city, side-view battlemap
- LoRA-trained consistency for AI-generated additions

### Phase 3: Marketplace
- Users can upload and sell their own asset packs
- Revenue share model (70/30 like game asset stores)
- Community-driven growth

## 8. Build Plan

### Phase 1: Foundation (Week 1-2)
- [ ] Phoenix project with auth (phx.gen.auth)
- [ ] Project CRUD (create/list/edit worlds)
- [ ] Loro document schema defined
- [ ] Loro sync via Phoenix WebSocket
- [ ] PixiJS canvas basic: pan, zoom, background
- [ ] Stamp placement: select asset → click canvas → stamp placed
- [ ] Asset library sidebar with 20-30 starter icons

### Phase 2: Editor (Week 3-4)
- [ ] Tool system: select, stamp, text, brush (terrain paint)
- [ ] Layer system: terrain, features, labels, effects
- [ ] Selection: click to select, drag to move, handles to resize/rotate
- [ ] Properties panel: edit selected object's properties
- [ ] Undo/redo via Loro versioning
- [ ] Location linking: mark stamps as "locations" with lore

### Phase 3: AI + Book (Week 5-6)
- [ ] AI lore generation for locations
- [ ] AI artwork generation for locations
- [ ] AI terrain suggestion ("generate a coastline here")
- [ ] Book/gazetteer view: render locations as styled pages
- [ ] PDF export

### Phase 4: Polish + Launch
- [ ] Parchment visual theme (medieval aesthetic)
- [ ] Responsive design
- [ ] Demo world with full lore
- [ ] Landing page
- [ ] Stripe subscription

## 9. Open Questions

1. **PixiJS vs Konva for MVP?** Konva is faster to prototype (built-in interactions). PixiJS is better long-term (WebGL performance). Start Konva, migrate later?

2. **Loro server-side in Elixir?** Loro is Rust/TypeScript. Server needs to participate in the CRDT network. Options: NIF binding (Rustler), or run a small Node sidecar for Loro sync.

3. **Asset format?** SVG (resolution-independent, smaller) vs PNG (richer art, what Inkarnate uses)?

4. **Rich text editor for book view?** Tiptap (ProseMirror-based) is the standard, but it's React/Vue. LiveView integration options: JS hook wrapping Tiptap, or use Milkdown (lighter ProseMirror wrapper).

5. **How deep does AI composability go?** Can AI do: place 20 mountains along a ridge? Paint a forest region? Generate an entire continent layout? Each level requires more sophisticated command generation.
