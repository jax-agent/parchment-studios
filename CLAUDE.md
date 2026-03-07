# Task: Implement M2.3: Asset library sidebar for Parchment Studios.

## Task
Add a stamp asset library sidebar to the map editor. When the user clicks a stamp thumbnail, the stamp tool activates with that asset selected. Clicking the canvas places that stamp using the real PNG art (not colored rects).

## What exists already
- 6 PNG stamp assets in priv/static/assets/stamps/classic_fantasy/: city.png, village.png, mountain_range.png, forest_cluster.png, ruins.png, stone_tower.png
- StampAsset Ecto schema with fields: id, name, category, pack_id, layers[] (JSONB), thumbnail_url
- Assets context: ParchmentStudios.Assets.list_packs/0, list_assets/1
- Seed data: 6 stamps in DB under 'Classic Fantasy' pack, categories: Settlements (city, village), Terrain (mountain_range, forest_cluster), Landmarks (ruins, stone_tower)
- map_editor_live.ex: MapEditorLive LiveView (read this file to understand existing structure)
- assets/js/map/hook.ts: MapEditorHook (stamp placement currently uses colored placeholder rects)
- assets/js/map/renderer.ts: MapRenderer (renders stamp layers as colored rects)
- assets/js/map/types.ts: TypeScript types

## What to build

### 1. LiveView changes (map_editor_live.ex)
- On mount, load asset packs:  and call  and  for the first/default pack
- Add assigns: , ,  (default true),  (nil),  (grouped by category)
- Handle events:
  - : sets  assign + activates stamp tool + pushes  event with asset id, category, name, and image_url
  - : toggles 
  - : changes active pack, reloads assets

### 2. HEEx template (in render/1)
Add an asset library panel. It should sit as a collapsible panel on the right side (or bottom - use right side, w-64). Show:
- Pack selector dropdown at top (if multiple packs)
- Categories as section headers (Settlements, Terrain, Landmarks)
- Stamp thumbnails in a grid (2 columns, small thumbnails ~64px)
- Each thumbnail: img tag with src pointed at /assets/stamps/classic_fantasy/{name}.png (replace spaces with underscores, lowercase)
- Clicking thumbnail: phx-click='select_asset' phx-value-id={asset.id} phx-value-name={asset.name} phx-value-category={asset.category}
- Selected asset gets a highlight ring
- Panel is collapsible (toggle_asset_library event)

Position the asset library panel to the RIGHT of the map canvas, replacing/alongside the right panel. When a location is selected, the lore panel shows; otherwise the asset library shows. Or better: asset library is always on right (w-64), lore panel slides out on top of it (overlay).

### 3. TypeScript hook changes (hook.ts)
- Handle  event from LiveView: store selected asset info (id, name, imageUrl, category)
- When  and an asset is selected, use the asset's image URL when creating the AddStampCommand
- The stampLayers should include the asset's image URL in the  array of the base layer

### 4. Renderer changes (renderer.ts)
- When a stamp layer has  with image URLs, render the image instead of colored rects
- Load images via  and cache them (imageCache map: url → HTMLImageElement)
- On render: if frames[0] is a URL string, use CanvasKit's MakeImageFromEncoded or drawImage approach
- Since CanvasKit (Skia) is used: fetch the image as ArrayBuffer, use CanvasKit.MakeImageFromEncoded() to create a Skia image, then use canvas.drawImageRect() to render it
- Cache decoded Skia images by URL
- Keep fallback to colored rects when no frames

### 5. Fix thumbnail_url in seeds
Check priv/repo/seeds.exs — update StampAssets to have thumbnail_url set to '/assets/stamps/classic_fantasy/{name}.png' for each stamp. Or better: compute it dynamically from the asset name in the template.

## Validation
- mix precommit passes (all tests green)
- Asset library sidebar visible with 6 stamp thumbnails
- Click 'city' thumbnail → stamp tool activates → click canvas → city.png renders at cursor position
- Mix test all passes

## Repo
/root/projects/parchment_studios

## Commands
mix precommit = mix format && mix credo --strict && mix test
Run server: mix phx.server (for manual verification only if needed)

## Finish
When done: git add -A && git commit -m 'feat(M2.3): asset library sidebar with real PNG stamp rendering (#11)'


You are in an isolated gfork clone. Work freely.

## Workflow
1. Create a feature branch: git checkout -b feat/asset-sidebar
2. Implement the task described above
3. Run tests/linting before finishing
4. Commit all changes with a descriptive message
5. Do NOT push — the orchestrator handles that

## Rules
- Stay focused on the task
- Don't modify unrelated files
- If blocked, explain what you need and stop
