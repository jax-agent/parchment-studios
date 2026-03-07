import type { Layer, MapObject } from './types';

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

// Color palette for placeholder rendering (one per layer type)
const LAYER_COLORS: Record<string, [number, number, number, number]> = {
  terrain: [34, 139, 34, 255],     // forest green
  water: [65, 105, 225, 255],      // royal blue
  features: [139, 69, 19, 255],    // saddle brown
  labels: [50, 50, 50, 255],       // dark gray
  effects: [128, 0, 128, 128],     // purple, semi-transparent
  custom: [100, 100, 100, 255],    // gray
};

export class MapRenderer {
  private ck: any | null = null;
  private surface: any | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private viewport = new Viewport();
  private dirty = true;
  private rafId: number | null = null;
  private font: any | null = null;

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
  }

  requestRedraw(): void {
    this.dirty = true;
  }

  startRenderLoop(getLayersFn: () => Layer[]): void {
    const frame = () => {
      if (this.dirty) {
        this.render(getLayersFn());
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

  render(layers: Layer[]): void {
    if (!this.ck || !this.surface) return;
    const canvas = this.surface.getCanvas();
    const ck = this.ck;

    canvas.clear(ck.Color4f(0.95, 0.93, 0.9, 1.0)); // parchment background

    canvas.save();
    // Apply viewport transform
    const { x: px, y: py } = this.viewport.getPan();
    const zoom = this.viewport.getZoom();
    canvas.translate(px, py);
    canvas.scale(zoom, zoom);

    // Render each visible layer sorted by zIndex
    const sorted = [...layers].sort((a, b) => a.zIndex - b.zIndex);
    for (const layer of sorted) {
      if (!layer.visible) continue;

      const paint = new ck.Paint();
      try {
        paint.setAntiAlias(true);

        const [r, g, b, a] = LAYER_COLORS[layer.type] ?? LAYER_COLORS.custom;
        const layerAlpha = (a / 255) * layer.opacity;

        for (const obj of layer.objects) {
          canvas.save();
          canvas.translate(obj.x, obj.y);

          if (obj.rotation !== 0) {
            canvas.rotate(obj.rotation, obj.width / 2, obj.height / 2);
          }
          if (obj.scale !== 1) {
            canvas.scale(obj.scale, obj.scale);
          }

          paint.setAlphaf(layerAlpha * obj.opacity);

          if (obj.type === 'text') {
            paint.setColor(ck.Color(r, g, b, 255));
            paint.setStyle(ck.PaintStyle.Fill);
            const text = (obj.data?.text as string) ?? 'Label';
            if (this.font) {
              canvas.drawText(text, 0, obj.height / 2, paint, this.font);
            }
          } else {
            // Stamps, paths, regions: render as colored rectangles (placeholder)
            paint.setColor(ck.Color(r, g, b, 255));
            paint.setStyle(ck.PaintStyle.Fill);
            const rect = ck.LTRBRect(0, 0, obj.width, obj.height);
            canvas.drawRect(rect, paint);

            // Outline
            paint.setStyle(ck.PaintStyle.Stroke);
            paint.setStrokeWidth(1);
            paint.setColor(ck.Color(0, 0, 0, 255));
            paint.setAlphaf(0.3 * layerAlpha * obj.opacity);
            canvas.drawRect(rect, paint);
          }

          canvas.restore();
        }
      } finally {
        paint.delete();
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
