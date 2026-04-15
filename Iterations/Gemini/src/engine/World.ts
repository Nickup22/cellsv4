import { Cell, Plant, Meat, Particle, Obstacle, Genome, Task } from './Entities';
import { Vec2, randomRange, randomInt, clamp, distToSegmentSq, closestPointOnSegment } from './utils';

const CELL_VISION = 200;
const HASH_SIZE = 150;

export class SpatialHash<T extends { id: number, pos: Vec2 }> {
    grid: Map<string, T[]> = new Map();
    
    _hash(v: Vec2) {
        return `${Math.floor(v.x / HASH_SIZE)},${Math.floor(v.y / HASH_SIZE)}`;
    }
    
    clear() { this.grid.clear(); }
    
    insert(entity: T) {
        const h = this._hash(entity.pos);
        if (!this.grid.has(h)) this.grid.set(h, []);
        this.grid.get(h)!.push(entity);
    }
    
    query(pos: Vec2, radius: number): T[] {
        const results: T[] = [];
        const minX = Math.floor((pos.x - radius) / HASH_SIZE);
        const maxX = Math.floor((pos.x + radius) / HASH_SIZE);
        const minY = Math.floor((pos.y - radius) / HASH_SIZE);
        const maxY = Math.floor((pos.y + radius) / HASH_SIZE);
        
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                const arr = this.grid.get(`${x},${y}`);
                if (arr) results.push(...arr);
            }
        }
        return results;
    }
}

export class World {
    cells: Map<number, Cell> = new Map();
    plants: Map<number, Plant> = new Map();
    meats: Map<number, Meat> = new Map();
    particles: Particle[] = [];
    obstacles: Obstacle[] = [];
    
    cellHash = new SpatialHash<Cell>();
    plantHash = new SpatialHash<Plant>();
    meatHash = new SpatialHash<Meat>();
    
    bounds = { w: 4000, h: 4000 };
    
    // Stats tracking
    stats = {
        population: 0,
        avgR: 0, avgG: 0, avgB: 0,
        history: [] as any[]
    };
    
    constructor() {
        // Init bounds
        this.obstacles.push(new Obstacle(new Vec2(0,0), new Vec2(this.bounds.w, 0)));
        this.obstacles.push(new Obstacle(new Vec2(this.bounds.w,0), new Vec2(this.bounds.w, this.bounds.h)));
        this.obstacles.push(new Obstacle(new Vec2(this.bounds.w,this.bounds.h), new Vec2(0, this.bounds.h)));
        this.obstacles.push(new Obstacle(new Vec2(0,this.bounds.h), new Vec2(0, 0)));
    }
    
    addCell(x: number, y: number, genome?: Genome) {
        const g: Genome = genome || [
            randomInt(0, 255), randomInt(0, 255), randomInt(0, 255),
            randomInt(0, 255), randomInt(0, 255), randomInt(0, 255)
        ];
        const cell = new Cell(x, y, g, 200);
        this.cells.set(cell.id, cell);
        return cell;
    }
    
    spawnPlant() {
        const x = randomRange(100, this.bounds.w - 100);
        const y = randomRange(100, this.bounds.h - 100);
        const p = new Plant(x, y);
        this.plants.set(p.id, p);
    }
    
    addMeat(x: number, y: number, energy: number) {
        if (energy <= 0) return;
        const m = new Meat(x, y, energy);
        this.meats.set(m.id, m);
    }
    
    addParticle(x: number, y: number, vx: number, vy: number, life: number, color: string) {
        this.particles.push(new Particle(x, y, vx, vy, life, color));
    }
    
