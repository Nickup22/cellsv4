import { clamp, dist, distSq, normalize, rand } from './math';
import { CONFIG } from './config';
import { Plant, Meat, Obstacle } from './Entities';

export type Genome = [number, number, number, number, number, number]; // R, G, B, cR, cG, cB

export class Cell {
  id: string;
  x: number;
  y: number;
  vx: number = 0;
  vy: number = 0;
  
  genome: Genome;
  
  hp: number = CONFIG.MAX_HP;
  maxHp: number = CONFIG.MAX_HP;
  hardDamage: number = 0;
  energy: number = CONFIG.STARTING_ENERGY;
  
  lastAttackTime: number = 0;
  lastAttackedTime: number = 0;
  
  targetId: string | null = null;
  leaderId: string | null = null;
  task: 'idle' | 'eat' | 'hunt' | 'follow' | 'flee' = 'idle';
  
  ancestors: Set<string> = new Set();
  descendants: Set<string> = new Set();
  generation: number = 0;
  
  plantsEaten: number = 0;
  meatEaten: number = 0;

  // Derived stats
  mass: number;
  maxSpeed: number;
  damage: number;
  attackCooldown: number;
  critChance: number;
  armor: number;
  critResist: number;
  regenRate: number;
  energyDrain: number;

  constructor(id: string, x: number, y: number, genome: Genome) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.genome = genome;
    
    const [r, g, b] = genome;
    
