import React, { useState, useEffect } from 'react';
import { AppState, SoilClass, CalculationResult } from './types';
import { calculateStructure } from './utils/solver';
import Visualizer from './components/Visualizer';
import { Activity, Box, Calculator, AlertTriangle, Info, ShieldCheck } from 'lucide-react';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    dimensions: {
      lx: 5,
      ly: 6,
      h: 3,
      slabThickness: 12
    },
    sections: {
      beamWidth: 25,
      beamDepth: 50,
      colWidth: 30,
      colDepth: 30
    },
    loads: {
      liveLoad: 2.0, // kN/m2 (Residential)
      deadLoadCoatings: 1.5 // kN/m2
    },
    seismic: {
      ss: 1.0, // High seismicity
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

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-2">
              <Calculator className="w-8 h-8 text-blue-600" />
              Betonarme Statik Analiz
            </h1>
            <p className="text-slate-500 mt-1">TS500 ve TBDY 2018'e göre ön tasarım aracı (Eğitim Amaçlı)</p>
          </div>
          <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-2 rounded-lg border border-amber-200 text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>Bu sonuçlar sadece ön boyutlandırma içindir. Uygulama projesi yerine geçmez.</span>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT COLUMN: INPUTS */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Structure Dimensions */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Box className="w-5 h-5 text-blue-500" /> Yapı Geometrisi
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Döşeme En (Lx) [m]</label>
                  <input type="number" name="lx" value={state.dimensions.lx} onChange={handleDimensionChange} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Döşeme Boy (Ly) [m]</label>
                  <input type="number" name="ly" value={state.dimensions.ly} onChange={handleDimensionChange} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Kat Yüksekliği (H) [m]</label>
                  <input type="number" name="h" value={state.dimensions.h} onChange={handleDimensionChange} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Döşeme Kalınlık [cm]</label>
                  <input type="number" name="slabThickness" value={state.dimensions.slabThickness} onChange={handleDimensionChange} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
            </div>

            {/* Sections */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Box className="w-5 h-5 text-purple-500" /> Kesitler
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Kiriş En [cm]</label>
                  <input type="number" name="beamWidth" value={state.sections.beamWidth} onChange={handleSectionChange} className="w-full p-2 border rounded focus:ring-2 focus:ring-purple-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Kiriş Yükseklik [cm]</label>
                  <input type="number" name="beamDepth" value={state.sections.beamDepth} onChange={handleSectionChange} className="w-full p-2 border rounded focus:ring-2 focus:ring-purple-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Kolon En [cm]</label>
                  <input type="number" name="colWidth" value={state.sections.colWidth} onChange={handleSectionChange} className="w-full p-2 border rounded focus:ring-2 focus:ring-purple-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Kolon Boy [cm]</label>
                  <input type="number" name="colDepth" value={state.sections.colDepth} onChange={handleSectionChange} className="w-full p-2 border rounded focus:ring-2 focus:ring-purple-500 outline-none" />
                </div>
              </div>
            </div>

            {/* Seismic & Loads */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-red-500" /> Yükler ve Deprem
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Hareketli Yük (q) [kN/m²]</label>
                    <input type="number" step="0.5" name="liveLoad" value={state.loads.liveLoad} onChange={handleLoadChange} className="w-full p-2 border rounded focus:ring-2 focus:ring-red-500 outline-none" />
                  </div>
                   <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Zemin Sınıfı</label>
                    <select name="soilClass" value={state.seismic.soilClass} onChange={handleSeismicChange} className="w-full p-2 border rounded focus:ring-2 focus:ring-red-500 outline-none bg-white">
                      {Object.values(SoilClass).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Ss (Kısa Periyot Spektral İvme Katsayısı)</label>
                  <input type="number" step="0.1" name="ss" value={state.seismic.ss} onChange={handleSeismicChange} className="w-full p-2 border rounded focus:ring-2 focus:ring-red-500 outline-none" />
                  <div className="mt-2 w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-red-500 h-full transition-all duration-300" style={{ width: `${Math.min(state.seismic.ss * 33, 100)}%`}}></div>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Türkiye Deprem Haritası değeridir (Örn: 0.25 - 1.50 arası)</p>
                </div>
              </div>
            </div>

          </div>

          {/* CENTER & RIGHT: VISUAL & RESULTS */}
          <div className="lg:col-span-8 space-y-6">
            
            <Visualizer dimensions={state.dimensions} sections={state.sections} />

            {results && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* SLAB RESULTS */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-2 bg-blue-50 text-blue-600 rounded-bl-xl text-xs font-bold">DÖŞEME</div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">Tasarım Yükü (Pd)</span>
                      <span className="font-mono font-bold text-slate-800">{results.slab.pd.toFixed(2)} kN/m²</span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">Moment (Mx, My)</span>
                      <span className="font-mono font-bold text-slate-800">{results.slab.m_x.toFixed(2)} kNm</span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 uppercase tracking-wide">Gereken Donatı</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-2xl font-bold text-blue-600">{results.slab.as_x.toFixed(2)}</span>
                        <span className="text-sm text-slate-500">cm²/m</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">Öneri: Ø8/{(100 / (results.slab.as_x / 0.50)).toFixed(0)}cm</p>
                    </div>
                  </div>
                </div>

                {/* BEAM RESULTS */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-2 bg-purple-50 text-purple-600 rounded-bl-xl text-xs font-bold">KİRİŞ</div>
                   <div className="space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">Yük (q)</span>
                      <span className="font-mono font-bold text-slate-800">{results.beams.load.toFixed(2)} kN/m</span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">Mesnet Momenti</span>
                      <span className="font-mono font-bold text-slate-800">{results.beams.moment_support.toFixed(1)} kNm</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-xs text-slate-500">Mesnet Donatısı</span>
                        <div className="font-bold text-purple-600">{results.beams.as_top.toFixed(2)} cm²</div>
                        <div className="text-[10px] text-slate-400">{Math.ceil(results.beams.as_top/1.13)} adet Ø12</div>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">Kesme Güvenliği</span>
                         <div className={`text-xs font-bold ${results.beams.shear_force > 0 ? 'text-green-600' : 'text-red-600'}`}>
                           {results.beams.shear_reinf}
                         </div>
                      </div>
                    </div>
                   </div>
                </div>

                 {/* COLUMN RESULTS */}
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-2 bg-emerald-50 text-emerald-600 rounded-bl-xl text-xs font-bold">KOLON</div>
                   <div className="space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">Eksenel Yük (Nd)</span>
                      <span className="font-mono font-bold text-slate-800">{results.columns.axial_load.toFixed(0)} kN</span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                       <span className="text-sm text-slate-600">Kapasite (Nmax)</span>
                       <span className={`font-mono font-bold ${results.columns.isSafe ? 'text-emerald-600' : 'text-red-500'}`}>
                         {results.columns.axial_capacity.toFixed(0)} kN
                       </span>
                    </div>
                    {results.columns.isSafe ? (
                      <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 p-2 rounded text-xs font-bold">
                        <ShieldCheck className="w-4 h-4" /> Kesit Yeterli
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded text-xs font-bold">
                         <AlertTriangle className="w-4 h-4" /> Kesit Yetersiz!
                      </div>
                    )}
                    <div>
                      <span className="text-xs text-slate-500">Min. Donatı</span>
                      <p className="font-bold text-slate-700">{results.columns.count_phi14} adet Ø14</p>
                    </div>
                   </div>
                </div>

                {/* SEISMIC RESULTS */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-2 bg-red-50 text-red-600 rounded-bl-xl text-xs font-bold">DEPREM (TBDY 2018)</div>
                   <div className="space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">Tasarım İvmesi (Sds)</span>
                      <span className="font-mono font-bold text-slate-800">{results.seismic.sds.toFixed(3)} g</span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">Yapı Periyodu (T1)</span>
                      <span className="font-mono font-bold text-slate-800">{results.seismic.period.toFixed(2)} sn</span>
                    </div>
                    <div className="pt-2">
                      <span className="text-sm text-slate-600 block mb-1">Taban Kesme Kuvveti (Vt)</span>
                      <div className="text-3xl font-bold text-red-600">{results.seismic.base_shear.toFixed(1)} <span className="text-lg text-slate-400">kN</span></div>
                      <p className="text-xs text-slate-400 mt-2">Bu kuvvet kat hizalarına dağıtılır.</p>
                    </div>
                   </div>
                </div>

              </div>
            )}
            
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg flex gap-3 text-sm text-blue-800">
              <Info className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="font-bold mb-1">Hesaplama Kabulleri</p>
                <ul className="list-disc pl-4 space-y-1 text-blue-700/80 text-xs">
                  <li>Beton sınıfı C30/37, Donatı Sınıfı B420C olarak alınmıştır.</li>
                  <li>Döşemeler TS500'e göre çift yönlü plak davranışı varsayılmıştır (Marcus Metodu katsayıları).</li>
                  <li>Deprem hesabı TBDY 2018 Eşdeğer Deprem Yükü Yöntemi ile basitleştirilmiştir (R=8, I=1).</li>
                  <li>Kirişler sürekli çerçeve mantığıyla (yaklaşık katsayılarla) çözülmüştür.</li>
                </ul>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