    update(dt: number) {
        if (dt > 0.1) dt = 0.1; // Cap delta
        
        // Rebuild hashes
        this.cellHash.clear();
        this.plantHash.clear();
        this.meatHash.clear();
        for (const c of this.cells.values()) this.cellHash.insert(c);
        for (const p of this.plants.values()) this.plantHash.insert(p);
        for (const m of this.meats.values()) this.meatHash.insert(m);
        
        // Update Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.pos = p.pos.add(p.vel.mul(dt));
            p.life -= dt;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
        
        // Update Meats
        for (const m of this.meats.values()) {
            m.lifetime -= dt;
            if (m.lifetime <= 0) this.meats.delete(m.id);
        }
        
        // Plant spawning
        if (Math.random() < 0.1 * dt * (2000 - this.plants.size) / 200) { // Limit to ~2000 plants max
            this.spawnPlant();
        }

        const deadCells: number[] = [];
        const newCells: Cell[] = [];

        // Stats tracking
        let sumR = 0, sumG = 0, sumB = 0;

        // Update Cells
        for (const cell of this.cells.values()) {
            sumR += cell.genome[0];
            sumG += cell.genome[1];
            sumB += cell.genome[2];

            cell.cooldownTimer -= dt;
            cell.combatTimer -= dt;
            
            // Energy logic
            cell.energy -= (0.5 + cell.energyDrain) * dt; // Passively eating energy
            
            if (cell.energy <= 0) {
                cell.energy = 0;
                cell.hp -= 5 * dt; // Starving hurts
            } else if (cell.hp < cell.maxHp - cell.hardDamage && cell.combatTimer <= 0) {
                // Regen normal HP
                let regenAmt = cell.regenRate * dt;
                
                // Diet nerf logic (if plantEaten > meatEaten, nerf regen)
                if (cell.plantEaten > cell.meatEaten * 1.5) {
                    regenAmt *= 0.2;
                }
                
                cell.hp += regenAmt;
                cell.energy -= regenAmt * 2.0; // Regen costs energy
            } else if (cell.hp >= cell.maxHp - cell.hardDamage && cell.hardDamage > 0 && cell.energy > cell.maxEnergy * 0.5) {
                // Heal hard damage (slow, very expensive)
                const healAmt = cell.regenRate * 0.2 * dt;
                cell.hardDamage -= healAmt;
                cell.energy -= healAmt * 20.0; // Hard heal costs 10x
                if (cell.hardDamage < 0) cell.hardDamage = 0;
            }
            
            if (cell.hp <= 0) {
                deadCells.push(cell.id);
                continue;
            }

            // AI & Vision
            const nearbyCells = this.cellHash.query(cell.pos, CELL_VISION).filter(c => c.id !== cell.id);
            const nearbyPlants = this.plantHash.query(cell.pos, CELL_VISION);
            const nearbyMeats = this.meatHash.query(cell.pos, CELL_VISION);
            
            this.think(cell, nearbyCells, nearbyPlants, nearbyMeats, newCells);
            
            // Movement (Steering)
            cell.vel = cell.vel.add(cell.acc.mul(dt));
            if (cell.vel.magSq() > cell.maxSpeed * cell.maxSpeed) {
                cell.vel = cell.vel.normalize().mul(cell.maxSpeed);
            }
            
            // Friction
            cell.vel = cell.vel.mul(Math.pow(0.5, dt)); 
            
            cell.pos = cell.pos.add(cell.vel.mul(dt));
            cell.acc = new Vec2(0,0);
            
            // Collision with bounds/obstacles
            this.handleObstacleCollisions(cell);
            
            // Animation
            cell.dancePhase += dt * cell.vel.mag() * 0.1;
            cell.heartbeatTime -= dt;
            if (cell.heartbeatTime <= 0) {
                cell.heartbeatTime = 1.0 - (cell.energy/cell.maxEnergy)*0.5;
                // Emit small heartbeat particle
                this.addParticle(cell.pos.x, cell.pos.y, 0, -10, 0.5, `rgba(${cell.genome[0]},${cell.genome[1]},${cell.genome[2]},0.5)`);
            }
        }
        
        // Remove dead cells and drop meat
        for (const id of deadCells) {
            const cell = this.cells.get(id)!;
            // Epic death particles
            for (let i = 0; i < 20; i++) {
                const a = randomRange(0, Math.PI * 2);
                const s = randomRange(10, 50);
                this.addParticle(cell.pos.x, cell.pos.y, Math.cos(a)*s, Math.sin(a)*s, randomRange(0.5, 1.5), `rgb(${cell.genome[0]},${cell.genome[1]},${cell.genome[2]})`);
            }
            // Drop meat based on remaining energy
            if (cell.energy > 50) {
                // Drop multiple pieces
                const pieces = Math.floor(cell.energy / 50);
                for (let i = 0; i < pieces; i++) {
                    const a = randomRange(0, Math.PI * 2);
                    const d = randomRange(0, cell.radius);
                    this.addMeat(cell.pos.x + Math.cos(a)*d, cell.pos.y + Math.sin(a)*d, 50);
                }
            }
            this.cells.delete(id);
        }
        
        for (const c of newCells) {
            this.cells.set(c.id, c);
        }

        // Update Stats History (every 1 sec approx)
        if (Math.random() < dt) {
            this.stats.population = this.cells.size;
            if (this.cells.size > 0) {
                this.stats.avgR = Math.round(sumR / this.cells.size);
                this.stats.avgG = Math.round(sumG / this.cells.size);
                this.stats.avgB = Math.round(sumB / this.cells.size);
            }
        }
    }
    
