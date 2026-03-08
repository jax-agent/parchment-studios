export type LayerType = 'terrain' | 'water' | 'features' | 'labels' | 'effects' | 'custom';

export type MapObjectType = 'stamp' | 'path' | 'text' | 'region' | 'brush_stroke';

/**
 * The compositing type of a stamp layer.
 * - base: primary artwork layer
 * - shadow: shadow pass (typically multiply blend, keyed to lightAngle)
 * - light: specular/rim pass (typically screen blend, keyed to lightAngle)
 * - state: state variant (damaged, frozen, on-fire, etc.)
 * - season: seasonal variant (snow-capped, autumn, etc.)
 */
export type StampLayerType = 'base' | 'shadow' | 'light' | 'state' | 'season';

/**
 * Blend modes supported by the compositing renderer.
 */
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';

/**
 * A single compositing layer within a stamp.
 * Multiple StampLayers are blended together to produce the final stamp appearance.
 *
 * For M0.1 (schema definition):
 * - frames[] may be empty — renderer falls back to a colored placeholder rect
 * - fps defaults to 0 (static, no animation)
 * - keyed_to links a layer's visual to a global state (e.g. 'lightAngle')
 * - toggle allows users to show/hide optional layers (e.g. "show snow caps")
 */
export interface StampLayer {
  id: string;
  type: StampLayerType;
  blendMode: BlendMode;
  opacity: number;
  visible: boolean;
  frames: string[]; // asset URLs for animation frames; empty = placeholder rect
  fps: number;      // 0 = static (no animation)
  keyed_to?: string; // global state key this layer responds to, e.g. 'lightAngle'
  toggle?: boolean;  // whether the user can toggle this layer on/off
}

/**
 * An object placed on the map canvas.
 *
 * stampLayers defines the internal compositing stack for this stamp.
 * Each layer is blended in order to produce the final visual.
 * loreId links this map object to a LoreEntry in the worldbuilding book.
 */
export interface MapObject {
  id: string;
  type: MapObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  opacity: number;
  stampLayers: StampLayer[]; // replaces flat assetId — compositing layer stack
  loreId?: string;           // links to LoreEntry (bidirectional map ↔ book)
  label?: string;
  data: Record<string, unknown>;
}

export type ToolMode = 'select' | 'pan' | 'stamp' | 'pattern' | 'path' | 'brush' | 'text';

/**
 * Global map state passed to the renderer each frame.
 * lightAngle is in radians (0 = east/right, π/2 = south/down).
 * Shadow layers shift opposite to lightAngle; light layers shift toward it.
 */
export interface MapState {
  lightAngle: number;
}

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  opacity: number;
  objects: MapObject[];
  zIndex: number;
}

export interface Command {
  id: string;
  type: string;
  execute(): void;
  undo(): void;
  toJSON(): object;
}
