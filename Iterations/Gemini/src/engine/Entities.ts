import { Vec2, clamp, randomInt, distToSegmentSq, closestPointOnSegment } from './utils';

export type Genome = [number, number, number, number, number, number]; // R, G, B, cR, cG, cB (0-255)

let NEXT_ID = 1;

export class Plant {
    id = NEXT_ID++;
    pos: Vec2;
    energy: number = 30;
    radius = 3;
    constructor(x: number, y: number) {
        this.pos = new Vec2(x, y);
    }
}

export class Meat {
    id = NEXT_ID++;
    pos: Vec2;
    energy: number;
    radius: number;
    lifetime: number;
    maxLifetime: number;
    constructor(x: number, y: number, energy: number) {
        this.pos = new Vec2(x, y);
        this.energy = energy;
        this.radius = clamp(Math.sqrt(energy) / 2, 2, 8);
        this.lifetime = 180; // seconds
        this.maxLifetime = this.lifetime;
    }
}

export class Particle {
    pos: Vec2;
    vel: Vec2;
    life: number;
    maxLife: number;
    color: string;
    constructor(x: number, y: number, vx: number, vy: number, life: number, color: string) {
        this.pos = new Vec2(x, y);
        this.vel = new Vec2(vx, vy);
        this.life = life;
        this.maxLife = life;
        this.color = color;
    }
}

export class Obstacle {
    id = NEXT_ID++;
    constructor(public start: Vec2, public end: Vec2) {}
}

export enum Task { WANDER, DANCE, EAT, HUNT, FLEE, FOLLOW_LEADER }

export class Cell {
    id = NEXT_ID++;
    pos: Vec2;
    vel: Vec2 = new Vec2(0, 0);
    acc: Vec2 = new Vec2(0, 0);
    
    genome: Genome;
    parentId: number | null = null;
    childrenIds: Set<number> = new Set();
    
    // Stats
    maxHp: number = 100;
    hp: number = 100;
    hardDamage: number = 0; // reduces effective max hp
    energy: number;
    maxEnergy: number = 500;
    
    radius: number = 6;
    mass: number;
    maxSpeed: number;
    
    // Attack
    cooldownTimer: number = 0;
    combatTimer: number = 0; // recently in combat
    attackDmg: number;
    attackCD: number;
    knockback: number;
    critChance: number;
    armor: number; // 0.0 to ~0.8
    
    regenRate: number;
    energyDrain: number;
    
    // Diet history (for regen nerf)
    meatEaten: number = 0;
    plantEaten: number = 0;

    // AI State
    task: Task = Task.WANDER;
    targetId: number | null = null;
    targetPos: Vec2 | null = null;
    leaderId: number | null = null;

    // Anim
    dancePhase: number = 0;
    heartbeatTime: number = 0;
    
    constructor(x: number, y: number, genome: Genome, energy: number) {
        this.pos = new Vec2(x, y);
        this.genome = [...genome] as Genome;
        this.energy = energy;
        
        const [r, g, b, cr, cg, cb] = this.genome;
        
        // Physical Stats Calculation
        // Red: Str/Damage/CD/Crit/Knockback
        this.attackDmg = 5 + (r / 255) * 25; // 5 to 30
        this.attackCD = 0.5 + (r / 255) * 2.0; // 0.5s to 2.5s
        this.critChance = (r / 255) * 0.4; // 0% to 40%
        this.knockback = 50 + (r / 255) * 100;
        
        // Blue: Armor/Mass/Speed
        this.armor = (b / 255) * 0.7; // up to 70% damage reduction
        this.mass = 1.0 + (b / 255) * 3.0; // 1 to 4
        this.maxSpeed = 80 - (b / 255) * 40; // 40 to 80
        
        // Green: Regen/EnergyDrain
        this.regenRate = (g / 255) * 10; // HP per sec
        this.energyDrain = 1 + (g / 255) * 4; // base drain + regen drain factor
    }
    
    applyForce(force: Vec2) {
        this.acc = this.acc.add(force.div(this.mass));
    }
    
    heal(amount: number) {
        const effectiveMax = this.maxHp - this.hardDamage;
        if (this.hp < effectiveMax) {
            this.hp = Math.min(effectiveMax, this.hp + amount);
        } else if (this.hardDamage > 0) {
            // Healing hard damage costs 10x energy, happens automatically if full normal HP
            // This is handled in the update loop via regen.
        }
    }
    
    takeDamage(dmg: number, isCrit: boolean, attacker: Cell) {
        let actualDmg = dmg * (1 - this.armor);
        if (isCrit) actualDmg *= 2.5;
        
        this.hp -= actualDmg;
        this.combatTimer = 5.0; // 5 seconds of combat state
        
        if (isCrit) {
            this.hardDamage += actualDmg * 0.5; // Half of crit damage becomes hard damage
            if (this.hardDamage > this.maxHp * 0.9) this.hardDamage = this.maxHp * 0.9;
        }
        
        // Revenge AI trigger
        if (this.task !== Task.FLEE && this.task !== Task.HUNT) {
            const [,, , cr, ,] = this.genome;
            // High Aggro (cR) = fight back, low = flee if low HP
            if (this.hp < this.maxHp * 0.4 && (cr / 255) < 0.5) {
                this.task = Task.FLEE;
                this.targetId = attacker.id;
            } else {
                this.task = Task.HUNT;
                this.targetId = attacker.id;
            }
        }
    }
}