import { Cell, Genome } from './Cell';
import { Plant, Meat, Obstacle } from './Entities';
import { SpatialHash } from './SpatialHash';
import { CONFIG } from './config';
import { distSq, rand, randInt, clamp } from './math';

export class Engine {
  cells: Cell[] = [];
  plants: Plant[] = [];
  meats: Meat[] = [];
  obstacles: Obstacle[] = [];
  
  cellHash: SpatialHash<Cell>;
  plantHash: SpatialHash<Plant>;
  meatHash: SpatialHash<Meat>;

  nextId = 1;
  lastTime = 0;
  now = 0;
  
  paused = false;

  constructor() {
    this.cellHash = new SpatialHash(CONFIG.VISION_RADIUS);
    this.plantHash = new SpatialHash(CONFIG.VISION_RADIUS);
    this.meatHash = new SpatialHash(CONFIG.VISION_RADIUS);
  }

  init() {
    this.cells = [];
    this.plants = [];
    this.meats = [];
    this.obstacles = [];
    this.nextId = 1;
    this.lastTime = performance.now() / 1000;
  }

  spawnCell(x: number, y: number, genome?: Genome) {
    if (this.cells.length >= CONFIG.MAX_CELLS) return null;
    const g = genome || [randInt(0, 255), randInt(0, 255), randInt(0, 255), randInt(0, 255), randInt(0, 255), randInt(0, 255)];
    const cell = new Cell((this.nextId++).toString(), x, y, g as Genome);
    this.cells.push(cell);
    return cell;
  }

  spawnPlant(x: number, y: number) {
    if (this.plants.length >= CONFIG.MAX_PLANTS) return null;
    const plant = new Plant((this.nextId++).toString(), x, y, CONFIG.PLANT_ENERGY);
    this.plants.push(plant);
    return plant;
  }

  spawnMeat(x: number, y: number, energy: number) {
    const meat = new Meat((this.nextId++).toString(), x, y, energy, this.now);
    this.meats.push(meat);
    return meat;
  }

  update(time: number) {
    const dt = Math.min((time - this.lastTime) * CONFIG.TIME_SPEED, 0.1); // Cap dt
    this.lastTime = time;
    this.now += dt;

    if (this.paused) return;

    // Rebuild spatial hashes
    this.cellHash.clear();
    this.plantHash.clear();
    this.meatHash.clear();

    for (const c of this.cells) this.cellHash.insert(c);
    for (const p of this.plants) this.plantHash.insert(p);
    for (const m of this.meats) this.meatHash.insert(m);

    // Spawn plants randomly
    if (Math.random() < CONFIG.PLANT_SPAWN_RATE * dt) {
      this.spawnPlant(rand(0, CONFIG.WORLD_WIDTH), rand(0, CONFIG.WORLD_HEIGHT));
    }

    // Process cells
    for (let i = this.cells.length - 1; i >= 0; i--) {
      const cell = this.cells[i];
      
      // Vision queries
      const visibleCells = this.cellHash.query(cell.x, cell.y, CONFIG.VISION_RADIUS, cell.id);
      const visiblePlants = this.plantHash.query(cell.x, cell.y, CONFIG.VISION_RADIUS);
      const visibleMeats = this.meatHash.query(cell.x, cell.y, CONFIG.VISION_RADIUS);

      cell.update(dt, this.now, visibleCells, visiblePlants, visibleMeats, this.obstacles);

      // Interactions
      this.handleInteractions(cell, visibleCells, visiblePlants, visibleMeats);

      // Reproduction
      if (cell.energy >= CONFIG.REPRODUCTION_COST + 10 && Math.random() < 0.1 * dt) {
        this.reproduce(cell);
      }

      // Death
      if (cell.hp <= 0) {
        this.die(cell, i);
      }
    }

    // Clean up old meat
    for (let i = this.meats.length - 1; i >= 0; i--) {
      if (this.now - this.meats[i].createdAt > 120) { // 2 minutes
        this.meats.splice(i, 1);
      }
    }
  }

  handleInteractions(cell: Cell, visibleCells: Cell[], visiblePlants: Plant[], visibleMeats: Meat[]) {
    // Eat plants
    for (let i = this.plants.length - 1; i >= 0; i--) {
      const p = this.plants[i];
      if (distSq(cell.x, cell.y, p.x, p.y) < (CONFIG.CELL_RADIUS + CONFIG.PLANT_RADIUS) ** 2) {
        cell.energy = Math.min(CONFIG.MAX_ENERGY, cell.energy + p.energy);
        cell.plantsEaten++;
        this.plants.splice(i, 1);
        // Also remove from hash to prevent double eating in same frame
        this.plantHash.grid.get(this.plantHash.getKey(p.x, p.y))?.splice(this.plantHash.grid.get(this.plantHash.getKey(p.x, p.y))!.indexOf(p), 1);
      }
    }

    // Eat meat
    for (let i = this.meats.length - 1; i >= 0; i--) {
      const m = this.meats[i];
      if (distSq(cell.x, cell.y, m.x, m.y) < (CONFIG.CELL_RADIUS + CONFIG.MEAT_RADIUS) ** 2) {
        cell.energy = Math.min(CONFIG.MAX_ENERGY, cell.energy + m.energy * CONFIG.MEAT_ENERGY_RATIO);
        cell.meatEaten++;
        this.meats.splice(i, 1);
        this.meatHash.grid.get(this.meatHash.getKey(m.x, m.y))?.splice(this.meatHash.grid.get(this.meatHash.getKey(m.x, m.y))!.indexOf(m), 1);
      }
    }

    // Combat
    if (this.now - cell.lastAttackTime >= cell.attackCooldown) {
      for (const other of visibleCells) {
        if (cell.task === 'hunt' && cell.targetId === other.id) {
          if (distSq(cell.x, cell.y, other.x, other.y) < (CONFIG.CELL_RADIUS * 2) ** 2) {
            this.attack(cell, other);
            break; // One attack per frame
          }
        }
      }
    }
  }

