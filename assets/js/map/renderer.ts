import type { Layer, MapObject, MapState, StampLayer, BlendMode } from './types';

export class Viewport {
  private panX = 0;
  private panY = 0;
  private zoom = 1.0;

  getZoom(): number {
    return this.zoom;
  }

  getPan(): { x: number; y: number } {
    return { x: this.panX, y: this.panY };
  }

  pan(dx: number, dy: number): void {
    this.panX += dx;
    this.panY += dy;
  }

  zoomTo(factor: number, cx: number, cy: number): void {
    // Zoom toward the point (cx, cy) in screen space
    const worldBefore = this.screenToWorld(cx, cy);
    this.zoom = factor;
    const worldAfter = this.screenToWorld(cx, cy);
    // Adjust pan so the world point under the cursor stays fixed
    this.panX += (worldAfter.x - worldBefore.x) * this.zoom;
    this.panY += (worldAfter.y - worldBefore.y) * this.zoom;
  }

  resetView(): void {
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.0;
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.panX) / this.zoom,
      y: (sy - this.panY) / this.zoom,
    };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: wx * this.zoom + this.panX,
      y: wy * this.zoom + this.panY,
    };
  }

  hitTest(screenX: number, screenY: number, layers: Layer[]): MapObject | null {
    const world = this.screenToWorld(screenX, screenY);
    // Iterate layers top-to-bottom (highest zIndex first)
    const sorted = [...layers].sort((a, b) => b.zIndex - a.zIndex);
    for (const layer of sorted) {
      if (!layer.visible) continue;
      // Check objects in reverse order (last added = on top)
      for (let i = layer.objects.length - 1; i >= 0; i--) {
        const obj = layer.objects[i];
        if (
          world.x >= obj.x &&
          world.x <= obj.x + obj.width &&
          world.y >= obj.y &&
          world.y <= obj.y + obj.height
        ) {
          return obj;
        }
      }
    }
    return null;
  }
}

// Color palette for placeholder rendering (one per map layer type)
const LAYER_COLORS: Record<string, [number, number, number, number]> = {
  terrain: [34, 139, 34, 255],     // forest green
  water: [65, 105, 225, 255],      // royal blue
  features: [139, 69, 19, 255],    // saddle brown
  labels: [50, 50, 50, 255],       // dark gray
  effects: [128, 0, 128, 128],     // purple, semi-transparent
  custom: [100, 100, 100, 255],    // gray
};

// Placeholder colors for stamp compositing layers (one per StampLayerType)
const STAMP_LAYER_COLORS: Record<string, [number, number, number]> = {
  base:   [180, 120,  60],   // warm ink-brown
  shadow: [ 50,  30,  10],   // near-black shadow
  light:  [255, 240, 170],   // warm highlight
  state:  [220, 120,  40],   // orange state tint
  season: [200, 220, 255],   // cool winter/season tint
};

// How far (in world px) a light-keyed layer shifts per unit
const LIGHT_SHADOW_DIST = 8;

/**
 * Maps our BlendMode strings to CanvasKit BlendMode enum values.
 * These are looked up at runtime (after ck is initialized) via blendModeValue().
 */
function blendModeValue(ck: any, mode: BlendMode): any {
  switch (mode) {
    case 'multiply': return ck.BlendMode.Multiply;
    case 'screen':   return ck.BlendMode.Screen;
    case 'overlay':  return ck.BlendMode.Overlay;
    case 'darken':   return ck.BlendMode.Darken;
    case 'lighten':  return ck.BlendMode.Lighten;
    default:         return ck.BlendMode.SrcOver; // 'normal'
  }
}

/**
 * Compute the (dx, dy) offset for a light-keyed stamp layer.
 * Shadow layers shift away from the light; light layers shift toward it.
 *
 * @param type  StampLayerType ('shadow' | 'light' | ...)
 * @param lightAngle  radians, 0 = east, π/2 = south
 */
export function lightKeyedOffset(
  type: string,
  lightAngle: number,
  dist = LIGHT_SHADOW_DIST,
): { dx: number; dy: number } {
  if (type === 'shadow') {
    // Shadow falls opposite to the light source
    return {
      dx: Math.cos(lightAngle + Math.PI) * dist,
      dy: Math.sin(lightAngle + Math.PI) * dist,
    };
  }
  if (type === 'light') {
    // Light catch in the light direction, shorter distance
    return {
      dx: Math.cos(lightAngle) * (dist * 0.4),
      dy: Math.sin(lightAngle) * (dist * 0.4),
    };
  }
  return { dx: 0, dy: 0 };
}

