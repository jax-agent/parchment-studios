/**
 * Ray-casting point-in-polygon test.
 * Returns true if the point (px, py) is inside the polygon defined by verts.
 */
export function pointInPolygon(
  px: number,
  py: number,
  verts: { x: number; y: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i].x, yi = verts[i].y;
    const xj = verts[j].x, yj = verts[j].y;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Compute the centroid (average) of polygon vertices.
 */
export function computeCentroid(verts: { x: number; y: number }[]): { x: number; y: number } {
  let sx = 0, sy = 0;
  for (const v of verts) {
    sx += v.x;
    sy += v.y;
  }
  return { x: sx / verts.length, y: sy / verts.length };
}
