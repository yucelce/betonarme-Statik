// App.tsx
import React, { useState } from 'react';
import { AppState, SoilClass, ConcreteClass, CalculationResult, GridSettings, AxisData } from './types';
import { calculateStructure } from './utils/solver';
import { Plus, Trash2, Play } from 'lucide-react';
import Visualizer from './components/Visualizer';

const calculateTotalLength = (axes: AxisData[]) => axes.reduce((sum, axis) => sum + axis.spacing, 0);

const App: React.FC = () => {
  // Initial axes
  const initialXAxis = [{ id: 'x1', spacing: 4 }, { id: 'x2', spacing: 5 }];
  const initialYAxis = [{ id: 'y1', spacing: 4 }, { id: 'y2', spacing: 4 }];

  const [state, setState] = useState<AppState>({
    grid: {
      xAxis: initialXAxis,
      yAxis: initialYAxis
    },
    dimensions: {
      storyCount: 3,
      h: 3,
      foundationHeight: 50,
      foundationCantilever: 50,
      lx: calculateTotalLength(initialXAxis),
      ly: calculateTotalLength(initialYAxis)
    },
    sections: {
      beamWidth: 25,
      beamDepth: 50,
      colWidth: 40,
      colDepth: 40,
      slabThickness: 14
    },
    loads: { liveLoadKg: 200, deadLoadCoatingsKg: 150 },
    seismic: { ss: 1.2, s1: 0.35, soilClass: SoilClass.ZC, Rx: 8, I: 1.0 },
    materials: { concreteClass: ConcreteClass.C30 },
    rebars: { slabDia: 8, beamMainDia: 14, beamStirrupDia: 8, colMainDia: 16, colStirrupDia: 8, foundationDia: 14 }
  });

  const [results, setResults] = useState<CalculationResult | null>(null);

  // Helper to update dimensions when grid changes
  const updateGridAndDimensions = (newGrid: GridSettings) => {
    setState(prev => ({
      ...prev,
      grid: newGrid,
      dimensions: {
        ...prev.dimensions,
        lx: calculateTotalLength(newGrid.xAxis),
        ly: calculateTotalLength(newGrid.yAxis)
      }
    }));
  };

  const handleAddAxis = (dir: 'x' | 'y') => {
    const currentAxes = dir === 'x' ? state.grid.xAxis : state.grid.yAxis;
    const newAxes = [
      ...currentAxes,
      { id: `${dir}${Date.now()}`, spacing: 4 }
    ];

    const newGrid = {
      ...state.grid,
      [dir === 'x' ? 'xAxis' : 'yAxis']: newAxes
    };

    updateGridAndDimensions(newGrid);
  };

  const handleRemoveAxis = (dir: 'x' | 'y', idx: number) => {
    const currentAxes = dir === 'x' ? state.grid.xAxis : state.grid.yAxis;
    if (currentAxes.length <= 1) return;

    const newAxes = [...currentAxes];
    newAxes.splice(idx, 1);

    const newGrid = {
      ...state.grid,
      [dir === 'x' ? 'xAxis' : 'yAxis']: newAxes
    };

    updateGridAndDimensions(newGrid);
  };

  const handleAxisChange = (dir: 'x' | 'y', idx: number, val: number) => {
    const currentAxes = dir === 'x' ? state.grid.xAxis : state.grid.yAxis;
    const newAxes = [...currentAxes];
    newAxes[idx] = { ...newAxes[idx], spacing: val };

    const newGrid = {
      ...state.grid,
      [dir === 'x' ? 'xAxis' : 'yAxis']: newAxes
    };

    updateGridAndDimensions(newGrid);
  };

  const runAnalysis = () => {
    setResults(calculateStructure(state));
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <header className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm">
          <h1 className="text-2xl font-bold text-slate-800">Yapısal Analiz (Grid Sistemi)</h1>
          <button onClick={runAnalysis} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700">
            <Play className="w-4 h-4" /> Hesapla
          </button>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

          {/* Sol Panel: Akslar ve Ayarlar (3/12 width) */}
          <div className="xl:col-span-3 space-y-4">
            {/* AKS EDİTÖRÜ */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <h2 className="font-bold text-slate-700 mb-4">Aks Sistemi</h2>

              {/* X Aksları */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-blue-600">X Yönü (m)</span>
                  <button onClick={() => handleAddAxis('x')} className="text-blue-600 hover:bg-blue-50 p-1 rounded"><Plus className="w-4 h-4" /></button>
                </div>
                <div className="space-y-2">
                  {state.grid.xAxis.map((axis, i) => (
                    <div key={axis.id} className="flex gap-2 items-center">
                      <span className="text-xs text-slate-400 w-6">A{i + 1}</span>
                      <input
                        type="number"
                        value={axis.spacing}
                        onChange={(e) => handleAxisChange('x', i, +e.target.value)}
                        className="w-full p-2 border rounded text-sm"
                      />
                      <button onClick={() => handleRemoveAxis('x', i)} className="text-red-400"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Y Aksları */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-green-600">Y Yönü (m)</span>
                  <button onClick={() => handleAddAxis('y')} className="text-green-600 hover:bg-green-50 p-1 rounded"><Plus className="w-4 h-4" /></button>
                </div>
                <div className="space-y-2">
                  {state.grid.yAxis.map((axis, i) => (
                    <div key={axis.id} className="flex gap-2 items-center">
                      <span className="text-xs text-slate-400 w-6">B{i + 1}</span>
                      <input
                        type="number"
                        value={axis.spacing}
                        onChange={(e) => handleAxisChange('y', i, +e.target.value)}
                        className="w-full p-2 border rounded text-sm"
                      />
                      <button onClick={() => handleRemoveAxis('y', i)} className="text-red-400"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Kat ve Kesit Ayarları */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-slate-700 mb-2 text-sm">Kat & Kesit</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <label className="text-[10px] text-slate-500">Kat Adedi</label>
                  <input type="number" value={state.dimensions.storyCount} onChange={e => setState({ ...state, dimensions: { ...state.dimensions, storyCount: +e.target.value } })} className="w-full border rounded p-1" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500">Kiriş (cm)</label>
                  <div className="flex gap-1">
                    <input type="number" title="Genişlik" value={state.sections.beamWidth} onChange={e => setState({ ...state, sections: { ...state.sections, beamWidth: +e.target.value } })} className="w-1/2 border rounded p-1" />
                    <input type="number" title="Yükseklik" value={state.sections.beamDepth} onChange={e => setState({ ...state, sections: { ...state.sections, beamDepth: +e.target.value } })} className="w-1/2 border rounded p-1" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500">Kolon (cm)</label>
                  <div className="flex gap-1">
                    <input type="number" title="Genişlik" value={state.sections.colWidth} onChange={e => setState({ ...state, sections: { ...state.sections, colWidth: +e.target.value } })} className="w-1/2 border rounded p-1" />
                    <input type="number" title="Derinlik" value={state.sections.colDepth} onChange={e => setState({ ...state, sections: { ...state.sections, colDepth: +e.target.value } })} className="w-1/2 border rounded p-1" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sağ Panel: Görselleştirme ve Sonuçlar (9/12 width) */}
          <div className="xl:col-span-9 space-y-4">
            
            {/* 1. Görselleştirici (Her zaman görünür) */}
            <div className="h-[400px] lg:h-[500px]">
               <Visualizer state={state} />
            </div>

            {/* 2. Sonuç Kartları (Hesaplandıysa görünür) */}
            {results ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border-l-4 border-blue-500 shadow-sm">
                  <div className="text-xs text-slate-500">Bina Ağırlığı</div>
                  <div className="text-xl font-bold text-slate-800">{results.seismic.building_weight.toFixed(1)} kN</div>
                </div>
                <div className="bg-white p-4 rounded-xl border-l-4 border-red-500 shadow-sm">
                  <div className="text-xs text-slate-500">Taban Kesme Kuvveti</div>
                  <div className="text-xl font-bold text-slate-800">{results.seismic.base_shear.toFixed(1)} kN</div>
                </div>
                <div className="bg-white p-4 rounded-xl border-l-4 border-purple-500 shadow-sm">
                  <div className="text-xs text-slate-500">Max Kiriş Momenti</div>
                  <div className="text-xl font-bold text-slate-800">{results.beams.moment_support.toFixed(1)} kNm</div>
                </div>
                <div className="bg-white p-4 rounded-xl border-l-4 border-green-500 shadow-sm">
                  <div className="text-xs text-slate-500">Periyot (T1)</div>
                  <div className="text-xl font-bold text-slate-800">{results.seismic.period_t1.toFixed(3)} s</div>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-slate-400 bg-white rounded-xl border border-dashed">
                Detaylı sonuçlar için "Hesapla" butonuna basın.
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default App;