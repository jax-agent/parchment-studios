import type { Layer, LayerType, MapObject } from './types';

export function createDefaultLayers(): Layer[] {
  const defaults: { id: string; name: string; type: LayerType }[] = [
    { id: 'terrain', name: 'Terrain', type: 'terrain' },
    { id: 'water', name: 'Water', type: 'water' },
    { id: 'features', name: 'Features', type: 'features' },
    { id: 'labels', name: 'Labels', type: 'labels' },
    { id: 'effects', name: 'Effects', type: 'effects' },
  ];

  return defaults.map((d, i) => ({
    ...d,
    visible: true,
    locked: false,
    opacity: 1.0,
    objects: [],
    zIndex: i,
  }));
}

let idCounter = 0;
function generateId(): string {
  return `obj-${Date.now()}-${++idCounter}`;
}

export class LayerManager {
  private layers: Layer[] = [];

  constructor() {
    this.layers = createDefaultLayers();
  }

  addLayer(layer: Omit<Layer, 'zIndex'>): Layer {
    const maxZ = this.layers.reduce((max, l) => Math.max(max, l.zIndex), -1);
    const newLayer: Layer = { ...layer, zIndex: maxZ + 1 };
    this.layers.push(newLayer);
    return newLayer;
  }

  removeLayer(id: string): Layer | undefined {
    const idx = this.layers.findIndex((l) => l.id === id);
    if (idx === -1) return undefined;
    return this.layers.splice(idx, 1)[0];
  }

  restoreLayer(layer: Layer): void {
    this.layers.push(layer);
  }

  getLayer(id: string): Layer | undefined {
    return this.layers.find((l) => l.id === id);
  }

  getLayers(): Layer[] {
    return [...this.layers].sort((a, b) => a.zIndex - b.zIndex);
  }

  addObject(layerId: string, obj: Omit<MapObject, 'id'>): MapObject {
    const layer = this.getLayer(layerId);
    if (!layer) throw new Error(`Layer not found: ${layerId}`);
    const newObj: MapObject = { ...obj, id: generateId() };
    layer.objects.push(newObj);
    return newObj;
  }

  removeObject(layerId: string, objectId: string): MapObject | undefined {
    const layer = this.getLayer(layerId);
    if (!layer) return undefined;
    const idx = layer.objects.findIndex((o) => o.id === objectId);
    if (idx === -1) return undefined;
    return layer.objects.splice(idx, 1)[0];
  }

  restoreObject(layerId: string, obj: MapObject): void {
    const layer = this.getLayer(layerId);
    if (!layer) throw new Error(`Layer not found: ${layerId}`);
    layer.objects.push(obj);
  }

  moveObject(layerId: string, objectId: string, x: number, y: number): void {
    const layer = this.getLayer(layerId);
    if (!layer) return;
    const obj = layer.objects.find((o) => o.id === objectId);
    if (obj) {
      obj.x = x;
      obj.y = y;
    }
  }

  updateObject(layerId: string, objectId: string, updates: Partial<MapObject>): void {
    const layer = this.getLayer(layerId);
    if (!layer) return;
    const obj = layer.objects.find((o) => o.id === objectId);
    if (obj) {
      Object.assign(obj, updates);
    }
  }

  moveLayerUp(id: string): void {
    const sorted = this.getLayers();
    const idx = sorted.findIndex((l) => l.id === id);
    if (idx === -1 || idx === sorted.length - 1) return;
    const current = sorted[idx];
    const above = sorted[idx + 1];
    const tmpZ = current.zIndex;
    current.zIndex = above.zIndex;
    above.zIndex = tmpZ;
  }

  moveLayerDown(id: string): void {
    const sorted = this.getLayers();
    const idx = sorted.findIndex((l) => l.id === id);
    if (idx <= 0) return;
    const current = sorted[idx];
    const below = sorted[idx - 1];
    const tmpZ = current.zIndex;
    current.zIndex = below.zIndex;
    below.zIndex = tmpZ;
  }

  reorderLayer(id: string, newZIndex: number): void {
    const layer = this.getLayer(id);
    if (layer) {
      layer.zIndex = newZIndex;
    }
  }

  setVisible(id: string, visible: boolean): void {
    const layer = this.getLayer(id);
    if (layer) layer.visible = visible;
  }

  setLocked(id: string, locked: boolean): void {
    const layer = this.getLayer(id);
    if (layer) layer.locked = locked;
  }

  setOpacity(id: string, opacity: number): void {
    const layer = this.getLayer(id);
    if (layer) layer.opacity = opacity;
  }

  getObjects(layerId: string): MapObject[] {
    const layer = this.getLayer(layerId);
    if (!layer) return [];
    return [...layer.objects];
  }

  toJSON(): object {
    return { layers: this.getLayers() };
  }

  fromJSON(data: object): void {
    const parsed = data as { layers: Layer[] };
    this.layers = parsed.layers.map((l) => ({
      ...l,
      objects: l.objects.map((o) => ({ ...o })),
    }));
  }
}
