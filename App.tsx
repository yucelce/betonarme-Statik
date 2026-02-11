// App.tsx
import React, { useState, useEffect } from 'react';
import { AppState, SoilClass, ConcreteClass, AnalysisSummary, AxisData } from './types';
import { calculateFullStructure } from './utils/solver';
import { Plus, Trash2, Activity, Play } from 'lucide-react';
import Visualizer from './components/Visualizer'; // Visualizer'ın da güncellenmesi gerekir!

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    grid: {
      xAxis: [{ id: 'x1', spacing: 4 }, { id: 'x2', spacing: 5 }], // Varsayılan 2 açıklık
      yAxis: [{ id: 'y1', spacing: 4 }, { id: 'y2', spacing: 4 }]
    },
    dimensions: { storyCount: 3, h: 3, foundationHeight: 50, foundationCantilever: 50 },
    sections: { defaultBeamWidth: 25, defaultBeamDepth: 50, defaultColWidth: 40, defaultColDepth: 40, defaultSlabThickness: 14 },
    loads: { liveLoadKg: 200, deadLoadCoatingsKg: 150 },
    seismic: { ss: 1.2, s1: 0.35, soilClass: SoilClass.ZC, Rx: 8, I: 1.0 },
    materials: { concreteClass: ConcreteClass.C30 },
    rebars: { slabDia: 8, beamMainDia: 14, beamStirrupDia: 8, colMainDia: 16, colStirrupDia: 8, foundationDia: 14 }
  });

  const [results, setResults] = useState<AnalysisSummary | null>(null);

  const handleAddAxis = (dir: 'x' | 'y') => {
    setState(prev => ({
      ...prev,
      grid: {
        ...prev.grid,
        [dir === 'x' ? 'xAxis' : 'yAxis']: [
          ...prev.grid[dir === 'x' ? 'xAxis' : 'yAxis'],
          { id: `${dir}${Date.now()}`, spacing: 4 }
        ]
      }
    }));
  };

  const handleRemoveAxis = (dir: 'x' | 'y', idx: number) => {
    setState(prev => {
      const newAxes = [...prev.grid[dir === 'x' ? 'xAxis' : 'yAxis']];
      if (newAxes.length > 1) newAxes.splice(idx, 1);
      return {
        ...prev,
        grid: { ...prev.grid, [dir === 'x' ? 'xAxis' : 'yAxis']: newAxes }
      };
    });
  };

  const handleAxisChange = (dir: 'x' | 'y', idx: number, val: number) => {
    setState(prev => {
      const newAxes = [...prev.grid[dir === 'x' ? 'xAxis' : 'yAxis']];
      newAxes[idx].spacing = val;
      return {
        ...prev,
        grid: { ...prev.grid, [dir === 'x' ? 'xAxis' : 'yAxis']: newAxes }
      };
    });
  };

  const runAnalysis = () => {
    setResults(calculateFullStructure(state));
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm">
          <h1 className="text-2xl font-bold text-slate-800">Yapısal Analiz (Grid Sistemi)</h1>
          <button onClick={runAnalysis} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700">
            <Play className="w-4 h-4" /> Hesapla
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Sol Panel: Akslar ve Ayarlar */}
          <div className="space-y-4">
            
            {/* AKS EDİTÖRÜ */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <h2 className="font-bold text-slate-700 mb-4">Aks Sistemi (Açıklıklar)</h2>
              
              {/* X Aksları */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-blue-600">X Yönü Açıklıkları (m)</span>
                  <button onClick={() => handleAddAxis('x')} className="text-blue-600 hover:bg-blue-50 p-1 rounded"><Plus className="w-4 h-4"/></button>
                </div>
                <div className="space-y-2">
                  {state.grid.xAxis.map((axis, i) => (
                    <div key={axis.id} className="flex gap-2 items-center">
                      <span className="text-xs text-slate-400 w-6">A{i+1}-A{i+2}</span>
                      <input 
                        type="number" 
                        value={axis.spacing} 
                        onChange={(e) => handleAxisChange('x', i, +e.target.value)}
                        className="w-full p-2 border rounded text-sm"
                      />
                      <button onClick={() => handleRemoveAxis('x', i)} className="text-red-400"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Y Aksları */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-green-600">Y Yönü Açıklıkları (m)</span>
                  <button onClick={() => handleAddAxis('y')} className="text-green-600 hover:bg-green-50 p-1 rounded"><Plus className="w-4 h-4"/></button>
                </div>
                <div className="space-y-2">
                  {state.grid.yAxis.map((axis, i) => (
                    <div key={axis.id} className="flex gap-2 items-center">
                      <span className="text-xs text-slate-400 w-6">B{i+1}-B{i+2}</span>
                      <input 
                        type="number" 
                        value={axis.spacing} 
                        onChange={(e) => handleAxisChange('y', i, +e.target.value)}
                        className="w-full p-2 border rounded text-sm"
                      />
                      <button onClick={() => handleRemoveAxis('y', i)} className="text-red-400"><Trash2 className="w-4 h-4"/></button>
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
                   <input type="number" value={state.dimensions.storyCount} onChange={e=>setState({...state, dimensions:{...state.dimensions, storyCount:+e.target.value}})} className="w-full border rounded p-1"/>
                 </div>
                 <div>
                   <label className="text-[10px] text-slate-500">Kiriş Boyut</label>
                   <div className="flex gap-1">
                     <input type="number" value={state.sections.defaultBeamWidth} className="w-1/2 border rounded p-1" readOnly/>
                     <input type="number" value={state.sections.defaultBeamDepth} className="w-1/2 border rounded p-1" readOnly/>
                   </div>
                 </div>
               </div>
            </div>

          </div>

          {/* Orta Panel: Sonuçlar */}
          <div className="lg:col-span-2 space-y-4">
             {results ? (
               <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                 <div className="bg-white p-4 rounded-xl border-l-4 border-blue-500 shadow-sm">
                   <div className="text-xs text-slate-500">Toplam Bina Ağırlığı</div>
                   <div className="text-2xl font-bold text-slate-800">{results.totalWeight_kN.toFixed(1)} kN</div>
                 </div>
                 <div className="bg-white p-4 rounded-xl border-l-4 border-red-500 shadow-sm">
                   <div className="text-xs text-slate-500">Taban Kesme Kuvveti</div>
                   <div className="text-2xl font-bold text-slate-800">{results.baseShear_kN.toFixed(1)} kN</div>
                 </div>
                 <div className="bg-white p-4 rounded-xl border-l-4 border-purple-500 shadow-sm">
                   <div className="text-xs text-slate-500">Max Kiriş Momenti</div>
                   <div className="text-2xl font-bold text-slate-800">{results.maxBeamMoment_kNm.toFixed(1)} kNm</div>
                 </div>
                 
                 {/* Buraya Visualizer eklenebilir, ancak Grid'e göre yeniden yazılması gerekir */}
                 <div className="col-span-full bg-slate-100 p-8 text-center rounded-xl border border-dashed border-slate-300">
                    <p className="text-slate-500">Grid Görselleştirmesi İçin Visualizer Bileşeni Güncellenmelidir.</p>
                    <p className="text-xs text-slate-400 mt-2">Model: {state.grid.xAxis.length}x{state.grid.yAxis.length} açıklık</p>
                 </div>
               </div>
             ) : (
               <div className="h-full flex items-center justify-center text-slate-400 bg-white rounded-xl border border-dashed">
                 Hesaplama yapmak için butona basın.
               </div>
             )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default App;