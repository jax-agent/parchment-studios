import { describe, it, expect, beforeEach } from 'vitest';
import { CommandHistory, AddObjectCommand, RemoveObjectCommand, MoveObjectCommand, SetLayerVisibilityCommand, SetLayerOpacityCommand, ReorderLayerCommand, AddLayerCommand, RemoveLayerCommand, AddStampCommand, BrushStrokeCommand, BatchCommand } from '../commands';
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

  describe('SetLayerVisibilityCommand — integration', () => {
    it('hiding Features layer makes stamps invisible (renderer skips hidden layers)', () => {
      // Place a stamp on Features
      layers.addObject('features', {
        type: 'stamp', x: 0, y: 0, width: 40, height: 40,
        rotation: 0, scale: 1, opacity: 1,
        stampLayers: [makeStampLayer('base-1')], data: {},
      });
      expect(layers.getLayer('features')!.visible).toBe(true);
      expect(layers.getLayer('features')!.objects).toHaveLength(1);

      // Hide Features layer via command
      const cmd = new SetLayerVisibilityCommand(layers, 'features', false);
      cmd.execute();
      expect(layers.getLayer('features')!.visible).toBe(false);
      // Objects still exist but layer is hidden — renderer should skip
      expect(layers.getLayer('features')!.objects).toHaveLength(1);

      // Undo → visible again
      cmd.undo();
      expect(layers.getLayer('features')!.visible).toBe(true);
    });

    it('visibility toggle is fully undoable through CommandHistory', () => {
      const history = new CommandHistory();

      // Hide
      const hideCmd = new SetLayerVisibilityCommand(layers, 'features', false);
      history.execute(hideCmd);
      expect(layers.getLayer('features')!.visible).toBe(false);

      // Undo → visible
      history.undo();
      expect(layers.getLayer('features')!.visible).toBe(true);

      // Redo → hidden again
      history.redo();
      expect(layers.getLayer('features')!.visible).toBe(false);
    });

    it('multiple visibility toggles are independently undoable', () => {
      const history = new CommandHistory();

      // Hide features
      history.execute(new SetLayerVisibilityCommand(layers, 'features', false));
      // Hide terrain
      history.execute(new SetLayerVisibilityCommand(layers, 'terrain', false));

      expect(layers.getLayer('features')!.visible).toBe(false);
      expect(layers.getLayer('terrain')!.visible).toBe(false);

      // Undo terrain → visible, features still hidden
      history.undo();
      expect(layers.getLayer('terrain')!.visible).toBe(true);
      expect(layers.getLayer('features')!.visible).toBe(false);

      // Undo features → visible
      history.undo();
      expect(layers.getLayer('features')!.visible).toBe(true);
    });
  });

  describe('SetLayerOpacityCommand — integration', () => {
    it('opacity change is undoable through CommandHistory', () => {
      const history = new CommandHistory();

      history.execute(new SetLayerOpacityCommand(layers, 'features', 0.3));
      expect(layers.getLayer('features')!.opacity).toBe(0.3);

      history.undo();
      expect(layers.getLayer('features')!.opacity).toBe(1.0);

      history.redo();
      expect(layers.getLayer('features')!.opacity).toBe(0.3);
    });

    it('successive opacity changes each preserve previous value for undo', () => {
      const history = new CommandHistory();

      history.execute(new SetLayerOpacityCommand(layers, 'features', 0.8));
      history.execute(new SetLayerOpacityCommand(layers, 'features', 0.4));
      history.execute(new SetLayerOpacityCommand(layers, 'features', 0.1));

      expect(layers.getLayer('features')!.opacity).toBe(0.1);

      history.undo();
      expect(layers.getLayer('features')!.opacity).toBe(0.4);

      history.undo();
      expect(layers.getLayer('features')!.opacity).toBe(0.8);

      history.undo();
      expect(layers.getLayer('features')!.opacity).toBe(1.0);
    });

    it('zero opacity effectively hides layer content', () => {
      const cmd = new SetLayerOpacityCommand(layers, 'features', 0);
      cmd.execute();
      expect(layers.getLayer('features')!.opacity).toBe(0);
      // Layer is still "visible" but at 0 opacity — renderer multiplies alpha to 0
      expect(layers.getLayer('features')!.visible).toBe(true);
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

  describe('BrushStrokeCommand', () => {
    const strokeParams = {
      x: 10,
      y: 20,
      width: 100,
      height: 80,
      color: '#4a7c59',
      opacity: 0.75,
      size: 20,
      hardness: 0.3,
      points: [
        { x: 5, y: 10 },
        { x: 20, y: 30 },
        { x: 50, y: 45 },
      ],
    };

    it('execute adds a brush_stroke object to the terrain layer', () => {
      const before = layers.getLayer('terrain')!.objects.length;
      const cmd = new BrushStrokeCommand(layers, 'terrain', strokeParams);
      cmd.execute();

      const terrain = layers.getLayer('terrain')!;
      expect(terrain.objects).toHaveLength(before + 1);

      const stroke = terrain.objects[terrain.objects.length - 1];
      expect(stroke.type).toBe('brush_stroke');
      expect(stroke.data.color).toBe('#4a7c59');
      expect(stroke.data.size).toBe(20);
      expect((stroke.data.points as { x: number; y: number }[])).toHaveLength(3);
      expect(cmd.getAddedId()).toBe(stroke.id);
    });

    it('undo removes the brush stroke', () => {
      const before = layers.getLayer('terrain')!.objects.length;
      const cmd = new BrushStrokeCommand(layers, 'terrain', strokeParams);
      cmd.execute();
      expect(layers.getLayer('terrain')!.objects).toHaveLength(before + 1);

      cmd.undo();
      expect(layers.getLayer('terrain')!.objects).toHaveLength(before);
    });

    it('is undoable via CommandHistory', () => {
      const history = new CommandHistory();
      const before = layers.getLayer('terrain')!.objects.length;

      history.execute(new BrushStrokeCommand(layers, 'terrain', strokeParams));
      expect(layers.getLayer('terrain')!.objects).toHaveLength(before + 1);

      history.undo();
      expect(layers.getLayer('terrain')!.objects).toHaveLength(before);

      history.redo();
      expect(layers.getLayer('terrain')!.objects).toHaveLength(before + 1);
    });

    it('sequential strokes are independently undoable', () => {
      const history = new CommandHistory();
      const before = layers.getLayer('terrain')!.objects.length;

      history.execute(new BrushStrokeCommand(layers, 'terrain', strokeParams));
      history.execute(new BrushStrokeCommand(layers, 'terrain', { ...strokeParams, color: '#8ab87a' }));
      expect(layers.getLayer('terrain')!.objects).toHaveLength(before + 2);

      history.undo();
      expect(layers.getLayer('terrain')!.objects).toHaveLength(before + 1);

      history.undo();
      expect(layers.getLayer('terrain')!.objects).toHaveLength(before);
    });

    it('opacity is stored on the MapObject', () => {
      const cmd = new BrushStrokeCommand(layers, 'terrain', { ...strokeParams, opacity: 0.5 });
      cmd.execute();
      const terrain = layers.getLayer('terrain')!;
      const stroke = terrain.objects[terrain.objects.length - 1];
      expect(stroke.opacity).toBe(0.5);
    });

    it('toJSON serializes all params', () => {
      const cmd = new BrushStrokeCommand(layers, 'terrain', strokeParams);
      cmd.execute();
      const json = cmd.toJSON() as any;
      expect(json.type).toBe('brush_stroke');
      expect(json.layerId).toBe('terrain');
      expect(json.params.color).toBe('#4a7c59');
    });
  });

  describe('BatchCommand', () => {
    it('execute calls execute on all sub-commands in order', () => {
      const order: number[] = [];
      const cmd1: Command = {
        id: '1', type: 'test',
        execute() { order.push(1); }, undo() {}, toJSON() { return {}; },
      };
      const cmd2: Command = {
        id: '2', type: 'test',
        execute() { order.push(2); }, undo() {}, toJSON() { return {}; },
      };
      const batch = new BatchCommand([cmd1, cmd2]);
      batch.execute();
      expect(order).toEqual([1, 2]);
    });

    it('undo calls undo on all sub-commands in reverse order', () => {
      const order: number[] = [];
      const cmd1: Command = {
        id: '1', type: 'test',
        execute() {}, undo() { order.push(1); }, toJSON() { return {}; },
      };
      const cmd2: Command = {
        id: '2', type: 'test',
        execute() {}, undo() { order.push(2); }, toJSON() { return {}; },
      };
      const batch = new BatchCommand([cmd1, cmd2]);
      batch.undo();
      expect(order).toEqual([2, 1]);
    });

    it('toJSON serializes sub-commands', () => {
      const cmd1: Command = {
        id: '1', type: 'test',
        execute() {}, undo() {}, toJSON() { return { type: 'a' }; },
      };
      const batch = new BatchCommand([cmd1]);
      const json = batch.toJSON() as any;
      expect(json.type).toBe('batch');
      expect(json.commands).toHaveLength(1);
      expect(json.commands[0].type).toBe('a');
    });

    it('works with real AddObjectCommands for batch undo', () => {
      const obj1: Omit<MapObject, 'id'> = {
        type: 'stamp', x: 10, y: 10, width: 40, height: 40,
        rotation: 0, scale: 1, opacity: 1, stampLayers: [], data: {},
      };
      const obj2: Omit<MapObject, 'id'> = {
        type: 'stamp', x: 50, y: 50, width: 40, height: 40,
        rotation: 0, scale: 1, opacity: 1, stampLayers: [], data: {},
      };
      const cmd1 = new AddObjectCommand(layers, 'features', obj1);
      const cmd2 = new AddObjectCommand(layers, 'features', obj2);
      cmd1.execute();
      cmd2.execute();
      expect(layers.getLayer('features')!.objects).toHaveLength(2);

      const batch = new BatchCommand([cmd1, cmd2]);
      batch.undo();
      expect(layers.getLayer('features')!.objects).toHaveLength(0);
    });
  });
});

describe('CommandHistory.record', () => {
  it('adds to undo stack without calling execute', () => {
    const history = new CommandHistory();
    let executed = false;
    const cmd: Command = {
      id: '1', type: 'test',
      execute() { executed = true; }, undo() {}, toJSON() { return {}; },
    };
    history.record(cmd);
    expect(executed).toBe(false);
    expect(history.canUndo()).toBe(true);
  });

  it('clears redo stack when recording', () => {
    const history = new CommandHistory();
    const noop: Command = {
      id: '1', type: 'test',
      execute() {}, undo() {}, toJSON() { return {}; },
    };
    history.execute(noop);
    history.undo();
    expect(history.canRedo()).toBe(true);
    history.record(noop);
    expect(history.canRedo()).toBe(false);
  });

  it('recorded command is undoable', () => {
    const history = new CommandHistory();
    let undone = false;
    const cmd: Command = {
      id: '1', type: 'test',
      execute() {}, undo() { undone = true; }, toJSON() { return {}; },
    };
    history.record(cmd);
    history.undo();
    expect(undone).toBe(true);
  });
});
