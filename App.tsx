
import React, { useState } from 'react';
import { AppState, SoilClass, ConcreteClass, CalculationResult, GridSettings, AxisData, ViewMode, SectionOverride } from './types';
import { calculateStructure } from './utils/solver';
import { Plus, Trash2, Play, FileText, Settings, LayoutGrid, Eye, EyeOff, X, Download, Upload, BarChart3 } from 'lucide-react';
import Visualizer from './components/Visualizer';
import Report from './utils/report';
import BeamDetailPanel from './components/BeamDetailPanel';

const calculateTotalLength = (axes: AxisData[]) => axes.reduce((sum, axis) => sum + axis.spacing, 0);

// Varsayılan Başlangıç Değerleri
const INITIAL_STATE: AppState = {
  grid: {
    xAxis: [{ id: 'x1', spacing: 5 }, { id: 'x2', spacing: 4 }],
    yAxis: [{ id: 'y1', spacing: 4 }, { id: 'y2', spacing: 5 }]
  },
  dimensions: {
    storyCount: 2,
    h: 3,
    foundationHeight: 50,
    foundationCantilever: 50,
    lx: 9, // x1+x2
    ly: 9  // y1+y2
  },
  sections: {
    beamWidth: 25,
    beamDepth: 50,
    colWidth: 40,
    colDepth: 40,
    slabThickness: 15
  },
  loads: {
    liveLoadKg: 200,
    deadLoadCoatingsKg: 150
  },
  seismic: {
    ss: 1.2, s1: 0.4, soilClass: SoilClass.ZC, Rx: 8, I: 1.0
  },
  materials: { concreteClass: ConcreteClass.C30 },
  rebars: {
    slabDia: 8, beamMainDia: 14, beamStirrupDia: 8,
    colMainDia: 16, colStirrupDia: 8, foundationDia: 14
  },
  elementOverrides: {}
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [results, setResults] = useState<CalculationResult | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'inputs' | 'report'>('inputs');

  const updateState = (section: keyof AppState, payload: any) => {
    setState(prev => {
      const newState = { ...prev, [section]: { ...prev[section], ...payload } };
      
      // Grid değişirse boyutları güncelle
      if (section === 'grid') {
        newState.dimensions.lx = calculateTotalLength(newState.grid.xAxis);
        newState.dimensions.ly = calculateTotalLength(newState.grid.yAxis);
      }
      return newState;
    });
    // Her değişiklikte sonuçları sıfırla ki kullanıcı tekrar hesaplasın
    setResults(null);
    setSelectedElementId(null);
  };

  const handleCalculate = () => {
    try {
      const res = calculateStructure(state);
      setResults(res);
      setActiveTab('report');
      setSelectedElementId(null);
    } catch (e) {
      console.error(e);
      alert("Hesaplama sırasında bir hata oluştu. Lütfen parametreleri kontrol edin.");
    }
  };

  const handleDownloadProject = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "yapisal_analiz_projesi.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (json.grid && json.dimensions) {
          setState(json);
          setResults(null);
        } else {
          alert("Geçersiz proje dosyası.");
        }
      } catch (error) {
        alert("Dosya okunamadı.");
      }
    };
    reader.readAsText(file);
  };

  // Grid Yönetimi
  const addAxis = (axis: 'x' | 'y') => {
    const newAxis = { id: Math.random().toString(36).substr(2, 5), spacing: 4 };
    const currentAxes = axis === 'x' ? state.grid.xAxis : state.grid.yAxis;
    updateState('grid', { [axis === 'x' ? 'xAxis' : 'yAxis']: [...currentAxes, newAxis] });
  };

  const removeAxis = (axis: 'x' | 'y', index: number) => {
    const currentAxes = axis === 'x' ? state.grid.xAxis : state.grid.yAxis;
    if (currentAxes.length <= 1) return;
    const newAxes = [...currentAxes];
    newAxes.splice(index, 1);
    updateState('grid', { [axis === 'x' ? 'xAxis' : 'yAxis']: newAxes });
  };

  const updateAxis = (axis: 'x' | 'y', index: number, val: number) => {
    const currentAxes = axis === 'x' ? state.grid.xAxis : state.grid.yAxis;
    const newAxes = [...currentAxes];
    newAxes[index] = { ...newAxes[index], spacing: val };
    updateState('grid', { [axis === 'x' ? 'xAxis' : 'yAxis']: newAxes });
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900">
      
      {/* HEADER */}
      <header className="bg-slate-900 text-white p-4 shadow-md z-20">
        <div className="container mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-6 h-6 text-blue-400" />
            <div>
              <h1 className="text-xl font-bold tracking-tight">Betonarme Statik Analiz</h1>
              <p className="text-xs text-slate-400">TS500 & TBDY 2018 (Hızlı Ön Tasarım)</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
             <div className="flex bg-slate-800 rounded-lg p-1">
                <button 
                  onClick={() => setActiveTab('inputs')}
                  className={`px-3 py-1.5 rounded-md text-sm flex items-center gap-2 transition-all ${activeTab === 'inputs' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                >
                  <Settings className="w-4 h-4" /> Giriş
                </button>
                <button 
                   onClick={() => results ? setActiveTab('report') : alert('Önce analiz yapmalısınız.')}
                   className={`px-3 py-1.5 rounded-md text-sm flex items-center gap-2 transition-all ${activeTab === 'report' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                >
                  <FileText className="w-4 h-4" /> Rapor
                </button>
             </div>

             <div className="h-6 w-px bg-slate-700 mx-2"></div>

             <button onClick={handleDownloadProject} className="p-2 hover:bg-slate-800 rounded text-slate-300 hover:text-white" title="Projeyi Kaydet">
                <Download className="w-5 h-5" />
             </button>
             <label className="p-2 hover:bg-slate-800 rounded text-slate-300 hover:text-white cursor-pointer" title="Proje Aç">
                <Upload className="w-5 h-5" />
                <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
             </label>

             <button 
                onClick={handleCalculate}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg hover:shadow-green-500/20 transition-all"
             >
                <Play className="w-5 h-5 fill-current" /> ANALİZ ET
             </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 container mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT PANEL: INPUTS (Only visible in 'inputs' tab) */}
        {activeTab === 'inputs' && (
          <div className="lg:col-span-4 space-y-4 max-h-[calc(100vh-120px)] overflow-y-auto pr-2 custom-scrollbar">
            
            {/* GEOMETRİ AYARLARI */}
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 p-3 border-b flex items-center gap-2 font-bold text-slate-700">
                <LayoutGrid className="w-4 h-4" /> Geometri ve Akslar
              </div>
              <div className="p-4 space-y-4 text-sm">
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-500 mb-1">Kat Adedi</label>
                      <input type="number" min="1" max="10" className="w-full border rounded p-2" 
                        value={state.dimensions.storyCount} 
                        onChange={(e) => updateState('dimensions', { storyCount: Number(e.target.value) })} 
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 mb-1">Kat Yüksekliği (m)</label>
                      <input type="number" step="0.1" className="w-full border rounded p-2" 
                        value={state.dimensions.h} 
                        onChange={(e) => updateState('dimensions', { h: Number(e.target.value) })} 
                      />
                    </div>
                 </div>

                 {/* X Aksları */}
                 <div>
                    <label className="block text-slate-500 mb-1 flex justify-between">
                      X Aks Açıklıkları (m) 
                      <button onClick={() => addAxis('x')} className="text-blue-600 hover:text-blue-800"><Plus className="w-4 h-4"/></button>
                    </label>
                    <div className="space-y-2">
                      {state.grid.xAxis.map((axis, i) => (
                        <div key={axis.id} className="flex gap-2 items-center">
                           <span className="w-6 text-center text-xs font-mono bg-slate-100 rounded">{i+1}</span>
                           <input type="number" className="flex-1 border rounded p-1" value={axis.spacing} onChange={(e) => updateAxis('x', i, Number(e.target.value))} />
                           <button onClick={() => removeAxis('x', i)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4"/></button>
                        </div>
                      ))}
                    </div>
                 </div>

                 {/* Y Aksları */}
                 <div>
                    <label className="block text-slate-500 mb-1 flex justify-between">
                      Y Aks Açıklıkları (m)
                      <button onClick={() => addAxis('y')} className="text-blue-600 hover:text-blue-800"><Plus className="w-4 h-4"/></button>
                    </label>
                    <div className="space-y-2">
                      {state.grid.yAxis.map((axis, i) => (
                        <div key={axis.id} className="flex gap-2 items-center">
                           <span className="w-6 text-center text-xs font-mono bg-slate-100 rounded">{String.fromCharCode(65+i)}</span>
                           <input type="number" className="flex-1 border rounded p-1" value={axis.spacing} onChange={(e) => updateAxis('y', i, Number(e.target.value))} />
                           <button onClick={() => removeAxis('y', i)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4"/></button>
                        </div>
                      ))}
                    </div>
                 </div>
              </div>
            </section>

             {/* KESİT AYARLARI */}
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
               <div className="bg-slate-50 p-3 border-b flex items-center gap-2 font-bold text-slate-700">
                <div className="w-4 h-4 bg-slate-400 rounded-sm"></div> Kesitler (cm)
              </div>
              <div className="p-4 grid grid-cols-2 gap-4 text-sm">
                 <div>
                    <label className="block text-slate-500 mb-1">Kiriş Genişlik</label>
                    <input type="number" className="w-full border rounded p-2" value={state.sections.beamWidth} onChange={(e) => updateState('sections', { beamWidth: Number(e.target.value) })} />
                 </div>
                 <div>
                    <label className="block text-slate-500 mb-1">Kiriş Yükseklik</label>
                    <input type="number" className="w-full border rounded p-2" value={state.sections.beamDepth} onChange={(e) => updateState('sections', { beamDepth: Number(e.target.value) })} />
                 </div>
                 <div>
                    <label className="block text-slate-500 mb-1">Kolon Genişlik</label>
                    <input type="number" className="w-full border rounded p-2" value={state.sections.colWidth} onChange={(e) => updateState('sections', { colWidth: Number(e.target.value) })} />
                 </div>
                 <div>
                    <label className="block text-slate-500 mb-1">Kolon Derinlik</label>
                    <input type="number" className="w-full border rounded p-2" value={state.sections.colDepth} onChange={(e) => updateState('sections', { colDepth: Number(e.target.value) })} />
                 </div>
                 <div className="col-span-2">
                    <label className="block text-slate-500 mb-1">Döşeme Kalınlığı</label>
                    <input type="number" className="w-full border rounded p-2" value={state.sections.slabThickness} onChange={(e) => updateState('sections', { slabThickness: Number(e.target.value) })} />
                 </div>
              </div>
            </section>

            {/* YÜK VE MALZEME */}
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
               <div className="bg-slate-50 p-3 border-b flex items-center gap-2 font-bold text-slate-700">
                <BarChart3 className="w-4 h-4" /> Yük ve Malzeme
              </div>
              <div className="p-4 grid grid-cols-2 gap-4 text-sm">
                 <div>
                    <label className="block text-slate-500 mb-1">Hareketli Yük (kg/m²)</label>
                    <input type="number" className="w-full border rounded p-2" value={state.loads.liveLoadKg} onChange={(e) => updateState('loads', { liveLoadKg: Number(e.target.value) })} />
                 </div>
                 <div>
                    <label className="block text-slate-500 mb-1">Kaplama Yükü (kg/m²)</label>
                    <input type="number" className="w-full border rounded p-2" value={state.loads.deadLoadCoatingsKg} onChange={(e) => updateState('loads', { deadLoadCoatingsKg: Number(e.target.value) })} />
                 </div>
                 <div>
                    <label className="block text-slate-500 mb-1">Beton Sınıfı</label>
                    <select className="w-full border rounded p-2" value={state.materials.concreteClass} onChange={(e) => updateState('materials', { concreteClass: e.target.value })}>
                       {Object.values(ConcreteClass).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                 </div>
                 <div>
                    <label className="block text-slate-500 mb-1">Zemin Sınıfı</label>
                    <select className="w-full border rounded p-2" value={state.seismic.soilClass} onChange={(e) => updateState('seismic', { soilClass: e.target.value })}>
                       {Object.values(SoilClass).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                 </div>
              </div>
            </section>
          </div>
        )}

        {/* RIGHT PANEL: VISUALIZATION & REPORT */}
        <div className={`${activeTab === 'inputs' ? 'lg:col-span-8' : 'col-span-12'} h-full flex flex-col gap-6 relative`}>
           
           {/* Visualizer Alanı */}
           <div className={`transition-all duration-300 ${activeTab === 'report' ? 'h-96' : 'h-[600px]'} w-full relative`}>
              <Visualizer 
                state={state} 
                selectedElementId={selectedElementId}
                onElementSelect={setSelectedElementId}
              />

              {/* DETAY PANELİ (GRAFİKLER) */}
              {/* Burası "Elemana tıklandığında yükler gösterilmiyor" sorununu çözen kısımdır. */}
              {results && selectedElementId && results.memberResults.has(selectedElementId) && (
                <BeamDetailPanel 
                  data={results.memberResults.get(selectedElementId)!}
                  onClose={() => setSelectedElementId(null)}
                />
              )}
           </div>
           
           {/* Rapor Alanı (Sadece Rapor sekmesinde) */}
           {activeTab === 'report' && results && (
             <div className="animate-in fade-in slide-in-from-bottom-10 pb-20">
                <Report state={state} results={results} />
             </div>
           )}

        </div>

      </main>
    </div>
  );
};

export default App;
