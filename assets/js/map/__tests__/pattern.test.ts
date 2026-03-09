import { describe, it, expect, beforeEach } from 'vitest';
import { CommandHistory, AddObjectCommand, BatchCommand } from '../commands';
import { LayerManager } from '../layers';
import type { MapObject } from '../types';

describe('Pattern Stamp', () => {
  let layers: LayerManager;

  beforeEach(() => {
    layers = new LayerManager();
  });

  function placePatternStamp(worldX: number, worldY: number): AddObjectCommand {
    const jitter = () => (Math.random() - 0.5) * 40;
    const rotation = Math.random() * Math.PI * 2;
    const scale = 0.85 + Math.random() * 0.30;

    const obj: Omit<MapObject, 'id'> = {
      type: 'stamp',
      x: worldX + jitter(),
      y: worldY + jitter(),
      width: 80,
      height: 80,
      rotation,
      scale,
      opacity: 1,
      stampLayers: [{
        id: `base-${Date.now()}`,
        type: 'base',
        blendMode: 'normal',
        opacity: 1,
        visible: true,
        frames: [],
        fps: 0,
      }],
      data: { assetName: 'Tree', assetCategory: 'vegetation', isPatternStamp: true },
    };

    const cmd = new AddObjectCommand(layers, 'features', obj);
    cmd.execute();
    return cmd;
  }

  it('produces rotation in [0, 2π]', () => {
    for (let i = 0; i < 50; i++) {
      const cmd = placePatternStamp(100, 100);
      const obj = layers.getLayer('features')!.objects[layers.getLayer('features')!.objects.length - 1];
      expect(obj.rotation).toBeGreaterThanOrEqual(0);
      expect(obj.rotation).toBeLessThan(Math.PI * 2);
    }
  });

  it('produces scale in [0.85, 1.15]', () => {
    for (let i = 0; i < 50; i++) {
      const cmd = placePatternStamp(100, 100);
      const obj = layers.getLayer('features')!.objects[layers.getLayer('features')!.objects.length - 1];
      expect(obj.scale).toBeGreaterThanOrEqual(0.85);
      expect(obj.scale).toBeLessThanOrEqual(1.15);
    }
  });

  it('stamps have isPatternStamp: true in data', () => {
    placePatternStamp(50, 50);
    const obj = layers.getLayer('features')!.objects[0];
    expect(obj.data.isPatternStamp).toBe(true);
  });

  it('batch undo removes all stamps from a stroke', () => {
    const cmds: AddObjectCommand[] = [];
    for (let i = 0; i < 5; i++) {
      cmds.push(placePatternStamp(i * 48, 100));
    }
    expect(layers.getLayer('features')!.objects).toHaveLength(5);

    const batch = new BatchCommand(cmds);
    const history = new CommandHistory();
    history.record(batch);

    history.undo();
    expect(layers.getLayer('features')!.objects).toHaveLength(0);
  });

  it('batch redo re-adds all stamps', () => {
    const cmds: AddObjectCommand[] = [];
    for (let i = 0; i < 3; i++) {
      cmds.push(placePatternStamp(i * 48, 100));
    }

    const batch = new BatchCommand(cmds);
    const history = new CommandHistory();
    history.record(batch);

    history.undo();
    expect(layers.getLayer('features')!.objects).toHaveLength(0);

    history.redo();
    expect(layers.getLayer('features')!.objects).toHaveLength(3);
  });
});
