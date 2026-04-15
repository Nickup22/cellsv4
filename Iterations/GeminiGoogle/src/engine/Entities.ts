import { rand } from './math';

export class Plant {
  id: string;
  x: number;
  y: number;
  energy: number;

  constructor(id: string, x: number, y: number, energy: number) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.energy = energy;
  }
}

export class Meat {
  id: string;
  x: number;
  y: number;
  energy: number;
  createdAt: number;

  constructor(id: string, x: number, y: number, energy: number, now: number) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.energy = energy;
    this.createdAt = now;
  }
}

export class Obstacle {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;

  constructor(id: string, x1: number, y1: number, x2: number, y2: number) {
    this.id = id;
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
  }
}
