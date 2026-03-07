import { describe, it, expect, beforeEach } from 'vitest';
import { CommandHistory, AddObjectCommand, RemoveObjectCommand, MoveObjectCommand, SetLayerVisibilityCommand, SetLayerOpacityCommand, ReorderLayerCommand, AddLayerCommand, RemoveLayerCommand, AddStampCommand } from '../commands';
import { LayerManager } from '../layers';
import type { Command, MapObject, StampLayer } from '../types';

/** Helper: create a minimal base StampLayer for tests */
function makeStampLayer(id: string): StampLayer {
  return {
    id,
    type: 'base',
    blendMode: 'normal',
    opacity: 1,
    visible: true,
    frames: [],
    fps: 0,
  };
}

describe('CommandHistory', () => {
  let history: CommandHistory;
  let executeCount: number;
  let undoCount: number;

  function makeCommand(): Command {
    return {
      id: crypto.randomUUID(),
      type: 'test',
      execute() { executeCount++; },
      undo() { undoCount++; },
      toJSON() { return { type: 'test' }; },
    };
  }

  beforeEach(() => {
    history = new CommandHistory();
    executeCount = 0;
    undoCount = 0;
  });

  it('starts with empty stacks', () => {
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it('execute runs command and enables undo', () => {
    history.execute(makeCommand());
    expect(executeCount).toBe(1);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  it('undo reverses last command', () => {
    history.execute(makeCommand());
    history.undo();
    expect(undoCount).toBe(1);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);
  });

  it('redo re-executes undone command', () => {
    history.execute(makeCommand());
    history.undo();
    history.redo();
    expect(executeCount).toBe(2); // initial + redo
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  it('execute clears redo stack', () => {
    history.execute(makeCommand());
    history.undo();
    expect(history.canRedo()).toBe(true);
    history.execute(makeCommand());
    expect(history.canRedo()).toBe(false);
  });

  it('undo on empty stack is a no-op', () => {
    history.undo();
    expect(undoCount).toBe(0);
  });

  it('redo on empty stack is a no-op', () => {
    history.redo();
    expect(executeCount).toBe(0);
  });

  it('clear empties both stacks', () => {
    history.execute(makeCommand());
    history.execute(makeCommand());
    history.undo();
    history.clear();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it('handles multiple execute/undo/redo cycles', () => {
    const cmd1 = makeCommand();
    const cmd2 = makeCommand();
    history.execute(cmd1);
    history.execute(cmd2);
    expect(executeCount).toBe(2);
    history.undo();
    history.undo();
    expect(undoCount).toBe(2);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);
    history.redo();
    expect(executeCount).toBe(3);
  });
});

describe('Concrete Commands', () => {
  let layers: LayerManager;

  beforeEach(() => {
    layers = new LayerManager();
  });

  describe('AddObjectCommand', () => {
    it('adds an object to a layer and undoes it', () => {
      const obj: Omit<MapObject, 'id'> = {
        type: 'stamp', x: 10, y: 20, width: 50, height: 50,
        rotation: 0, scale: 1, opacity: 1, stampLayers: [], data: {},
      };
      const cmd = new AddObjectCommand(layers, 'features', obj);
      cmd.execute();

      const layer = layers.getLayer('features')!;
      expect(layer.objects).toHaveLength(1);
      expect(layer.objects[0].x).toBe(10);

      cmd.undo();
      expect(layers.getLayer('features')!.objects).toHaveLength(0);
    });
  });

  describe('RemoveObjectCommand', () => {
    it('removes an object and restores it on undo', () => {
      const added = layers.addObject('features', {
        type: 'stamp', x: 5, y: 5, width: 10, height: 10,
        rotation: 0, scale: 1, opacity: 1, stampLayers: [], data: {},
      });
      const cmd = new RemoveObjectCommand(layers, 'features', added.id);
      cmd.execute();
      expect(layers.getLayer('features')!.objects).toHaveLength(0);

      cmd.undo();
      expect(layers.getLayer('features')!.objects).toHaveLength(1);
      expect(layers.getLayer('features')!.objects[0].id).toBe(added.id);
    });
  });

  describe('MoveObjectCommand', () => {
    it('moves an object and undoes the move', () => {
      const added = layers.addObject('features', {
        type: 'stamp', x: 0, y: 0, width: 10, height: 10,
        rotation: 0, scale: 1, opacity: 1, stampLayers: [], data: {},
      });
      const cmd = new MoveObjectCommand(layers, 'features', added.id, 100, 200);
      cmd.execute();
      expect(layers.getLayer('features')!.objects[0].x).toBe(100);
      expect(layers.getLayer('features')!.objects[0].y).toBe(200);

      cmd.undo();
      expect(layers.getLayer('features')!.objects[0].x).toBe(0);
      expect(layers.getLayer('features')!.objects[0].y).toBe(0);
    });
  });

  describe('SetLayerVisibilityCommand', () => {
    it('toggles visibility and undoes it', () => {
      const cmd = new SetLayerVisibilityCommand(layers, 'features', false);
      cmd.execute();
      expect(layers.getLayer('features')!.visible).toBe(false);

      cmd.undo();
      expect(layers.getLayer('features')!.visible).toBe(true);
    });
  });

  describe('SetLayerOpacityCommand', () => {
    it('sets opacity and undoes it', () => {
      const cmd = new SetLayerOpacityCommand(layers, 'features', 0.5);
      cmd.execute();
      expect(layers.getLayer('features')!.opacity).toBe(0.5);

      cmd.undo();
      expect(layers.getLayer('features')!.opacity).toBe(1.0);
    });
  });

  describe('ReorderLayerCommand', () => {
    it('moves layer up and undoes it', () => {
      const originalZIndex = layers.getLayer('features')!.zIndex;
      const cmd = new ReorderLayerCommand(layers, 'features', 'up');
      cmd.execute();
      expect(layers.getLayer('features')!.zIndex).toBeGreaterThan(originalZIndex);

      cmd.undo();
      expect(layers.getLayer('features')!.zIndex).toBe(originalZIndex);
    });
  });

  describe('AddLayerCommand', () => {
    it('adds a layer and undoes it', () => {
      const initialCount = layers.getLayers().length;
      const cmd = new AddLayerCommand(layers, {
        id: 'custom-1', name: 'Custom', type: 'custom',
        visible: true, locked: false, opacity: 1, objects: [],
      });
      cmd.execute();
      expect(layers.getLayers()).toHaveLength(initialCount + 1);

      cmd.undo();
      expect(layers.getLayers()).toHaveLength(initialCount);
    });
  });

  describe('AddStampCommand', () => {
    it('adds stamp to features layer with correct fields', () => {
      const layers_ = [makeStampLayer('base-1')];
      const cmd = new AddStampCommand(layers, 'features', {
        x: 100, y: 200, width: 40, height: 40, stampLayers: layers_, label: 'Stamp',
      });
      cmd.execute();

      const objs = layers.getLayer('features')!.objects;
      expect(objs).toHaveLength(1);
      expect(objs[0].type).toBe('stamp');
      expect(objs[0].x).toBe(100);
      expect(objs[0].y).toBe(200);
      expect(objs[0].width).toBe(40);
      expect(objs[0].height).toBe(40);
      expect(objs[0].stampLayers).toHaveLength(1);
      expect(objs[0].stampLayers[0].type).toBe('base');
      expect(objs[0].label).toBe('Stamp');
    });

    it('stores loreId when provided', () => {
      const cmd = new AddStampCommand(layers, 'features', {
        x: 0, y: 0, width: 40, height: 40,
        stampLayers: [makeStampLayer('base-1')],
        loreId: 'lore-abc',
        label: 'City',
      });
      cmd.execute();
      const obj = layers.getLayer('features')!.objects[0];
      expect(obj.loreId).toBe('lore-abc');
    });

    it('getAddedId returns the created object ID', () => {
      const cmd = new AddStampCommand(layers, 'features', {
        x: 0, y: 0, width: 40, height: 40, stampLayers: [], label: 'Test',
      });
      expect(cmd.getAddedId()).toBeNull();
      cmd.execute();
      expect(cmd.getAddedId()).toBeDefined();
      expect(typeof cmd.getAddedId()).toBe('string');
    });

    it('undo removes the stamp and clears addedId', () => {
      const cmd = new AddStampCommand(layers, 'features', {
        x: 50, y: 50, width: 40, height: 40, stampLayers: [], label: 'Undo',
      });
      cmd.execute();
      expect(layers.getLayer('features')!.objects).toHaveLength(1);

      cmd.undo();
      expect(layers.getLayer('features')!.objects).toHaveLength(0);
      expect(cmd.getAddedId()).toBeNull();
    });

    it('redo re-adds the stamp via CommandHistory', () => {
      const history = new CommandHistory();
      const cmd = new AddStampCommand(layers, 'features', {
        x: 10, y: 10, width: 40, height: 40, stampLayers: [], label: 'Redo',
      });
      history.execute(cmd);
      expect(layers.getLayer('features')!.objects).toHaveLength(1);

      history.undo();
      expect(layers.getLayer('features')!.objects).toHaveLength(0);

      history.redo();
      expect(layers.getLayer('features')!.objects).toHaveLength(1);
    });

    it('toJSON serializes correctly', () => {
      const stampLayers = [makeStampLayer('base-1')];
      const params = { x: 10, y: 20, width: 40, height: 40, stampLayers, label: 'Test' };
      const cmd = new AddStampCommand(layers, 'features', params);
      cmd.execute();
      const json = cmd.toJSON() as any;
      expect(json.type).toBe('add_stamp');
      expect(json.layerId).toBe('features');
      expect(json.params.stampLayers).toHaveLength(1);
      expect(json.addedId).toBeDefined();
    });
  });

  describe('RemoveLayerCommand', () => {
    it('removes a layer and restores it on undo', () => {
      const initialCount = layers.getLayers().length;
      const cmd = new RemoveLayerCommand(layers, 'effects');
      cmd.execute();
      expect(layers.getLayers()).toHaveLength(initialCount - 1);
      expect(layers.getLayer('effects')).toBeUndefined();

      cmd.undo();
      expect(layers.getLayers()).toHaveLength(initialCount);
      expect(layers.getLayer('effects')).toBeDefined();
    });
  });
});
