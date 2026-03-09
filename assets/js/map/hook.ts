import { MapRenderer, Viewport } from './renderer';
import type { PreviewStroke, RegionPreview } from './renderer';
import { LayerManager } from './layers';
import { CommandHistory, MoveObjectCommand, AddStampCommand, AddObjectCommand, RemoveObjectCommand, SetLayerVisibilityCommand, SetLayerOpacityCommand, BrushStrokeCommand, BatchCommand } from './commands';
import type { BrushPoint } from './commands';
import type { MapObject, MapState, ToolMode, StampLayer, StampLayerType, BlendMode, PathStyle, RegionFillStyle } from './types';
import { computeCentroid } from './region';

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
    // Space bar pan state
    this._spaceHeld = false;
    this._previousTool = null as ToolMode | null;
    // Brush state
    this._brushActive = false;
    this._brushPoints = [] as BrushPoint[];
    this._brushColor = '#4a7c59';  // Forest green default
    this._brushSize = 20;
    this._brushOpacity = 0.75;
    this._brushHardness = 0.3;
    // Pattern Stamp state
    this._patternStrokeActive = false;
    this._patternStrokeCmds = [] as AddObjectCommand[];
    this._patternLastWorldX = 0;
    this._patternLastWorldY = 0;
    this._patternSpacing = 48;
    // Path tool state
    this._pathWaypoints = [] as { x: number; y: number }[];
    this._pathInProgress = false;
    this._pathStyle = 'road' as PathStyle;
    this._pathMouseX = 0;
    this._pathMouseY = 0;
    // Region tool state
    this._regionVertices = [] as { x: number; y: number }[];
    this._regionInProgress = false;
    this._regionFillStyle = 'hatching' as RegionFillStyle;
    this._regionFillColor = '#2d5a27';
    this._regionMouseX = 0;
    this._regionMouseY = 0;

    // Init CanvasKit (async)
    this._renderer.init(canvas).then(() => {
      this._renderer.startRenderLoop(
        () => this._layers.getLayers(),
        () => this._selectedObject?.id ?? null,
        () => this._mapState,
        () => this._brushActive && this._brushPoints.length > 0
          ? {
              points: this._brushPoints,
              color: this._brushColor,
              size: this._brushSize,
              opacity: this._brushOpacity,
              hardness: this._brushHardness,
            } as PreviewStroke
          : null,
        () => this._pathInProgress && this._pathWaypoints.length > 0
          ? {
              waypoints: this._pathWaypoints,
              mouseX: this._pathMouseX,
              mouseY: this._pathMouseY,
              pathStyle: this._pathStyle,
            }
          : null,
        () => this._regionInProgress && this._regionVertices.length > 0
          ? {
              vertices: this._regionVertices,
              mouseX: this._regionMouseX,
              mouseY: this._regionMouseY,
              fillStyle: this._regionFillStyle,
              fillColor: this._regionFillColor,
            } as RegionPreview
          : null,
      );
      this._renderer.requestRedraw();
    });

    // Mouse events
    const viewport = (): Viewport => this._renderer.getViewport();

    canvas.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 0) {
        if (this._toolMode === 'brush') {
          // Brush mode: start drawing a stroke
          const world = viewport().screenToWorld(e.offsetX, e.offsetY);
          this._brushActive = true;
          this._brushPoints = [{ x: world.x, y: world.y }];
          canvas.style.cursor = 'crosshair';
          this._renderer.requestRedraw();
        } else if (this._toolMode === 'path') {
          // Path mode: place waypoints on click
          const world = viewport().screenToWorld(e.offsetX, e.offsetY);
          if (!this._pathInProgress) {
            this._pathInProgress = true;
            this._pathWaypoints = [{ x: world.x, y: world.y }];
          } else {
            this._pathWaypoints.push({ x: world.x, y: world.y });
          }
          canvas.style.cursor = 'crosshair';
          this._renderer.requestRedraw();
        } else if (this._toolMode === 'region') {
          // Region mode: place polygon vertices on click
          const world = viewport().screenToWorld(e.offsetX, e.offsetY);
          if (!this._regionInProgress) {
            this._regionInProgress = true;
            this._regionVertices = [{ x: world.x, y: world.y }];
          } else {
            this._regionVertices.push({ x: world.x, y: world.y });
          }
          canvas.style.cursor = 'crosshair';
          this._renderer.requestRedraw();
        } else if (this._toolMode === 'pattern' && this._activeStampAsset) {
          // Pattern Stamp mode: start a scatter stroke
          const world = viewport().screenToWorld(e.offsetX, e.offsetY);
          this._patternStrokeActive = true;
          this._patternStrokeCmds = [];
          this._patternLastWorldX = world.x;
          this._patternLastWorldY = world.y;
          this._placePatternStamp(world.x, world.y);
          canvas.style.cursor = 'crosshair';
          this._renderer.requestRedraw();
        } else if (this._toolMode === 'pan') {
          // Pan mode: left click pans
          this._isPanning = true;
          this._dragStartX = e.offsetX;
          this._dragStartY = e.offsetY;
          canvas.style.cursor = 'grabbing';
        } else if (this._toolMode === 'stamp') {
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
      if (this._regionInProgress && this._toolMode === 'region') {
        const world = viewport().screenToWorld(e.offsetX, e.offsetY);
        this._regionMouseX = world.x;
        this._regionMouseY = world.y;
        this._renderer.requestRedraw();
      } else if (this._pathInProgress && this._toolMode === 'path') {
        const world = viewport().screenToWorld(e.offsetX, e.offsetY);
        this._pathMouseX = world.x;
        this._pathMouseY = world.y;
        this._renderer.requestRedraw();
      } else if (this._patternStrokeActive && this._toolMode === 'pattern') {
        const world = viewport().screenToWorld(e.offsetX, e.offsetY);
        const dx = world.x - this._patternLastWorldX;
        const dy = world.y - this._patternLastWorldY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= this._patternSpacing) {
          const steps = Math.floor(dist / this._patternSpacing);
          for (let i = 1; i <= steps; i++) {
            const t = (i * this._patternSpacing) / dist;
            const wx = this._patternLastWorldX + dx * t;
            const wy = this._patternLastWorldY + dy * t;
            this._placePatternStamp(wx, wy);
          }
          this._patternLastWorldX = this._patternLastWorldX + dx * (steps * this._patternSpacing / dist);
          this._patternLastWorldY = this._patternLastWorldY + dy * (steps * this._patternSpacing / dist);
          this._renderer.requestRedraw();
        }
      } else if (this._brushActive && this._toolMode === 'brush') {
        const world = viewport().screenToWorld(e.offsetX, e.offsetY);
        const last = this._brushPoints[this._brushPoints.length - 1];
        // Throttle: only add point if moved > 2 world-px (avoids thousands of duplicate points)
        const dx = world.x - last.x;
        const dy = world.y - last.y;
        if (dx * dx + dy * dy >= 4) {
          this._brushPoints.push({ x: world.x, y: world.y });
          this._renderer.requestRedraw();
        }
      } else if (this._isPanning) {
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
      if (this._patternStrokeActive) {
        this._patternStrokeActive = false;
        if (this._patternStrokeCmds.length > 0) {
          const batch = new BatchCommand(this._patternStrokeCmds);
          this._history.record(batch);
          this.pushEvent('pattern_stroke_placed', { count: this._patternStrokeCmds.length });
        }
        this._patternStrokeCmds = [];
        canvas.style.cursor = '';
        this._renderer.requestRedraw();
        return;
      }

      if (this._brushActive && this._toolMode === 'brush') {
        this._brushActive = false;
        const points = this._brushPoints;
        this._brushPoints = [];

        if (points.length > 0) {
          // Compute bounding box (points are in world space)
          let minX = points[0].x, minY = points[0].y;
          let maxX = points[0].x, maxY = points[0].y;
          for (const p of points) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
          }
          const pad = this._brushSize / 2;
          const ox = minX - pad;
          const oy = minY - pad;

          // Convert points to local (relative to bounding-box origin)
          const localPoints: BrushPoint[] = points.map((p) => ({ x: p.x - ox, y: p.y - oy }));

          const cmd = new BrushStrokeCommand(this._layers, 'terrain', {
            x: ox,
            y: oy,
            width: maxX - minX + pad * 2,
            height: maxY - minY + pad * 2,
            color: this._brushColor,
            opacity: this._brushOpacity,
            size: this._brushSize,
            hardness: this._brushHardness,
            points: localPoints,
          });
          this._history.execute(cmd);
        }

        canvas.style.cursor = '';
        this._renderer.requestRedraw();
        return;
      }

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
      if (this._toolMode === 'pan') {
        canvas.style.cursor = 'grab';
      }
    });

    canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const currentZoom = viewport().getZoom();
      const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(10, currentZoom * zoomDelta));
      viewport().zoomTo(newZoom, e.offsetX, e.offsetY);
      this._renderer.requestRedraw();
      this.pushEvent('zoom_changed', { zoom: viewport().getZoom() });
    }, { passive: false });

    // Double-click: finish path or region
    canvas.addEventListener('dblclick', (e: MouseEvent) => {
      if (this._toolMode === 'region' && this._regionInProgress && this._regionVertices.length >= 3) {
        e.preventDefault();
        e.stopPropagation();

        const centroid = computeCentroid(this._regionVertices);

        const regionObj: Omit<MapObject, 'id'> = {
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
            vertices: [...this._regionVertices],
            fillStyle: this._regionFillStyle,
            fillColor: this._regionFillColor,
            strokeColor: '#1a1a1a',
            strokeWidth: 2,
          },
        };

        const targetLayer = this._layers.getLayers().find((l: { type: string }) => l.type === 'features')
          ?? this._layers.getLayers()[0];
        if (targetLayer) {
          const cmd = new AddObjectCommand(this._layers, targetLayer.id, regionObj);
          this._history.execute(cmd);

          // Get the added object's id for the lore link
          const addedObjs = targetLayer.objects;
          const addedObj = addedObjs[addedObjs.length - 1];
          const objectId = addedObj?.id ?? '';

          this.pushEvent('region_placed', {
            fill_style: this._regionFillStyle,
            vertex_count: this._regionVertices.length,
            object_id: objectId,
          });
        }

        this._regionVertices = [];
        this._regionInProgress = false;
        this._renderer.requestRedraw();
        return;
      }

      if (this._toolMode === 'path' && this._pathInProgress && this._pathWaypoints.length >= 2) {
        e.preventDefault();
        e.stopPropagation();

        const PATH_STYLES: Record<string, { color: string; width: number }> = {
          road: { color: '#8B6914', width: 3 },
          river: { color: '#3a7bc4', width: 4 },
          border: { color: '#6b2929', width: 2 },
          mountain_pass: { color: '#5a5a5a', width: 2 },
        };
        const style = PATH_STYLES[this._pathStyle] ?? PATH_STYLES.road;

        const pathObj: Omit<MapObject, 'id'> = {
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
            waypoints: [...this._pathWaypoints],
            pathStyle: this._pathStyle,
            pathWidth: style.width,
            pathColor: style.color,
          },
        };

        const targetLayer = this._layers.getLayers().find((l: { type: string }) => l.type === 'features')
          ?? this._layers.getLayers()[0];
        if (targetLayer) {
          const cmd = new AddObjectCommand(this._layers, targetLayer.id, pathObj);
          this._history.execute(cmd);
          this.pushEvent('path_placed', {
            style: this._pathStyle,
            waypoint_count: this._pathWaypoints.length,
          });
        }

        this._pathWaypoints = [];
        this._pathInProgress = false;
        this._renderer.requestRedraw();
      }
    });

    // Prevent context menu on middle click
    canvas.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
    });

    // Tool shortcut map
    const toolShortcuts: Record<string, ToolMode> = {
      v: 'select', h: 'pan', s: 'stamp', p: 'pattern', l: 'path', b: 'brush', t: 'text', g: 'region',
    };
    const toolLabels: Record<string, string> = {
      select: 'Select', pan: 'Pan', stamp: 'Stamp', pattern: 'Pattern',
      path: 'Path', brush: 'Brush', text: 'Text', region: 'Region',
    };

    const isInputFocused = () => {
      const tag = document.activeElement?.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };

    const setToolFromJS = (tool: ToolMode) => {
      this._toolMode = tool;
      this._selectedObject = null;
      this.pushEvent('set_tool', { tool });
      this._renderer.requestRedraw();
      // Update radial wheel label
      const labelEl = document.querySelector('.tool-wheel__label');
      if (labelEl) labelEl.textContent = toolLabels[tool] || 'Select';
      // Update cursor for pan tool
      canvas.style.cursor = tool === 'pan' ? 'grab' : '';
    };

    // Keyboard shortcuts
    const keyHandler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;

      // Undo/Redo
      if (mod && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          this._history.redo();
        } else {
          this._history.undo();
        }
        this._renderer.requestRedraw();
        return;
      }
      if (mod && e.key === 'y') {
        e.preventDefault();
        this._history.redo();
        this._renderer.requestRedraw();
        return;
      }

      // Zoom shortcuts
      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const newZoom = Math.min(10, viewport().getZoom() * 1.2);
        viewport().zoomTo(newZoom, cx, cy);
        this._renderer.requestRedraw();
        this.pushEvent('zoom_changed', { zoom: viewport().getZoom() });
        return;
      }
      if (mod && e.key === '-') {
        e.preventDefault();
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const newZoom = Math.max(0.1, viewport().getZoom() * 0.8);
        viewport().zoomTo(newZoom, cx, cy);
        this._renderer.requestRedraw();
        this.pushEvent('zoom_changed', { zoom: viewport().getZoom() });
        return;
      }
      if (mod && e.key === '0') {
        e.preventDefault();
        viewport().zoomTo(1, canvas.width / 2, canvas.height / 2);
        viewport().pan(-viewport().panX, -viewport().panY);
        this._renderer.requestRedraw();
        this.pushEvent('zoom_changed', { zoom: 1 });
        return;
      }

      // Skip tool shortcuts if typing in an input
      if (isInputFocused()) return;

      // Space bar pan (Figma-style)
      if (e.key === ' ' && !this._spaceHeld) {
        e.preventDefault();
        this._spaceHeld = true;
        this._previousTool = this._toolMode;
        this._toolMode = 'pan' as ToolMode;
        canvas.style.cursor = 'grab';
        return;
      }

      // Escape: cancel in-progress region or path, or deselect
      if (e.key === 'Escape') {
        if (this._regionInProgress) {
          this._regionVertices = [];
          this._regionInProgress = false;
          this._renderer.requestRedraw();
          return;
        }
        if (this._pathInProgress) {
          this._pathWaypoints = [];
          this._pathInProgress = false;
          this._renderer.requestRedraw();
          return;
        }
        this._selectedObject = null;
        this._isDragging = false;
        setToolFromJS('select');
        return;
      }

      // Delete = remove selected stamp
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this._selectedObject) {
          const layerId = this._findLayerForObject(this._selectedObject.id);
          if (layerId) {
            const cmd = new RemoveObjectCommand(this._layers, layerId, this._selectedObject.id);
            this._history.execute(cmd);
            this._selectedObject = null;
            this._renderer.requestRedraw();
          }
        }
        return;
      }

      // Tool shortcuts (single key, no modifiers)
      if (!mod && !e.shiftKey && !e.altKey) {
        const tool = toolShortcuts[e.key.toLowerCase()];
        if (tool) {
          e.preventDefault();
          setToolFromJS(tool);
        }
      }
    };
    window.addEventListener('keydown', keyHandler);
    this._keyHandler = keyHandler;

    // Space bar release → restore previous tool
    const keyUpHandler = (e: KeyboardEvent) => {
      if (e.key === ' ' && this._spaceHeld) {
        this._spaceHeld = false;
        const prev = this._previousTool || 'select';
        this._toolMode = prev as ToolMode;
        this._previousTool = null;
        canvas.style.cursor = prev === 'pan' ? 'grab' : '';
        this._renderer.requestRedraw();
      }
    };
    window.addEventListener('keyup', keyUpHandler);
    this._keyUpHandler = keyUpHandler;

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

    this.handleEvent('brush_options_changed', (data: {
      color?: string; size?: number; opacity?: number; hardness?: number;
    }) => {
      if (data.color !== undefined) this._brushColor = data.color;
      if (data.size !== undefined) this._brushSize = data.size;
      if (data.opacity !== undefined) this._brushOpacity = data.opacity;
      if (data.hardness !== undefined) this._brushHardness = data.hardness;
    });

    this.handleEvent('set_path_style', (data: { style: string }) => {
      this._pathStyle = data.style as PathStyle;
    });

    this.handleEvent('set_region_fill_style', (data: { style: string }) => {
      this._regionFillStyle = data.style as RegionFillStyle;
    });

    this.handleEvent('set_region_fill_color', (data: { color: string }) => {
      this._regionFillColor = data.color;
    });

    this.handleEvent('light_angle_changed', (data: { angle: number }) => {
      this._mapState = { ...this._mapState, lightAngle: data.angle };
      this._renderer.requestRedraw();
    });

    this.handleEvent('locations_updated', (_data: any) => {
      // Placeholder for future location sync
      this._renderer.requestRedraw();
    });

    // When server creates a LoreEntry for a stamp/region, update the MapObject's loreId
    this.handleEvent('lore_entry_created', (data: { stamp_id?: string; object_id?: string; lore_id: string }) => {
      const targetId = data.object_id || data.stamp_id;
      if (!targetId) return;
      for (const layer of this._layers.getLayers()) {
        const obj = layer.objects.find((o: MapObject) => o.id === targetId);
        if (obj) {
          this._layers.updateObject(layer.id, targetId, { loreId: data.lore_id });
          if (this._selectedObject?.id === targetId) {
            this._selectedObject = { ...this._selectedObject, loreId: data.lore_id };
          }
          break;
        }
      }
    });

    // Fly-to: animate viewport to center on a specific map object
    this.handleEvent('fly_to_object', (data: { object_id: string }) => {
      let target: MapObject | null = null;
      for (const layer of this._layers.getLayers()) {
        const obj = layer.objects.find((o: MapObject) => o.id === data.object_id);
        if (obj) {
          target = obj;
          break;
        }
      }
      if (!target) return;

      const vp = viewport();
      const zoom = vp.getZoom();
      const startPan = vp.getPan();

      const objCenterX = target.x + target.width / 2;
      const objCenterY = target.y + target.height / 2;
      const targetPanX = canvas.width / 2 - objCenterX * zoom;
      const targetPanY = canvas.height / 2 - objCenterY * zoom;

      const startTime = performance.now();
      const duration = 300;

      const animateFly = (now: number) => {
        const t = Math.min((now - startTime) / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic

        const currentPan = vp.getPan();
        const nextX = startPan.x + (targetPanX - startPan.x) * ease;
        const nextY = startPan.y + (targetPanY - startPan.y) * ease;
        vp.pan(nextX - currentPan.x, nextY - currentPan.y);

        this._renderer.requestRedraw();

        if (t < 1) {
          requestAnimationFrame(animateFly);
        } else {
          this._selectedObject = target;
          this._renderer.requestRedraw();
        }
      };

      requestAnimationFrame(animateFly);
    });

    // Export: render map off-screen and trigger PNG download
    this.handleEvent('export_map', async (data: { width?: number; height?: number }) => {
      const width = data.width ?? 2048;
      const height = data.height ?? 2048;
      const mapState = this._mapState ?? { lightAngle: 0 };
      const layers = this._layers.getLayers();
      this.pushEvent('export_started', {});
      try {
        const bytes = await this._renderer.exportToPNG(width, height, layers, mapState.lightAngle);
        if (!bytes) {
          this.pushEvent('export_failed', { reason: 'renderer not ready' });
          return;
        }
        const blob = new Blob([bytes], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // Filename includes resolution label
        const resLabel = width >= 8192 ? '8k' : width >= 4096 ? '4k' : '2k';
        a.download = `parchment-map-${resLabel}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.pushEvent('export_complete', {});
      } catch (err) {
        this.pushEvent('export_failed', { reason: String(err) });
      }
    });

    // Radial tool wheel interaction (pure JS, no LiveView round-trip for open/close)
    const wheelEl = container.parentElement?.querySelector('#tool-wheel');
    if (wheelEl) {
      wheelEl.addEventListener('mouseenter', () => wheelEl.classList.add('tool-wheel--open'));
      wheelEl.addEventListener('mouseleave', () => wheelEl.classList.remove('tool-wheel--open'));
      wheelEl.querySelectorAll('.tool-wheel__item').forEach((item) => {
        item.addEventListener('click', () => wheelEl.classList.remove('tool-wheel--open'));
      });
    }
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
    if (this._keyUpHandler) {
      window.removeEventListener('keyup', this._keyUpHandler);
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

  // Helper: place a single pattern stamp with randomization
  _placePatternStamp(this: Record<string, any>, worldX: number, worldY: number): void {
    const asset = this._activeStampAsset;
    if (!asset) return;

    const ts = Date.now();
    const jitter = () => (Math.random() - 0.5) * 40;
    const rotation = Math.random() * Math.PI * 2;
    const scale = 0.85 + Math.random() * 0.30;

    const stampLayers: StampLayer[] = asset.layers.map((layer: any, i: number) => ({
      id: `${layer.id ?? 'layer'}-${ts}-${i}`,
      type: (layer.type ?? 'base') as StampLayerType,
      blendMode: (layer.blendMode ?? layer.blend_mode ?? 'normal') as BlendMode,
      opacity: layer.opacity ?? 1,
      visible: layer.visible ?? true,
      frames: layer.frames ?? (layer.url ? [layer.url] : []),
      fps: layer.fps ?? 0,
      keyed_to: layer.keyed_to,
    }));

    const size = 64;
    const obj: Omit<MapObject, 'id'> = {
      type: 'stamp',
      x: worldX + jitter() - size / 2,
      y: worldY + jitter() - size / 2,
      width: size,
      height: size,
      rotation,
      scale,
      opacity: 1,
      stampLayers,
      data: {
        assetName: asset.name,
        assetCategory: asset.category,
        isPatternStamp: true,
      },
    };

    const targetLayer = this._layers.getLayers().find((l: { type: string }) => l.type === 'features')
      ?? this._layers.getLayers()[0];
    if (!targetLayer) return;

    const cmd = new AddObjectCommand(this._layers, targetLayer.id, obj);
    cmd.execute();
    this._patternStrokeCmds.push(cmd);
  },
};
