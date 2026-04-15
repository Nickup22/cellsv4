import React, { useState, useEffect } from 'react';
import { Cell } from '../engine/Cell';
import { CONFIG } from '../engine/config';
import { Engine } from '../engine/Engine';
import { Play, Pause, FastForward, MousePointer2, Dna, Leaf, Minus, Trash2, Skull, Beef } from 'lucide-react';

interface UIProps {
  engine: Engine;
  hoveredCell: Cell | null;
  tool: string;
  setTool: (tool: string) => void;
  paused: boolean;
  setPaused: (paused: boolean) => void;
  timeSpeed: number;
  setTimeSpeed: (speed: number) => void;
}

export const UI: React.FC<UIProps> = ({ engine, hoveredCell, tool, setTool, paused, setPaused, timeSpeed, setTimeSpeed }) => {
  const [showSettings, setShowSettings] = useState(false);
  const [stats, setStats] = useState({ cells: 0, plants: 0, meat: 0 });
  const [toast, setToast] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    plantSpawnRate: CONFIG.PLANT_SPAWN_RATE,
    mutationRate: CONFIG.MUTATION_RATE,
    damageMult: CONFIG.DAMAGE_MULT
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setStats({
        cells: engine.cells.length,
        plants: engine.plants.length,
        meat: engine.meats.length
      });
      // Synchronize settings in case they were changed by load
      setSettings({
        plantSpawnRate: CONFIG.PLANT_SPAWN_RATE,
        mutationRate: CONFIG.MUTATION_RATE,
        damageMult: CONFIG.DAMAGE_MULT
      });
    }, 500);
    return () => clearInterval(interval);
  }, [engine]);

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4">
      {/* Top Bar */}
      <div className="flex justify-between items-start">
        <div className="flex gap-2 pointer-events-auto bg-zinc-900/80 p-2 rounded-lg border border-zinc-800 backdrop-blur-sm">
          <button 
            className={`p-2 rounded ${tool === 'pointer' ? 'bg-blue-600' : 'hover:bg-zinc-800'}`}
            onClick={() => setTool('pointer')}
            title="Pointer"
          >
            <MousePointer2 size={20} className="text-white" />
          </button>
          <button 
            className={`p-2 rounded ${tool === 'spawn_cell' ? 'bg-blue-600' : 'hover:bg-zinc-800'}`}
            onClick={() => setTool('spawn_cell')}
            title="Spawn Random Cell"
          >
            <Dna size={20} className="text-white" />
          </button>
          <button 
            className={`p-2 rounded ${tool === 'spawn_herbivore' ? 'bg-blue-600' : 'hover:bg-zinc-800'}`}
            onClick={() => setTool('spawn_herbivore')}
            title="Spawn Herbivore"
          >
            <Leaf size={20} className="text-green-400" />
          </button>
          <button 
            className={`p-2 rounded ${tool === 'spawn_carnivore' ? 'bg-blue-600' : 'hover:bg-zinc-800'}`}
            onClick={() => setTool('spawn_carnivore')}
            title="Spawn Carnivore"
          >
            <Beef size={20} className="text-red-400" />
          </button>
          <button 
            className={`p-2 rounded ${tool === 'spawn_plant' ? 'bg-blue-600' : 'hover:bg-zinc-800'}`}
            onClick={() => setTool('spawn_plant')}
            title="Spawn Plant"
          >
            <Leaf size={20} className="text-white" />
          </button>
          <button 
            className={`p-2 rounded ${tool === 'spawn_meat' ? 'bg-blue-600' : 'hover:bg-zinc-800'}`}
            onClick={() => setTool('spawn_meat')}
            title="Spawn Meat"
          >
            <Beef size={20} className="text-white" />
          </button>
          <button 
            className={`p-2 rounded ${tool === 'kill_cell' ? 'bg-blue-600' : 'hover:bg-zinc-800'}`}
            onClick={() => setTool('kill_cell')}
            title="Kill Cell"
          >
            <Skull size={20} className="text-white" />
          </button>
          <button 
            className={`p-2 rounded ${tool === 'add_obstacle' ? 'bg-blue-600' : 'hover:bg-zinc-800'}`}
            onClick={() => setTool('add_obstacle')}
            title="Add Obstacle"
          >
            <Minus size={20} className="text-white" />
          </button>
          <button 
            className={`p-2 rounded ${tool === 'remove_obstacle' ? 'bg-blue-600' : 'hover:bg-zinc-800'}`}
            onClick={() => setTool('remove_obstacle')}
            title="Remove Obstacle"
          >
            <Trash2 size={20} className="text-white" />
          </button>
          <div className="w-px bg-zinc-700 mx-1" />
          <button 
            className={`p-2 rounded hover:bg-zinc-800`}
            onClick={() => setPaused(!paused)}
            title={paused ? "Play" : "Pause"}
          >
            {paused ? <Play size={20} className="text-green-400" /> : <Pause size={20} className="text-yellow-400" />}
          </button>
          <button 
            className={`p-2 rounded hover:bg-zinc-800`}
            onClick={() => setTimeSpeed(timeSpeed === 1 ? 2 : timeSpeed === 2 ? 5 : 1)}
            title="Time Speed"
          >
            <div className="flex items-center text-white font-mono text-sm">
              <FastForward size={16} className="mr-1" />
              {timeSpeed}x
            </div>
          </button>
        </div>

        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="bg-zinc-900/80 text-white px-4 py-2 rounded-lg border border-zinc-800 backdrop-blur-sm flex gap-4 text-sm font-mono">
            <div><span className="text-zinc-400">Cells:</span> {stats.cells}</div>
            <div><span className="text-zinc-400">Plants:</span> {stats.plants}</div>
            <div><span className="text-zinc-400">Meat:</span> {stats.meat}</div>
          </div>
          <div className="flex gap-2">
            <button 
              className="bg-zinc-900/80 text-white px-4 py-2 rounded-lg border border-zinc-800 hover:bg-zinc-800 backdrop-blur-sm"
              onClick={() => {
                // We need to reset camera, but camera is in Simulation.tsx.
                // We can just dispatch a custom event.
                window.dispatchEvent(new CustomEvent('reset-camera'));
              }}
            >
              Reset Camera
            </button>
            <button 
              className="bg-zinc-900/80 text-white px-4 py-2 rounded-lg border border-zinc-800 hover:bg-zinc-800 backdrop-blur-sm"
              onClick={() => setShowSettings(!showSettings)}
            >
              Settings
            </button>
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="absolute top-32 right-4 w-80 bg-zinc-900/90 border border-zinc-800 rounded-lg p-4 pointer-events-auto backdrop-blur-md text-white overflow-y-auto max-h-[80vh]">
          <h2 className="text-lg font-bold mb-4">Simulation Settings</h2>
          <div className="space-y-4">
            <div>
              <label className="flex justify-between text-zinc-400 mb-1">
                <span>Plant Spawn Rate</span>
                <span>{(settings.plantSpawnRate * 60).toFixed(1)}/s</span>
              </label>
              <input 
                type="range" 
                min="0" max="0.1" step="0.001"
                value={settings.plantSpawnRate}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  CONFIG.PLANT_SPAWN_RATE = val;
                  setSettings(s => ({...s, plantSpawnRate: val}));
                }}
                className="w-full"
              />
            </div>
            <div>
              <label className="flex justify-between text-zinc-400 mb-1">
                <span>Mutation Rate</span>
                <span>{(settings.mutationRate * 100).toFixed(0)}%</span>
              </label>
              <input 
                type="range" 
                min="0" max="1" step="0.01"
                value={settings.mutationRate}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  CONFIG.MUTATION_RATE = val;
                  setSettings(s => ({...s, mutationRate: val}));
                }}
                className="w-full"
              />
            </div>
            <div>
              <label className="flex justify-between text-zinc-400 mb-1">
                <span>Damage Multiplier</span>
                <span>{settings.damageMult.toFixed(1)}x</span>
              </label>
              <input 
                type="range" 
                min="0.1" max="5" step="0.1"
                value={settings.damageMult}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  CONFIG.DAMAGE_MULT = val;
                  setSettings(s => ({...s, damageMult: val}));
                }}
                className="w-full"
              />
            </div>
            <div className="pt-4 border-t border-zinc-800 space-y-2">
              <button 
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-2 rounded border border-zinc-700 transition-colors"
                onClick={() => {
                  CONFIG.PLANT_SPAWN_RATE = 0.016;
                  CONFIG.MUTATION_RATE = 0.1;
                  CONFIG.DAMAGE_MULT = 1.0;
                  setSettings({
                    plantSpawnRate: 0.016,
                    mutationRate: 0.1,
                    damageMult: 1.0
                  });
                  showToast('Settings reset to default');
                }}
              >
                Reset Settings
              </button>
              <button 
                className="w-full bg-red-900/50 hover:bg-red-800/50 text-red-200 py-2 rounded border border-red-800/50 transition-colors"
                onClick={() => {
                  engine.cells = [];
                  engine.plants = [];
                  engine.meats = [];
                }}
              >
                Clear All Entities
              </button>
              <button 
                className="w-full bg-orange-900/50 hover:bg-orange-800/50 text-orange-200 py-2 rounded border border-orange-800/50 transition-colors"
                onClick={() => {
                  engine.obstacles = [];
                }}
              >
                Clear Obstacles
              </button>
            </div>
            <div className="pt-4 border-t border-zinc-800 flex gap-2">
              <button 
                className="flex-1 bg-blue-900/50 hover:bg-blue-800/50 text-blue-200 py-2 rounded border border-blue-800/50 transition-colors"
                onClick={() => {
                  const data = engine.serialize();
                  localStorage.setItem('cells4_save', data);
                  showToast('Saved to local storage!');
                }}
              >
                Save
              </button>
              <button 
                className="flex-1 bg-green-900/50 hover:bg-green-800/50 text-green-200 py-2 rounded border border-green-800/50 transition-colors"
                onClick={() => {
                  const data = localStorage.getItem('cells4_save');
                  if (data) {
                    engine.deserialize(data);
                    showToast('Loaded from local storage!');
                  } else {
                    showToast('No save found!');
                  }
                }}
              >
                Load
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-zinc-800 text-white px-4 py-2 rounded-lg shadow-lg border border-zinc-700 pointer-events-none animate-in fade-in slide-in-from-bottom-4">
          {toast}
        </div>
      )}

      {/* Hover Info */}
      {hoveredCell && (
        <div className="absolute bottom-4 right-4 w-72 bg-zinc-900/90 border border-zinc-800 rounded-lg p-4 text-white font-mono text-xs backdrop-blur-md pointer-events-auto">
          <div className="flex justify-between items-center mb-2 border-b border-zinc-700 pb-2">
            <span className="font-bold text-sm">Cell #{hoveredCell.id} (Gen {hoveredCell.generation})</span>
            <div className="flex items-center gap-2">
              <span className="text-zinc-400">{hoveredCell.task}</span>
              <button 
                className="p-1 bg-zinc-800 hover:bg-zinc-700 rounded"
                onClick={() => window.dispatchEvent(new CustomEvent('follow-cell', { detail: hoveredCell.id }))}
                title="Follow Cell"
              >
                <MousePointer2 size={12} className="text-blue-400" />
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <div className="text-zinc-500">Body (RGB)</div>
              <div className="flex gap-1">
                <span className="text-red-400">{hoveredCell.genome[0]}</span>
                <span className="text-green-400">{hoveredCell.genome[1]}</span>
                <span className="text-blue-400">{hoveredCell.genome[2]}</span>
              </div>
            </div>
            <div>
              <div className="text-zinc-500">Core (RGB)</div>
              <div className="flex gap-1">
                <span className="text-red-400">{hoveredCell.genome[3]}</span>
                <span className="text-green-400">{hoveredCell.genome[4]}</span>
                <span className="text-blue-400">{hoveredCell.genome[5]}</span>
              </div>
            </div>
          </div>

          <div className="space-y-1 mt-3">
            <div className="flex justify-between">
              <span className="text-zinc-400">HP</span>
              <span>{Math.floor(hoveredCell.hp)} / {Math.floor(hoveredCell.maxHp)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Hard Dmg</span>
              <span className="text-red-400">{Math.floor(hoveredCell.hardDamage)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Energy</span>
              <span className="text-yellow-400">{Math.floor(hoveredCell.energy)} / {CONFIG.MAX_ENERGY}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Damage</span>
              <span>{hoveredCell.damage.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Armor</span>
              <span>{(hoveredCell.armor * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Regen</span>
              <span>{hoveredCell.regenRate.toFixed(1)}/s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Speed</span>
              <span>{hoveredCell.maxSpeed.toFixed(0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Eaten</span>
              <span>{hoveredCell.plantsEaten} <Leaf size={10} className="inline text-green-400"/> / {hoveredCell.meatEaten} <Beef size={10} className="inline text-red-400"/></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
