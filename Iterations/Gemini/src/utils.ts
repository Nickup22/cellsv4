export class Vec2 {
    constructor(public x: number, public y: number) {}

    add(v: Vec2) { return new Vec2(this.x + v.x, this.y + v.y); }
    sub(v: Vec2) { return new Vec2(this.x - v.x, this.y - v.y); }
    mul(s: number) { return new Vec2(this.x * s, this.y * s); }
    div(s: number) { return new Vec2(this.x / s, this.y / s); }
    magSq() { return this.x * this.x + this.y * this.y; }
    mag() { return Math.sqrt(this.magSq()); }
    normalize() {
        const m = this.mag();
        return m === 0 ? new Vec2(0, 0) : new Vec2(this.x / m, this.y / m);
    }
    distSq(v: Vec2) { return Math.pow(this.x - v.x, 2) + Math.pow(this.y - v.y, 2); }
    dist(v: Vec2) { return Math.sqrt(this.distSq(v)); }
    dot(v: Vec2) { return this.x * v.x + this.y * v.y; }
    clone() { return new Vec2(this.x, this.y); }
    set(x: number, y: number) { this.x = x; this.y = y; return this; }
    copy(v: Vec2) { this.x = v.x; this.y = v.y; return this; }
}

export function randomRange(min: number, max: number) {
    return Math.random() * (max - min) + min;
}

export function randomInt(min: number, max: number) {
    return Math.floor(randomRange(min, max + 1));
}

export function clamp(val: number, min: number, max: number) {
    return Math.max(min, Math.min(max, val));
}

// Line segment distance (for obstacles)
export function distToSegmentSq(p: Vec2, v: Vec2, w: Vec2) {
    const l2 = v.distSq(w);
    if (l2 === 0) return p.distSq(v);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const proj = new Vec2(v.x + t * (w.x - v.x), v.y + t * (w.y - v.y));
    return p.distSq(proj);
}

export function closestPointOnSegment(p: Vec2, v: Vec2, w: Vec2) {
    const l2 = v.distSq(w);
    if (l2 === 0) return v.clone();
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return new Vec2(v.x + t * (w.x - v.x), v.y + t * (w.y - v.y));
}