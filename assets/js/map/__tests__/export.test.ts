import { describe, it, expect, vi } from 'vitest';
import { MapRenderer } from '../renderer';

describe('exportToPNG', () => {
  it('returns null when CanvasKit is not initialized', async () => {
    const renderer = new MapRenderer();
    // No init() called — ck and surface are null
    const result = await renderer.exportToPNG(2048, 2048, [], 0);
    expect(result).toBeNull();
  });

  it('creates surface and returns PNG bytes when CanvasKit is loaded', async () => {
    const renderer = new MapRenderer();

    // Build mock CanvasKit + surface chain
    const mockSnapshot = {
      encodeToBytes: vi.fn(() => new Uint8Array([137, 80, 78, 71])), // PNG magic bytes
      delete: vi.fn(),
    };

    const mockCanvas = {
      clear: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      drawRect: vi.fn(),
      drawText: vi.fn(),
      drawPath: vi.fn(),
      drawImageRect: vi.fn(),
    };

    const mockExportSurface = {
      getCanvas: vi.fn(() => mockCanvas),
      flush: vi.fn(),
      makeImageSnapshot: vi.fn(() => mockSnapshot),
      delete: vi.fn(),
    };

    const mockLiveSurface = {
      width: vi.fn(() => 800),
      height: vi.fn(() => 600),
      getCanvas: vi.fn(() => mockCanvas),
      flush: vi.fn(),
    };

    const mockCk = {
      MakeSurface: vi.fn(() => mockExportSurface),
      Color4f: vi.fn(() => [0.95, 0.93, 0.9, 1.0]),
      Color: vi.fn(() => 0),
      LTRBRect: vi.fn(() => ({})),
      PaintStyle: { Fill: 0, Stroke: 1 },
      BlendMode: { SrcOver: 0, Multiply: 1, Screen: 2, Overlay: 3, Darken: 4, Lighten: 5 },
      StrokeCap: { Round: 0 },
      StrokeJoin: { Round: 0 },
      BlurStyle: { Normal: 0 },
      Paint: vi.fn(() => ({
        setAntiAlias: vi.fn(),
        setColor: vi.fn(),
        setStyle: vi.fn(),
        setAlphaf: vi.fn(),
        setBlendMode: vi.fn(),
        setStrokeWidth: vi.fn(),
        setStrokeCap: vi.fn(),
        setStrokeJoin: vi.fn(),
        setMaskFilter: vi.fn(),
        delete: vi.fn(),
      })),
      Font: vi.fn(() => ({ delete: vi.fn() })),
      Path: vi.fn(() => ({
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        cubicTo: vi.fn(),
        delete: vi.fn(),
      })),
      MaskFilter: { MakeBlur: vi.fn(() => ({ delete: vi.fn() })) },
      ImageFormat: { PNG: 0 },
    };

    // Inject mock CanvasKit internals via private fields
    (renderer as any).ck = mockCk;
    (renderer as any).surface = mockLiveSurface;

    const layers = [
      {
        id: 'features',
        name: 'Features',
        type: 'features',
        visible: true,
        locked: false,
        opacity: 1.0,
        zIndex: 3,
        objects: [],
      },
    ];

    const result = await renderer.exportToPNG(2048, 2048, layers, 0);

    expect(result).not.toBeNull();
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result!.length).toBeGreaterThan(0);
    expect(mockCk.MakeSurface).toHaveBeenCalledWith(2048, 2048);
    expect(mockExportSurface.makeImageSnapshot).toHaveBeenCalled();
    expect(mockSnapshot.encodeToBytes).toHaveBeenCalled();
    expect(mockExportSurface.delete).toHaveBeenCalled();
    expect(mockSnapshot.delete).toHaveBeenCalled();
  });

  it('returns null when off-screen surface creation fails', async () => {
    const renderer = new MapRenderer();

    const mockCk = {
      MakeSurface: vi.fn(() => null), // Surface creation fails
      Color4f: vi.fn(),
    };

    const mockLiveSurface = {
      width: vi.fn(() => 800),
      height: vi.fn(() => 600),
    };

    (renderer as any).ck = mockCk;
    (renderer as any).surface = mockLiveSurface;

    const result = await renderer.exportToPNG(2048, 2048, [], 0);
    expect(result).toBeNull();
  });
});
