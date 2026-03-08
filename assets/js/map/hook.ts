import { MapRenderer, Viewport } from './renderer';
import { LayerManager } from './layers';
import { CommandHistory, MoveObjectCommand, AddStampCommand, RemoveObjectCommand, SetLayerVisibilityCommand, SetLayerOpacityCommand } from './commands';
import type { MapObject, MapState, ToolMode, StampLayer, StampLayerType, BlendMode } from './types';

interface HookContext {
  el: HTMLElement;
  pushEvent: (event: string, payload: object) => void;
  handleEvent: (event: string, callback: (payload: any) => void) => void;
}

export const MapEditorHook = {
  mounted(this: HookContext & Record<string, any>) {
    const container = this.el;
    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    // Resize canvas to match container
    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      if (this._renderer) {
        this._renderer.requestRedraw();
      }
    };
    resize();
    this._resizeObserver = new ResizeObserver(resize);
    this._resizeObserver.observe(container);

    this._layers = new LayerManager();
    this._history = new CommandHistory();
    this._renderer = new MapRenderer();
    this._selectedObject = null as MapObject | null;
    this._toolMode = 'select' as ToolMode;
    this._isDragging = false;
    this._isPanning = false;
    this._dragStartX = 0;
    this._dragStartY = 0;
    this._dragObjStartX = 0;
    this._dragObjStartY = 0;
    // Global map state — lightAngle: 0 = east, -π/4 = classic top-left fantasy light
    this._mapState = { lightAngle: -Math.PI / 4 } as MapState;
    this._activeStampAsset = null as any;

    // Init CanvasKit (async)
    this._renderer.init(canvas).then(() => {
      this._renderer.startRenderLoop(
        () => this._layers.getLayers(),
        () => this._selectedObject?.id ?? null,
        () => this._mapState,
      );
      this._renderer.requestRedraw();
    });

    // Mouse events
    const viewport = (): Viewport => this._renderer.getViewport();

    canvas.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 0) {
        if (this._toolMode === 'stamp') {
          // Stamp mode: place a stamp at click position
          const world = viewport().screenToWorld(e.offsetX, e.offsetY);
          const ts = Date.now();
          const size = 64;

          let stampLayers: StampLayer[];
          let label: string;

          if (this._activeStampAsset) {
            const asset = this._activeStampAsset;
            label = asset.name;
            stampLayers = asset.layers.map((layer: any, i: number) => ({
              id: `${layer.id}-${ts}-${i}`,
              type: layer.type as StampLayerType,
              blendMode: layer.blendMode as BlendMode,
              opacity: layer.opacity ?? 1,
              visible: layer.visible ?? true,
              frames: layer.frames ?? [],
              fps: layer.fps ?? 0,
              keyed_to: layer.keyed_to,
            }));
          } else {
            label = 'Stamp';
            stampLayers = [
              {
                id: `base-${ts}`,
                type: 'base' as const,
                blendMode: 'normal' as const,
                opacity: 1,
                visible: true,
                frames: [],
                fps: 0,
              },
              {
                id: `shadow-${ts}`,
                type: 'shadow' as const,
                blendMode: 'multiply' as const,
                opacity: 0.6,
                visible: true,
                frames: [],
                fps: 0,
                keyed_to: 'lightAngle',
              },
            ];
          }

          const cmd = new AddStampCommand(this._layers, 'features', {
            x: world.x - size / 2, y: world.y - size / 2,
            width: size, height: size,
            stampLayers,
            label,
          });
          this._history.execute(cmd);
          this._renderer.requestRedraw();
          this.pushEvent('stamp_placed', {
            id: cmd.getAddedId(),
            x: world.x - size / 2, y: world.y - size / 2,
            width: size, height: size,
            name: label,
            asset_category: this._activeStampAsset?.category ?? 'unknown',
          });
        } else {
          // Select mode: check for hit
          const hit = viewport().hitTest(e.offsetX, e.offsetY, this._layers.getLayers());
          if (hit) {
            this._selectedObject = hit;
            this._isDragging = true;
            this._dragStartX = e.offsetX;
            this._dragStartY = e.offsetY;
            this._dragObjStartX = hit.x;
            this._dragObjStartY = hit.y;
            this.pushEvent('object_selected', { id: hit.id, lore_id: hit.loreId ?? null });
          } else {
            this._selectedObject = null;
            this._isPanning = true;
            this._dragStartX = e.offsetX;
            this._dragStartY = e.offsetY;
          }
        }
      } else if (e.button === 1) {
        // Middle click: pan
        e.preventDefault();
        this._isPanning = true;
        this._dragStartX = e.offsetX;
        this._dragStartY = e.offsetY;
      }
    });

    canvas.addEventListener('mousemove', (e: MouseEvent) => {
      if (this._isPanning) {
        const dx = e.offsetX - this._dragStartX;
        const dy = e.offsetY - this._dragStartY;
        viewport().pan(dx, dy);
        this._dragStartX = e.offsetX;
        this._dragStartY = e.offsetY;
        this._renderer.requestRedraw();
      } else if (this._isDragging && this._selectedObject) {
        const world = viewport().screenToWorld(e.offsetX, e.offsetY);
        const startWorld = viewport().screenToWorld(this._dragStartX, this._dragStartY);
        const newX = this._dragObjStartX + (world.x - startWorld.x);
        const newY = this._dragObjStartY + (world.y - startWorld.y);
        // Live preview (direct move, no command yet)
        const layerId = this._findLayerForObject(this._selectedObject.id);
        if (layerId) {
          this._layers.moveObject(layerId, this._selectedObject.id, newX, newY);
          this._renderer.requestRedraw();
        }
      }
    });

    canvas.addEventListener('mouseup', (e: MouseEvent) => {
      if (this._isDragging && this._selectedObject) {
        const obj = this._selectedObject;
        const layerId = this._findLayerForObject(obj.id);
        if (layerId && (obj.x !== this._dragObjStartX || obj.y !== this._dragObjStartY)) {
          // Reset to start position, then execute command (so undo works correctly)
          const finalX = obj.x;
          const finalY = obj.y;
          this._layers.moveObject(layerId, obj.id, this._dragObjStartX, this._dragObjStartY);
          const cmd = new MoveObjectCommand(this._layers, layerId, obj.id, finalX, finalY);
          this._history.execute(cmd);
          this._renderer.requestRedraw();
        }
      }
      this._isDragging = false;
      this._isPanning = false;
    });

    canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const currentZoom = viewport().getZoom();
      const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(10, currentZoom * zoomDelta));
      viewport().zoomTo(newZoom, e.offsetX, e.offsetY);
      this._renderer.requestRedraw();
    }, { passive: false });

    // Prevent context menu on middle click
    canvas.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
    });

    // Keyboard shortcuts
    const keyHandler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          this._history.redo();
        } else {
          this._history.undo();
        }
        this._renderer.requestRedraw();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        // Ctrl+Y / Cmd+Y = redo (Windows/Linux convention)
        e.preventDefault();
        this._history.redo();
        this._renderer.requestRedraw();
      } else if (e.key === 'Escape') {
        // Escape = deselect
        this._selectedObject = null;
        this._isDragging = false;
        this._renderer.requestRedraw();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        // Delete = remove selected stamp (undoable)
        if (this._selectedObject) {
          const layerId = this._findLayerForObject(this._selectedObject.id);
          if (layerId) {
            const cmd = new RemoveObjectCommand(this._layers, layerId, this._selectedObject.id);
            this._history.execute(cmd);
            this._selectedObject = null;
            this._renderer.requestRedraw();
          }
        }
      }
    };
    window.addEventListener('keydown', keyHandler);
    this._keyHandler = keyHandler;

    // LiveView push event handlers
    this.handleEvent('layer_visibility_changed', (data: { id: string; visible: boolean }) => {
      const cmd = new SetLayerVisibilityCommand(this._layers, data.id, data.visible);
      this._history.execute(cmd);
      this._renderer.requestRedraw();
    });

    this.handleEvent('layer_opacity_changed', (data: { id: string; opacity: number }) => {
      const cmd = new SetLayerOpacityCommand(this._layers, data.id, data.opacity);
      this._history.execute(cmd);
      this._renderer.requestRedraw();
    });

    this.handleEvent('map_state', (data: { layers: any }) => {
      if (data.layers) {
        this._layers.fromJSON(data);
        this._renderer.requestRedraw();
      }
    });

    this.handleEvent('set_tool', (data: { tool: string; stamp_asset?: any }) => {
      this._toolMode = data.tool as ToolMode;
      if (data.stamp_asset) {
        this._activeStampAsset = data.stamp_asset;
      }
      this._selectedObject = null;
      this._renderer.requestRedraw();
    });

    this.handleEvent('light_angle_changed', (data: { angle: number }) => {
      this._mapState = { ...this._mapState, lightAngle: data.angle };
      this._renderer.requestRedraw();
    });

    this.handleEvent('locations_updated', (_data: any) => {
      // Placeholder for future location sync
      this._renderer.requestRedraw();
    });

    // When server creates a LoreEntry for a stamp, update the MapObject's loreId
    this.handleEvent('lore_entry_created', (data: { stamp_id: string; lore_id: string }) => {
      // Find which layer holds this stamp and update its loreId
      for (const layer of this._layers.getLayers()) {
        const obj = layer.objects.find((o: MapObject) => o.id === data.stamp_id);
        if (obj) {
          this._layers.updateObject(layer.id, data.stamp_id, { loreId: data.lore_id });
          // Update selected reference if this is the currently selected object
          if (this._selectedObject?.id === data.stamp_id) {
            this._selectedObject = { ...this._selectedObject, loreId: data.lore_id };
          }
          break;
        }
      }
    });
  },

  destroyed(this: HookContext & Record<string, any>) {
    if (this._renderer) {
      this._renderer.destroy();
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
    }
  },

  // Helper: find which layer contains an object
  _findLayerForObject(this: Record<string, any>, objectId: string): string | null {
    for (const layer of this._layers.getLayers()) {
      if (layer.objects.some((o: MapObject) => o.id === objectId)) {
        return layer.id;
      }
    }
    return null;
  },
};
