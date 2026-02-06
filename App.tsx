import React, { useState, useEffect } from 'react';
import { AppState, SoilClass, CalculationResult } from './types';
import { calculateStructure } from './utils/solver';
import Visualizer from './components/Visualizer';
import { Activity, Box, Calculator, AlertTriangle, Info, ShieldCheck, XCircle, CheckCircle } from 'lucide-react';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    dimensions: {
      lx: 5,
      ly: 6,
      h: 3,
      slabThickness: 12,
      storyCount: 3
    },
    sections: {
      beamWidth: 25,
      beamDepth: 50,
      colWidth: 30,
      colDepth: 30
    },
    loads: {
      liveLoad: 2.0,
      deadLoadCoatings: 1.5
    },
    seismic: {
      ss: 1.0,
      soilClass: SoilClass.ZC
    }
  });

  const [results, setResults] = useState<CalculationResult | null>(null);

  useEffect(() => {
    const res = calculateStructure(state);
    setResults(res);
  }, [state]);

  const handleDimensionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setState(prev => ({
      ...prev,
      dimensions: { ...prev.dimensions, [name]: parseFloat(value) || 0 }
    }));
  };

  const handleSectionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setState(prev => ({
      ...prev,
      sections: { ...prev.sections, [name]: parseFloat(value) || 0 }
    }));
  };

  const handleLoadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setState(prev => ({
      ...prev,
      loads: { ...prev.loads, [name]: parseFloat(value) || 0 }
    }));
  };

  const handleSeismicChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    const { name, value } = e.target;
    setState(prev => ({
      ...prev,
      seismic: { ...prev.seismic, [name]: name === 'ss' ? parseFloat(value) : value }
    }));
  };

  // Status Badge Component
  const StatusBadge = ({ safe, label }: { safe: boolean, label?: string }) => (
    <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded ${safe ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {safe ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label || (safe ? "Güvenli" : "Yetersiz")}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-2">
              <Calculator className="w-8 h-8 text-blue-600" />
              Betonarme Statik Analiz Pro
            </h1>
            <p className="text-slate-500 mt-1">TS500 & TBDY 2018 (İleri Düzey Kontroller)</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* INPUTS (Aynı Kaldı - Özet Geçildi) */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
               <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Box className="w-5 h-5 text-blue-500" /> Yapı Verileri
              </h2>
               {/* Kat Adedi */}
               <div className="mb-4">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Kat Adedi</label>
                  <input type="number" name="storyCount" value={state.dimensions.storyCount} onChange={handleDimensionChange} className="w-full p-2 border rounded" />
               </div>
               {/* Boyutlar */}
               <div className="grid grid-cols-2 gap-4">
                  <input type="number" placeholder="Lx" name="lx" value={state.dimensions.lx} onChange={handleDimensionChange} className="p-2 border rounded" />
                  <input type="number" placeholder="Ly" name="ly" value={state.dimensions.ly} onChange={handleDimensionChange} className="p-2 border rounded" />
                  <input type="number" placeholder="Kolon En" name="colWidth" value={state.sections.colWidth} onChange={handleSectionChange} className="p-2 border rounded" />
                  <input type="number" placeholder="Kolon Boy" name="colDepth" value={state.sections.colDepth} onChange={handleSectionChange} className="p-2 border rounded" />
               </div>
               <div className="mt-4">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Deprem İvmesi (Ss)</label>
                  <input type="number" step="0.1" name="ss" value={state.seismic.ss} onChange={handleSeismicChange} className="w-full p-2 border rounded" />
               </div>
            </div>
          </div>

          {/* RESULTS */}
          <div className="lg:col-span-8 space-y-6">
            <Visualizer dimensions={state.dimensions} sections={state.sections} />

            {results && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* 1. DÖŞEME */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between mb-4 border-b pb-2">
                    <h3 className="font-bold text-slate-700">DÖŞEME</h3>
                    <StatusBadge safe={results.slab.isSafe} />
                  </div>
                  <div className="space-y-2 text-sm">
                     <div className="flex justify-between"><span>Moment:</span> <b>{results.slab.m_x.toFixed(2)} kNm</b></div>
                     <div className="flex justify-between"><span>Donatı:</span> <b className="text-blue-600">{results.slab.as_x.toFixed(2)} cm²/m</b></div>
                  </div>
                </div>

                {/* 2. KİRİŞ */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between mb-4 border-b pb-2">
                    <h3 className="font-bold text-slate-700">KİRİŞ (Sürekli Çerçeve)</h3>
                    <StatusBadge safe={results.beams.isDeflectionSafe} label="Sehim" />
                  </div>
                  <div className="space-y-2 text-sm">
                     <div className="flex justify-between"><span>Mesnet Momenti:</span> <b>{results.beams.moment_support.toFixed(1)} kNm</b></div>
                     <div className="flex justify-between"><span>Açıklık Momenti:</span> <b>{results.beams.moment_span.toFixed(1)} kNm</b></div>
                     <div className="flex justify-between"><span>Sehim / Sınır:</span> 
                        <span className={`${results.beams.isDeflectionSafe ? 'text-green-600' : 'text-red-600'}`}>
                          {results.beams.deflection.toFixed(1)} / {results.beams.deflection_limit.toFixed(1)} mm
                        </span>
                     </div>
                     <div className="flex justify-between mt-2 pt-2 border-t"><span>Etriye:</span> <b className="text-purple-600">{results.beams.shear_reinf}</b></div>
                  </div>
                </div>

                {/* 3. KOLON (GELİŞMİŞ) */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm md:col-span-2">
                  <div className="flex justify-between mb-4 border-b pb-2">
                    <h3 className="font-bold text-slate-700">KOLON & DEPREM GÜVENLİĞİ</h3>
                    <div className="flex gap-2">
                      <StatusBadge safe={results.columns.isSafe} label="Kapasite" />
                      <StatusBadge safe={results.columns.isStrongColumn} label="Güçlü Kolon" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between"><span>Eksenel Yük (Nd):</span> <b>{results.columns.axial_load.toFixed(0)} kN</b></div>
                      <div className="flex justify-between"><span>Deprem Momenti (Md):</span> <b>{results.columns.moment_x.toFixed(1)} kNm</b></div>
                      
                      {/* Interaction Bar */}
                      <div>
                        <div className="flex justify-between text-xs mb-1 text-slate-500">
                          <span>N-M Etkileşim Oranı</span>
                          <span>%{ (results.columns.interaction_ratio * 100).toFixed(0) }</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2.5">
                          <div className={`h-2.5 rounded-full ${results.columns.interaction_ratio > 1 ? 'bg-red-500' : 'bg-green-500'}`} style={{width: `${Math.min(results.columns.interaction_ratio*100, 100)}%`}}></div>
                        </div>
                        {results.columns.interaction_ratio > 1 && <p className="text-xs text-red-500 mt-1">Kesit Yetersiz! Kolonları büyütün.</p>}
                      </div>
                    </div>

                    <div className="space-y-3 text-sm border-l pl-4 border-slate-100">
                       <div className="flex justify-between">
                         <span>Güçlü Kolon Oranı:</span> 
                         <b className={results.columns.isStrongColumn ? 'text-green-600' : 'text-red-600'}>{results.columns.strong_col_ratio.toFixed(2)}</b>
                       </div>
                       <p className="text-xs text-slate-400">Yönetmelik Sınırı: 1.20</p>

                       <div className="flex justify-between pt-2 border-t">
                         <span>Göreli Kat Ötelemesi:</span> 
                         <b className={results.seismic.isDriftSafe ? 'text-green-600' : 'text-red-600'}>
                            %{(results.seismic.story_drift_ratio * 100).toFixed(2)}
                         </b>
                       </div>
                       <p className="text-xs text-slate-400">Sınır: %0.8 (0.008)</p>
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;