import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Engine } from '../engine/Engine';
import { CONFIG } from '../engine/config';
import { Cell } from '../engine/Cell';
import { Obstacle } from '../engine/Entities';
import { distSq } from '../engine/math';

interface SimulationProps {
  engine: Engine;
  setHoveredCell: (cell: Cell | null) => void;
  tool: string;
}

export const Simulation: React.FC<SimulationProps> = ({ engine, setHoveredCell, tool }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef({ x: CONFIG.WORLD_WIDTH / 2, y: CONFIG.WORLD_HEIGHT / 2, zoom: 1 });
  const isDragging = useRef(false);
  const isDrawingObstacle = useRef(false);
  const obstacleStart = useRef({ x: 0, y: 0 });
  const lastMouse = useRef({ x: 0, y: 0 });
  const lastHoveredId = useRef<string | null>(null);
  const followedCellId = useRef<string | null>(null);

  useEffect(() => {
    const handleResetCamera = () => {
      cameraRef.current = { x: CONFIG.WORLD_WIDTH / 2, y: CONFIG.WORLD_HEIGHT / 2, zoom: 1 };
      followedCellId.current = null;
    };
    
    const handleFollowCell = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      followedCellId.current = customEvent.detail;
    };

    window.addEventListener('reset-camera', handleResetCamera);
    window.addEventListener('follow-cell', handleFollowCell);
    return () => {
      window.removeEventListener('reset-camera', handleResetCamera);
      window.removeEventListener('follow-cell', handleFollowCell);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    const render = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      engine.update(time / 1000);

      if (followedCellId.current) {
        const cell = engine.cells.find(c => c.id === followedCellId.current);
        if (cell) {
          cameraRef.current.x = cell.x;
          cameraRef.current.y = cell.y;
        } else {
          followedCellId.current = null;
        }
      }

      // Clear
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      const camera = cameraRef.current;
      // Apply camera
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);

      // Draw bounds
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, CONFIG.WORLD_WIDTH, CONFIG.WORLD_HEIGHT);

      // Draw plants
      ctx.fillStyle = '#00ff00';
      for (const p of engine.plants) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, CONFIG.PLANT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw meats
      ctx.fillStyle = '#8b0000';
      for (const m of engine.meats) {
        ctx.beginPath();
        ctx.arc(m.x, m.y, CONFIG.MEAT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw obstacles
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 4;
      for (const obs of engine.obstacles) {
        ctx.beginPath();
        ctx.moveTo(obs.x1, obs.y1);
        ctx.lineTo(obs.x2, obs.y2);
        ctx.stroke();
      }

      // Draw active obstacle
      if (isDrawingObstacle.current) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.moveTo(obstacleStart.current.x, obstacleStart.current.y);
        
        const rect = canvas.getBoundingClientRect();
        const worldX = (lastMouse.current.x - rect.width / 2) / camera.zoom + camera.x;
        const worldY = (lastMouse.current.y - rect.height / 2) / camera.zoom + camera.y;
        
        ctx.lineTo(worldX, worldY);
        ctx.stroke();
      }

      // Draw cells
      for (const c of engine.cells) {
        // Heartbeat effect
        const beat = (time % 1000) / 1000;
        if (followedCellId.current === c.id) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${1 - beat})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(c.x, c.y, CONFIG.CELL_RADIUS + beat * 20, 0, Math.PI * 2);
          ctx.stroke();
        } else if (beat < 0.2 && parseInt(c.id) % 3 === 0) { // Only some cells pulse at a time to reduce visual clutter
          ctx.strokeStyle = `rgba(${c.genome[0]}, ${c.genome[1]}, ${c.genome[2]}, ${1 - (beat * 5)})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(c.x, c.y, CONFIG.CELL_RADIUS + (beat * 5) * 10, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Body
        ctx.fillStyle = `rgb(${c.genome[0]}, ${c.genome[1]}, ${c.genome[2]})`;
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(c.x, c.y, CONFIG.CELL_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Core
        ctx.fillStyle = `rgb(${c.genome[3]}, ${c.genome[4]}, ${c.genome[5]})`;
        ctx.beginPath();
        ctx.arc(c.x, c.y, CONFIG.CELL_RADIUS * 0.4, 0, Math.PI * 2);
        ctx.fill();

        // HP Bar
        const hpRatio = Math.max(0, c.hp / c.maxHp);
        const hardDamageRatio = c.hardDamage / c.maxHp;
        const barWidth = CONFIG.CELL_RADIUS * 2;
        const barHeight = 2;
        const barY = c.y - CONFIG.CELL_RADIUS - 4;
        
        ctx.fillStyle = '#333';
        ctx.fillRect(c.x - barWidth / 2, barY, barWidth, barHeight);
        
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(c.x - barWidth / 2, barY, barWidth * hpRatio, barHeight);

        if (c.hardDamage > 0) {
          ctx.fillStyle = '#8b0000';
          ctx.fillRect(c.x - barWidth / 2 + barWidth * (1 - hardDamageRatio), barY, barWidth * hardDamageRatio, barHeight);
        }
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => cancelAnimationFrame(animationFrameId);
  }, [engine]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    const zoomFactor = 1.1;
    cameraRef.current.zoom = e.deltaY < 0 ? cameraRef.current.zoom * zoomFactor : cameraRef.current.zoom / zoomFactor;
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (tool === 'add_obstacle') {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const camera = cameraRef.current;
      const worldX = (e.clientX - rect.left - rect.width / 2) / camera.zoom + camera.x;
      const worldY = (e.clientY - rect.top - rect.height / 2) / camera.zoom + camera.y;
      isDrawingObstacle.current = true;
      obstacleStart.current = { x: worldX, y: worldY };
      lastMouse.current = { x: e.clientX, y: e.clientY };
    } else {
      isDragging.current = true;
      followedCellId.current = null; // Unfollow on drag
      lastMouse.current = { x: e.clientX, y: e.clientY };
    }
  }, [tool]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging.current) {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      cameraRef.current.x -= dx / cameraRef.current.zoom;
      cameraRef.current.y -= dy / cameraRef.current.zoom;
    } else if (!isDrawingObstacle.current) {
      // Hover logic
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const camera = cameraRef.current;
      const worldX = (mouseX - rect.width / 2) / camera.zoom + camera.x;
      const worldY = (mouseY - rect.height / 2) / camera.zoom + camera.y;

      let hovered: Cell | null = null;
      for (const c of engine.cells) {
        if ((c.x - worldX) ** 2 + (c.y - worldY) ** 2 <= (CONFIG.CELL_RADIUS * 1.5) ** 2) {
          hovered = c;
          break;
        }
      }
      
      if (hovered?.id !== lastHoveredId.current) {
        lastHoveredId.current = hovered?.id || null;
        setHoveredCell(hovered);
      }
    }
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, [engine, setHoveredCell]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (isDrawingObstacle.current) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const camera = cameraRef.current;
        const worldX = (e.clientX - rect.left - rect.width / 2) / camera.zoom + camera.x;
        const worldY = (e.clientY - rect.top - rect.height / 2) / camera.zoom + camera.y;
        
        // Add obstacle
        engine.obstacles.push(new Obstacle(
          Math.random().toString(),
          obstacleStart.current.x,
          obstacleStart.current.y,
          worldX,
          worldY
        ));
      }
      isDrawingObstacle.current = false;
    }
    isDragging.current = false;
  }, [engine]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const camera = cameraRef.current;
    const worldX = (mouseX - rect.width / 2) / camera.zoom + camera.x;
    const worldY = (mouseY - rect.height / 2) / camera.zoom + camera.y;

    if (tool === 'pointer') {
      for (const c of engine.cells) {
        if (distSq(c.x, c.y, worldX, worldY) <= (CONFIG.CELL_RADIUS * 1.5) ** 2) {
          followedCellId.current = c.id;
          break;
        }
      }
    } else if (tool === 'spawn_cell' || tool === 'spawn_herbivore' || tool === 'spawn_carnivore' || tool === 'spawn_plant' || tool === 'spawn_meat' || tool === 'remove_obstacle' || tool === 'kill_cell') {
      if (tool === 'spawn_cell') engine.spawnCell(worldX, worldY);
      if (tool === 'spawn_herbivore') engine.spawnCell(worldX, worldY, [0, 255, 0, 0, 0, 0]);
      if (tool === 'spawn_carnivore') engine.spawnCell(worldX, worldY, [255, 0, 0, 0, 0, 0]);
      if (tool === 'spawn_plant') engine.spawnPlant(worldX, worldY);
      if (tool === 'spawn_meat') engine.spawnMeat(worldX, worldY, 50);
      if (tool === 'kill_cell') {
        for (let i = 0; i < engine.cells.length; i++) {
          const c = engine.cells[i];
          if (distSq(c.x, c.y, worldX, worldY) <= (CONFIG.CELL_RADIUS * 1.5) ** 2) {
            c.hp = 0; // Kill it
            break;
          }
        }
      }
      if (tool === 'remove_obstacle') {
        for (let i = 0; i < engine.obstacles.length; i++) {
          const obs = engine.obstacles[i];
          const l2 = distSq(obs.x1, obs.y1, obs.x2, obs.y2);
          if (l2 === 0) continue;
          let t = ((worldX - obs.x1) * (obs.x2 - obs.x1) + (worldY - obs.y1) * (obs.y2 - obs.y1)) / l2;
          t = Math.max(0, Math.min(1, t));
          const projX = obs.x1 + t * (obs.x2 - obs.x1);
          const projY = obs.y1 + t * (obs.y2 - obs.y1);
          if (distSq(worldX, worldY, projX, projY) < 400) { // 20px radius
            engine.obstacles.splice(i, 1);
            break;
          }
        }
      }
    }
  }, [engine, tool]);

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
      className="absolute top-0 left-0 w-full h-full cursor-crosshair"
      style={{ touchAction: 'none' }}
    />
  );
};