  attack(attacker: Cell, defender: Cell) {
    attacker.lastAttackTime = this.now;
    defender.lastAttackedTime = this.now;

    let damage = attacker.damage * CONFIG.DAMAGE_MULT;
    let isCrit = false;

    // Crit calculation
    if (Math.random() < attacker.critChance * CONFIG.CRIT_MULT) {
      // Check crit resist
      if (Math.random() > defender.critResist) {
        isCrit = true;
        damage *= 2.5; // Massive damage
      }
    }

    // Armor reduction
    damage *= (1 - defender.armor);
    
    defender.hp -= damage;

    if (isCrit && CONFIG.HARD_DAMAGE_ENABLED) {
      defender.hardDamage = Math.min(defender.maxHp * 0.8, defender.hardDamage + damage * 0.5);
    }

    // Knockback
    const kbForce = isCrit ? 200 : 100;
    const dx = defender.x - attacker.x;
    const dy = defender.y - attacker.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    // Mass affects knockback
    const kbRatio = attacker.mass / defender.mass;
    defender.vx += nx * kbForce * kbRatio;
    defender.vy += ny * kbForce * kbRatio;
    
    // Recoil
    attacker.vx -= nx * kbForce * 0.2;
    attacker.vy -= ny * kbForce * 0.2;
  }

  reproduce(parent: Cell) {
    parent.energy -= CONFIG.REPRODUCTION_COST;
    
    // Mutation
    const mutationStrength = Math.max(1, (1 - (parent.hp / parent.maxHp)) * 2) * CONFIG.MUTATION_RATE;
    const newGenome = parent.genome.map(g => clamp(g + randInt(-mutationStrength, mutationStrength), 0, 255)) as Genome;
    
    // Spawn nearby
    const angle = Math.random() * Math.PI * 2;
    const dist = CONFIG.CELL_RADIUS * 2.5;
    const child = this.spawnCell(parent.x + Math.cos(angle) * dist, parent.y + Math.sin(angle) * dist, newGenome);
    
    if (child) {
      child.energy = CONFIG.STARTING_ENERGY;
      child.ancestors = new Set(parent.ancestors);
      child.ancestors.add(parent.id);
      child.generation = parent.generation + 1;
      parent.descendants.add(child.id);
    }
  }

  die(cell: Cell, index: number) {
    this.cells.splice(index, 1);
    
    // Drop meat based on remaining energy
    const meatCount = Math.floor(cell.energy / 10) + 1;
    for (let i = 0; i < meatCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * CONFIG.CELL_RADIUS * 2;
      this.spawnMeat(cell.x + Math.cos(angle) * dist, cell.y + Math.sin(angle) * dist, 10);
    }
  }

  public serialize(): string {
    return JSON.stringify({
      config: CONFIG,
      cells: this.cells.map(c => ({
        id: c.id,
        x: c.x,
        y: c.y,
        genome: c.genome,
        hp: c.hp,
        energy: c.energy,
        generation: c.generation,
        plantsEaten: c.plantsEaten,
        meatEaten: c.meatEaten
      })),
      plants: this.plants.map(p => ({ id: p.id, x: p.x, y: p.y, energy: p.energy })),
      meats: this.meats.map(m => ({ id: m.id, x: m.x, y: m.y, energy: m.energy })),
      obstacles: this.obstacles.map(o => ({ id: o.id, x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2 }))
    });
  }

  public deserialize(data: string) {
    try {
      const parsed = JSON.parse(data);
      if (parsed.config) {
        Object.assign(CONFIG, parsed.config);
      }
      this.cells = parsed.cells.map((c: any) => {
        const cell = new Cell(c.id, c.x, c.y, c.genome);
        cell.hp = c.hp;
        cell.energy = c.energy;
        cell.generation = c.generation || 0;
        cell.plantsEaten = c.plantsEaten || 0;
        cell.meatEaten = c.meatEaten || 0;
        return cell;
      });
      this.plants = parsed.plants.map((p: any) => new Plant(p.id || (this.nextId++).toString(), p.x, p.y, p.energy));
      this.meats = parsed.meats.map((m: any) => new Meat(m.id || (this.nextId++).toString(), m.x, m.y, m.energy, this.now));
      this.obstacles = parsed.obstacles.map((o: any) => new Obstacle(o.id || (this.nextId++).toString(), o.x1, o.y1, o.x2, o.y2));
    } catch (e) {
      console.error("Failed to deserialize", e);
    }
  }
}