export class MapRenderer {
  private ck: any | null = null;
  private surface: any | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private viewport = new Viewport();
  private dirty = true;
  private rafId: number | null = null;
  private font: any | null = null;
  private bgImage: any | null = null;
  private bgImageWidth = 0;
  private bgImageHeight = 0;

  getViewport(): Viewport {
    return this.viewport;
  }

  async init(canvasElement: HTMLCanvasElement): Promise<void> {
    const CanvasKitInit = (await import('canvaskit-wasm')).default;
    this.ck = await CanvasKitInit({
      locateFile: (file: string) => '/wasm/' + file,
    });
    this.canvasEl = canvasElement;
    this.surface = this.ck.MakeWebGLCanvasSurface(canvasElement);
    if (!this.surface) {
      this.surface = this.ck.MakeSWCanvasSurface(canvasElement);
    }
    if (!this.surface) {
      throw new Error('Failed to create CanvasKit surface');
    }
    this.font = new this.ck.Font(null, 14);

    // Load parchment background texture (non-blocking, falls back to solid fill)
    try {
      const resp = await fetch('/images/parchment_bg.png');
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const img = this.ck.MakeImageFromEncoded(bytes);
        if (img) {
          this.bgImage = img;
          this.bgImageWidth = img.width();
          this.bgImageHeight = img.height();
          this.requestRedraw();
        }
      }
    } catch {
      // silently fall back to solid parchment fill
    }
  }

  requestRedraw(): void {
    this.dirty = true;
  }

  startRenderLoop(
    getLayersFn: () => Layer[],
    getSelectedIdFn?: () => string | null,
    getMapStateFn?: () => MapState,
  ): void {
    const frame = () => {
      if (this.dirty) {
        const mapState = getMapStateFn?.() ?? { lightAngle: 0 };
        this.render(getLayersFn(), getSelectedIdFn?.() ?? undefined, mapState.lightAngle);
        this.dirty = false;
      }
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stopRenderLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private parseHexColor(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16),
    ];
  }

  /**
   * Composite the stampLayers[] of a single MapObject onto the canvas.
   * Each StampLayer is drawn as a placeholder colored rect with its blend mode applied.
   * Light-keyed layers (keyed_to === 'lightAngle') are offset by the shadow/light vector.
   *
   * @param canvas       CanvasKit canvas (already translated to obj origin)
   * @param obj          The MapObject being composited
   * @param ck           CanvasKit instance
   * @param baseAlpha    Pre-multiplied alpha from layer opacity × object opacity
   * @param lightAngle   Global light direction in radians
   * @param isSelected   Whether to draw a gold selection outline
   */
  private renderStampObject(
    canvas: any,
    obj: MapObject,
    ck: any,
    baseAlpha: number,
    lightAngle: number,
    isSelected: boolean,
  ): void {
    const visibleLayers = obj.stampLayers.filter((sl: StampLayer) => sl.visible);

    if (visibleLayers.length === 0) {
      // Fallback: single placeholder rect when no layers are defined
      const paint = new ck.Paint();
      try {
        paint.setAntiAlias(true);
        paint.setColor(ck.Color(180, 120, 60, 255));
        paint.setStyle(ck.PaintStyle.Fill);
        paint.setAlphaf(baseAlpha);
        canvas.drawRect(ck.LTRBRect(0, 0, obj.width, obj.height), paint);
      } finally {
        paint.delete();
      }
    } else {
      // Composite each stamp layer in order
      for (const sl of visibleLayers) {
        const paint = new ck.Paint();
        try {
          paint.setAntiAlias(true);

          // Placeholder color per stamp layer type
          const [r, g, b] = STAMP_LAYER_COLORS[sl.type] ?? STAMP_LAYER_COLORS.base;
          paint.setColor(ck.Color(r, g, b, 255));
          paint.setStyle(ck.PaintStyle.Fill);
          paint.setAlphaf(baseAlpha * sl.opacity);

          // Blend mode
          paint.setBlendMode(blendModeValue(ck, sl.blendMode));

          // Light-keyed offset (shadow / light layers shift with lightAngle)
          const offset = sl.keyed_to === 'lightAngle'
            ? lightKeyedOffset(sl.type, lightAngle)
            : { dx: 0, dy: 0 };

          const rect = ck.LTRBRect(
            offset.dx,
            offset.dy,
            obj.width + offset.dx,
            obj.height + offset.dy,
          );
          canvas.drawRect(rect, paint);
        } finally {
          paint.delete();
        }
      }
    }

    // Label text
    if (obj.label && this.font) {
      const lp = new ck.Paint();
      try {
        lp.setColor(ck.Color(255, 255, 255, 255));
        lp.setStyle(ck.PaintStyle.Fill);
        lp.setAlphaf(baseAlpha);
        canvas.drawText(obj.label, 4, obj.height / 2 + 5, lp, this.font);
      } finally {
        lp.delete();
      }
    }

    // Outline: gold selection highlight or subtle dark border
    const op = new ck.Paint();
    try {
      op.setAntiAlias(true);
      op.setStyle(ck.PaintStyle.Stroke);
      const outlineRect = ck.LTRBRect(0, 0, obj.width, obj.height);
      if (isSelected) {
        op.setStrokeWidth(3);
        op.setColor(ck.Color(255, 215, 0, 255));
        op.setAlphaf(1.0);
      } else {
        op.setStrokeWidth(1);
        op.setColor(ck.Color(0, 0, 0, 255));
        op.setAlphaf(0.3 * baseAlpha);
      }
      canvas.drawRect(outlineRect, op);
    } finally {
      op.delete();
    }
  }

  /**
   * Main render call. Draws all visible map layers with their objects.
   *
   * @param layers         Current layer stack
   * @param selectedObjectId  ID of the currently selected object (for gold outline)
   * @param lightAngle     Global light direction in radians (0 = east, π/2 = south)
   */
  render(layers: Layer[], selectedObjectId?: string, lightAngle = 0): void {
    if (!this.ck || !this.surface) return;
    const canvas = this.surface.getCanvas();
    const ck = this.ck;

    // Solid parchment clear — always (serves as fallback if texture not loaded)
    canvas.clear(ck.Color4f(0.95, 0.93, 0.9, 1.0));

    canvas.save();
    // Apply viewport transform
    const { x: px, y: py } = this.viewport.getPan();
    const zoom = this.viewport.getZoom();
    canvas.translate(px, py);
    canvas.scale(zoom, zoom);

    // Tile parchment background texture in world space (pans/zooms with map)
    if (this.bgImage && this.bgImageWidth > 0 && this.bgImageHeight > 0) {
      const canvasW = this.surface!.width();
      const canvasH = this.surface!.height();
      const tw = this.bgImageWidth;
      const th = this.bgImageHeight;
      // Visible world-space bounds (inverse viewport transform)
      const worldLeft  = -px / zoom;
      const worldTop   = -py / zoom;
      const worldRight = (canvasW - px) / zoom;
      const worldBottom = (canvasH - py) / zoom;
      const startX = Math.floor(worldLeft  / tw) * tw;
      const startY = Math.floor(worldTop   / th) * th;
      const bgPaint = new ck.Paint();
      try {
        for (let ty = startY; ty < worldBottom; ty += th) {
          for (let tx = startX; tx < worldRight; tx += tw) {
            canvas.drawImage(this.bgImage, tx, ty, bgPaint);
          }
        }
      } finally {
        bgPaint.delete();
      }
    }

    // Render each visible layer sorted by zIndex
    const sorted = [...layers].sort((a, b) => a.zIndex - b.zIndex);
    for (const layer of sorted) {
      if (!layer.visible) continue;

      const [lr, lg, lb, la] = LAYER_COLORS[layer.type] ?? LAYER_COLORS.custom;
      const layerAlpha = (la / 255) * layer.opacity;

      for (const obj of layer.objects) {
        canvas.save();
        canvas.translate(obj.x, obj.y);

        if (obj.rotation !== 0) {
          canvas.rotate(obj.rotation, obj.width / 2, obj.height / 2);
        }
        if (obj.scale !== 1) {
          canvas.scale(obj.scale, obj.scale);
        }

        const objAlpha = layerAlpha * obj.opacity;
        const isSelected = !!(selectedObjectId && obj.id === selectedObjectId);

        if (obj.type === 'text') {
          const paint = new ck.Paint();
          try {
            paint.setAntiAlias(true);
            paint.setColor(ck.Color(lr, lg, lb, 255));
            paint.setStyle(ck.PaintStyle.Fill);
            paint.setAlphaf(objAlpha);
            const text = (obj.data?.text as string) ?? 'Label';
            if (this.font) {
              canvas.drawText(text, 0, obj.height / 2, paint, this.font);
            }
          } finally {
            paint.delete();
          }
        } else {
          // Stamps, paths, regions: composite via stampLayers[]
          this.renderStampObject(canvas, obj, ck, objAlpha, lightAngle, isSelected);
        }

        canvas.restore();
      }
    }

    canvas.restore();
    this.surface.flush();
  }

  destroy(): void {
    this.stopRenderLoop();
    if (this.font) {
      this.font.delete();
      this.font = null;
    }
    if (this.surface) {
      this.surface.delete();
      this.surface = null;
    }
    this.ck = null;
    this.canvasEl = null;
  }
}
