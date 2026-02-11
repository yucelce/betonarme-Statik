// App.tsx
import React, { useState } from 'react';
import { AppState, SoilClass, ConcreteClass, CalculationResult, GridSettings, AxisData, ViewMode } from './types';
import { calculateStructure } from './utils/solver';
import { Plus, Trash2, Play, FileText, Settings, LayoutGrid, Eye, EyeOff } from 'lucide-react';
import Visualizer from './components/Visualizer';
// HATA 1 DÜZELTİLDİ: Report bileşeni 'utils' klasörü altındaydı, import yolu düzeltildi.
import Report from './utils/report';
import { Download, Upload } from 'lucide-react';

const calculateTotalLength = (axes: AxisData[]) => axes.reduce((sum, axis) => sum + axis.spacing, 0);



const App: React.FC = () => {
  const handleDownloadProject = () => {
    // 1. State'i okunabilir JSON formatına çevir
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));

    // 2. İndirme linki oluştur
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "yapisal_analiz_projesi.json");

    // 3. Tıkla ve kaldır
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  // PROJEYİ YÜKLE (JSON OKU)
  const handleUploadProject = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    const file = event.target.files?.[0];

    if (!file) return;

    fileReader.readAsText(file, "UTF-8");
    fileReader.onload = (e) => {
      try {
        const result = e.target?.result;
        if (typeof result === 'string') {
          const loadedState = JSON.parse(result);

          // Basit bir doğrulama yapalım (Dosyanın doğru formatta olup olmadığını anlamak için)
          if (loadedState.grid && loadedState.dimensions && loadedState.materials) {
            setState(loadedState);
            // Eğer varsa eski sonuçları temizle ki yeni projeye göre tekrar hesaplansın
            setResults(null);
            alert("Proje başarıyla yüklendi!");
          } else {
            alert("Hata: Geçersiz proje dosyası.");
          }
        }
      } catch (error) {
        console.error(error);
        alert("Dosya okunurken bir hata oluştu.");
      }
    };
    // Aynı dosyayı tekrar seçebilmek için input değerini sıfırla
    event.target.value = '';
  };
  const initialXAxis = [{ id: 'x1', spacing: 4 }, { id: 'x2', spacing: 5 }];
  const initialYAxis = [{ id: 'y1', spacing: 4 }, { id: 'y2', spacing: 4 }];

  const [activeTab, setActiveTab] = useState<'design' | 'report'>('design');
  const [viewMode, setViewMode] = useState<ViewMode>('normal');

  const [state, setState] = useState<AppState>({
    grid: { xAxis: initialXAxis, yAxis: initialYAxis },
    dimensions: {
      storyCount: 3, h: 3, foundationHeight: 50, foundationCantilever: 50,
      lx: calculateTotalLength(initialXAxis), ly: calculateTotalLength(initialYAxis)
    },
    sections: {
      beamWidth: 25, beamDepth: 50, colWidth: 40, colDepth: 40, slabThickness: 14
    },
    loads: { liveLoadKg: 200, deadLoadCoatingsKg: 150 },
    seismic: { ss: 1.2, s1: 0.35, soilClass: SoilClass.ZC, Rx: 8, I: 1.0 },
    materials: { concreteClass: ConcreteClass.C30 },
    rebars: { slabDia: 10, beamMainDia: 14, beamStirrupDia: 8, colMainDia: 16, colStirrupDia: 8, foundationDia: 14 }
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

// Eleman seçildiğinde çalışacak fonksiyon
const handleElementSelect = (id: string | null) => {
    setSelectedElementId(id);
};

// Eleman boyutunu güncelleme fonksiyonu
const updateElementSection = (width: number, depth: number) => {
    if (!selectedElementId) return;
    
    setState(prev => ({
        ...prev,
        elementOverrides: {
            ...prev.elementOverrides,
            [selectedElementId]: { width, depth }
        }
    }));
};

// Özelleştirmeyi silip genele dönme fonksiyonu
const resetElementSection = () => {
    if (!selectedElementId) return;
    
    const newOverrides = { ...state.elementOverrides };
    delete newOverrides[selectedElementId];
    
    setState(prev => ({ ...prev, elementOverrides: newOverrides }));
};
  });

  const [results, setResults] = useState<CalculationResult | null>(null);

  const updateGridAndDimensions = (newGrid: GridSettings) => {
    setState(prev => ({
      ...prev, grid: newGrid,
      dimensions: { ...prev.dimensions, lx: calculateTotalLength(newGrid.xAxis), ly: calculateTotalLength(newGrid.yAxis) }
    }));
  };

  const handleAddAxis = (dir: 'x' | 'y') => {
    const currentAxes = dir === 'x' ? state.grid.xAxis : state.grid.yAxis;
    const newAxes = [...currentAxes, { id: `${dir}${Date.now()}`, spacing: 4 }];
    updateGridAndDimensions({ ...state.grid, [dir === 'x' ? 'xAxis' : 'yAxis']: newAxes });
  };

  const handleRemoveAxis = (dir: 'x' | 'y', idx: number) => {
    const currentAxes = dir === 'x' ? state.grid.xAxis : state.grid.yAxis;
    if (currentAxes.length <= 1) return;
    const newAxes = [...currentAxes];
    newAxes.splice(idx, 1);
    updateGridAndDimensions({ ...state.grid, [dir === 'x' ? 'xAxis' : 'yAxis']: newAxes });
  };

  const handleAxisChange = (dir: 'x' | 'y', idx: number, val: number) => {
    const currentAxes = dir === 'x' ? state.grid.xAxis : state.grid.yAxis;
    const newAxes = [...currentAxes];
    newAxes[idx] = { ...newAxes[idx], spacing: val };
    updateGridAndDimensions({ ...state.grid, [dir === 'x' ? 'xAxis' : 'yAxis']: newAxes });
  };

  const runAnalysis = () => {
    const res = calculateStructure(state);
    setResults(res);
    setViewMode('analysis');
    if (activeTab === 'report') setActiveTab('design'); // Kalmak veya geçmek tercih
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">

      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-3 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold">Y</div>
          <h1 className="text-xl font-bold text-slate-800">Yapısal Analiz</h1>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button onClick={() => setActiveTab('design')} className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${activeTab === 'design' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>Tasarım</button>
          <button onClick={() => setActiveTab('report')} disabled={!results} className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors flex items-center gap-2 ${activeTab === 'report' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700 disabled:opacity-50'}`}>
            <FileText className="w-4 h-4" /> Rapor
          </button>
        </div>

        <button onClick={runAnalysis} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 shadow-md shadow-blue-200 transition-all active:scale-95">
          <Play className="w-4 h-4" /> HESAPLA
        </button>
      </header>
      <div className="flex gap-2 mr-4 border-r pr-4 border-slate-300">
        {/* KAYDET BUTONU */}
        <button
          onClick={handleDownloadProject}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50 hover:text-blue-600 transition-colors"
          title="Projeyi Bilgisayarına Kaydet"
        >
          <Download className="w-4 h-4" />
          Kaydet
        </button>

        {/* YÜKLE BUTONU (Gizli input ile) */}
        <div className="relative">
          <input
            type="file"
            accept=".json"
            onChange={handleUploadProject}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            title="Bilgisayardan Proje Yükle"
          />
          <button
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50 hover:text-green-600 transition-colors pointer-events-none"
          >
            <Upload className="w-4 h-4" />
            Yükle
          </button>
        </div>
      </div>

      <main className="max-w-7xl mx-auto p-6">

        {/* REPORT VIEW */}
        {activeTab === 'report' && results ? (
          <Report state={state} results={results} />
        ) : (
          /* DESIGN VIEW */
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">

            {/* --- SOL PANEL (GİRDİLER) --- */}
            <div className="xl:col-span-4 space-y-4">

              {/* 1. SEKMELİ AYARLAR */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-bold text-slate-700">Akslar & Geometri</span>
                </div>

                <div className="p-4 space-y-4">
                  {/* Aks Düzenleyici */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex justify-between items-center mb-1"><span className="text-xs font-bold text-blue-600">X Yönü (m)</span><button onClick={() => handleAddAxis('x')} className="text-blue-600 hover:bg-blue-50"><Plus className="w-3 h-3" /></button></div>
                      <div className="space-y-1 h-32 overflow-y-auto pr-1">
                        {state.grid.xAxis.map((axis, i) => (
                          <div key={axis.id} className="flex gap-1 items-center"><span className="text-[10px] text-slate-400 w-4">A{i + 1}</span><input type="number" value={axis.spacing} onChange={(e) => handleAxisChange('x', i, +e.target.value)} className="w-full p-1 border rounded text-xs" /><button onClick={() => handleRemoveAxis('x', i)} className="text-red-400"><Trash2 className="w-3 h-3" /></button></div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1"><span className="text-xs font-bold text-green-600">Y Yönü (m)</span><button onClick={() => handleAddAxis('y')} className="text-green-600 hover:bg-green-50"><Plus className="w-3 h-3" /></button></div>
                      <div className="space-y-1 h-32 overflow-y-auto pr-1">
                        {state.grid.yAxis.map((axis, i) => (
                          <div key={axis.id} className="flex gap-1 items-center"><span className="text-[10px] text-slate-400 w-4">B{i + 1}</span><input type="number" value={axis.spacing} onChange={(e) => handleAxisChange('y', i, +e.target.value)} className="w-full p-1 border rounded text-xs" /><button onClick={() => handleRemoveAxis('y', i)} className="text-red-400"><Trash2 className="w-3 h-3" /></button></div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Kat ve Kesit Boyutları */}
                  <div className="border-t pt-4 grid grid-cols-2 gap-3">
                    <div><label className="text-[10px] text-slate-500 block">Kat Adedi</label><input type="number" value={state.dimensions.storyCount} onChange={e => setState({ ...state, dimensions: { ...state.dimensions, storyCount: +e.target.value } })} className="w-full border rounded p-1 text-sm" /></div>
                    <div><label className="text-[10px] text-slate-500 block">Kat Yük. (m)</label><input type="number" value={state.dimensions.h} onChange={e => setState({ ...state, dimensions: { ...state.dimensions, h: +e.target.value } })} className="w-full border rounded p-1 text-sm" /></div>
                    <div>
                      <label className="text-[10px] text-slate-500 block">Kolon (cm)</label>
                      <div className="flex gap-1"><input value={state.sections.colWidth} onChange={e => setState({ ...state, sections: { ...state.sections, colWidth: +e.target.value } })} className="w-1/2 border rounded p-1 text-xs" /><input value={state.sections.colDepth} onChange={e => setState({ ...state, sections: { ...state.sections, colDepth: +e.target.value } })} className="w-1/2 border rounded p-1 text-xs" /></div>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block">Kiriş (cm)</label>
                      <div className="flex gap-1"><input value={state.sections.beamWidth} onChange={e => setState({ ...state, sections: { ...state.sections, beamWidth: +e.target.value } })} className="w-1/2 border rounded p-1 text-xs" /><input value={state.sections.beamDepth} onChange={e => setState({ ...state, sections: { ...state.sections, beamDepth: +e.target.value } })} className="w-1/2 border rounded p-1 text-xs" /></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. MALZEME & YÜKLER */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-bold text-slate-700">Malzeme & Yükler</span>
                </div>
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1">Beton Sınıfı</label>
                      <select value={state.materials.concreteClass} onChange={e => setState({ ...state, materials: { ...state.materials, concreteClass: e.target.value as ConcreteClass } })} className="w-full border rounded p-1.5 text-sm bg-white">
                        {Object.values(ConcreteClass).map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1">Hareketli Yük (kg/m²)</label>
                      <input type="number" value={state.loads.liveLoadKg} onChange={e => setState({ ...state, loads: { ...state.loads, liveLoadKg: +e.target.value } })} className="w-full border rounded p-1.5 text-sm" />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1 font-bold">Donatı Çapları (mm)</label>
                    <div className="grid grid-cols-3 gap-2">
                      <div><span className="text-[9px] text-slate-400">Döşeme</span><select value={state.rebars.slabDia} onChange={e => setState({ ...state, rebars: { ...state.rebars, slabDia: +e.target.value } })} className="w-full border p-1 text-xs rounded"><option value={8}>Ø8</option><option value={10}>Ø10</option><option value={12}>Ø12</option></select></div>
                      <div><span className="text-[9px] text-slate-400">Kiriş</span><select value={state.rebars.beamMainDia} onChange={e => setState({ ...state, rebars: { ...state.rebars, beamMainDia: +e.target.value } })} className="w-full border p-1 text-xs rounded"><option value={12}>Ø12</option><option value={14}>Ø14</option><option value={16}>Ø16</option></select></div>
                      <div><span className="text-[9px] text-slate-400">Kolon</span><select value={state.rebars.colMainDia} onChange={e => setState({ ...state, rebars: { ...state.rebars, colMainDia: +e.target.value } })} className="w-full border p-1 text-xs rounded"><option value={14}>Ø14</option><option value={16}>Ø16</option><option value={20}>Ø20</option></select></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. DEPREM PARAMETRELERİ */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-700">Deprem Parametreleri (TBDY 2018)</span>
                </div>
                <div className="p-4 grid grid-cols-3 gap-3">
                  <div className="col-span-3">
                    <label className="text-[10px] text-slate-500 block mb-1">Zemin Sınıfı</label>
                    <select value={state.seismic.soilClass} onChange={e => setState({ ...state, seismic: { ...state.seismic, soilClass: e.target.value as SoilClass } })} className="w-full border rounded p-1.5 text-sm bg-white">
                      {Object.values(SoilClass).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">Ss</label>
                    <input type="number" step="0.1" value={state.seismic.ss} onChange={e => setState({ ...state, seismic: { ...state.seismic, ss: +e.target.value } })} className="w-full border rounded p-1 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">S1</label>
                    <input type="number" step="0.1" value={state.seismic.s1} onChange={e => setState({ ...state, seismic: { ...state.seismic, s1: +e.target.value } })} className="w-full border rounded p-1 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">Rx</label>
                    <input type="number" value={state.seismic.Rx} onChange={e => setState({ ...state, seismic: { ...state.seismic, Rx: +e.target.value } })} className="w-full border rounded p-1 text-sm" />
                  </div>
                </div>
              </div>

            </div>

            {/* --- SAĞ PANEL (GÖRSELLEŞTİRME & SONUÇLAR) --- */}
            <div className="xl:col-span-8 space-y-4">

              {/* Görselleştirici Konteyner */}
              <div className="relative">
                {/* Görünüm Modu Değiştirici */}
                <div className="absolute top-4 right-4 z-10 bg-white/90 backdrop-blur border border-slate-200 p-1 rounded-lg flex shadow-sm">
                  <button
                    onClick={() => setViewMode('normal')}
                    className={`p-2 rounded flex items-center gap-2 text-xs font-bold transition-all ${viewMode === 'normal' ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    <Eye className="w-3 h-3" /> Normal
                  </button>
                  <button
                    onClick={() => setViewMode('analysis')}
                    disabled={!results}
                    className={`p-2 rounded flex items-center gap-2 text-xs font-bold transition-all ${viewMode === 'analysis' ? 'bg-red-50 text-red-600' : 'text-slate-400 hover:text-slate-600 disabled:opacity-50'}`}
                  >
                    <EyeOff className="w-3 h-3" /> Analiz Sonucu
                  </button>
                </div>

                <div className="h-[500px]">
                  {/* HATA 2 DÜZELTİLDİ: Visualizer bileşeni sadece 'state' prop'unu kabul ediyor. Diğer prop'lar kaldırıldı. */}
                  <Visualizer state={state} />
                </div>
                {/* App.tsx içinde Visualizer'ın olduğu div'in içine, Visualizer'dan sonra ekleyin */}

{selectedElementId && (
  <div className="absolute top-4 left-4 z-20 bg-white p-4 rounded-xl shadow-xl border border-slate-200 w-64 animate-in fade-in zoom-in duration-200">
    <div className="flex justify-between items-center mb-3 border-b pb-2">
      <h3 className="font-bold text-slate-700 text-sm">Eleman Düzenle</h3>
      <button onClick={() => setSelectedElementId(null)} className="text-slate-400 hover:text-red-500">
        <X className="w-4 h-4" /> {/* Lucide-react'tan X iconunu import etmeyi unutmayın */}
      </button>
    </div>
    
    <div className="text-xs font-mono text-slate-500 mb-3 bg-slate-50 p-1 rounded">
      ID: {selectedElementId}
    </div>

    <div className="space-y-3">
      {/* Mevcut Değerleri Bul */}
      {(() => {
        // Mevcut override var mı yoksa genelden mi geliyor?
        const override = state.elementOverrides[selectedElementId];
        const isColumn = selectedElementId.startsWith('C');
        // Varsayılan değerler
        const defaultW = isColumn ? state.sections.colWidth : state.sections.beamWidth;
        const defaultD = isColumn ? state.sections.colDepth : state.sections.beamDepth;
        
        const currentW = override?.width ?? defaultW;
        const currentD = override?.depth ?? defaultD;
        const hasOverride = !!override;

        return (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-1">Genişlik (cm)</label>
                <input 
                  type="number" 
                  className="w-full border rounded p-1 text-sm font-bold text-slate-700"
                  value={currentW}
                  onChange={(e) => updateElementSection(Number(e.target.value), currentD)}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-1">Derinlik (cm)</label>
                <input 
                  type="number" 
                  className="w-full border rounded p-1 text-sm font-bold text-slate-700"
                  value={currentD}
                  onChange={(e) => updateElementSection(currentW, Number(e.target.value))}
                />
              </div>
            </div>

            {hasOverride && (
              <button 
                onClick={resetElementSection}
                className="w-full mt-2 text-xs text-red-600 bg-red-50 hover:bg-red-100 py-1 rounded border border-red-200 transition-colors"
              >
                Varsayılanlara Dön
              </button>
            )}
            
            <div className="text-[10px] text-slate-400 mt-2">
              {hasOverride 
                ? "Bu eleman için özel boyut tanımlı." 
                : "Genel kesit ayarları kullanılıyor."}
            </div>
          </>
        );
      })()}
    </div>
  </div>
)}
              </div>

              {/* Özet Kartlar */}
              {results && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-xl border-l-4 border-blue-500 shadow-sm">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Bina Ağırlığı</div>
                    <div className="text-xl font-bold text-slate-800">{results.seismic.building_weight.toFixed(0)} kN</div>
                  </div>
                  <div className="bg-white p-4 rounded-xl border-l-4 border-orange-500 shadow-sm">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Taban Kesme (Vt)</div>
                    <div className="text-xl font-bold text-slate-800">{results.seismic.base_shear.toFixed(0)} kN</div>
                  </div>
                  <div className="bg-white p-4 rounded-xl border-l-4 border-purple-500 shadow-sm">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Periyot (T1)</div>
                    <div className="text-xl font-bold text-slate-800">{results.seismic.period_t1.toFixed(3)} s</div>
                  </div>
                  <button onClick={() => setActiveTab('report')} className="bg-slate-800 text-white p-4 rounded-xl shadow-sm hover:bg-slate-700 transition-colors text-left group">
                    <div className="text-[10px] uppercase font-bold text-slate-400 group-hover:text-slate-300">Detaylı Rapor</div>
                    <div className="text-sm font-bold flex items-center gap-2">İncele <FileText className="w-4 h-4" /></div>
                  </button>
                </div>
              )}

            </div>

          </div>
        )}
      </main>
    </div>
  );
};

export default App;