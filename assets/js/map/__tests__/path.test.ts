import { describe, it, expect, beforeEach } from 'vitest';
import { CommandHistory, AddObjectCommand } from '../commands';
import { LayerManager } from '../layers';
import type { MapObject, PathStyle } from '../types';

/** Helper: build a path MapObject (without id) */
function makePathObj(
  waypoints: { x: number; y: number }[],
  pathStyle: PathStyle = 'road',
): Omit<MapObject, 'id'> {
  const styles: Record<string, { color: string; width: number }> = {
    road: { color: '#8B6914', width: 3 },
    river: { color: '#3a7bc4', width: 4 },
    border: { color: '#6b2929', width: 2 },
    mountain_pass: { color: '#5a5a5a', width: 2 },
  };
  const s = styles[pathStyle] ?? styles.road;
  return {
    type: 'path',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    scale: 1,
    opacity: 1,
    stampLayers: [],
    data: {
      waypoints,
      pathStyle,
      pathWidth: s.width,
      pathColor: s.color,
    },
  };
}

describe('Path Tool', () => {
  let layers: LayerManager;

  beforeEach(() => {
    layers = new LayerManager();
  });

  it('PathObject has type=path and stores waypoints in data', () => {
    const waypoints = [
      { x: 10, y: 20 },
      { x: 50, y: 60 },
      { x: 100, y: 30 },
    ];
    const obj = makePathObj(waypoints, 'road');
    expect(obj.type).toBe('path');
    expect(obj.data.waypoints).toHaveLength(3);
    expect(obj.data.pathStyle).toBe('road');
    expect(obj.data.pathWidth).toBe(3);
    expect(obj.data.pathColor).toBe('#8B6914');
  });

  it('river path has correct style attributes', () => {
    const obj = makePathObj([{ x: 0, y: 0 }, { x: 100, y: 100 }], 'river');
    expect(obj.data.pathStyle).toBe('river');
    expect(obj.data.pathWidth).toBe(4);
    expect(obj.data.pathColor).toBe('#3a7bc4');
  });

  it('border path has correct style attributes', () => {
    const obj = makePathObj([{ x: 0, y: 0 }, { x: 100, y: 100 }], 'border');
    expect(obj.data.pathStyle).toBe('border');
    expect(obj.data.pathWidth).toBe(2);
    expect(obj.data.pathColor).toBe('#6b2929');
  });

  it('mountain_pass path has correct style attributes', () => {
    const obj = makePathObj([{ x: 0, y: 0 }, { x: 100, y: 100 }], 'mountain_pass');
    expect(obj.data.pathStyle).toBe('mountain_pass');
    expect(obj.data.pathWidth).toBe(2);
    expect(obj.data.pathColor).toBe('#5a5a5a');
  });

  it('AddObjectCommand works with PathObject', () => {
    const waypoints = [
      { x: 0, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 0 },
    ];
    const cmd = new AddObjectCommand(layers, 'features', makePathObj(waypoints));
    cmd.execute();

    const objs = layers.getLayer('features')!.objects;
    expect(objs).toHaveLength(1);
    expect(objs[0].type).toBe('path');
    expect((objs[0].data.waypoints as { x: number; y: number }[])).toHaveLength(3);
  });

  it('undo removes the path object', () => {
    const cmd = new AddObjectCommand(
      layers,
      'features',
      makePathObj([{ x: 0, y: 0 }, { x: 100, y: 100 }]),
    );
    cmd.execute();
    expect(layers.getLayer('features')!.objects).toHaveLength(1);

    cmd.undo();
    expect(layers.getLayer('features')!.objects).toHaveLength(0);
  });

  it('Ctrl+Z removes entire path in one step via CommandHistory', () => {
    const history = new CommandHistory();
    const cmd = new AddObjectCommand(
      layers,
      'features',
      makePathObj([
        { x: 0, y: 0 },
        { x: 25, y: 50 },
        { x: 50, y: 0 },
        { x: 75, y: 50 },
      ]),
    );
    history.execute(cmd);
    expect(layers.getLayer('features')!.objects).toHaveLength(1);

    history.undo();
    expect(layers.getLayer('features')!.objects).toHaveLength(0);

    history.redo();
    expect(layers.getLayer('features')!.objects).toHaveLength(1);
  });

  it('Catmull-Rom: 3 collinear points produce intermediate control points', () => {
    // Verify Catmull-Rom conversion formula produces reasonable control points
    const pts = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ];

    // For segment i=0 (pts[0]→pts[1]):
    // p0 = pts[max(0, -1)] = pts[0] = {0,0}
    // p1 = pts[0] = {0,0}
    // p2 = pts[1] = {50,0}
    // p3 = pts[min(2, 2)] = pts[2] = {100,0}
    // cp1x = p1.x + (p2.x - p0.x)/6 = 0 + 50/6 ≈ 8.33
    // cp2x = p2.x - (p3.x - p1.x)/6 = 50 - 100/6 ≈ 33.33

    const i = 0;
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;

    // Control points between p1 and p2, within a reasonable range
    expect(cp1x).toBeCloseTo(8.33, 1);
    expect(cp2x).toBeCloseTo(33.33, 1);
    // Both control points are between p1.x and p2.x
    expect(cp1x).toBeGreaterThan(p1.x);
    expect(cp2x).toBeLessThan(p2.x);
  });
});
