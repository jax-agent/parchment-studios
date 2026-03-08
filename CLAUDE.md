# Task: M2.4 — Shadow + Light Layers for 6 Starter Stamps

## What to Build

Generate shadow and light layer PNGs for all 6 classic fantasy stamps, update the seed data to include 3-layer stamps, and update the renderer to shift shadow/light offsets based on `lightAngle`.

## Context

- Elixir/Phoenix + CanvasKit WASM + TypeScript project
- 6 stamps have base art in: `priv/static/assets/stamps/classic_fantasy/`
  - city.png, village.png, mountain_range.png, forest_cluster.png, ruins.png, stone_tower.png
- Each stamp currently has 2 StampLayers (base + shadow placeholder)
- `lightAngle` is in MapState (default -π/4), wired into `hook.ts` + `renderer.ts`
- Seeds are in `priv/repo/seeds.exs`
- Nano-banana-pro script: `~/.openclaw/workspace/skills/nano-banana-pro/scripts/generate_image.py`
- `GEMINI_API_KEY` env var is already set in the environment

## Part 1: Generate Shadow Layer PNGs

For each of the 6 stamps, run the image generation script to create a shadow PNG.

The script signature (check it first):
```bash
python3 ~/.openclaw/workspace/skills/nano-banana-pro/scripts/generate_image.py \
  --prompt "PROMPT" \
  --output priv/static/assets/stamps/classic_fantasy/{name}_shadow.png \
  --width 256 --height 256
```

Shadow prompt template:
`"Grayscale shadow mask for a hand-drawn ink fantasy cartography stamp icon, {description}. Black silhouette with soft edges, dark gray drop shadow gradient, white background, simple 2D top-down view. 256x256."`

Stamps and descriptions:
- city → "medieval walled city with towers"
- village → "small village with cottages"
- mountain_range → "mountain peaks"
- forest_cluster → "cluster of trees"
- ruins → "ancient crumbled stone ruins"
- stone_tower → "tall stone tower"

Output files: `priv/static/assets/stamps/classic_fantasy/{name}_shadow.png`

## Part 2: Generate Light Layer PNGs

Same process but for highlight/light layers:

Light prompt template:
`"Grayscale highlight mask for a hand-drawn ink fantasy cartography stamp icon, {description}. White highlights on raised surfaces from a top-left light source, soft gradient from bright to dark, white background. 256x256."`

Output files: `priv/static/assets/stamps/classic_fantasy/{name}_light.png`

## Part 3: Update Seeds to 3-Layer Stamps

In `priv/repo/seeds.exs`, each stamp's `:layers` field should be a 3-element list:

```elixir
layers: [
  %{
    "id" => "base",
    "type" => "image",
    "blendMode" => "normal",
    "opacity" => 1.0,
    "visible" => true,
    "frames" => [],
    "fps" => 0,
    "url" => "/assets/stamps/classic_fantasy/{name}.png"
  },
  %{
    "id" => "shadow",
    "type" => "image",
    "blendMode" => "multiply",
    "opacity" => 0.7,
    "visible" => true,
    "frames" => [],
    "fps" => 0,
    "keyed_to" => "shadow",
    "url" => "/assets/stamps/classic_fantasy/{name}_shadow.png"
  },
  %{
    "id" => "light",
    "type" => "image",
    "blendMode" => "screen",
    "opacity" => 0.5,
    "visible" => true,
    "frames" => [],
    "fps" => 0,
    "keyed_to" => "light",
    "url" => "/assets/stamps/classic_fantasy/{name}_light.png"
  }
]
```

After updating seeds.exs, run:
```bash
mix ecto.reset
```

Verify 6 assets exist with 3 layers each.

## Part 4: Update Renderer for lightAngle Offset

In `assets/js/map/renderer.ts`, when drawing stamp layers:

- If `layer.keyed_to === 'shadow'`: shift draw rect by:
  - `dx = -Math.sin(lightAngle) * 8` (pixels, world space)
  - `dy = Math.cos(lightAngle) * 8`
- If `layer.keyed_to === 'light'`: shift opposite:
  - `dx = Math.sin(lightAngle) * 4`
  - `dy = -Math.cos(lightAngle) * 4`
- If no `keyed_to`: draw at original position (no shift)

`lightAngle` is available via `this.getMapStateFn().lightAngle` in the renderer.

The offset applies to the destination rect passed to `drawImageRect` or the translated position of the placeholder rect.

Also update the TypeScript `StampLayer` type to include optional `keyed_to?: string` and `url?: string` fields (they may already exist — check types.ts).

## Verification

```bash
mix precommit          # all Elixir tests must pass
cd assets && npm test  # all TS tests must pass
```

## Commit

```bash
git checkout -b feat/m2-4-shadow-light
git add priv/static/assets/stamps/classic_fantasy/
git add priv/repo/seeds.exs assets/js/map/renderer.ts assets/js/map/types.ts
git commit -m "feat(M2.4): shadow + light layers for 6 starter stamps with lightAngle compositing"
```

## Completion

When completely finished and committed, run:
```bash
openclaw system event --text "Done: M2.4 shadow+light layers for 6 stamps committed" --mode now
```