    think(cell: Cell, neighbors: Cell[], plants: Plant[], meats: Meat[], newCells: Cell[]) {
        const [r, g, b, cr, cg, cb] = cell.genome;
        
        const aggro = cr / 255; // 0 = peaceful, 1 = aggressive
        const tolerance = cb / 255; // 0 = xenophobe, 1 = pack mentality
        const gluttony = cg / 255; // 0 = fasts, 1 = eats immediately
        
        let targetPos = cell.targetPos;
        
        // Check for reproduction
        if (cell.energy > cell.maxEnergy * 0.8 && cell.hp > cell.maxHp * 0.8) {
            if (Math.random() < 0.05) { // 5% chance per tick when full
                cell.energy -= cell.maxEnergy * 0.6; // cost 60%
                
                // Mutate
                const hpPercent = cell.hp / cell.maxHp;
                const mutationChance = 1.0 - hpPercent; // Lower HP = higher mutation risk
                const mutAmount = mutationChance * 50; // Max +-50 per stat
                
                const newGen: Genome = [...cell.genome] as Genome;
                for (let i = 0; i < 6; i++) {
                    newGen[i] = clamp(newGen[i] + randomInt(-mutAmount, mutAmount), 0, 255);
                }
                
                const child = new Cell(cell.pos.x + randomRange(-10,10), cell.pos.y + randomRange(-10,10), newGen, cell.maxEnergy * 0.3);
                child.parentId = cell.id;
                cell.childrenIds.add(child.id);
                newCells.push(child);
            }
        }
        
        // Evaluate AI state based on priorities
        
        // 1. FLEE
        let dangerousEnemy = null;
        for (const n of neighbors) {
            if (n.targetId === cell.id && n.pos.distSq(cell.pos) < 2500) { // 50px
                dangerousEnemy = n; break;
            }
        }
        
        if (dangerousEnemy && cell.hp < cell.maxHp * (1.0 - aggro)) {
            cell.task = Task.FLEE;
            targetPos = cell.pos.add(cell.pos.sub(dangerousEnemy.pos)); // Run away
        } else if (cell.task === Task.FLEE) {
            // Keep fleeing if still in task
            if (!dangerousEnemy) cell.task = Task.WANDER;
        } else {
            // Not fleeing
            
            // 2. HUNT (Combat)
            // If attacked recently, hunt attacker
            if (cell.targetId) {
                const target = this.cells.get(cell.targetId);
                if (target && target.pos.distSq(cell.pos) < CELL_VISION*CELL_VISION) {
                    cell.task = Task.HUNT;
                    targetPos = target.pos;
                    
                    // Attack logic
                    if (cell.cooldownTimer <= 0 && target.pos.distSq(cell.pos) < Math.pow(cell.radius + target.radius + 5, 2)) {
                        this.executeAttack(cell, target);
                    }
                } else {
                    cell.targetId = null;
                    cell.task = Task.WANDER;
                }
            } else {
                // Look for things to attack based on aggro
                if (aggro > 0.5 && cell.energy < cell.maxEnergy * 0.9) {
                    for (const n of neighbors) {
                        // Don't attack similar genome if high tolerance
                        const genomeDiff = Math.abs(n.genome[0]-cell.genome[0]) + Math.abs(n.genome[1]-cell.genome[1]) + Math.abs(n.genome[2]-cell.genome[2]);
                        if (genomeDiff < 100 * tolerance) continue;
                        
                        if (Math.random() < 0.1) {
                            cell.targetId = n.id;
                            cell.task = Task.HUNT;
                            break;
                        }
                    }
                }
            }
            
            // 3. EAT (if not hunting)
            if (cell.task !== Task.HUNT) {
                if (cell.energy < cell.maxEnergy * (0.3 + gluttony * 0.6)) {
                    cell.task = Task.EAT;
                    // Find closest meat or plant
                    let closestFood: any = null;
                    let minDist = Infinity;
                    
                    for (const m of meats) {
                        const d = m.pos.distSq(cell.pos);
                        if (d < minDist) { minDist = d; closestFood = { type: 'meat', obj: m }; }
                    }
                    
                    // High aggro prefers meat over plants
                    if (!closestFood || aggro < 0.8) {
                        for (const p of plants) {
                            const d = p.pos.distSq(cell.pos);
                            if (d < minDist) { minDist = d; closestFood = { type: 'plant', obj: p }; }
                        }
                    }
                    
                    if (closestFood) {
                        targetPos = closestFood.obj.pos;
                        // Eat it if close enough
                        if (minDist < Math.pow(cell.radius + 5, 2)) {
                            if (closestFood.type === 'meat') {
                                cell.energy = Math.min(cell.maxEnergy, cell.energy + closestFood.obj.energy);
                                cell.meatEaten++;
                                this.meats.delete(closestFood.obj.id);
                            } else {
                                cell.energy = Math.min(cell.maxEnergy, cell.energy + closestFood.obj.energy);
                                cell.plantEaten++;
                                this.plants.delete(closestFood.obj.id);
                            }
                            cell.task = Task.WANDER;
                        }
                    } else {
                        cell.task = Task.WANDER;
                    }
                } else {
                    // 4. FOLLOW LEADER (Pack mentality)
                    if (tolerance > 0.4 && cell.task !== Task.FOLLOW_LEADER) {
                        for (const n of neighbors) {
                            const genomeDiff = Math.abs(n.genome[0]-cell.genome[0]) + Math.abs(n.genome[1]-cell.genome[1]) + Math.abs(n.genome[2]-cell.genome[2]);
                            if (genomeDiff < 50 && n.id !== cell.id) {
                                cell.leaderId = n.id;
                                cell.task = Task.FOLLOW_LEADER;
                                break;
                            }
                        }
                    }
                    
                    if (cell.task === Task.FOLLOW_LEADER) {
                        const leader = this.cells.get(cell.leaderId!);
                        if (leader && leader.pos.distSq(cell.pos) < CELL_VISION*CELL_VISION) {
                            // Don't go straight in, keep distance
                            const diff = leader.pos.sub(cell.pos);
                            if (diff.magSq() > 900) { // 30px
                                targetPos = leader.pos;
                            } else {
                                targetPos = null; // stop moving
                            }
                            // Copy leader's target
                            if (leader.targetId && leader.task === Task.HUNT) {
                                cell.targetId = leader.targetId;
                                cell.task = Task.HUNT;
                            }
                        } else {
                            cell.leaderId = null;
                            cell.task = Task.WANDER;
                        }
                    }
                }
            }
        }
        
        // 5. WANDER
        if (cell.task === Task.WANDER) {
            if (!targetPos || cell.pos.distSq(targetPos) < 100 || Math.random() < 0.05) {
                targetPos = cell.pos.add(new Vec2(randomRange(-100, 100), randomRange(-100, 100)));
                // Dance logic handled by having random close targets
            }
        }
        
        cell.targetPos = targetPos;
        
        // STEERING towards targetPos
        if (targetPos) {
            const desired = targetPos.sub(cell.pos);
            const dist = desired.mag();
            if (dist > 0) {
                const norm = desired.div(dist);
                const desiredVel = norm.mul(cell.maxSpeed);
                const steer = desiredVel.sub(cell.vel);
                // Obstacle avoidance
                const avoidance = this.getObstacleAvoidance(cell);
                cell.applyForce(steer.mul(2.0).add(avoidance));
            }
        } else {
            // Dampen speed
            cell.applyForce(cell.vel.mul(-1.0));
        }
    }
    
