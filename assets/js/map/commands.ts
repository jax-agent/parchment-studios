import type { Command, Layer, MapObject } from './types';
import type { LayerManager } from './layers';

export class CommandHistory {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  execute(cmd: Command): void {
    cmd.execute();
    this.undoStack.push(cmd);
    this.redoStack = [];
  }

  undo(): void {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this.redoStack.push(cmd);
  }

  redo(): void {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.execute();
    this.undoStack.push(cmd);
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

let cmdCounter = 0;
function cmdId(): string {
  return `cmd-${Date.now()}-${++cmdCounter}`;
}

export class AddObjectCommand implements Command {
  id = cmdId();
  type = 'add_object';
  private addedId: string | null = null;
  private objectData: Omit<MapObject, 'id'>;

  constructor(
    private layers: LayerManager,
    private layerId: string,
    obj: Omit<MapObject, 'id'>,
  ) {
    this.objectData = { ...obj };
  }

  execute(): void {
    const added = this.layers.addObject(this.layerId, this.objectData);
    this.addedId = added.id;
  }

  undo(): void {
    if (this.addedId) {
      this.layers.removeObject(this.layerId, this.addedId);
    }
  }

  toJSON(): object {
    return { type: this.type, layerId: this.layerId, object: this.objectData, addedId: this.addedId };
  }
}

export class RemoveObjectCommand implements Command {
  id = cmdId();
  type = 'remove_object';
  private removedObject: MapObject | null = null;

  constructor(
    private layers: LayerManager,
    private layerId: string,
    private objectId: string,
  ) {}

  execute(): void {
    this.removedObject = this.layers.removeObject(this.layerId, this.objectId) ?? null;
  }

  undo(): void {
    if (this.removedObject) {
      this.layers.restoreObject(this.layerId, this.removedObject);
    }
  }

  toJSON(): object {
    return { type: this.type, layerId: this.layerId, objectId: this.objectId };
  }
}

export class MoveObjectCommand implements Command {
  id = cmdId();
  type = 'move_object';
  private oldX = 0;
  private oldY = 0;

  constructor(
    private layers: LayerManager,
    private layerId: string,
    private objectId: string,
    private newX: number,
    private newY: number,
  ) {
    const layer = layers.getLayer(layerId);
    const obj = layer?.objects.find((o) => o.id === objectId);
    if (obj) {
      this.oldX = obj.x;
      this.oldY = obj.y;
    }
  }

  execute(): void {
    this.layers.moveObject(this.layerId, this.objectId, this.newX, this.newY);
  }

  undo(): void {
    this.layers.moveObject(this.layerId, this.objectId, this.oldX, this.oldY);
  }

  toJSON(): object {
    return {
      type: this.type, layerId: this.layerId, objectId: this.objectId,
      oldX: this.oldX, oldY: this.oldY, newX: this.newX, newY: this.newY,
    };
  }
}

export class SetLayerVisibilityCommand implements Command {
  id = cmdId();
  type = 'set_layer_visibility';
  private oldVisible: boolean;

  constructor(
    private layers: LayerManager,
    private layerId: string,
    private visible: boolean,
  ) {
    this.oldVisible = layers.getLayer(layerId)?.visible ?? true;
  }

  execute(): void {
    this.layers.setVisible(this.layerId, this.visible);
  }

  undo(): void {
    this.layers.setVisible(this.layerId, this.oldVisible);
  }

  toJSON(): object {
    return { type: this.type, layerId: this.layerId, visible: this.visible };
  }
}

export class SetLayerOpacityCommand implements Command {
  id = cmdId();
  type = 'set_layer_opacity';
  private oldOpacity: number;

  constructor(
    private layers: LayerManager,
    private layerId: string,
    private opacity: number,
  ) {
    this.oldOpacity = layers.getLayer(layerId)?.opacity ?? 1.0;
  }

  execute(): void {
    this.layers.setOpacity(this.layerId, this.opacity);
  }

  undo(): void {
    this.layers.setOpacity(this.layerId, this.oldOpacity);
  }

  toJSON(): object {
    return { type: this.type, layerId: this.layerId, opacity: this.opacity };
  }
}

export class ReorderLayerCommand implements Command {
  id = cmdId();
  type = 'reorder_layer';
  private snapshot: { id: string; zIndex: number }[] = [];

  constructor(
    private layers: LayerManager,
    private layerId: string,
    private direction: 'up' | 'down',
  ) {
    this.snapshot = layers.getLayers().map((l) => ({ id: l.id, zIndex: l.zIndex }));
  }

  execute(): void {
    if (this.direction === 'up') {
      this.layers.moveLayerUp(this.layerId);
    } else {
      this.layers.moveLayerDown(this.layerId);
    }
  }

  undo(): void {
    for (const s of this.snapshot) {
      this.layers.reorderLayer(s.id, s.zIndex);
    }
  }

  toJSON(): object {
    return { type: this.type, layerId: this.layerId, direction: this.direction };
  }
}

export class AddLayerCommand implements Command {
  id = cmdId();
  type = 'add_layer';
  private addedLayer: Layer | null = null;

  constructor(
    private layers: LayerManager,
    private layerData: Omit<Layer, 'zIndex'>,
  ) {}

  execute(): void {
    this.addedLayer = this.layers.addLayer(this.layerData);
  }

  undo(): void {
    if (this.addedLayer) {
      this.layers.removeLayer(this.addedLayer.id);
    }
  }

  toJSON(): object {
    return { type: this.type, layer: this.layerData };
  }
}

export interface StampParams {
  x: number;
  y: number;
  width: number;
  height: number;
  stampLayers: import('./types').StampLayer[];
  label?: string;
  loreId?: string;
}

export class AddStampCommand implements Command {
  id = cmdId();
  type = 'add_stamp';
  private addedId: string | null = null;

  constructor(
    private layers: LayerManager,
    private layerId: string,
    private params: StampParams,
  ) {}

  execute(): void {
    const obj: Omit<MapObject, 'id'> = {
      type: 'stamp',
      x: this.params.x,
      y: this.params.y,
      width: this.params.width,
      height: this.params.height,
      stampLayers: this.params.stampLayers,
      loreId: this.params.loreId,
      label: this.params.label,
      rotation: 0,
      scale: 1,
      opacity: 1,
      data: {},
    };
    const added = this.layers.addObject(this.layerId, obj);
    this.addedId = added.id;
  }

  undo(): void {
    if (this.addedId) {
      this.layers.removeObject(this.layerId, this.addedId);
      this.addedId = null;
    }
  }

  getAddedId(): string | null {
    return this.addedId;
  }

  toJSON(): object {
    return { type: this.type, layerId: this.layerId, params: this.params, addedId: this.addedId };
  }
}

export class RemoveLayerCommand implements Command {
  id = cmdId();
  type = 'remove_layer';
  private removedLayer: Layer | null = null;

  constructor(
    private layers: LayerManager,
    private layerId: string,
  ) {}

  execute(): void {
    this.removedLayer = this.layers.removeLayer(this.layerId) ?? null;
  }

  undo(): void {
    if (this.removedLayer) {
      this.layers.restoreLayer(this.removedLayer);
    }
  }

  toJSON(): object {
    return { type: this.type, layerId: this.layerId };
  }
}