    this.mass = 10 + (b / 255) * 20;
    this.maxSpeed = CONFIG.MAX_SPEED - (b / 255) * 25;
    this.damage = 5 + (r / 255) * 25;
    this.attackCooldown = 0.5 + (r / 255) * 1.5; // seconds
    this.critChance = (r / 255) * 0.3; // up to 30%
    this.armor = (b / 255) * 0.8; // up to 80% damage reduction
    this.critResist = (b / 255) * 1.0; // up to 100% crit resistance
    this.regenRate = (g / 255) * 5; // HP per second
    this.energyDrain = CONFIG.BASE_ENERGY_DRAIN + (g / 255) * 2 + (this.mass / 30) * 0.5;
  }

  get cR() { return this.genome[3]; }
  get cG() { return this.genome[4]; }
  get cB() { return this.genome[5]; }

  update(dt: number, now: number, cells: Cell[], plants: Plant[], meats: Meat[], obstacles: Obstacle[]) {
    // Energy drain
    this.energy -= this.energyDrain * dt;
    
    if (this.energy <= 0) {
      this.energy = 0;
      this.hp -= 10 * dt; // Starvation damage
    }

    // Regen
    const timeSinceCombat = Math.min(now - this.lastAttackTime, now - this.lastAttackedTime);
    const inCombat = timeSinceCombat < 3; // 3 seconds combat timer
    
    // Plant diet nerfs regen
    const dietRatio = this.plantsEaten / (this.plantsEaten + this.meatEaten + 1);
    const regenNerf = 1 - (dietRatio * 0.8); // Up to 80% nerf if only eating plants
    
    let currentRegen = this.regenRate * regenNerf;
    if (inCombat) currentRegen *= 0.2; // 80% nerf in combat
    
    if (this.energy > 0 && this.hp < this.maxHp - this.hardDamage) {
      const healAmount = Math.min(currentRegen * dt, (this.maxHp - this.hardDamage) - this.hp);
      this.hp += healAmount;
      this.energy -= healAmount * 0.5; // Healing costs energy
    }

    // AI Decision Making (simplified for performance)
    this.decideTask(cells, plants, meats, now);
    this.executeTask(dt, cells, plants, meats, obstacles);
    
    // Physics
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    
    // Friction
    this.vx *= Math.pow(0.1, dt);
    this.vy *= Math.pow(0.1, dt);
    
    // Bounds
    this.x = clamp(this.x, CONFIG.CELL_RADIUS, CONFIG.WORLD_WIDTH - CONFIG.CELL_RADIUS);
    this.y = clamp(this.y, CONFIG.CELL_RADIUS, CONFIG.WORLD_HEIGHT - CONFIG.CELL_RADIUS);
  }

  decideTask(cells: Cell[], plants: Plant[], meats: Meat[], now: number) {
    // Simple priority system
    const hunger = 1 - (this.energy / CONFIG.MAX_ENERGY);
    const health = this.hp / (this.maxHp - this.hardDamage);
    
    let bestScore = -1;
    let bestTask: any = 'idle';
    let newTargetId: string | null = null;

    // Flee
    if (health < 0.5 && this.cR < 128) {
      const attackers = cells.filter(c => c.targetId === this.id);
      if (attackers.length > 0) {
        const score = (1 - health) * 2 + (255 - this.cR) / 255;
        if (score > bestScore) {
          bestScore = score;
          bestTask = 'flee';
          newTargetId = attackers[0].id; // Flee from nearest attacker
        }
      }
    }

    // Eat
    if (hunger > 0.2 || this.cG > 128) {
      const gluttonyMult = 1 + (this.cG / 255);
      
      // Find closest food
      let closestFood: any = null;
      let closestDist = Infinity;
      
      for (const p of plants) {
        const d = distSq(this.x, this.y, p.x, p.y);
        if (d < closestDist) { closestDist = d; closestFood = p; }
      }
      
      for (const m of meats) {
        const d = distSq(this.x, this.y, m.x, m.y);
        // Meat is preferred if cR is high
        const adjustedDist = d / (1 + (this.cR / 255)); 
        if (adjustedDist < closestDist) { closestDist = d; closestFood = m; }
      }

      if (closestFood) {
        const score = hunger * gluttonyMult * (1 - Math.min(closestDist / (CONFIG.VISION_RADIUS**2), 1));
        if (score > bestScore) {
          bestScore = score;
          bestTask = 'eat';
          newTargetId = closestFood.id;
        }
      }
    }

    // Hunt
    if (hunger > 0.4 || this.cR > 150) {
      let closestPrey: Cell | null = null;
      let closestDist = Infinity;
      
      for (const c of cells) {
        if (c.id === this.id || c.id === this.leaderId) continue;
        // Don't hunt similar cells if pack mentality is high
        const similarity = this.getSimilarity(c);
        if (this.cB > 128 && similarity > 0.8) continue;
        
        const d = distSq(this.x, this.y, c.x, c.y);
        if (d < closestDist) { closestDist = d; closestPrey = c; }
      }

      if (closestPrey) {
        const score = (hunger + (this.cR / 255)) * (1 - Math.min(closestDist / (CONFIG.VISION_RADIUS**2), 1));
        if (score > bestScore) {
          bestScore = score;
          bestTask = 'hunt';
          newTargetId = closestPrey.id;
        }
      }
    }
    
    // Retaliate
    if (now - this.lastAttackedTime < 2) {
       // If attacked recently, high priority to fight back
       const score = 2.0 + (this.cR / 255);
       if (score > bestScore) {
         bestScore = score;
         bestTask = 'hunt';
         // Keep current target if it's a hunt, else we would need to know who attacked us.
         // For simplicity, we just keep hunting if we were already.
       }
    }

    // Follow
    if (this.cB > 100 && bestScore < 1.0) {
      let bestFriend: Cell | null = null;
      let bestFriendScore = -1;
      
      for (const c of cells) {
        if (c.id === this.id) continue;
        const similarity = this.getSimilarity(c);
        if (similarity > 0.7) {
          const d = distSq(this.x, this.y, c.x, c.y);
          const fScore = similarity * (1 - Math.min(d / (CONFIG.VISION_RADIUS**2), 1));
          if (fScore > bestFriendScore) {
            bestFriendScore = fScore;
            bestFriend = c;
          }
        }
      }
      
      if (bestFriend) {
        const score = (this.cB / 255) * bestFriendScore;
        if (score > bestScore) {
          bestScore = score;
          bestTask = 'follow';
          newTargetId = bestFriend.id;
          this.leaderId = bestFriend.id;
        }
      }
    }

    this.task = bestTask;
    this.targetId = newTargetId;
  }

  executeTask(dt: number, cells: Cell[], plants: Plant[], meats: Meat[], obstacles: Obstacle[]) {
    let targetX = this.x;
    let targetY = this.y;
    let speedMult = 1;

    if (this.task === 'eat' && this.targetId) {
      const target = plants.find(p => p.id === this.targetId) || meats.find(m => m.id === this.targetId);
      if (target) {
        targetX = target.x;
        targetY = target.y;
      } else {
        this.task = 'idle';
      }
    } else if (this.task === 'hunt' && this.targetId) {
      const target = cells.find(c => c.id === this.targetId);
      if (target) {
        targetX = target.x;
        targetY = target.y;
      } else {
        this.task = 'idle';
      }
    } else if (this.task === 'follow' && this.targetId) {
      const target = cells.find(c => c.id === this.targetId);
      if (target) {
        // Don't go exactly to center, stay a bit away
        const d = dist(this.x, this.y, target.x, target.y);
        if (d > CONFIG.CELL_RADIUS * 4) {
          targetX = target.x;
          targetY = target.y;
        } else {
          speedMult = 0; // Stop moving if close enough
        }
      } else {
        this.task = 'idle';
        this.leaderId = null;
      }
    } else if (this.task === 'flee' && this.targetId) {
      const target = cells.find(c => c.id === this.targetId);
      if (target) {
        // Move away
        targetX = this.x + (this.x - target.x);
        targetY = this.y + (this.y - target.y);
      } else {
        this.task = 'idle';
      }
    } else if (this.task === 'idle') {
      // Dance
      targetX = this.x + Math.sin(Date.now() / 500 + parseInt(this.id)) * 20;
      targetY = this.y + Math.cos(Date.now() / 400 + parseInt(this.id)) * 20;
      speedMult = 0.3;
    }

    if (speedMult > 0) {
      let dirX = targetX - this.x;
      let dirY = targetY - this.y;
      
      // Obstacle avoidance
      for (const obs of obstacles) {
        // Simple point-line distance
        const l2 = distSq(obs.x1, obs.y1, obs.x2, obs.y2);
        if (l2 === 0) continue;
        
        let t = ((this.x - obs.x1) * (obs.x2 - obs.x1) + (this.y - obs.y1) * (obs.y2 - obs.y1)) / l2;
        t = Math.max(0, Math.min(1, t));
        
        const projX = obs.x1 + t * (obs.x2 - obs.x1);
        const projY = obs.y1 + t * (obs.y2 - obs.y1);
        
        const dSq = distSq(this.x, this.y, projX, projY);
        const avoidRadius = CONFIG.CELL_RADIUS * 3;
        
        if (dSq < avoidRadius * avoidRadius) {
          const d = Math.sqrt(dSq) || 1;
          const pushStrength = (avoidRadius - d) / avoidRadius;
          dirX += ((this.x - projX) / d) * pushStrength * 100;
          dirY += ((this.y - projY) / d) * pushStrength * 100;
        }
      }

      const dir = normalize(dirX, dirY);
      const accel = 200; // Acceleration factor
      this.vx += dir.x * accel * speedMult * dt;
      this.vy += dir.y * accel * speedMult * dt;
      
      // Cap speed
      const currentSpeed = dist(0, 0, this.vx, this.vy);
      if (currentSpeed > this.maxSpeed) {
        this.vx = (this.vx / currentSpeed) * this.maxSpeed;
        this.vy = (this.vy / currentSpeed) * this.maxSpeed;
      }
    }
  }

  getSimilarity(other: Cell) {
    let diff = 0;
    for (let i = 0; i < 6; i++) {
      diff += Math.abs(this.genome[i] - other.genome[i]);
    }
    return 1 - (diff / (6 * 255));
  }
}