    getObstacleAvoidance(cell: Cell): Vec2 {
        let avoidance = new Vec2(0,0);
        const lookAhead = cell.vel.normalize().mul(50);
        const ahead = cell.pos.add(lookAhead);
        
        for (const obs of this.obstacles) {
            const closest = closestPointOnSegment(ahead, obs.start, obs.end);
            const dist = ahead.dist(closest);
            if (dist < 30) {
                avoidance = avoidance.add(ahead.sub(closest).normalize().mul(200));
            }
            // Add cells to avoidance for soft separation
            // But only if we are moving towards them
        }
        
        return avoidance;
    }
    
    handleObstacleCollisions(cell: Cell) {
        for (const obs of this.obstacles) {
            const closest = closestPointOnSegment(cell.pos, obs.start, obs.end);
            const distSq = cell.pos.distSq(closest);
            const r2 = cell.radius * cell.radius;
            if (distSq < r2) {
                // Colliding! Push out
                const dist = Math.sqrt(distSq);
                const overlap = cell.radius - dist;
                const normal = dist > 0 ? cell.pos.sub(closest).div(dist) : new Vec2(1, 0); // fallback
                cell.pos = cell.pos.add(normal.mul(overlap));
                
                // Reflect velocity loosely
                const dot = cell.vel.dot(normal);
                if (dot < 0) {
                    cell.vel = cell.vel.sub(normal.mul(dot * 1.5));
                }
            }
        }
    }
    
