import { describe, it, expect, beforeEach } from 'vitest';
import { LayerManager, createDefaultLayers } from '../layers';

describe('LayerManager', () => {
  let mgr: LayerManager;

  beforeEach(() => {
    mgr = new LayerManager();
  });

  describe('default layers', () => {
    it('initializes with 5 default layers', () => {
      expect(mgr.getLayers()).toHaveLength(5);
    });

    it('layers are sorted by zIndex (terrain=0 at bottom, effects=4 at top)', () => {
      const layers = mgr.getLayers();
      expect(layers[0].id).toBe('terrain');
      expect(layers[4].id).toBe('effects');
      for (let i = 1; i < layers.length; i++) {
        expect(layers[i].zIndex).toBeGreaterThan(layers[i - 1].zIndex);
      }
    });

    it('all default layers are visible, unlocked, opacity 1', () => {
      for (const layer of mgr.getLayers()) {
        expect(layer.visible).toBe(true);
        expect(layer.locked).toBe(false);
        expect(layer.opacity).toBe(1.0);
      }
    });
  });

  describe('addLayer', () => {
    it('adds a layer with auto-assigned zIndex', () => {
      const layer = mgr.addLayer({
        id: 'custom-1', name: 'Custom', type: 'custom',
        visible: true, locked: false, opacity: 1, objects: [],
      });
      expect(layer.zIndex).toBe(5); // after the 5 defaults (0-4)
      expect(mgr.getLayers()).toHaveLength(6);
    });
  });

  describe('removeLayer', () => {
    it('returns removed layer', () => {
      const removed = mgr.removeLayer('effects');
      expect(removed).toBeDefined();
      expect(removed!.id).toBe('effects');
      expect(mgr.getLayers()).toHaveLength(4);
    });

    it('returns undefined for non-existent layer', () => {
      expect(mgr.removeLayer('nope')).toBeUndefined();
    });
  });

  describe('getLayer', () => {
    it('returns layer by id', () => {
      const layer = mgr.getLayer('terrain');
      expect(layer).toBeDefined();
      expect(layer!.name).toBe('Terrain');
    });

    it('returns undefined for non-existent id', () => {
      expect(mgr.getLayer('nope')).toBeUndefined();
    });
  });

  describe('object CRUD', () => {
    it('addObject auto-generates id', () => {
      const obj = mgr.addObject('features', {
        type: 'stamp', x: 10, y: 20, width: 50, height: 50,
        rotation: 0, scale: 1, opacity: 1, data: {},
      });
      expect(obj.id).toBeDefined();
      expect(obj.id.length).toBeGreaterThan(0);
    });

    it('removeObject returns removed object', () => {
      const added = mgr.addObject('features', {
        type: 'stamp', x: 0, y: 0, width: 10, height: 10,
        rotation: 0, scale: 1, opacity: 1, data: {},
      });
      const removed = mgr.removeObject('features', added.id);
      expect(removed).toBeDefined();
      expect(removed!.id).toBe(added.id);
      expect(mgr.getLayer('features')!.objects).toHaveLength(0);
    });

    it('removeObject returns undefined for non-existent object', () => {
      expect(mgr.removeObject('features', 'nope')).toBeUndefined();
    });

    it('moveObject updates x and y', () => {
      const obj = mgr.addObject('features', {
        type: 'stamp', x: 0, y: 0, width: 10, height: 10,
        rotation: 0, scale: 1, opacity: 1, data: {},
      });
      mgr.moveObject('features', obj.id, 100, 200);
      const updated = mgr.getLayer('features')!.objects[0];
      expect(updated.x).toBe(100);
      expect(updated.y).toBe(200);
    });

    it('updateObject applies partial updates', () => {
      const obj = mgr.addObject('features', {
        type: 'stamp', x: 0, y: 0, width: 10, height: 10,
        rotation: 0, scale: 1, opacity: 1, data: {},
      });
      mgr.updateObject('features', obj.id, { rotation: 45, scale: 2 });
      const updated = mgr.getLayer('features')!.objects[0];
      expect(updated.rotation).toBe(45);
      expect(updated.scale).toBe(2);
      expect(updated.x).toBe(0); // unchanged
    });
  });

  describe('layer ordering', () => {
    it('moveLayerUp swaps with layer above', () => {
      const beforeFeatures = mgr.getLayer('features')!.zIndex;
      const beforeLabels = mgr.getLayer('labels')!.zIndex;
      mgr.moveLayerUp('features');
      expect(mgr.getLayer('features')!.zIndex).toBe(beforeLabels);
      expect(mgr.getLayer('labels')!.zIndex).toBe(beforeFeatures);
    });

    it('moveLayerDown swaps with layer below', () => {
      const beforeFeatures = mgr.getLayer('features')!.zIndex;
      const beforeWater = mgr.getLayer('water')!.zIndex;
      mgr.moveLayerDown('features');
      expect(mgr.getLayer('features')!.zIndex).toBe(beforeWater);
      expect(mgr.getLayer('water')!.zIndex).toBe(beforeFeatures);
    });

    it('moveLayerUp on topmost layer is a no-op', () => {
      const before = mgr.getLayer('effects')!.zIndex;
      mgr.moveLayerUp('effects');
      expect(mgr.getLayer('effects')!.zIndex).toBe(before);
    });

    it('moveLayerDown on bottommost layer is a no-op', () => {
      const before = mgr.getLayer('terrain')!.zIndex;
      mgr.moveLayerDown('terrain');
      expect(mgr.getLayer('terrain')!.zIndex).toBe(before);
    });

    it('reorderLayer sets a specific zIndex', () => {
      mgr.reorderLayer('terrain', 10);
      expect(mgr.getLayer('terrain')!.zIndex).toBe(10);
    });
  });

  describe('visibility / locking / opacity', () => {
    it('setVisible updates visibility', () => {
      mgr.setVisible('terrain', false);
      expect(mgr.getLayer('terrain')!.visible).toBe(false);
    });

    it('setLocked updates locked state', () => {
      mgr.setLocked('terrain', true);
      expect(mgr.getLayer('terrain')!.locked).toBe(true);
    });

    it('setOpacity updates opacity', () => {
      mgr.setOpacity('terrain', 0.5);
      expect(mgr.getLayer('terrain')!.opacity).toBe(0.5);
    });
  });

  describe('serialization', () => {
    it('toJSON/fromJSON roundtrip preserves state', () => {
      mgr.addObject('features', {
        type: 'stamp', x: 42, y: 99, width: 10, height: 10,
        rotation: 15, scale: 1.5, opacity: 0.8, assetId: 'castle-01', data: { color: 'red' },
      });
      mgr.setVisible('terrain', false);
      mgr.setOpacity('water', 0.7);

      const json = mgr.toJSON();
      const restored = new LayerManager();
      restored.fromJSON(json);

      expect(restored.getLayers()).toHaveLength(5);
      expect(restored.getLayer('terrain')!.visible).toBe(false);
      expect(restored.getLayer('water')!.opacity).toBe(0.7);

      const featuresObjs = restored.getLayer('features')!.objects;
      expect(featuresObjs).toHaveLength(1);
      expect(featuresObjs[0].x).toBe(42);
      expect(featuresObjs[0].assetId).toBe('castle-01');
      expect(featuresObjs[0].data).toEqual({ color: 'red' });
    });
  });
});

describe('createDefaultLayers', () => {
  it('returns 5 layers in correct order', () => {
    const layers = createDefaultLayers();
    expect(layers).toHaveLength(5);
    expect(layers.map(l => l.id)).toEqual(['terrain', 'water', 'features', 'labels', 'effects']);
  });
});
