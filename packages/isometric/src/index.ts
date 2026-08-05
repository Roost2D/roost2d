export interface GridPoint { x: number; y: number; }
export interface ScreenPoint { x: number; y: number; }
export interface GridBounds { minX: number; minY: number; width: number; height: number; }
export interface IsometricProjection { tileWidth: number; tileHeight: number; origin?: ScreenPoint; }
export type TileAnchor = 'center' | 'top' | 'bottom' | 'left' | 'right';

export function gridToScreen(point: GridPoint, projection: IsometricProjection, anchor: TileAnchor = 'center'): ScreenPoint {
  validateProjection(projection); const origin = projection.origin ?? { x: 0, y: 0 };
  const base = { x: origin.x + (point.x - point.y) * projection.tileWidth / 2, y: origin.y + (point.x + point.y) * projection.tileHeight / 2 };
  const offset = anchorOffset(anchor, projection); return { x: base.x + offset.x, y: base.y + offset.y };
}
export function screenToGrid(point: ScreenPoint, projection: IsometricProjection): GridPoint {
  validateProjection(projection); const origin = projection.origin ?? { x: 0, y: 0 }; const x = point.x - origin.x; const y = point.y - origin.y;
  return { x: (x / (projection.tileWidth / 2) + y / (projection.tileHeight / 2)) / 2, y: (y / (projection.tileHeight / 2) - x / (projection.tileWidth / 2)) / 2 };
}
export function screenToCell(point: ScreenPoint, projection: IsometricProjection): GridPoint { const grid = screenToGrid(point, projection); return { x: Math.floor(grid.x), y: Math.floor(grid.y) }; }
export function isInsideGrid(point: GridPoint, bounds: GridBounds): boolean { return point.x >= bounds.minX && point.y >= bounds.minY && point.x < bounds.minX + bounds.width && point.y < bounds.minY + bounds.height; }
export function clampToGrid(point: GridPoint, bounds: GridBounds): GridPoint { return { x: Math.max(bounds.minX, Math.min(bounds.minX + bounds.width - 1, point.x)), y: Math.max(bounds.minY, Math.min(bounds.minY + bounds.height - 1, point.y)) }; }
export function depthFor(point: GridPoint, elevation = 0, bias = 0): number { return (point.x + point.y) * 10_000 + elevation * 100 + bias; }
export function subTilePosition(cell: GridPoint, u: number, v: number): GridPoint { return { x: cell.x + Math.max(0, Math.min(1, u)), y: cell.y + Math.max(0, Math.min(1, v)) }; }

export function tileDiamond(cell: GridPoint, projection: IsometricProjection): [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint] {
  const center = gridToScreen(cell, projection); const halfWidth = projection.tileWidth / 2; const halfHeight = projection.tileHeight / 2;
  return [{ x: center.x, y: center.y - halfHeight }, { x: center.x + halfWidth, y: center.y }, { x: center.x, y: center.y + halfHeight }, { x: center.x - halfWidth, y: center.y }];
}

/** Returns the top-most candidate using a game-provided depth/elevation callback. */
export function pickTile(point: ScreenPoint, projection: IsometricProjection, bounds: GridBounds, elevation: (cell: GridPoint) => number = () => 0): GridPoint | undefined {
  const estimate = screenToCell(point, projection); const candidates: GridPoint[] = [];
  for (let y = estimate.y - 1; y <= estimate.y + 1; y += 1) for (let x = estimate.x - 1; x <= estimate.x + 1; x += 1) if (isInsideGrid({ x, y }, bounds)) candidates.push({ x, y });
  return candidates.filter((cell) => pointInDiamond(point, tileDiamond(cell, projection))).sort((a, b) => depthFor(b, elevation(b)) - depthFor(a, elevation(a)))[0];
}

export function worldBounds(bounds: GridBounds, projection: IsometricProjection): { x: number; y: number; width: number; height: number } {
  const corners = [gridToScreen({ x: bounds.minX, y: bounds.minY }, projection), gridToScreen({ x: bounds.minX + bounds.width, y: bounds.minY }, projection), gridToScreen({ x: bounds.minX, y: bounds.minY + bounds.height }, projection), gridToScreen({ x: bounds.minX + bounds.width, y: bounds.minY + bounds.height }, projection)];
  const xs = corners.map(({ x }) => x); const ys = corners.map(({ y }) => y); const halfWidth = projection.tileWidth / 2; const halfHeight = projection.tileHeight / 2;
  return { x: Math.min(...xs) - halfWidth, y: Math.min(...ys) - halfHeight, width: Math.max(...xs) - Math.min(...xs) + projection.tileWidth, height: Math.max(...ys) - Math.min(...ys) + projection.tileHeight };
}

function validateProjection(projection: IsometricProjection): void { if (!(projection.tileWidth > 0 && projection.tileHeight > 0)) throw new Error('Tile dimensions must be positive'); }
function anchorOffset(anchor: TileAnchor, projection: IsometricProjection): ScreenPoint { if (anchor === 'top') return { x: 0, y: -projection.tileHeight / 2 }; if (anchor === 'bottom') return { x: 0, y: projection.tileHeight / 2 }; if (anchor === 'left') return { x: -projection.tileWidth / 2, y: 0 }; if (anchor === 'right') return { x: projection.tileWidth / 2, y: 0 }; return { x: 0, y: 0 }; }
function pointInDiamond(point: ScreenPoint, diamond: [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint]): boolean { const centerX = (diamond[1].x + diamond[3].x) / 2; const centerY = (diamond[0].y + diamond[2].y) / 2; const halfWidth = (diamond[1].x - diamond[3].x) / 2; const halfHeight = (diamond[2].y - diamond[0].y) / 2; return Math.abs(point.x - centerX) / halfWidth + Math.abs(point.y - centerY) / halfHeight <= 1; }
