export type LayerType = 'terrain' | 'water' | 'features' | 'labels' | 'effects' | 'custom';

export type MapObjectType = 'stamp' | 'path' | 'text' | 'region';

export interface MapObject {
  id: string;
  type: MapObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  opacity: number;
  assetId?: string;
  data: Record<string, unknown>;
}

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  opacity: number;
  objects: MapObject[];
  zIndex: number;
}

export interface Command {
  id: string;
  type: string;
  execute(): void;
  undo(): void;
  toJSON(): object;
}
