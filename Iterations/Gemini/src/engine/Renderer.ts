import { World } from './World';
import { Cell, Task } from './Entities';
import { Vec2 } from './utils';

export class Camera {
    x = 0;
    y = 0;
    zoom = 1;

    screenToWorld(sx: number, sy: number, cw: number, ch: number) {
        return new Vec2(
            (sx - cw / 2) / this.zoom + this.x,
            (sy - ch / 2) / this.zoom + this.y
        );
    }
    
    worldToScreen(wx: number, wy: number, cw: number, ch: number) {
        return new Vec2(
            (wx - this.x) * this.zoom + cw / 2,
            (wy - this.y) * this.zoom + ch / 2
        );
    }
}

export class Renderer {
    ctx: CanvasRenderingContext2D;
    camera: Camera = new Camera();
    width: number = 800;
    height: number = 600;
    
    selectedCellId: number | null = null;
    hoveredCellId: number | null = null;

    constructor(canvas: HTMLCanvasElement) {
        this.ctx = canvas.getContext('2d', { alpha: false })!; // Optimize
        this.resize(canvas.width, canvas.height);
    }

    resize(w: number, h: number) {
        this.width = w;
        this.height = h;
    }

    render(world: World) {
        const { ctx, camera, width, height } = this;
        
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);
        
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, -camera.y);

        // Grid / Bounds
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, world.bounds.w, world.bounds.h);

        // Meats
        for (const meat of world.meats.values()) {
            ctx.beginPath();
            ctx.arc(meat.pos.x, meat.pos.y, meat.radius, 0, Math.PI * 2);
            ctx.fillStyle = '#aa4444';
            ctx.fill();
        }

        // Plants
        ctx.fillStyle = '#22aa22';
        for (const plant of world.plants.values()) {
            ctx.beginPath();
            ctx.arc(plant.pos.x, plant.pos.y, plant.radius, 0, Math.PI * 2);
            ctx.fill();
        }

        // Particles
        for (const p of world.particles) {
            ctx.beginPath();
            ctx.arc(p.pos.x, p.pos.y, 2, 0, Math.PI*2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life / p.maxLife;
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        // Cells
        for (const cell of world.cells.values()) {
            this.drawCell(cell, world);
        }

        // Obstacles
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        for (const obs of world.obstacles) {
            ctx.beginPath();
            ctx.moveTo(obs.start.x, obs.start.y);
            ctx.lineTo(obs.end.x, obs.end.y);
            ctx.stroke();
        }
        
        // Highlights (selection / hover)
        this.drawOverlays(world);

        ctx.restore();
    }

    drawCell(cell: Cell, world: World) {
        const { ctx } = this;
        
        const [r, g, b, cr, cg, cb] = cell.genome;
        
        // Body
        ctx.beginPath();
        ctx.arc(cell.pos.x, cell.pos.y, cell.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fill();
        
        // Armor (thickness of outline based on B)
        ctx.lineWidth = 1 + (b / 255) * 2;
        ctx.strokeStyle = '#fff';
        ctx.stroke();

        // Core
        // Pulse based on dance/energy
        const pulse = 1 + Math.sin(cell.dancePhase) * 0.2;
        ctx.beginPath();
        ctx.arc(cell.pos.x, cell.pos.y, cell.radius * 0.4 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.fill();

        // HP Bar
        const barW = 16;
        const barH = 3;
        const barX = cell.pos.x - barW / 2;
        const barY = cell.pos.y - cell.radius - 6;

        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barW, barH);
        
        const hpPerc = cell.hp / cell.maxHp;
        const hardDmgPerc = cell.hardDamage / cell.maxHp;
        
        ctx.fillStyle = '#0f0';
        if (hpPerc < 0.3) ctx.fillStyle = '#f00';
        else if (hpPerc < 0.6) ctx.fillStyle = '#ff0';
        
        ctx.fillRect(barX, barY, barW * hpPerc, barH);
        
        // Hard damage (dark red on right)
        ctx.fillStyle = '#800000';
        ctx.fillRect(barX + barW * (1.0 - hardDmgPerc), barY, barW * hardDmgPerc, barH);
        
        // Combat indicator
        if (cell.combatTimer > 0) {
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(cell.pos.x, cell.pos.y, cell.radius + 3, 0, Math.PI*2);
            ctx.stroke();
        }
    }
    
    drawOverlays(world: World) {
        const { ctx } = this;
        const hoverCell = this.hoveredCellId ? world.cells.get(this.hoveredCellId) : null;
        const selectCell = this.selectedCellId ? world.cells.get(this.selectedCellId) : null;
        
        const targetCell = hoverCell || selectCell;
        
        if (targetCell) {
            // Draw path / target
            if (targetCell.targetPos) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(targetCell.pos.x, targetCell.pos.y);
                ctx.lineTo(targetCell.targetPos.x, targetCell.targetPos.y);
                ctx.stroke();
                ctx.setLineDash([]);
                
                // Draw crosshair at target
                ctx.beginPath();
                ctx.arc(targetCell.targetPos.x, targetCell.targetPos.y, 3, 0, Math.PI*2);
                ctx.fillStyle = 'white';
                ctx.fill();
            }
            
            // Highlight Leader
            if (targetCell.leaderId) {
                const leader = world.cells.get(targetCell.leaderId);
                if (leader) {
                    ctx.strokeStyle = 'rgba(100, 100, 255, 0.8)';
                    ctx.beginPath();
                    ctx.moveTo(targetCell.pos.x, targetCell.pos.y);
                    ctx.lineTo(leader.pos.x, leader.pos.y);
                    ctx.stroke();
                }
            }

            // Highlight Relatives
            if (targetCell.parentId) {
                const parent = world.cells.get(targetCell.parentId);
                if (parent) {
                    ctx.strokeStyle = 'rgba(255, 100, 255, 0.8)';
                    ctx.beginPath();
                    ctx.arc(parent.pos.x, parent.pos.y, parent.radius + 6, 0, Math.PI*2);
                    ctx.stroke();
                }
            }
            
            for (const childId of targetCell.childrenIds) {
                const child = world.cells.get(childId);
                if (child) {
                    ctx.strokeStyle = 'rgba(100, 255, 255, 0.8)';
                    ctx.beginPath();
                    ctx.arc(child.pos.x, child.pos.y, child.radius + 6, 0, Math.PI*2);
                    ctx.stroke();
                }
            }

            // Ring around selected
            ctx.strokeStyle = 'yellow';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(targetCell.pos.x, targetCell.pos.y, targetCell.radius + 8, 0, Math.PI*2);
            ctx.stroke();
        }
    }
}