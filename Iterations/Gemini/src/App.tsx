import React, { useEffect, useRef, useState } from 'react';
import { World } from './engine/World';
import { Renderer } from './engine/Renderer';
import { Genome, Cell, Task, Obstacle } from './engine/Entities';
import { Vec2 } from './engine/utils';
import { Settings, Play, Pause, FastForward, Info, Plus, Hand, Paintbrush, MinusSquare } from 'lucide-react';

export default function App() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const worldRef = useRef<World>(new World());
    const rendererRef = useRef<Renderer | null>(null);
    const reqRef = useRef<number>(0);

    const [paused, setPaused] = useState(false);
    const [speed, setSpeed] = useState(1);
    const [hoveredCell, setHoveredCell] = useState<Cell | null>(null);
    const [stats, setStats] = useState(worldRef.current.stats);

    // Initial population
    useEffect(() => {
        for (let i = 0; i < 50; i++) {
            worldRef.current.addCell(
                Math.random() * worldRef.current.bounds.w,
                Math.random() * worldRef.current.bounds.h
            );
        }
        for (let i = 0; i < 200; i++) worldRef.current.spawnPlant();
    }, []);

    // Game Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        rendererRef.current = new Renderer(canvas);

        let lastTime = performance.now();
        const loop = (time: number) => {
            const dt = (time - lastTime) / 1000;
            lastTime = time;

            if (!paused) {
                for (let i = 0; i < speed; i++) {
                    worldRef.current.update(dt);
                }
            }
            
            rendererRef.current?.render(worldRef.current);
            setStats({ ...worldRef.current.stats });

            // Update hover UI if needed
            if (rendererRef.current?.hoveredCellId) {
                const c = worldRef.current.cells.get(rendererRef.current.hoveredCellId);
                if (c) setHoveredCell({ ...c } as Cell); // clone for react
            } else {
                setHoveredCell(null);
            }

            reqRef.current = requestAnimationFrame(loop);
        };

        reqRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(reqRef.current);
    }, [paused, speed]);

    // Handle Resize
    useEffect(() => {
        const handleResize = () => {
            if (canvasRef.current && rendererRef.current) {
                canvasRef.current.width = window.innerWidth;
                canvasRef.current.height = window.innerHeight;
                rendererRef.current.resize(window.innerWidth, window.innerHeight);
            }
        };
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Interaction
    const [tool, setTool] = useState<'pan' | 'spawn' | 'obstacle'>('pan');
    const dragStartRef = useRef<{x: number, y: number} | null>(null);

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!rendererRef.current) return;
        const renderer = rendererRef.current;
        const camera = renderer.camera;
        
        if (e.buttons === 1 && tool === 'pan') {
            camera.x -= e.movementX / camera.zoom;
            camera.y -= e.movementY / camera.zoom;
        } else if (e.buttons === 4) { // Middle click always pans
            camera.x -= e.movementX / camera.zoom;
            camera.y -= e.movementY / camera.zoom;
        }

        // Hover
        const worldPos = camera.screenToWorld(e.clientX, e.clientY, canvasRef.current!.width, canvasRef.current!.height);
        
        let foundId: number | null = null;
        let minDist = Infinity;
        for (const cell of worldRef.current.cells.values()) {
            const distSq = cell.pos.distSq(worldPos);
            if (distSq < cell.radius * cell.radius + 100 && distSq < minDist) {
                minDist = distSq;
                foundId = cell.id;
            }
        }
        renderer.hoveredCellId = foundId;
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (!rendererRef.current) return;
        const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
        rendererRef.current.camera.zoom *= zoomDelta;
        rendererRef.current.camera.zoom = Math.max(0.1, Math.min(10, rendererRef.current.camera.zoom));
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!rendererRef.current) return;
        const worldPos = rendererRef.current.camera.screenToWorld(e.clientX, e.clientY, canvasRef.current!.width, canvasRef.current!.height);
        
        if (e.button === 2 || (e.button === 0 && tool === 'spawn')) {
            worldRef.current.addCell(worldPos.x, worldPos.y);
        } else if (e.button === 0 && tool === 'obstacle') {
            dragStartRef.current = { x: worldPos.x, y: worldPos.y };
            
            const onUp = (upE: PointerEvent) => {
                window.removeEventListener('pointerup', onUp);
                if (!dragStartRef.current || !rendererRef.current) return;
                const endPos = rendererRef.current.camera.screenToWorld(upE.clientX, upE.clientY, canvasRef.current!.width, canvasRef.current!.height);
                
                if (Math.hypot(endPos.x - dragStartRef.current.x, endPos.y - dragStartRef.current.y) > 10) {
                    worldRef.current.obstacles.push(new Obstacle(
                        new Vec2(dragStartRef.current.x, dragStartRef.current.y),
                        new Vec2(endPos.x, endPos.y)
                    ));
                }
                dragStartRef.current = null;
            };
            window.addEventListener('pointerup', onUp);
        }
    };

    return (
        <div className="w-full h-screen overflow-hidden bg-black text-white font-sans selection:bg-transparent relative">
            <canvas 
                ref={canvasRef}
                className="w-full h-full cursor-crosshair touch-none"
                onPointerMove={handlePointerMove}
                onPointerDown={handlePointerDown}
                onWheel={handleWheel}
                onContextMenu={e => e.preventDefault()}
            />
            
            {/* UI Overlay */}
            <div className="absolute top-4 left-4 flex flex-col gap-2">
                <div className="flex gap-2">
                    <button className="p-2 bg-gray-800 rounded hover:bg-gray-700" onClick={() => setPaused(!paused)}>
                        {paused ? <Play size={20} /> : <Pause size={20} />}
                    </button>
                    <button className="p-2 bg-gray-800 rounded hover:bg-gray-700 flex items-center gap-1" onClick={() => setSpeed(s => s === 1 ? 5 : 1)}>
                        <FastForward size={20} /> x{speed}
                    </button>
                </div>
                <div className="flex gap-2 mt-2 bg-gray-900/80 p-2 rounded-lg backdrop-blur-sm border border-gray-700">
                    <button className={`p-2 rounded ${tool === 'pan' ? 'bg-blue-600' : 'hover:bg-gray-700'}`} onClick={() => setTool('pan')} title="Перемещение (Pan)">
                        <Hand size={20} />
                    </button>
                    <button className={`p-2 rounded ${tool === 'spawn' ? 'bg-blue-600' : 'hover:bg-gray-700'}`} onClick={() => setTool('spawn')} title="Создать клетку (Spawn)">
                        <Plus size={20} />
                    </button>
                    <button className={`p-2 rounded ${tool === 'obstacle' ? 'bg-blue-600' : 'hover:bg-gray-700'}`} onClick={() => setTool('obstacle')} title="Нарисовать стену (Draw wall)">
                        <Paintbrush size={20} />
                    </button>
                </div>
            </div>
            
            <div className="absolute top-4 right-4 bg-gray-900/80 p-4 rounded-lg text-sm border border-gray-700 backdrop-blur-sm min-w-[200px]">
                <h2 className="font-bold text-lg mb-2 flex items-center gap-2"><Settings size={18} /> Клетки 4</h2>
                <p>Популяция: {stats.population}</p>
                <div className="mt-2 text-xs text-gray-400">Ср. Геном:</div>
                <div className="flex gap-2 text-xs">
                    <span className="text-red-400">R: {stats.avgR}</span>
                    <span className="text-green-400">G: {stats.avgG}</span>
                    <span className="text-blue-400">B: {stats.avgB}</span>
                </div>
                <div className="mt-4 text-xs text-gray-500">
                    ЛКМ/Колесико: Перемещение/Зум<br/>
                    ПКМ: Спавн клетки
                </div>
            </div>

            {/* Hover Tooltip */}
            {hoveredCell && (
                <div 
                    className="absolute pointer-events-none bg-gray-900/90 p-4 rounded border border-gray-600 shadow-xl backdrop-blur-md"
                    style={{ left: Math.min(window.innerWidth - 300, 20), bottom: 20, width: '280px' }}
                >
                    <div className="font-bold border-b border-gray-700 pb-1 mb-2 flex justify-between">
                        <span>Клетка #{hoveredCell.id}</span>
                        <span className="text-gray-400 text-xs">Родитель: {hoveredCell.parentId || 'Нет'}</span>
                    </div>
                    
                    <div className="text-xs space-y-1">
                        <div className="flex justify-between">
                            <span>Задача:</span> 
                            <span className="text-yellow-400">{Task[hoveredCell.task]}</span>
                        </div>
                        
                        <div className="my-2 p-2 bg-black/50 rounded flex gap-1 justify-center">
                            {hoveredCell.genome.map((v, i) => (
                                <span key={i} className="inline-block w-6 text-center text-[10px]" style={{
                                    color: i<3 ? ['#f55','#5f5','#55f'][i] : ['#f55','#5f5','#55f'][i-3],
                                    opacity: i>=3 ? 0.7 : 1
                                }}>{Math.round(v)}</span>
                            ))}
                        </div>

                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2 border-t border-gray-700 pt-2">
                            <div>ХП: {Math.round(hoveredCell.hp)}/{Math.round(hoveredCell.maxHp)}</div>
                            <div className="text-purple-400">Энергия: {Math.round(hoveredCell.energy)}</div>
                            <div className="text-red-400">Урон: {hoveredCell.attackDmg.toFixed(1)}</div>
                            <div className="text-blue-400">Броня: {(hoveredCell.armor*100).toFixed(0)}%</div>
                            <div className="text-red-300">Крит: {(hoveredCell.critChance*100).toFixed(0)}%</div>
                            <div className="text-green-400">Реген: {hoveredCell.regenRate.toFixed(1)}/s</div>
                            <div>КД: {hoveredCell.attackCD.toFixed(1)}s</div>
                            <div>Масса: {hoveredCell.mass.toFixed(1)}</div>
                        </div>
                        
                        {(hoveredCell.hardDamage > 0) && (
                            <div className="text-[10px] text-red-500 mt-1">
                                Хард-урон: {Math.round(hoveredCell.hardDamage)}
                            </div>
                        )}
                        
                        {hoveredCell.leaderId !== null && (
                            <div className="text-[10px] text-blue-300 mt-1">
                                Следует за: #{hoveredCell.leaderId}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}