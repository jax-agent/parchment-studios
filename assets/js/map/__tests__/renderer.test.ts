import { describe, it, expect, beforeEach } from 'vitest';
import { Viewport, lightKeyedOffset } from '../renderer';
import type { Layer, MapObject } from '../types';

describe('Viewport', () => {
  let viewport: Viewport;

  beforeEach(() => {
    viewport = new Viewport();
  });

  describe('screenToWorld / worldToScreen', () => {
    it('identity transform at default state', () => {
      const world = viewport.screenToWorld(100, 200);
      expect(world.x).toBe(100);
      expect(world.y).toBe(200);
    });

    it('are inverse operations', () => {
      viewport.pan(50, -30);
      viewport.zoomTo(2.0, 0, 0);
      const screen = { x: 150, y: 75 };
      const world = viewport.screenToWorld(screen.x, screen.y);
      const back = viewport.worldToScreen(world.x, world.y);
      expect(back.x).toBeCloseTo(screen.x, 5);
      expect(back.y).toBeCloseTo(screen.y, 5);
    });

    it('pan offsets correctly', () => {
      viewport.pan(100, 50);
      const world = viewport.screenToWorld(100, 50);
      // screen (100,50) with pan (100,50) → world (0,0)
      expect(world.x).toBeCloseTo(0, 5);
      expect(world.y).toBeCloseTo(0, 5);
    });

    it('zoom scales correctly', () => {
      viewport.zoomTo(2.0, 0, 0);
      const world = viewport.screenToWorld(200, 100);
      expect(world.x).toBeCloseTo(100, 5);
      expect(world.y).toBeCloseTo(50, 5);
    });

    it('zoom toward point keeps that point fixed', () => {
      const cx = 300, cy = 200;
      const beforeWorld = viewport.screenToWorld(cx, cy);
      viewport.zoomTo(2.0, cx, cy);
      const afterWorld = viewport.screenToWorld(cx, cy);
      expect(afterWorld.x).toBeCloseTo(beforeWorld.x, 5);
      expect(afterWorld.y).toBeCloseTo(beforeWorld.y, 5);
    });
  });

  describe('resetView', () => {
    it('resets pan and zoom to defaults', () => {
      viewport.pan(100, 200);
      viewport.zoomTo(3.0, 0, 0);
      viewport.resetView();
      const world = viewport.screenToWorld(0, 0);
      expect(world.x).toBe(0);
      expect(world.y).toBe(0);
      expect(viewport.getZoom()).toBe(1.0);
    });
  });
});

describe('lightKeyedOffset', () => {
  it('shadow shifts opposite to light (east → shadow goes west)', () => {
    // lightAngle = 0 means light comes from the east
    const { dx, dy } = lightKeyedOffset('shadow', 0);
    // shadow should go west (negative x), near zero y
    expect(dx).toBeLessThan(0);
    expect(Math.abs(dy)).toBeLessThan(0.01);
  });

  it('shadow shifts opposite to light (south → shadow goes north)', () => {
    // lightAngle = π/2 means light comes from the south
    const { dx, dy } = lightKeyedOffset('shadow', Math.PI / 2);
    expect(dy).toBeLessThan(0);
    expect(Math.abs(dx)).toBeLessThan(0.01);
  });

  it('light shifts toward light direction (east → light shift goes east)', () => {
    const { dx, dy } = lightKeyedOffset('light', 0);
    expect(dx).toBeGreaterThan(0);
    expect(Math.abs(dy)).toBeLessThan(0.01);
  });

  it('non-light-keyed types have zero offset', () => {
    const { dx, dy } = lightKeyedOffset('base', Math.PI / 4);
    expect(dx).toBe(0);
    expect(dy).toBe(0);
  });

  it('shadow magnitude equals the dist param', () => {
    // At lightAngle=0, shadow dx should be -dist (exact opposite of east)
    const dist = 12;
    const { dx } = lightKeyedOffset('shadow', 0, dist);
    expect(dx).toBeCloseTo(-dist, 5);
  });

  it('different lightAngles produce different shadow offsets', () => {
    const { dx: dx1, dy: dy1 } = lightKeyedOffset('shadow', 0);
    const { dx: dx2, dy: dy2 } = lightKeyedOffset('shadow', Math.PI / 4);
    expect(dx1).not.toBeCloseTo(dx2, 2);
  });

  it('classic top-right light (−π/4) casts shadow toward bottom-left', () => {
    // lightAngle = -π/4 means light shines toward the upper-right
    // shadow falls opposite → lower-left (negative x, positive y in canvas coords)
    const { dx, dy } = lightKeyedOffset('shadow', -Math.PI / 4);
    expect(dx).toBeLessThan(0);
    expect(dy).toBeGreaterThan(0);
  });
});

