import type { Layer, MapObject, MapState, StampLayer, BlendMode, PathStyle } from './types';
import type { BrushPoint } from './commands';

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

export interface PreviewStroke {
  points: BrushPoint[];   // absolute world coordinates
  color: string;
  size: number;
  opacity: number;
  hardness: number;
}

export interface PathPreview {
  waypoints: { x: number; y: number }[];
  mouseX: number;
  mouseY: number;
  pathStyle: PathStyle;
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
  private imageCache: Map<string, any> = new Map();
  private loadingImages: Set<string> = new Set();

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
    getPreviewStrokeFn?: () => PreviewStroke | null,
    getPathPreviewFn?: () => PathPreview | null,
  ): void {
    const frame = () => {
      if (this.dirty) {
        const mapState = getMapStateFn?.() ?? { lightAngle: 0 };
        this.render(
          getLayersFn(),
          getSelectedIdFn?.() ?? undefined,
          mapState.lightAngle,
          getPreviewStrokeFn?.() ?? null,
          getPathPreviewFn?.() ?? null,
        );
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

  private async loadImage(url: string): Promise<void> {
    if (this.imageCache.has(url) || this.loadingImages.has(url)) return;
    if (!this.ck) return;

    this.loadingImages.add(url);
    try {
      const resp = await fetch(url);
      if (!resp.ok) return;
      const buf = await resp.arrayBuffer();
      const img = this.ck.MakeImageFromEncoded(new Uint8Array(buf));
      if (img) {
        this.imageCache.set(url, img);
        this.requestRedraw();
      }
    } catch {
      // silently fall back to placeholder
    } finally {
      this.loadingImages.delete(url);
    }
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
          paint.setAlphaf(baseAlpha * sl.opacity);
          paint.setBlendMode(blendModeValue(ck, sl.blendMode));

          // Light-keyed offset (shadow / light layers shift with lightAngle)
          const offset = sl.keyed_to === 'lightAngle'
            ? lightKeyedOffset(sl.type, lightAngle)
            : { dx: 0, dy: 0 };

          const imageUrl = sl.frames.length > 0 ? sl.frames[0] : null;
          const cachedImage = imageUrl ? this.imageCache.get(imageUrl) : null;

          if (cachedImage) {
            // Draw real PNG image
            const srcRect = ck.LTRBRect(0, 0, cachedImage.width(), cachedImage.height());
            const dstRect = ck.LTRBRect(
              offset.dx, offset.dy,
              obj.width + offset.dx, obj.height + offset.dy,
            );
            canvas.drawImageRect(cachedImage, srcRect, dstRect, paint);
          } else {
            // Placeholder colored rect
            const [r, g, b] = STAMP_LAYER_COLORS[sl.type] ?? STAMP_LAYER_COLORS.base;
            paint.setColor(ck.Color(r, g, b, 255));
            paint.setStyle(ck.PaintStyle.Fill);
            const rect = ck.LTRBRect(
              offset.dx, offset.dy,
              obj.width + offset.dx, obj.height + offset.dy,
            );
            canvas.drawRect(rect, paint);

            // Trigger async load if URL exists but not yet cached
            if (imageUrl) {
              this.loadImage(imageUrl);
            }
          }
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
   * Build a smooth SkPath through the given points using catmull-rom spline.
   * Falls back to a simple polyline if fewer than 2 points.
   */
  private buildStrokePath(ck: any, points: BrushPoint[]): any {
    const path = new ck.Path();
    if (points.length === 0) return path;
    if (points.length === 1) {
      // Single dot — draw a small circle via moveTo + lineTo same point
      path.moveTo(points[0].x, points[0].y);
      path.lineTo(points[0].x + 0.01, points[0].y);
      return path;
    }

    path.moveTo(points[0].x, points[0].y);

    if (points.length === 2) {
      path.lineTo(points[1].x, points[1].y);
      return path;
    }

    // Catmull-Rom spline: for each segment i → i+1, compute cubic bezier control points
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(i - 1, 0)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(i + 2, points.length - 1)];

      // Catmull-Rom → Bezier conversion (alpha = 0.5)
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path.cubicTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
    return path;
  }

  /**
   * Draw a brush stroke path with optional blur (softness) effect.
   * @param canvas     CanvasKit canvas (already in world space)
   * @param path       SkPath to stroke
   * @param color      Hex color string e.g. '#4a7c59'
   * @param size       Stroke width in world px
   * @param opacity    0–1
   * @param hardness   0=fully soft (blurred), 1=hard edge
   */
  private drawBrushPath(
    canvas: any,
    ck: any,
    path: any,
    color: string,
    size: number,
    opacity: number,
    hardness: number,
  ): void {
    const [r, g, b] = this.parseHexColor(color);
    const paint = new ck.Paint();
    try {
      paint.setAntiAlias(true);
      paint.setStyle(ck.PaintStyle.Stroke);
      paint.setStrokeWidth(size);
      paint.setStrokeCap(ck.StrokeCap.Round);
      paint.setStrokeJoin(ck.StrokeJoin.Round);
      paint.setColor(ck.Color(r, g, b, 255));
      paint.setAlphaf(opacity);

      // Soft brush: apply blur mask filter based on (1 - hardness)
      const blurSigma = size * (1 - hardness) * 0.3;
      if (blurSigma > 0.5) {
        const mf = ck.MaskFilter.MakeBlur(ck.BlurStyle.Normal, blurSigma, true);
        paint.setMaskFilter(mf);
        mf.delete();
      }

      canvas.drawPath(path, paint);
    } finally {
      paint.delete();
      path.delete();
    }
  }

  /**
   * Render a brush_stroke MapObject.
   * Points in obj.data.points are local (relative to obj.x, obj.y) — canvas is already translated.
   */
  private renderBrushStroke(canvas: any, obj: MapObject, ck: any): void {
    const points = (obj.data.points as BrushPoint[]) ?? [];
    if (points.length === 0) return;

    const color = (obj.data.color as string) ?? '#4a7c59';
    const size = (obj.data.size as number) ?? 20;
    const hardness = (obj.data.hardness as number) ?? 0.3;
    const path = this.buildStrokePath(ck, points);
    this.drawBrushPath(canvas, ck, path, color, size, obj.opacity, hardness);
  }

  /**
   * Draw a completed path MapObject using Catmull-Rom splines.
   */
  private renderPathObject(canvas: any, obj: MapObject, ck: any): void {
    const waypoints = (obj.data.waypoints as { x: number; y: number }[]) ?? [];
    if (waypoints.length < 2) return;

    const pathStyle = (obj.data.pathStyle as PathStyle) ?? 'road';
    const width = (obj.data.pathWidth as number) ?? 3;
    const color = (obj.data.pathColor as string) ?? '#8B6914';

    const skPath = this.buildStrokePath(ck, waypoints);
    const paint = new ck.Paint();
    try {
      paint.setAntiAlias(true);
      paint.setStyle(ck.PaintStyle.Stroke);
      paint.setStrokeCap(ck.StrokeCap.Round);
      paint.setStrokeJoin(ck.StrokeJoin.Round);

      if (pathStyle === 'road') {
        // Double-line: wider dark line, then parchment gap, then thin dark line
        const [r, g, b] = this.parseHexColor(color);
        paint.setColor(ck.Color(r, g, b, 255));
        paint.setStrokeWidth(width + 4);
        canvas.drawPath(skPath, paint);
        const [pr, pg, pb] = this.parseHexColor('#f4e4c1');
        paint.setColor(ck.Color(pr, pg, pb, 255));
        paint.setStrokeWidth(width);
        canvas.drawPath(skPath, paint);
      } else if (pathStyle === 'border') {
        const [r, g, b] = this.parseHexColor(color);
        paint.setColor(ck.Color(r, g, b, 255));
        paint.setStrokeWidth(width);
        const dashEffect = ck.PathEffect.MakeDash([8, 4], 0);
        paint.setPathEffect(dashEffect);
        canvas.drawPath(skPath, paint);
        paint.setPathEffect(null);
        dashEffect.delete();
      } else if (pathStyle === 'mountain_pass') {
        const [r, g, b] = this.parseHexColor(color);
        paint.setColor(ck.Color(r, g, b, 255));
        paint.setStrokeWidth(width);
        const dashEffect = ck.PathEffect.MakeDash([2, 4], 0);
        paint.setPathEffect(dashEffect);
        canvas.drawPath(skPath, paint);
        paint.setPathEffect(null);
        dashEffect.delete();
      } else {
        // river + default
        const [r, g, b] = this.parseHexColor(color);
        paint.setColor(ck.Color(r, g, b, 255));
        paint.setStrokeWidth(width);
        if (pathStyle === 'river') {
          const blur = ck.MaskFilter.MakeBlur(ck.BlurStyle.Normal, 1.5, true);
          paint.setMaskFilter(blur);
          blur.delete();
        }
        canvas.drawPath(skPath, paint);
        paint.setMaskFilter(null);
      }
    } finally {
      paint.delete();
      skPath.delete();
    }
  }

  /**
   * Draw in-progress path preview with ghost segment and waypoint dots.
   */
  private renderPathPreview(canvas: any, ck: any, preview: PathPreview): void {
    const { waypoints, mouseX, mouseY } = preview;
    if (waypoints.length === 0) return;

    // Draw ghost spline through placed waypoints + cursor position
    const ghostPts = [...waypoints, { x: mouseX, y: mouseY }];
    if (ghostPts.length >= 2) {
      const ghostPath = this.buildStrokePath(ck, ghostPts);
      const paint = new ck.Paint();
      try {
        paint.setAntiAlias(true);
        paint.setStyle(ck.PaintStyle.Stroke);
        paint.setStrokeWidth(2);
        paint.setStrokeCap(ck.StrokeCap.Round);
        paint.setColor(ck.Color(100, 100, 100, 255));
        paint.setAlphaf(0.5);
        const dashEffect = ck.PathEffect.MakeDash([6, 4], 0);
        paint.setPathEffect(dashEffect);
        canvas.drawPath(ghostPath, paint);
        paint.setPathEffect(null);
        dashEffect.delete();
      } finally {
        paint.delete();
        ghostPath.delete();
      }
    }

    // Draw circles at each placed waypoint
    const dotPaint = new ck.Paint();
    try {
      dotPaint.setAntiAlias(true);
      dotPaint.setStyle(ck.PaintStyle.Fill);
      dotPaint.setColor(ck.Color(80, 80, 80, 255));
      dotPaint.setAlphaf(0.8);
      for (const wp of waypoints) {
        canvas.drawCircle(wp.x, wp.y, 4, dotPaint);
      }
    } finally {
      dotPaint.delete();
    }
  }

  /**
   * Main render call. Draws all visible map layers with their objects.
   *
   * @param layers         Current layer stack
   * @param selectedObjectId  ID of the currently selected object (for gold outline)
   * @param lightAngle     Global light direction in radians (0 = east, π/2 = south)
   * @param previewStroke  In-progress brush stroke to render as overlay
   */
  render(layers: Layer[], selectedObjectId?: string, lightAngle = 0, previewStroke: PreviewStroke | null = null, pathPreview: PathPreview | null = null): void {
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
        } else if (obj.type === 'brush_stroke') {
          this.renderBrushStroke(canvas, obj, ck);
        } else if (obj.type === 'path') {
          this.renderPathObject(canvas, obj, ck);
        } else {
          // Stamps, regions: composite via stampLayers[]
          this.renderStampObject(canvas, obj, ck, objAlpha, lightAngle, isSelected);
        }

        canvas.restore();
      }
    }

    // Render in-progress brush stroke preview (absolute world coords, drawn before restore)
    if (previewStroke && previewStroke.points.length > 0) {
      const prevPath = this.buildStrokePath(ck, previewStroke.points);
      this.drawBrushPath(
        canvas,
        ck,
        prevPath,
        previewStroke.color,
        previewStroke.size,
        previewStroke.opacity,
        previewStroke.hardness,
      );
    }

    // Render in-progress path preview
    if (pathPreview) {
      this.renderPathPreview(canvas, ck, pathPreview);
    }

    canvas.restore();
    this.surface.flush();
  }

  /**
   * Export the current map view to a PNG at the given resolution.
   * Renders all visible layers off-screen using the current viewport camera.
   * Returns PNG bytes as Uint8Array, or null if CanvasKit is not ready.
   *
   * @param width   Output width in pixels (e.g. 2048)
   * @param height  Output height in pixels (e.g. 2048)
   * @param layers  Current layer stack
   * @param lightAngle  Global light direction in radians
   */
  async exportToPNG(
    width: number,
    height: number,
    layers: Layer[],
    lightAngle = 0,
  ): Promise<Uint8Array | null> {
    if (!this.ck || !this.surface) return null;

    // For large exports (> 4096), use tiled rendering to avoid OOM
    if (width > 4096 || height > 4096) {
      return this.exportToPNGTiled(width, height, layers, lightAngle);
    }

    const ck = this.ck;

    // Create an off-screen CPU surface at export resolution
    const exportSurface = ck.MakeSurface(width, height);
    if (!exportSurface) return null;

    try {
      const canvas = exportSurface.getCanvas();

      // Clear with parchment background
      canvas.clear(ck.Color4f(0.95, 0.93, 0.9, 1.0));

      // Scale viewport to fit the export canvas
      // We render the same world-space content the user sees, scaled to fill the export
      const liveW = this.surface.width();
      const liveH = this.surface.height();
      const scaleX = width / (liveW || 1);
      const scaleY = height / (liveH || 1);
      const exportScale = Math.min(scaleX, scaleY);

      canvas.save();
      const { x: px, y: py } = this.viewport.getPan();
      const zoom = this.viewport.getZoom();
      canvas.translate(px * exportScale, py * exportScale);
      canvas.scale(zoom * exportScale, zoom * exportScale);

      // Tile parchment background texture
      if (this.bgImage && this.bgImageWidth > 0 && this.bgImageHeight > 0) {
        const tw = this.bgImageWidth;
        const th = this.bgImageHeight;
        const worldLeft   = -px / zoom;
        const worldTop    = -py / zoom;
        const worldRight  = (width / exportScale - px) / zoom;
        const worldBottom = (height / exportScale - py) / zoom;
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

      // Render layers (no selection highlight in export)
      const sorted = [...layers].sort((a, b) => a.zIndex - b.zIndex);
      for (const layer of sorted) {
        if (!layer.visible) continue;
        const [, , , la] = LAYER_COLORS[layer.type] ?? LAYER_COLORS.custom;
        const layerAlpha = (la / 255) * layer.opacity;

        for (const obj of layer.objects) {
          canvas.save();
          canvas.translate(obj.x, obj.y);
          if (obj.rotation !== 0) canvas.rotate(obj.rotation, obj.width / 2, obj.height / 2);
          if (obj.scale !== 1) canvas.scale(obj.scale, obj.scale);

          const objAlpha = layerAlpha * obj.opacity;

          if (obj.type === 'brush_stroke') {
            this.renderBrushStroke(canvas, obj, ck);
          } else if (obj.type === 'path') {
            this.renderPathObject(canvas, obj, ck);
          } else if (obj.type !== 'text') {
            this.renderStampObject(canvas, obj, ck, objAlpha, lightAngle, false);
          }
          canvas.restore();
        }
      }

      canvas.restore();
      exportSurface.flush();

      // Encode to PNG
      const snapshot = exportSurface.makeImageSnapshot();
      if (!snapshot) return null;
      const pngBytes = snapshot.encodeToBytes();
      snapshot.delete();
      return pngBytes;
    } finally {
      exportSurface.delete();
    }
  }

  /**
   * Tiled export for large resolutions (> 4096px).
   * Renders 4 quadrants at half-resolution each using CanvasKit CPU surfaces,
   * then stitches them onto a Canvas2D element and returns the combined PNG.
   */
  private async exportToPNGTiled(
    width: number,
    height: number,
    layers: Layer[],
    lightAngle: number,
  ): Promise<Uint8Array | null> {
    const ck = this.ck!;
    const tileW = Math.ceil(width / 2);
    const tileH = Math.ceil(height / 2);

    // Create a full-size Canvas2D to stitch tiles onto
    const stitchCanvas = document.createElement('canvas');
    stitchCanvas.width = width;
    stitchCanvas.height = height;
    const ctx = stitchCanvas.getContext('2d');
    if (!ctx) return null;

    const liveW = this.surface!.width();
    const liveH = this.surface!.height();
    const { x: px, y: py } = this.viewport.getPan();
    const zoom = this.viewport.getZoom();

    // Quadrants: [offsetX, offsetY]
    const quadrants: [number, number][] = [
      [0, 0],
      [tileW, 0],
      [0, tileH],
      [tileW, tileH],
    ];

    for (const [ox, oy] of quadrants) {
      const tileSurface = ck.MakeSurface(tileW, tileH);
      if (!tileSurface) return null;

      try {
        const tileCanvas = tileSurface.getCanvas();
        tileCanvas.clear(ck.Color4f(0.95, 0.93, 0.9, 1.0));

        const scaleX = width / (liveW || 1);
        const scaleY = height / (liveH || 1);
        const exportScale = Math.min(scaleX, scaleY);

        tileCanvas.save();
        // Shift by -ox, -oy so we render the correct quadrant
        tileCanvas.translate(-ox, -oy);
        tileCanvas.translate(px * exportScale, py * exportScale);
        tileCanvas.scale(zoom * exportScale, zoom * exportScale);

        // Tile parchment background texture
        if (this.bgImage && this.bgImageWidth > 0 && this.bgImageHeight > 0) {
          const tw = this.bgImageWidth;
          const th = this.bgImageHeight;
          const worldLeft = -px / zoom;
          const worldTop = -py / zoom;
          const worldRight = (width / exportScale - px) / zoom;
          const worldBottom = (height / exportScale - py) / zoom;
          const startX = Math.floor(worldLeft / tw) * tw;
          const startY = Math.floor(worldTop / th) * th;
          const bgPaint = new ck.Paint();
          try {
            for (let ty = startY; ty < worldBottom; ty += th) {
              for (let tx = startX; tx < worldRight; tx += tw) {
                tileCanvas.drawImage(this.bgImage, tx, ty, bgPaint);
              }
            }
          } finally {
            bgPaint.delete();
          }
        }

        // Render layers
        const sorted = [...layers].sort((a, b) => a.zIndex - b.zIndex);
        for (const layer of sorted) {
          if (!layer.visible) continue;
          const [, , , la] = LAYER_COLORS[layer.type] ?? LAYER_COLORS.custom;
          const layerAlpha = (la / 255) * layer.opacity;

          for (const obj of layer.objects) {
            tileCanvas.save();
            tileCanvas.translate(obj.x, obj.y);
            if (obj.rotation !== 0) tileCanvas.rotate(obj.rotation, obj.width / 2, obj.height / 2);
            if (obj.scale !== 1) tileCanvas.scale(obj.scale, obj.scale);

            const objAlpha = layerAlpha * obj.opacity;

            if (obj.type === 'brush_stroke') {
              this.renderBrushStroke(tileCanvas, obj, ck);
            } else if (obj.type === 'path') {
              this.renderPathObject(tileCanvas, obj, ck);
            } else if (obj.type !== 'text') {
              this.renderStampObject(tileCanvas, obj, ck, objAlpha, lightAngle, false);
            }
            tileCanvas.restore();
          }
        }

        tileCanvas.restore();
        tileSurface.flush();

        // Encode tile to PNG, draw onto the stitch canvas
        const snapshot = tileSurface.makeImageSnapshot();
        if (!snapshot) return null;
        const tileBytes = snapshot.encodeToBytes();
        snapshot.delete();

        if (tileBytes) {
          const blob = new Blob([tileBytes], { type: 'image/png' });
          const bmp = await createImageBitmap(blob);
          ctx.drawImage(bmp, ox, oy);
          bmp.close();
        }
      } finally {
        tileSurface.delete();
      }
    }

    // Convert stitched canvas to PNG bytes
    return new Promise<Uint8Array | null>((resolve) => {
      stitchCanvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        blob.arrayBuffer().then((buf) => {
          resolve(new Uint8Array(buf));
        });
      }, 'image/png');
    });
  }

  destroy(): void {
    this.stopRenderLoop();
    for (const img of this.imageCache.values()) {
      img.delete();
    }
    this.imageCache.clear();
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
