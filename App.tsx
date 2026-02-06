// App.tsx
import React, { useState, useEffect } from 'react';
import { AppState, SoilClass, ConcreteClass, CalculationResult } from './types';
import { calculateStructure } from './utils/solver';
import Visualizer from './components/Visualizer';
import { Activity, Box, Calculator, CheckCircle, XCircle, Scale, FileText, ChevronDown, ChevronUp, Settings } from 'lucide-react';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    dimensions: { lx: 5, ly: 6, h: 3, slabThickness: 12, storyCount: 3, foundationHeight: 60, foundationCantilever: 60 },
    sections: { beamWidth: 25, beamDepth: 50, colWidth: 40, colDepth: 40 },
    loads: { liveLoadKg: 200, deadLoadCoatingsKg: 150 },
    seismic: { ss: 1.2, s1: 0.35, soilClass: SoilClass.ZC, Rx: 8, I: 1.0 }, 
    materials: { concreteClass: ConcreteClass.C30 },
    rebars: { slabDia: 8, beamMainDia: 14, beamStirrupDia: 8, colMainDia: 16, foundationDia: 14 }
  });

  const [results, setResults] = useState<CalculationResult | null>(null);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    setResults(calculateStructure(state));
  }, [state]);

  const handleChange = (section: keyof AppState, field: string, value: any) => {
    setState(prev => ({
      ...prev,
      [section]: { ...prev[section], [field]: value }
    }));
  };

  const StatusBadge = ({ status }: { status: { isSafe: boolean, message: string, reason?: string } }) => (
    <div className="flex flex-col items-end">
      <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded ${status.isSafe ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
        {status.isSafe ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
        {status.message}
      </div>
      {!status.isSafe && status.reason && (
        <span className="text-[10px] text-red-600 mt-1 font-medium text-right max-w-[120px] leading-tight">{status.reason}</span>
      )}
    </div>
  );

  const ReportRow = ({ label, value, unit, subtext, status }: { label: string, value: string | number, unit?: string, subtext?: string, status?: boolean }) => (
    <div className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0 text-sm hover:bg-slate-50 px-2 rounded group">
      <span className="text-slate-600 font-medium group-hover:text-slate-800 transition-colors">{label}</span>
      <div className="text-right">
        <span className="font-mono font-bold text-slate-800">{value}</span>
        {unit && <span className="text-slate-400 text-xs ml-1">{unit}</span>}
        {subtext && (
          <span className="text-[10px] text-slate-400 block">
            {subtext}
            {status !== undefined && (
              <span className={`ml-1 font-bold ${status ? 'text-green-500' : 'text-red-500'}`}>
                {status ? '✔' : '✘'}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-2 md:p-6 font-sans pb-20">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* HEADER */}
        <header className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Calculator className="w-6 h-6 text-blue-600" />
            Betonarme Analiz Pro v2.1 (Detaylı)
          </h1>
          <div className="flex gap-2 text-xs">
            <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-100 font-bold">TS500:2000</span>
            <span className="bg-red-50 text-red-700 px-3 py-1 rounded-full border border-red-100 font-bold">TBDY 2018</span>
          </div>
        </header>

        {/* GİRDİLER - KARTLAR */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><Box className="w-4 h-4 text-blue-500"/> Yapı & Temel</h2>
            <div className="space-y-2 text-sm">
                <div><label className="text-[10px] text-slate-500">Kat Adedi</label><input type="number" value={state.dimensions.storyCount} onChange={e => handleChange('dimensions', 'storyCount', +e.target.value)} className="w-full p-1 border rounded" /></div>
                <div className="grid grid-cols-2 gap-2">
                   <div><label className="text-[10px] text-slate-500">Lx (m)</label><input type="number" value={state.dimensions.lx} onChange={e => handleChange('dimensions', 'lx', +e.target.value)} className="w-full p-1 border rounded" /></div>
                   <div><label className="text-[10px] text-slate-500">Ly (m)</label><input type="number" value={state.dimensions.ly} onChange={e => handleChange('dimensions', 'ly', +e.target.value)} className="w-full p-1 border rounded" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                   <div><label className="text-[10px] text-slate-500">Plak (cm)</label><input type="number" value={state.dimensions.slabThickness} onChange={e => handleChange('dimensions', 'slabThickness', +e.target.value)} className="w-full p-1 border rounded" /></div>
                   <div><label className="text-[10px] text-slate-500">Radye H</label><input type="number" value={state.dimensions.foundationHeight} onChange={e => handleChange('dimensions', 'foundationHeight', +e.target.value)} className="w-full p-1 border bg-emerald-50 rounded" /></div>
                </div>
                <div><label className="text-[10px] text-slate-500">Radye Ampatman (cm)</label><input type="number" value={state.dimensions.foundationCantilever} onChange={e => handleChange('dimensions', 'foundationCantilever', +e.target.value)} className="w-full p-1 border rounded" /></div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><Scale className="w-4 h-4 text-purple-500"/> Kesitler</h2>
             <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                   <div><label className="text-[10px] text-slate-500">Kiriş B</label><input type="number" value={state.sections.beamWidth} onChange={e => handleChange('sections', 'beamWidth', +e.target.value)} className="w-full p-1 border rounded" /></div>
                   <div><label className="text-[10px] text-slate-500">Kiriş H</label><input type="number" value={state.sections.beamDepth} onChange={e => handleChange('sections', 'beamDepth', +e.target.value)} className="w-full p-1 border rounded" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                   <div><label className="text-[10px] text-slate-500">Kolon B</label><input type="number" value={state.sections.colWidth} onChange={e => handleChange('sections', 'colWidth', +e.target.value)} className="w-full p-1 border rounded" /></div>
                   <div><label className="text-[10px] text-slate-500">Kolon H</label><input type="number" value={state.sections.colDepth} onChange={e => handleChange('sections', 'colDepth', +e.target.value)} className="w-full p-1 border rounded" /></div>
                </div>
             </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-red-500"/> Deprem & Yükler</h2>
             <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                   <div><label className="text-[10px] text-slate-500">Ss</label><input type="number" step="0.1" value={state.seismic.ss} onChange={e => handleChange('seismic', 'ss', +e.target.value)} className="w-full p-1 border rounded" /></div>
                   <div><label className="text-[10px] text-slate-500">S1</label><input type="number" step="0.1" value={state.seismic.s1} onChange={e => handleChange('seismic', 's1', +e.target.value)} className="w-full p-1 border rounded bg-yellow-50" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                   <div>
                     <label className="text-[10px] text-slate-500">Zemin</label>
                     <select value={state.seismic.soilClass} onChange={e => handleChange('seismic', 'soilClass', e.target.value)} className="w-full p-1 border rounded bg-slate-50 text-xs">
                         {Object.values(SoilClass).map(sc => <option key={sc} value={sc}>{sc}</option>)}
                     </select>
                   </div>
                   <div><label className="text-[10px] text-slate-500">Rx (Sistem)</label><input type="number" value={state.seismic.Rx} onChange={e => handleChange('seismic', 'Rx', +e.target.value)} className="w-full p-1 border rounded" /></div>
                </div>
                <div><label className="text-[10px] text-slate-500">Hareketli Yük (kg/m²)</label><input type="number" value={state.loads.liveLoadKg} onChange={e => handleChange('loads', 'liveLoadKg', +e.target.value)} className="w-full p-1 border rounded" /></div>
             </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><Settings className="w-4 h-4 text-slate-600"/> Donatı Çapları</h2>
             <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-1 text-xs">
                   <div>
                     <label className="text-[9px] text-slate-400 block">Döşeme</label>
                     <select value={state.rebars.slabDia} onChange={e => handleChange('rebars', 'slabDia', +e.target.value)} className="w-full border rounded">
                        {[8, 10, 12].map(d => <option key={d} value={d}>Ø{d}</option>)}
                     </select>
                   </div>
                   <div>
                     <label className="text-[9px] text-slate-400 block">Kiriş</label>
                     <select value={state.rebars.beamMainDia} onChange={e => handleChange('rebars', 'beamMainDia', +e.target.value)} className="w-full border rounded">
                        {[12, 14, 16, 20].map(d => <option key={d} value={d}>Ø{d}</option>)}
                     </select>
                   </div>
                   <div>
                     <label className="text-[9px] text-slate-400 block">Kolon</label>
                     <select value={state.rebars.colMainDia} onChange={e => handleChange('rebars', 'colMainDia', +e.target.value)} className="w-full border rounded">
                        {[14, 16, 20, 22].map(d => <option key={d} value={d}>Ø{d}</option>)}
                     </select>
                   </div>
                   <div>
                     <label className="text-[9px] text-slate-400 block">Radye</label>
                     <select value={state.rebars.foundationDia} onChange={e => handleChange('rebars', 'foundationDia', +e.target.value)} className="w-full border rounded bg-emerald-50">
                        {[12, 14, 16, 20].map(d => <option key={d} value={d}>Ø{d}</option>)}
                     </select>
                   </div>
                </div>
             </div>
          </div>

        </div>

        {/* GÖRSELLER */}
        <div><Visualizer dimensions={state.dimensions} sections={state.sections} /></div>

        {/* SONUÇ KARTLARI - DETAYLI */}
        {results && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            {/* Döşeme Kartı */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-bl-full -mr-8 -mt-8"></div>
               <h3 className="font-bold text-slate-700 mb-2">DÖŞEME</h3>
               <div className="space-y-1 text-xs text-slate-600 relative z-10">
                 <div className="flex justify-between"><span>Tip:</span> <b>{results.slab.alpha > 0.06 ? 'Tek Yönlü' : 'Çift Yönlü'}</b></div>
                 <div className="flex justify-between"><span>Donatı:</span> <b className="text-blue-600">Ø{state.rebars.slabDia} / {results.slab.spacing} cm</b></div>
                 <div className="flex justify-between"><span>Moment:</span> <b>{results.slab.m_x.toFixed(1)} kNm</b></div>
                 <StatusBadge status={results.slab.thicknessStatus} />
               </div>
            </div>

            {/* Kiriş Kartı */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 w-16 h-16 bg-purple-50 rounded-bl-full -mr-8 -mt-8"></div>
               <h3 className="font-bold text-slate-700 mb-2">KİRİŞ</h3>
               <div className="space-y-1 text-xs text-slate-600 relative z-10">
                 <div className="flex justify-between"><span>Açıklık Donatı:</span> <b>{results.beams.count_span}Ø{state.rebars.beamMainDia}</b></div>
                 <div className="flex justify-between"><span>Etriye:</span> <b className="text-purple-600">{results.beams.shear_reinf_type}</b></div>
                 <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Vd: {results.beams.shear_design.toFixed(1)}</span>
                    <span>Vmax: {results.beams.shear_limit.toFixed(1)} kN</span>
                 </div>
                 <StatusBadge status={results.beams.checks.shear} />
               </div>
            </div>

            {/* Kolon Kartı */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-50 rounded-bl-full -mr-8 -mt-8"></div>
               <h3 className="font-bold text-slate-700 mb-2">KOLON</h3>
               <div className="space-y-1 text-xs text-slate-600 relative z-10">
                 <div className="flex justify-between"><span>Donatı:</span> <b>{results.columns.count_main}Ø{state.rebars.colMainDia}</b></div>
                 <div className="flex justify-between"><span>Yük/Kap:</span> <b>{results.columns.axial_load_design.toFixed(0)} / {results.columns.axial_capacity_max.toFixed(0)} kN</b></div>
                 <StatusBadge status={results.columns.checks.strongColumn} />
               </div>
            </div>

            {/* Radye Kartı */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 w-16 h-16 bg-orange-50 rounded-bl-full -mr-8 -mt-8"></div>
               <h3 className="font-bold text-slate-700 mb-2">RADYE</h3>
               <div className="space-y-1 text-xs text-slate-600 relative z-10">
                 <div className="flex justify-between"><span>Zımbalama:</span> <b className={results.foundation.checks.punching.isSafe ? 'text-green-600' : 'text-red-600'}>{results.foundation.checks.punching.message}</b></div>
                 <div className="flex justify-between border-t pt-1 mt-1"><span>Donatı:</span> <b className="text-orange-600">Ø{state.rebars.foundationDia} / {results.foundation.as_provided_spacing} cm</b></div>
                 <StatusBadge status={results.foundation.checks.bearing} />
               </div>
            </div>

          </div>
        )}

        {/* DETAYLI MÜHENDİSLİK RAPORU */}
        {results && (
          <div>
            <button 
              onClick={() => setShowReport(!showReport)}
              className="w-full py-3 flex items-center justify-center gap-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors shadow-lg text-sm"
            >
              <FileText className="w-4 h-4" />
              {showReport ? "Raporu Gizle" : "Detaylı Mühendislik Raporunu İncele"}
              {showReport ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />}
            </button>

            {showReport && (
              <div className="mt-4 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-px bg-slate-200">
                  
                  <div className="bg-white p-6">
                    <h4 className="text-sm font-bold text-blue-600 uppercase mb-4 border-b pb-2">1. DÖŞEME HESAPLARI (TS500)</h4>
                    <div className="space-y-1">
                      <ReportRow label="Tasarım Yükü (Pd)" value={results.slab.pd.toFixed(2)} unit="kN/m²" subtext="1.4G + 1.6Q" />
                      <ReportRow label="Moment Katsayısı (α)" value={results.slab.alpha.toFixed(3)} />
                      <ReportRow label="Hesap Momenti (Md)" value={results.slab.m_x.toFixed(2)} unit="kNm" />
                      <ReportRow label="Gereken Donatı (As)" value={results.slab.as_req.toFixed(2)} unit="cm²/m" />
                      <div className="mt-2 pt-2 border-t border-dashed font-bold text-blue-700 text-sm flex justify-between">
                         <span>SONUÇ:</span>
                         <span>Ø{state.rebars.slabDia} / {results.slab.spacing} cm</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6">
                    <h4 className="text-sm font-bold text-purple-600 uppercase mb-4 border-b pb-2">2. KİRİŞ HESAPLARI</h4>
                    <div className="space-y-1">
                       <ReportRow label="Tasarım Kesme (Vd)" value={results.beams.shear_design.toFixed(2)} unit="kN" />
                       <ReportRow label="Kesme Dayanımı (Vcr)" value={results.beams.shear_cracking.toFixed(2)} unit="kN" subtext="Çatlama Sınırı" />
                       <ReportRow label="Maksimum Kesme (Vmax)" value={results.beams.shear_limit.toFixed(2)} unit="kN" subtext="Kesit Ezilme Sınırı" status={results.beams.checks.shear.isSafe} />
                       <ReportRow label="Hesap Momenti (Mesnet)" value={results.beams.moment_support.toFixed(1)} unit="kNm" />
                       <ReportRow label="Sehim (δ)" value={results.beams.deflection.toFixed(2)} unit="mm" subtext={`Limit: ${results.beams.deflection_limit.toFixed(1)} mm`} status={results.beams.checks.deflection.isSafe} />
                    </div>
                  </div>

                  <div className="bg-white p-6">
                     <h4 className="text-sm font-bold text-emerald-600 uppercase mb-4 border-b pb-2">3. KOLON & PERFORMANS</h4>
                     <div className="space-y-1">
                        <ReportRow label="Eksenel Yük (Nd)" value={results.columns.axial_load_design.toFixed(0)} unit="kN" />
                        <ReportRow label="Eksenel Kapasite (Nmax)" value={results.columns.axial_capacity_max.toFixed(0)} unit="kN" subtext="0.5 fck Ac" />
                        <ReportRow label="Kapasite Oranı" value={results.columns.interaction_ratio.toFixed(2)} status={results.columns.checks.capacity.isSafe} />
                        <ReportRow label="Güçlü Kolon Oranı" value={results.columns.strong_col_ratio.toFixed(2)} subtext="(Mra+Mrü) / (Mri+Mrj) ≥ 1.2" status={results.columns.checks.strongColumn.isSafe} />
                     </div>
                  </div>

                   <div className="bg-white p-6">
                     <h4 className="text-sm font-bold text-red-600 uppercase mb-4 border-b pb-2">4. TBDY 2018 DEPREM ANALİZİ</h4>
                     <div className="space-y-1">
                        <ReportRow label="Spektral İvme (Sds)" value={results.seismic.param_sds.toFixed(3)} />
                        <ReportRow label="Periyot (S1)" value={results.seismic.param_sd1.toFixed(3)} />
                        <ReportRow label="Bina Doğal Periyodu (T1)" value={results.seismic.period_t1.toFixed(2)} unit="s" />
                        <ReportRow label="Tasarım İvmesi Sae(T)" value={results.seismic.spectrum_sae.toFixed(3)} unit="g" />
                        <ReportRow label="Taban Kesme (Vt)" value={results.seismic.base_shear.toFixed(0)} unit="kN" subtext={`Ağırlık W = ${results.seismic.building_weight.toFixed(0)} kN`} />
                     </div>
                  </div>

                  <div className="bg-white p-6 col-span-1 lg:col-span-2">
                     <h4 className="text-sm font-bold text-orange-600 uppercase mb-4 border-b pb-2">5. RADYE TEMEL KONTROLLERİ</h4>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1">
                           <ReportRow label="Temel Alanı" value={((state.dimensions.lx + 2*state.dimensions.foundationCantilever/100) * (state.dimensions.ly + 2*state.dimensions.foundationCantilever/100)).toFixed(1)} unit="m²" />
                           <ReportRow label="Zemin Gerilmesi" value={results.foundation.stress_actual.toFixed(1)} unit="kN/m²" subtext={`Emniyet: ${results.foundation.stress_limit}`} status={results.foundation.checks.bearing.isSafe} />
                        </div>
                        <div className="space-y-1">
                           <ReportRow label="Zımbalama Yükü (Vpd)" value={results.foundation.punching_force.toFixed(0)} unit="N" />
                           <ReportRow label="Zımbalama Gerilmesi" value={results.foundation.punching_stress.toFixed(2)} unit="MPa" />
                           <ReportRow label="Zımbalama Sınırı" value={results.foundation.punching_capacity.toFixed(2)} unit="MPa" status={results.foundation.checks.punching.isSafe} />
                           <div className="mt-2 text-right font-bold text-orange-700 text-sm">
                              Donatı: Ø{state.rebars.foundationDia} / {results.foundation.as_provided_spacing} cm
                           </div>
                        </div>
                     </div>
                  </div>

                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default App;