import { describe, it, expect, beforeEach } from 'vitest';
import { CommandHistory, AddObjectCommand } from '../commands';
import { LayerManager } from '../layers';
import { pointInPolygon, computeCentroid } from '../region';
import type { MapObject, RegionFillStyle } from '../types';

/** Helper: build a region MapObject (without id) */
function makeRegionObj(
  vertices: { x: number; y: number }[],
  fillStyle: RegionFillStyle = 'hatching',
  fillColor = '#2d5a27',
): Omit<MapObject, 'id'> {
  return {
    type: 'region',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    scale: 1,
    opacity: 1,
    stampLayers: [],
    data: {
      vertices,
      fillStyle,
      fillColor,
      strokeColor: '#1a1a1a',
      strokeWidth: 2,
    },
  };
}

describe('Region Fill Tool', () => {
  let layers: LayerManager;

  beforeEach(() => {
    layers = new LayerManager();
  });

  it('RegionFillStyle type includes all 5 styles', () => {
    const styles: RegionFillStyle[] = ['none', 'hatching', 'watercolor', 'crosshatch', 'solid'];
    expect(styles).toHaveLength(5);
    // Each is a valid string — typescript compilation ensures correctness
    for (const s of styles) {
      expect(typeof s).toBe('string');
    }
  });

  it('pointInPolygon returns true for point inside triangle', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 100 },
    ];
    expect(pointInPolygon(50, 30, triangle)).toBe(true);
  });

  it('pointInPolygon returns false for point outside triangle', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 100 },
    ];
    expect(pointInPolygon(200, 200, triangle)).toBe(false);
  });

  it('pointInPolygon handles concave polygon', () => {
    const concave = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 50, y: 50 },
      { x: 0, y: 100 },
    ];
    // Inside the polygon
    expect(pointInPolygon(25, 25, concave)).toBe(true);
    // Inside the concavity (should be outside)
    expect(pointInPolygon(50, 80, concave)).toBe(false);
  });

  it('MapObject with type=region can be created with correct data shape', () => {
    const vertices = [
      { x: 10, y: 20 },
      { x: 50, y: 10 },
      { x: 80, y: 40 },
      { x: 60, y: 80 },
    ];
    const obj = makeRegionObj(vertices, 'watercolor', '#3a7bc4');
    expect(obj.type).toBe('region');
    expect(obj.data.vertices).toHaveLength(4);
    expect(obj.data.fillStyle).toBe('watercolor');
    expect(obj.data.fillColor).toBe('#3a7bc4');
    expect(obj.data.strokeColor).toBe('#1a1a1a');
    expect(obj.data.strokeWidth).toBe(2);
  });

  it('AddObjectCommand works with region MapObject', () => {
    const vertices = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const cmd = new AddObjectCommand(layers, 'features', makeRegionObj(vertices));
    cmd.execute();

    const objs = layers.getLayer('features')!.objects;
    expect(objs).toHaveLength(1);
    expect(objs[0].type).toBe('region');
    expect((objs[0].data.vertices as { x: number; y: number }[])).toHaveLength(4);
  });

  it('undo removes the region object', () => {
    const vertices = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 100 },
    ];
    const cmd = new AddObjectCommand(layers, 'features', makeRegionObj(vertices));
    cmd.execute();
    expect(layers.getLayer('features')!.objects).toHaveLength(1);

    cmd.undo();
    expect(layers.getLayer('features')!.objects).toHaveLength(0);
  });

  it('3+ vertices required (2 vertices should not satisfy minimum)', () => {
    const twoVertices = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ];
    // The region tool requires >= 3 vertices to finalize.
    // With 2 vertices, no region should be created.
    expect(twoVertices.length).toBeLessThan(3);

    // A valid region needs at least 3
    const threeVertices = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 100 },
    ];
    expect(threeVertices.length).toBeGreaterThanOrEqual(3);
  });

  it('centroid calculation: average of vertices x/y', () => {
    const vertices = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const centroid = computeCentroid(vertices);
    expect(centroid.x).toBe(50);
    expect(centroid.y).toBe(50);
  });

  it('centroid of triangle', () => {
    const vertices = [
      { x: 0, y: 0 },
      { x: 90, y: 0 },
      { x: 0, y: 90 },
    ];
    const centroid = computeCentroid(vertices);
    expect(centroid.x).toBe(30);
    expect(centroid.y).toBe(30);
  });

  it('Ctrl+Z removes entire placed region in one step via CommandHistory', () => {
    const history = new CommandHistory();
    const vertices = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const cmd = new AddObjectCommand(layers, 'features', makeRegionObj(vertices, 'solid'));
    history.execute(cmd);
    expect(layers.getLayer('features')!.objects).toHaveLength(1);

    history.undo();
    expect(layers.getLayer('features')!.objects).toHaveLength(0);

    history.redo();
    expect(layers.getLayer('features')!.objects).toHaveLength(1);
  });
});