    executeAttack(attacker: Cell, victim: Cell) {
        attacker.cooldownTimer = attacker.attackCD;
        
        let dmg = attacker.attackDmg;
        const [ar, ag, ab] = attacker.genome;
        const [vr, vg, vb] = victim.genome;
        
        // Crit logic
        // Armor blocks crits (if victim armor is high relative to attacker strength)
        let isCrit = false;
        const blockCritChance = victim.armor; // 0 to 0.7
        
        if (Math.random() < attacker.critChance) {
            if (Math.random() > blockCritChance) {
                isCrit = true;
            }
        }
        
        victim.takeDamage(dmg, isCrit, attacker);
        
        // Knockback (Pressure)
        let knockbackForce = attacker.knockback;
        if (isCrit) knockbackForce *= 2;
        
        // Heavy cell gets pushed less
        const dir = victim.pos.sub(attacker.pos).normalize();
        victim.vel = victim.vel.add(dir.mul(knockbackForce / victim.mass));
        attacker.vel = attacker.vel.sub(dir.mul((knockbackForce / 3) / attacker.mass)); // recoil
        
        // Hit effect
        this.addParticle(victim.pos.x, victim.pos.y, dir.x * 50, dir.y * 50, 0.2, 'white');
        if (isCrit) {
            // Bloody crit
            for (let i=0; i<5; i++) this.addParticle(victim.pos.x, victim.pos.y, dir.x * 100 + randomRange(-20,20), dir.y * 100 + randomRange(-20,20), 0.5, 'red');
        }
    }
}