export class SpatialHash<T extends { x: number; y: number; id: string }> {
  cellSize: number;
  grid: Map<string, T[]>;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
    this.grid = new Map();
  }

  clear() {
    this.grid.clear();
  }

  insert(obj: T) {
    const key = this.getKey(obj.x, obj.y);
    let cell = this.grid.get(key);
    if (!cell) {
      cell = [];
      this.grid.set(key, cell);
    }
    cell.push(obj);
  }

  getKey(x: number, y: number) {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }

  query(x: number, y: number, radius: number, excludeId?: string): T[] {
    const result: T[] = [];
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);
    const rSq = radius * radius;

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const cell = this.grid.get(`${cx},${cy}`);
        if (cell) {
          for (const obj of cell) {
            if (obj.id !== excludeId && (obj.x - x) ** 2 + (obj.y - y) ** 2 <= rSq) {
              result.push(obj);
            }
          }
        }
      }
    }
    return result;
  }
}