describe('hitTest', () => {
  function makeObject(x: number, y: number, w: number, h: number): MapObject {
    return {
      id: `obj-${x}-${y}`,
      type: 'stamp', x, y, width: w, height: h,
      rotation: 0, scale: 1, opacity: 1, stampLayers: [], data: {},
    };
  }

  function makeLayer(id: string, objects: MapObject[], visible = true): Layer {
    return {
      id, name: id, type: 'features', visible, locked: false,
      opacity: 1, objects, zIndex: 0,
    };
  }

  it('finds object at coordinates', () => {
    const viewport = new Viewport();
    const obj = makeObject(10, 10, 50, 50);
    const layers = [makeLayer('l1', [obj])];
    const hit = viewport.hitTest(25, 25, layers);
    expect(hit).toBeDefined();
    expect(hit!.id).toBe(obj.id);
  });

  it('returns null when missing', () => {
    const viewport = new Viewport();
    const obj = makeObject(10, 10, 50, 50);
    const layers = [makeLayer('l1', [obj])];
    const hit = viewport.hitTest(200, 200, layers);
    expect(hit).toBeNull();
  });

  it('ignores hidden layers', () => {
    const viewport = new Viewport();
    const obj = makeObject(10, 10, 50, 50);
    const layers = [makeLayer('l1', [obj], false)];
    const hit = viewport.hitTest(25, 25, layers);
    expect(hit).toBeNull();
  });

  it('ignores layers with opacity 0 for hit testing only when not visible', () => {
    const viewport = new Viewport();
    const obj = makeObject(10, 10, 50, 50);
    // opacity=0 but visible=true — still hittable (opacity is visual only)
    const layers = [{ ...makeLayer('l1', [obj]), opacity: 0 }];
    const hit = viewport.hitTest(25, 25, layers);
    expect(hit).toBeDefined();
    expect(hit!.id).toBe(obj.id);
  });

  it('returns topmost object when overlapping', () => {
    const viewport = new Viewport();
    const bottom = makeObject(10, 10, 50, 50);
    const top = makeObject(20, 20, 50, 50);
    const layers = [
      { ...makeLayer('l1', [bottom]), zIndex: 0 },
      { ...makeLayer('l2', [top]), zIndex: 1 },
    ];
    const hit = viewport.hitTest(30, 30, layers);
    expect(hit).toBeDefined();
    expect(hit!.id).toBe(top.id);
  });
});

describe('fly-to viewport centering', () => {
  it('pan delta centers object in a 800x600 canvas', () => {
    const viewport = new Viewport();
    const canvasW = 800;
    const canvasH = 600;

    // Object at world coords (200, 150) with size 64x64
    const objCenterX = 200 + 32;
    const objCenterY = 150 + 32;

    const zoom = viewport.getZoom(); // 1.0
    const targetPanX = canvasW / 2 - objCenterX * zoom;
    const targetPanY = canvasH / 2 - objCenterY * zoom;

    viewport.pan(targetPanX, targetPanY);

    // Object center should now map to canvas center
    const screen = viewport.worldToScreen(objCenterX, objCenterY);
    expect(screen.x).toBeCloseTo(canvasW / 2, 5);
    expect(screen.y).toBeCloseTo(canvasH / 2, 5);
  });

  it('pan delta centers object when zoomed', () => {
    const viewport = new Viewport();
    const canvasW = 800;
    const canvasH = 600;

    viewport.zoomTo(2.0, 0, 0);
    // Apply some existing pan
    viewport.pan(50, -30);

    const objCenterX = 300 + 32;
    const objCenterY = 400 + 32;

    const zoom = viewport.getZoom();
    const startPan = viewport.getPan();
    const targetPanX = canvasW / 2 - objCenterX * zoom;
    const targetPanY = canvasH / 2 - objCenterY * zoom;

    // Apply the delta
    viewport.pan(targetPanX - startPan.x, targetPanY - startPan.y);

    const screen = viewport.worldToScreen(objCenterX, objCenterY);
    expect(screen.x).toBeCloseTo(canvasW / 2, 5);
    expect(screen.y).toBeCloseTo(canvasH / 2, 5);
  });

  it('incremental pan updates converge to target (simulating animation)', () => {
    const viewport = new Viewport();
    const canvasW = 800;
    const canvasH = 600;

    const objCenterX = 500;
    const objCenterY = 400;

    const zoom = viewport.getZoom();
    const startPan = viewport.getPan();
    const targetPanX = canvasW / 2 - objCenterX * zoom;
    const targetPanY = canvasH / 2 - objCenterY * zoom;

    // Simulate 10 animation frames with ease-out
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const ease = 1 - Math.pow(1 - t, 3);
      const currentPan = viewport.getPan();
      const nextX = startPan.x + (targetPanX - startPan.x) * ease;
      const nextY = startPan.y + (targetPanY - startPan.y) * ease;
      viewport.pan(nextX - currentPan.x, nextY - currentPan.y);
    }

    const screen = viewport.worldToScreen(objCenterX, objCenterY);
    expect(screen.x).toBeCloseTo(canvasW / 2, 3);
    expect(screen.y).toBeCloseTo(canvasH / 2, 3);
  });
});
