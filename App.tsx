import React, { useState, useEffect } from 'react';
import { AppState, SoilClass, ConcreteClass, CalculationResult } from './types';
import { calculateStructure } from './utils/solver';
import Visualizer from './components/Visualizer';
import { Activity, Box, Calculator, CheckCircle, XCircle, Scale, FileText, ChevronDown, ChevronUp, Settings, Layers } from 'lucide-react';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    dimensions: { lx: 5, ly: 6, h: 3, slabThickness: 12, storyCount: 3, foundationHeight: 50 }, // Varsayılan radye h=50cm
    sections: { beamWidth: 25, beamDepth: 50, colWidth: 30, colDepth: 30 },
    loads: { liveLoadKg: 200, deadLoadCoatingsKg: 150 },
    seismic: { ss: 1.0, soilClass: SoilClass.ZC },
    materials: { concreteClass: ConcreteClass.C30 },
    rebars: { slabDia: 8, beamMainDia: 12, beamStirrupDia: 8, colMainDia: 14 }
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
            Betonarme Ön Tasarım
          </h1>
          <div className="flex gap-2 text-xs">
            <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-100 font-bold">TS500</span>
            <span className="bg-red-50 text-red-700 px-3 py-1 rounded-full border border-red-100 font-bold">TBDY 2018</span>
          </div>
        </header>

        {/* SATIR 1: GİRDİLER VE KONTROLLER */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          
          {/* Girdi 1: Yapı */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><Box className="w-4 h-4 text-blue-500"/> Yapı</h2>
            <div className="space-y-2 text-sm">
                <div><label className="text-[10px] text-slate-500">Kat Adedi</label><input type="number" value={state.dimensions.storyCount} onChange={e => handleChange('dimensions', 'storyCount', +e.target.value)} className="w-full p-1 border rounded" /></div>
                <div className="grid grid-cols-2 gap-2">
                   <div><label className="text-[10px] text-slate-500">Lx (m)</label><input type="number" value={state.dimensions.lx} onChange={e => handleChange('dimensions', 'lx', +e.target.value)} className="w-full p-1 border rounded" /></div>
                   <div><label className="text-[10px] text-slate-500">Ly (m)</label><input type="number" value={state.dimensions.ly} onChange={e => handleChange('dimensions', 'ly', +e.target.value)} className="w-full p-1 border rounded" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                   <div><label className="text-[10px] text-slate-500">Kat H (m)</label><input type="number" value={state.dimensions.h} onChange={e => handleChange('dimensions', 'h', +e.target.value)} className="w-full p-1 border rounded" /></div>
                   <div><label className="text-[10px] text-slate-500">Plak (cm)</label><input type="number" value={state.dimensions.slabThickness} onChange={e => handleChange('dimensions', 'slabThickness', +e.target.value)} className="w-full p-1 border rounded" /></div>
                </div>
                {/* YENİ: RADYE TEMEL GİRDİSİ */}
                <div>
                   <label className="text-[10px] text-slate-500 font-bold text-emerald-600">Radye H (cm)</label>
                   <input type="number" value={state.dimensions.foundationHeight} onChange={e => handleChange('dimensions', 'foundationHeight', +e.target.value)} className="w-full p-1 border border-emerald-200 bg-emerald-50 rounded" />
                </div>
            </div>
          </div>

          {/* Girdi 2: Kesitler */}
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

          {/* Girdi 3: Yükler */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-red-500"/> Yükler</h2>
             <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                   <div><label className="text-[10px] text-slate-500">Q (kg/m²)</label><input type="number" value={state.loads.liveLoadKg} onChange={e => handleChange('loads', 'liveLoadKg', +e.target.value)} className="w-full p-1 border rounded" /></div>
                   <div><label className="text-[10px] text-slate-500">G_kap (kg/m²)</label><input type="number" value={state.loads.deadLoadCoatingsKg} onChange={e => handleChange('loads', 'deadLoadCoatingsKg', +e.target.value)} className="w-full p-1 border rounded" /></div>
                </div>
                <div><label className="text-[10px] text-slate-500">Deprem (Ss)</label><input type="number" step="0.1" value={state.seismic.ss} onChange={e => handleChange('seismic', 'ss', +e.target.value)} className="w-full p-1 border rounded" /></div>
             </div>
          </div>

          {/* Girdi 4: Donatı & Malzeme */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><Settings className="w-4 h-4 text-slate-600"/> Donatı & Malzeme</h2>
             <div className="space-y-2 text-sm">
                <div>
                   <label className="text-[10px] text-slate-500">Beton</label>
                   <select value={state.materials.concreteClass} onChange={e => handleChange('materials', 'concreteClass', e.target.value)} className="w-full p-1 border rounded bg-slate-50 text-xs">
                    {Object.values(ConcreteClass).map(c => <option key={c} value={c}>{c}</option>)}
                   </select>
                </div>
                <div className="grid grid-cols-3 gap-1 text-xs">
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
                </div>
             </div>
          </div>

        </div>

        {/* SATIR 2: GÖRSELLER */}
        <div><Visualizer dimensions={state.dimensions} sections={state.sections} /></div>

        {/* SATIR 3: SONUÇ KARTLARI (ÖZET) */}
        {results && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            {/* Döşeme Özeti */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-bl-full -mr-8 -mt-8"></div>
               <div className="flex justify-between items-center mb-3 relative z-10">
                 <h3 className="font-bold text-slate-700">DÖŞEME</h3>
                 <StatusBadge status={results.slab.status} />
               </div>
               <div className="space-y-1 text-xs text-slate-600 relative z-10">
                 <div className="flex justify-between"><span>Moment (Md):</span> <b>{results.slab.m_x.toFixed(2)} kNm</b></div>
                 <div className="flex justify-between"><span>Donatı:</span> <b className="text-blue-600">Ø{state.rebars.slabDia} / {results.slab.spacing.toFixed(0)} cm</b></div>
                 <div className="text-[10px] text-right text-slate-400 mt-1">
                   Kalınlık: {state.dimensions.slabThickness}cm (Min: {results.slab.min_thickness.toFixed(1)})
                 </div>
               </div>
            </div>

            {/* Kiriş Özeti */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 w-16 h-16 bg-purple-50 rounded-bl-full -mr-8 -mt-8"></div>
               <div className="flex justify-between items-center mb-3 relative z-10">
                 <h3 className="font-bold text-slate-700">KİRİŞ</h3>
                 <div className="flex gap-1"><StatusBadge status={results.beams.shearStatus} /></div>
               </div>
               <div className="space-y-1 text-xs text-slate-600 relative z-10">
                 <div className="flex justify-between"><span>Mesnet / Açıklık:</span> <b>{results.beams.count_support}Ø{state.rebars.beamMainDia} / {results.beams.count_span}Ø{state.rebars.beamMainDia}</b></div>
                 <div className="flex justify-between"><span>Etriye:</span> <b className="text-purple-600">{results.beams.shear_reinf}</b></div>
                 <div className="text-[10px] text-right text-slate-400 mt-1">
                   Sehim: {results.beams.deflection.toFixed(1)}mm
                 </div>
               </div>
            </div>

            {/* Kolon Özeti */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-50 rounded-bl-full -mr-8 -mt-8"></div>
               <div className="flex justify-between items-center mb-3 relative z-10">
                 <h3 className="font-bold text-slate-700">KOLON</h3>
                 <StatusBadge status={results.columns.status} />
               </div>
               <div className="space-y-1 text-xs text-slate-600 relative z-10">
                 <div className="flex justify-between"><span>Seçilen:</span> <b>{results.columns.count_main} adet Ø{state.rebars.colMainDia}</b></div>
                 <div className="flex justify-between"><span>Kapasite Oranı:</span> <b>%{(results.columns.interaction_ratio*100).toFixed(0)}</b></div>
                 <div className="text-[10px] text-right text-slate-400 mt-1">
                   Güçlü Kolon: {results.columns.strong_col_ratio.toFixed(2)} (Min 1.2)
                 </div>
               </div>
            </div>

            {/* YENİ: Temel Özeti */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 w-16 h-16 bg-orange-50 rounded-bl-full -mr-8 -mt-8"></div>
               <div className="flex justify-between items-center mb-3 relative z-10">
                 <h3 className="font-bold text-slate-700">RADYE TEMEL</h3>
                 <StatusBadge status={{isSafe: results.foundation.isBearingSafe && results.foundation.isPunchingSafe, message: results.foundation.isBearingSafe ? 'Güvenli' : 'Riskli'}} />
               </div>
               <div className="space-y-1 text-xs text-slate-600 relative z-10">
                 <div className="flex justify-between"><span>Gerilme:</span> <b>{results.foundation.bearing_stress.toFixed(1)} kN/m²</b></div>
                 <div className="flex justify-between"><span>Zımbalama:</span> <b className={results.foundation.isPunchingSafe ? 'text-green-600' : 'text-red-600'}>{results.foundation.isPunchingSafe ? 'OK' : 'Yetersiz'}</b></div>
                 <div className="text-[10px] text-right text-slate-400 mt-1">
                   H: {state.dimensions.foundationHeight}cm (Ampatman: 50cm)
                 </div>
               </div>
            </div>

          </div>
        )}

        {/* SATIR 4: DETAYLI RAPOR */}
        {results && (
          <div>
            <button 
              onClick={() => setShowReport(!showReport)}
              className="w-full py-3 flex items-center justify-center gap-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors shadow-lg text-sm"
            >
              <FileText className="w-4 h-4" />
              {showReport ? "Raporu Gizle" : "Detaylı Hesap Raporunu İncele"}
              {showReport ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />}
            </button>

            {showReport && (
              <div className="mt-4 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-px bg-slate-200">
                  
                  {/* RAPOR 1: DÖŞEME */}
                  <div className="bg-white p-6">
                    <h4 className="text-sm font-bold text-blue-600 uppercase mb-4 border-b pb-2">1. DÖŞEME HESAPLARI (TS500)</h4>
                    <div className="space-y-1">
                      <ReportRow label="Plağın Kalınlığı (h)" value={state.dimensions.slabThickness} unit="cm" subtext={`Min. Gereken: ${results.slab.min_thickness.toFixed(1)} cm`} status={results.slab.thicknessStatus.isSafe} />
                      <ReportRow label="Etkili Derinlik (d)" value={results.slab.d} unit="mm" />
                      <ReportRow label="Tasarım Yükü (Pd)" value={results.slab.pd.toFixed(2)} unit="kN/m²" subtext="1.4G + 1.6Q" />
                      <ReportRow label="Hesap Momenti (Md)" value={results.slab.m_x.toFixed(2)} unit="kNm" />
                      <ReportRow label="Gereken Donatı (As)" value={results.slab.as_req.toFixed(2)} unit="cm²/m" />
                      <div className="mt-2 pt-2 border-t border-dashed">
                         <div className="flex justify-between items-center font-bold text-blue-700">
                           <span>SONUÇ DONATI:</span>
                           <span>Ø{state.rebars.slabDia} / {results.slab.spacing.toFixed(0)} cm</span>
                         </div>
                      </div>
                    </div>
                  </div>

                  {/* RAPOR 2: TEMEL (YENİ) */}
                  <div className="bg-white p-6">
                    <h4 className="text-sm font-bold text-orange-600 uppercase mb-4 border-b pb-2">2. RADYE TEMEL HESAPLARI</h4>
                    <div className="space-y-1">
                       <ReportRow label="Temel Tipi" value="Sürekli Radye" />
                       <ReportRow label="Seçilen Yükseklik (h)" value={state.dimensions.foundationHeight} unit="cm" />
                       <ReportRow label="Toplam Bina Yükü (Nd)" value={results.columns.axial_load.toFixed(1)} unit="kN" subtext="G+Q+E kombinasyonu" />
                       <ReportRow label="Zemin Gerilmesi (σ)" value={results.foundation.bearing_stress.toFixed(2)} unit="kN/m²" subtext={`Kapasite: ${results.foundation.bearing_capacity} kN/m²`} status={results.foundation.isBearingSafe} />
                       <ReportRow label="Zımbalama Gerilmesi" value={results.foundation.punching_stress.toFixed(2)} unit="MPa" />
                       <ReportRow label="Zımbalama Dayanımı" value={results.foundation.punching_limit.toFixed(2)} unit="MPa" status={results.foundation.isPunchingSafe} />
                       <ReportRow label="Zımbalama Durumu" value={results.foundation.isPunchingSafe ? "Güvenli" : "YETERSİZ"} status={results.foundation.isPunchingSafe} />
                    </div>
                  </div>

                  {/* RAPOR 3: KOLON */}
                  <div className="bg-white p-6">
                     <h4 className="text-sm font-bold text-emerald-600 uppercase mb-4 border-b pb-2">3. KOLON HESAPLARI</h4>
                     <div className="space-y-1">
                        <ReportRow label="Eksenel Yük (Nd)" value={results.columns.axial_load.toFixed(0)} unit="kN" />
                        <ReportRow label="Maks. Kapasite (Nmax)" value={results.columns.axial_capacity.toFixed(0)} unit="kN" />
                        <ReportRow label="N-M Etkileşim Oranı" value={results.columns.interaction_ratio.toFixed(2)} subtext="Sınır: 1.00" status={results.columns.status.isSafe} />
                        <div className="mt-2 pt-2 border-t border-dashed">
                           <div className="flex justify-between items-center font-bold text-emerald-700">
                             <span>SEÇİLEN DONATI:</span>
                             <span>{results.columns.count_main} adet Ø{state.rebars.colMainDia}</span>
                           </div>
                        </div>
                     </div>
                  </div>

                   {/* RAPOR 4: DEPREM */}
                   <div className="bg-white p-6">
                     <h4 className="text-sm font-bold text-red-600 uppercase mb-4 border-b pb-2">4. DEPREM PARAMETRELERİ (TBDY)</h4>
                     <div className="space-y-1">
                        <ReportRow label="Bina Ağırlığı (W)" value={results.seismic.building_weight.toFixed(0)} unit="kN" />
                        <ReportRow label="Periyot (T1)" value={results.seismic.period.toFixed(2)} unit="s" />
                        <ReportRow label="Taban Kesme (Vt)" value={results.seismic.base_shear.toFixed(0)} unit="kN" />
                        <ReportRow label="Güçlü Kolon Oranı" value={results.columns.strong_col_ratio.toFixed(2)} subtext="Sınır: 1.20" status={results.columns.strongColumnStatus.isSafe} />
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