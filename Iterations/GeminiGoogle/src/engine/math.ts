export function distSq(x1: number, y1: number, x2: number, y2: number) {
  return (x1 - x2) ** 2 + (y1 - y2) ** 2;
}
export function dist(x1: number, y1: number, x2: number, y2: number) {
  return Math.sqrt(distSq(x1, y1, x2, y2));
}
export function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}
export function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
export function randInt(min: number, max: number) {
  return Math.floor(rand(min, max));
}
export function normalize(x: number, y: number) {
  const d = dist(0, 0, x, y);
  if (d === 0) return { x: 0, y: 0 };
  return { x: x / d, y: y / d };
}
