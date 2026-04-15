import React, { useState, useEffect, useMemo } from 'react';
import { Engine } from './engine/Engine';
import { Simulation } from './components/Simulation';
import { UI } from './components/UI';
import { Cell } from './engine/Cell';
import { CONFIG } from './engine/config';

export default function App() {
  const engine = useMemo(() => new Engine(), []);
  const [hoveredCell, setHoveredCell] = useState<Cell | null>(null);
  const [tool, setTool] = useState('pointer');
  const [paused, setPaused] = useState(false);
  const [timeSpeed, setTimeSpeed] = useState(1);

  useEffect(() => {
    engine.init();
    
    // Initial spawn
    for (let i = 0; i < 50; i++) {
      engine.spawnCell(Math.random() * CONFIG.WORLD_WIDTH, Math.random() * CONFIG.WORLD_HEIGHT);
    }
    for (let i = 0; i < 200; i++) {
      engine.spawnPlant(Math.random() * CONFIG.WORLD_WIDTH, Math.random() * CONFIG.WORLD_HEIGHT);
    }
  }, [engine]);

  useEffect(() => {
    engine.paused = paused;
  }, [paused, engine]);

  useEffect(() => {
    CONFIG.TIME_SPEED = timeSpeed;
  }, [timeSpeed]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black text-white selection:bg-zinc-800">
      <Simulation engine={engine} setHoveredCell={setHoveredCell} tool={tool} />
      <UI 
        engine={engine}
        hoveredCell={hoveredCell} 
        tool={tool} 
        setTool={setTool} 
        paused={paused} 
        setPaused={setPaused} 
        timeSpeed={timeSpeed} 
        setTimeSpeed={setTimeSpeed} 
      />
    </div>
  );
}

