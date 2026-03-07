# M2.3 — Asset Library Sidebar

## Goal
Add a stamp asset library sidebar to the map editor. When the user clicks a stamp thumbnail, the stamp tool activates with that asset selected. Clicking the canvas places that stamp using the real PNG art (not colored rects).

## What already exists
- 6 PNG stamp assets in priv/static/assets/stamps/classic_fantasy/: city.png, village.png, mountain_range.png, forest_cluster.png, ruins.png, stone_tower.png
- StampAsset Ecto schema: id, name, category, pack_id, layers (JSONB array), thumbnail_url
- Assets context: ParchmentStudios.Assets with list_packs/0 and list_assets/1
- Seed data: 6 stamps in DB under 'Classic Fantasy' pack, categories: Settlements (city, village), Terrain (mountain_range, forest_cluster), Landmarks (ruins, stone_tower)
- map_editor_live.ex: MapEditorLive LiveView — read this file first
- assets/js/map/hook.ts: MapEditorHook — stamp placement uses colored placeholder rects currently
- assets/js/map/renderer.ts: MapRenderer — renders stamp layers as colored rects
- assets/js/map/types.ts: TypeScript types

## Changes to make

### 1. LiveView (lib/parchment_studios_web/live/map_editor_live.ex)
- alias ParchmentStudios.Assets
- On mount: load packs and assets, add assigns:
  - asset_packs: Assets.list_packs()
  - active_pack: first pack (or nil)
  - asset_library: assets grouped by category
  - asset_library_open: true
  - selected_asset: nil
- Event handlers:
  - "select_asset" — sets selected_asset, activates stamp tool, pushes "asset_selected" JS event with %{id, name, category, image_url}
  - "toggle_asset_library" — toggles asset_library_open
- Compute image_url from asset name: "/assets/stamps/classic_fantasy/#{String.replace(asset.name, " ", "_") |> String.downcase()}.png"

### 2. HEEx template (render/1 in map_editor_live.ex)
Add asset library panel on the right side (w-64), collapsible. Structure:
- Header: "STAMPS" label + collapse button
- Categories as section headers (iterate over grouped assets)
- 2-column thumbnail grid, each ~64px
- img src="/assets/stamps/classic_fantasy/{normalized_name}.png"
- phx-click="select_asset" with phx-value-id, phx-value-name, phx-value-category
- Selected asset gets a ring-2 ring-primary highlight
- When a location is selected in the right panel, the asset library is still shown (they are separate panels — asset library is always-visible on the right, lore detail overlays on top)

Actually: simplest approach — put asset library as an additional panel. The existing right panel for location detail can remain; add asset library BELOW the toolbar buttons or as a separate sidebar element. OR: make asset library the default right panel, and the location detail slides in over it as an overlay/absolute panel.

Best approach: Asset library is a fixed w-64 right panel. Location detail becomes an absolute floating panel (e.g., positioned right-64 from the right edge, w-80) that appears on top when a location is selected.

### 3. TypeScript hook (assets/js/map/hook.ts)
- Track selected asset: this._selectedAsset = null
- Handle "asset_selected" event from LiveView: store asset info (id, name, imageUrl, category)
- When placing stamp in stamp mode: include imageUrl in the base layer's frames array
  - stampLayers[0].frames = [imageUrl] (the base layer)
  - Keep shadow layer as before

### 4. Renderer (assets/js/map/renderer.ts)
- Add image cache: Map<string, CanvasKit.Image> or Map<string, HTMLImageElement>
- Since we use CanvasKit (Skia WASM): when a stamp layer's frames[0] is a URL string:
  1. If not cached: fetch(url) -> arrayBuffer -> CanvasKit.MakeImageFromEncoded(new Uint8Array(buf))
  2. Cache the decoded CanvasKit Image
  3. Use canvas.drawImageRect(ckImage, srcRect, dstRect, paint) to render
- Since image loading is async, use a preload/queue approach: when frames[0] is a URL, check cache; if missing, fetch and trigger re-render after load; render a placeholder rect in the meantime
- Keep colored rect fallback when frames is empty

### 5. Seeds fix (priv/repo/seeds.exs)
Update the seed StampAssets to set thumbnail_url for each:
  "/assets/stamps/classic_fantasy/{name}.png" where name is the asset name slug

## Validation
Run: mix format && mix credo --strict && mix test
All tests must pass.

## Commit when done
git add -A && git commit -m "feat(M2.3): asset library sidebar with real PNG stamp rendering (#11)"
