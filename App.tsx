import React, { useState, useEffect } from 'react';
import { AppState, SoilClass, ConcreteClass, CalculationResult, CheckStatus } from './types';
import { calculateStructure } from './utils/solver';
import { getConcreteProperties, STEEL_FYD, CONCRETE_DENSITY } from './constants'; // Hesap detaylarını göstermek için eklendi
import Visualizer from './components/Visualizer';
import { Activity, Box, Calculator, CheckCircle, XCircle, Scale, FileText, ChevronDown, ChevronUp, Settings, AlertTriangle } from 'lucide-react';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    dimensions: { lx: 5, ly: 6, h: 3, slabThickness: 12, storyCount: 3, foundationHeight: 60, foundationCantilever: 60 },
    sections: { beamWidth: 25, beamDepth: 50, colWidth: 40, colDepth: 40 },
    loads: { liveLoadKg: 200, deadLoadCoatingsKg: 150 },
    seismic: { ss: 1.2, s1: 0.35, soilClass: SoilClass.ZC, Rx: 8, I: 1.0 }, 
    materials: { concreteClass: ConcreteClass.C30 },
    // BURAYA colStirrupDia: 8 EKLENDİ
    rebars: { slabDia: 8, beamMainDia: 14, beamStirrupDia: 8, colMainDia: 16, colStirrupDia: 8, foundationDia: 14 }
  });

  const [results, setResults] = useState<CalculationResult | null>(null);
  const [showReport, setShowReport] = useState(false);

  // Beton özelliklerini formüllerde göstermek için alıyoruz
  const { fck, fctd, fcd } = getConcreteProperties(state.materials.concreteClass);

  useEffect(() => {
    setResults(calculateStructure(state));
  }, [state]);

  const handleChange = (section: keyof AppState, field: string, value: any) => {
    setState(prev => ({
      ...prev,
      [section]: { ...prev[section], [field]: value }
    }));
  };

  // Tüm kontrolleri tarayıp en kritik durumu döndüren yardımcı fonksiyon
  const getOverallStatus = (checks: Record<string, CheckStatus>): CheckStatus => {
    const failures = Object.values(checks).filter(c => !c.isSafe);
    if (failures.length > 0) {
      // İlk bulunan hatayı döndür
      return failures[0];
    }
    return { isSafe: true, message: 'Tüm Kontroller Uygun' };
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

  // GÜNCELLENMİŞ ReportRow: Formül ve Hesap Adımı desteği eklendi
  const ReportRow = ({ label, value, unit, subtext, status, formula, calc }: 
    { label: string, value: string | number, unit?: string, subtext?: string, status?: boolean, formula?: string, calc?: string }) => (
    <div className="flex flex-col py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 px-2 rounded group">
      <div className="flex justify-between items-center">
        <span className="text-slate-700 font-medium text-sm">{label}</span>
        <div className="text-right">
          <span className="font-mono font-bold text-slate-900">{value}</span>
          {unit && <span className="text-slate-500 text-xs ml-1">{unit}</span>}
          {status !== undefined && (
            <span className={`ml-2 font-bold ${status ? 'text-green-500' : 'text-red-500'}`}>
              {status ? '✔' : '✘'}
            </span>
          )}
        </div>
      </div>
      
      {/* Alt Bilgi ve Formül Kısmı */}
      <div className="flex flex-col mt-1 gap-1">
        {subtext && <span className="text-[10px] text-slate-400">{subtext}</span>}
        
        {(formula || calc) && (
          <div className="bg-slate-50 p-2 rounded border border-slate-100 mt-1 text-[10px] font-mono text-slate-500 hidden group-hover:block animate-in fade-in duration-200">
            {formula && <div className="text-blue-600 mb-0.5"><span className="font-bold">Formül:</span> {formula}</div>}
            {calc && <div className="text-slate-600"><span className="font-bold">Hesap:</span> {calc}</div>}
          </div>
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
            Betonarme Analiz Pro v2.2
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

        {/* SONUÇ KARTLARI - GÜNCELLENDİ (Toplu Kontrol) */}
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
                 {/* Burada tüm döşeme kontrollerini içeren bir özet kullanılabilir, şimdilik kalınlık kontrolü */}
                 <StatusBadge status={getOverallStatus({ thickness: results.slab.thicknessStatus, general: results.slab.status })} />
               </div>
            </div>

            {/* Kiriş Kartı - GÜNCELLENDİ (Toplu Hata Gösterimi) */}
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
                 {/* Sadece Shear değil, tüm kiriş hatalarını göster */}
                 <StatusBadge status={getOverallStatus(results.beams.checks)} />
               </div>
            </div>

            {/* Kolon Kartı - GÜNCELLENDİ (Toplu Hata Gösterimi) */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-50 rounded-bl-full -mr-8 -mt-8"></div>
               <h3 className="font-bold text-slate-700 mb-2">KOLON</h3>
               <div className="space-y-1 text-xs text-slate-600 relative z-10">
                 <div className="flex justify-between"><span>Donatı:</span> <b>{results.columns.count_main}Ø{state.rebars.colMainDia}</b></div>
                 <div className="flex justify-between"><span>Yük/Kap:</span> <b>{results.columns.axial_load_design.toFixed(0)} / {results.columns.axial_capacity_max.toFixed(0)} kN</b></div>
                 {/* Kapasite, Güçlü kolon vb. tüm hataları göster */}
                 <StatusBadge status={getOverallStatus(results.columns.checks)} />
               </div>
            </div>

            {/* Radye Kartı - GÜNCELLENDİ (Toplu Hata Gösterimi) */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 w-16 h-16 bg-orange-50 rounded-bl-full -mr-8 -mt-8"></div>
               <h3 className="font-bold text-slate-700 mb-2">RADYE</h3>
               <div className="space-y-1 text-xs text-slate-600 relative z-10">
                 <div className="flex justify-between"><span>Zımbalama:</span> <b className={results.foundation.checks.punching.isSafe ? 'text-green-600' : 'text-red-600'}>{results.foundation.checks.punching.message}</b></div>
                 <div className="flex justify-between border-t pt-1 mt-1"><span>Donatı:</span> <b className="text-orange-600">Ø{state.rebars.foundationDia} / {results.foundation.as_provided_spacing} cm</b></div>
                 {/* Zemin gerilmesi, Zımbalama vb. tüm hataları göster */}
                 <StatusBadge status={getOverallStatus(results.foundation.checks)} />
               </div>
            </div>
            {/* Joint (Birleşim) Kartı - YENİ EKLENECEK */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-red-50 rounded-bl-full -mr-8 -mt-8"></div>
              <h3 className="font-bold text-slate-700 mb-2">BİRLEŞİM (JOINT)</h3>
              <div className="space-y-1 text-xs text-slate-600 relative z-10">
                <div className="flex justify-between">
                    <span>Kesme Kuvveti (Ve):</span> 
                    <b>{results.joint.shear_force.toFixed(1)} kN</b>
                </div>
                <div className="flex justify-between">
                    <span>Kapasite (Vmax):</span> 
                    <b>{results.joint.shear_limit.toFixed(1)} kN</b>
                </div>
                <div className="flex justify-between border-t pt-1 mt-1">
                    <span>Durum:</span>
                    <span className={`font-bold ${results.joint.isSafe ? 'text-green-600' : 'text-red-600'}`}>
                        {results.joint.isSafe ? 'GÜVENLİ' : 'GÜVENSİZ'}
                    </span>
                </div>
              </div>
            </div>


          </div>
        )}

        {/* DETAYLI MÜHENDİSLİK RAPORU - GÜNCELLENDİ (Formüllerle) */}
        {results && (
          <div>
            <button 
              onClick={() => setShowReport(!showReport)}
              className="w-full py-3 flex items-center justify-center gap-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors shadow-lg text-sm"
            >
              <FileText className="w-4 h-4" />
              {showReport ? "Raporu Gizle" : "Detaylı Mühendislik Raporunu İncele (Formüllü)"}
              {showReport ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />}
            </button>
            
            {/* Bilgilendirme notu */}
            {showReport && (
               <div className="mt-2 text-center text-xs text-slate-500 italic">
                  * Detaylı formülleri görmek için satırların üzerine geliniz.
               </div>
            )}

            {showReport && (
              <div className="mt-2 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-px bg-slate-200">
                  
                  <div className="bg-white p-6">
                    <h4 className="text-sm font-bold text-blue-600 uppercase mb-4 border-b pb-2">1. DÖŞEME HESAPLARI (TS500)</h4>
                    <div className="space-y-1">
                      <ReportRow 
                        label="Tasarım Yükü (Pd)" 
                        value={results.slab.pd.toFixed(2)} 
                        unit="kN/m²" 
                        formula="Pd = 1.4G + 1.6Q"
                        calc={`1.4*${((state.dimensions.slabThickness/100*CONCRETE_DENSITY) + (state.loads.deadLoadCoatingsKg*0.00981)).toFixed(2)} + 1.6*${(state.loads.liveLoadKg*0.00981).toFixed(2)}`}
                      />
                      <ReportRow 
                        label="Moment Katsayısı (α)" 
                        value={results.slab.alpha.toFixed(3)} 
                        subtext={`m = ${Math.max(state.dimensions.lx, state.dimensions.ly)}/${Math.min(state.dimensions.lx, state.dimensions.ly)} = ${(Math.max(state.dimensions.lx, state.dimensions.ly)/Math.min(state.dimensions.lx, state.dimensions.ly)).toFixed(2)}`}
                      />
                      <ReportRow 
                        label="Hesap Momenti (Md)" 
                        value={results.slab.m_x.toFixed(2)} 
                        unit="kNm" 
                        formula="Md = α * Pd * Lx²"
                        calc={`${results.slab.alpha} * ${results.slab.pd.toFixed(2)} * ${state.dimensions.lx}²`}
                      />
                      <ReportRow 
                        label="Gereken Donatı (As)" 
                        value={results.slab.as_req.toFixed(2)} 
                        unit="cm²/m" 
                        formula="As = Md / (0.9 * fyd * d)"
                        calc={`${(results.slab.m_x*1000).toFixed(0)} / (0.9 * ${STEEL_FYD.toFixed(0)} * ${(results.slab.d/10).toFixed(2)})`}
                      />
                      <div className="mt-2 pt-2 border-t border-dashed font-bold text-blue-700 text-sm flex justify-between">
                         <span>SONUÇ:</span>
                         <span>Ø{state.rebars.slabDia} / {results.slab.spacing} cm</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6">
                    <h4 className="text-sm font-bold text-purple-600 uppercase mb-4 border-b pb-2">2. KİRİŞ HESAPLARI</h4>
                    <div className="space-y-1">
                       <ReportRow 
                        label="Tasarım Kesme (Vd)" 
                        value={results.beams.shear_design.toFixed(2)} 
                        unit="kN" 
                        formula="Vd ≈ q * L / 2"
                        calc={`${results.beams.load_design.toFixed(1)} * ${Math.max(state.dimensions.lx, state.dimensions.ly)} / 2`}
                       />
                       <ReportRow 
                        label="Kesme Dayanımı (Vcr)" 
                        value={results.beams.shear_cracking.toFixed(2)} 
                        unit="kN" 
                        subtext="Çatlama Sınırı"
                        formula="Vcr = 0.65 * fctd * b * d" 
                        calc={`0.65 * ${fctd} * ${state.sections.beamWidth*10} * ${state.sections.beamDepth*10-30} / 1000`}
                       />
                       <ReportRow 
                        label="Maksimum Kesme (Vmax)" 
                        value={results.beams.shear_limit.toFixed(2)} 
                        unit="kN" 
                        subtext="Kesit Ezilme Sınırı" 
                        status={results.beams.checks.shear.isSafe} 
                        formula="Vmax = 0.22 * fcd * b * d"
                        calc={`0.22 * ${fcd.toFixed(1)} * ${state.sections.beamWidth*10} * ${state.sections.beamDepth*10-30} / 1000`}
                       />
                       <ReportRow 
                        label="Mesnet Momenti" 
                        value={results.beams.moment_support.toFixed(1)} 
                        unit="kNm" 
                        formula="M ≈ q * L² / 12"
                       />
                       <ReportRow 
                        label="Sehim (δ)" 
                        value={results.beams.deflection.toFixed(2)} 
                        unit="mm" 
                        subtext={`Limit: ${results.beams.deflection_limit.toFixed(1)} mm`} 
                        status={results.beams.checks.deflection.isSafe}
                        formula="δ = (5 * q * L^4) / (384 * E * Ieff) * 3"
                        calc={`Elastik x 3 (Sünme)`} 
                       />
                    </div>
                  </div>

                  {/* YENİ KOLON RAPORU BAŞLANGICI */}
                  <div className="bg-white p-6 col-span-1 lg:col-span-2">
                     <h4 className="text-sm font-bold text-emerald-600 uppercase mb-4 border-b pb-2">3. KOLON DETAYLI ANALİZİ (TBDY 2018 & TS500)</h4>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       
                       {/* SOL SÜTUN: EKSENEL, MOMENT, NARİNLİK */}
                       <div className="space-y-1">
                          <h5 className="font-bold text-xs text-slate-500 mb-2 border-b border-dashed pb-1">A. EKSENEL KUVVET VE EĞİLME</h5>
                          
                          <ReportRow 
                            label="Eksenel Yük (Nd)" 
                            value={results.columns.axial_load_design.toFixed(0)} unit="kN"
                            formula="Nd = 1.0G + 1.0Q + 1.0E" 
                          />
                          <ReportRow 
                            label="Eksenel Sınır (0.40 Ac)" 
                            value={results.columns.axial_capacity_max.toFixed(0)} unit="kN" 
                            status={results.columns.checks.axial_limit.isSafe}
                            formula="Nmax = 0.40 * fck * Ac"
                            subtext="Süneklik Sınırı"
                          />
                          <ReportRow 
                            label="Narinlik Oranı (λ)" 
                            value={results.columns.slenderness.lambda.toFixed(2)} 
                            subtext={`Limit: ${results.columns.slenderness.lambda_lim.toFixed(1)}`}
                            formula="λ = ln / i"
                            status={!results.columns.slenderness.isSlender}
                          />
                          {results.columns.slenderness.isSlender && (
                            <ReportRow 
                              label="Moment Büyütme (β)" 
                              value={results.columns.slenderness.beta.toFixed(2)} 
                              formula="β = Cm / (1 - Nd/Nc)"
                              subtext="Narin kolon etkisi"
                            />
                          )}
                        <ReportRow 
                            label="Tasarım Momenti (Md)" 
                            value={results.columns.moment_magnified.toFixed(1)} unit="kNm"
                            formula={results.columns.slenderness.isSlender ? "Md = β * M_analiz" : "Md = M_analiz"}
                            status={results.columns.checks.moment_capacity.isSafe}
                          />
                       </div>

                       {/* SAĞ SÜTUN: KESME, SARGI, GÜÇLÜ KOLON */}
                       <div className="space-y-1">
                          <h5 className="font-bold text-xs text-slate-500 mb-2 border-b border-dashed pb-1">B. KESME VE SARGI (KAPASİTE TASARIMI)</h5>
                          
                          <ReportRow 
                            label="Kapasite Kesmesi (Ve)" 
                            value={results.columns.shear.Ve.toFixed(1)} unit="kN"
                            formula="Ve = (Mra + Mrü) / ln"
                            subtext="Moment kapasitesinden türetildi"
                          />
                          <ReportRow 
                            label="Kesme Dayanımı (Vr)" 
                            value={results.columns.shear.Vr.toFixed(1)} unit="kN"
                            status={results.columns.checks.shear_capacity.isSafe}
                            formula="Vr = Vc + Vw"
                            subtext={`Beton: ${results.columns.shear.Vc.toFixed(1)} + Etriye: ${results.columns.shear.Vw.toFixed(1)}`}
                          />
                          
                          <div className="my-2 border-t border-slate-100"></div>

                          <ReportRow 
                            label="Sargı Etriyesi (Ash)" 
                            value={results.columns.confinement.Ash_prov.toFixed(0)} unit="mm²"
                            subtext={`Gereken: ${results.columns.confinement.Ash_req.toFixed(0)} mm²`}
                            status={results.columns.checks.confinement.isSafe}
                            formula="Ash ≥ 0.3 s b (fck/fywk)..."
                          />
                          <ReportRow 
                            label="Max Donatı Oranı" 
                            value={(results.columns.rho_provided*100).toFixed(2)} unit="%"
                            status={results.columns.checks.maxRebar.isSafe}
                            subtext="Limit: %4.0"
                          />
                          <ReportRow 
                            label="Güçlü Kolon Oranı" 
                            value={results.columns.strong_col_ratio.toFixed(2)} 
                            subtext="(Mra+Mrü) / (Mri+Mrj) ≥ 1.2" 
                            status={results.columns.checks.strongColumn.isSafe} 
                          />
                       </div>
                     </div>
                  </div>
                  {/* YENİ KOLON RAPORU BİTİŞİ */}

                  <div className="bg-white p-6">
                  <h4 className="text-sm font-bold text-red-600 uppercase mb-4 border-b pb-2">EK: BİRLEŞİM GÜVENLİĞİ</h4>
                  <div className="space-y-1">
                      <ReportRow 
                        label="Birleşim Kesme (Ve)" 
                        value={results.joint.shear_force.toFixed(2)} 
                        unit="kN" 
                        formula="Ve = 1.25 * fyk * As - Vkol" 
                      />
                      <ReportRow 
                        label="Birleşim Dayanımı (Vmax)" 
                        value={results.joint.shear_limit.toFixed(2)} 
                        unit="kN" 
                        subtext="Kuşatılmamış Kabulü"
                        formula="1.0 * √fck * bj * h" 
                        status={results.joint.isSafe}
                      />
                  </div>
                  </div>



                   <div className="bg-white p-6">
                     <h4 className="text-sm font-bold text-red-600 uppercase mb-4 border-b pb-2">4. TBDY 2018 DEPREM ANALİZİ</h4>
                     <div className="space-y-1">
                        <ReportRow label="Spektral İvme (Sds)" value={results.seismic.param_sds.toFixed(3)} formula="Sds = Ss * Fs" />
                        <ReportRow label="Periyot (S1)" value={results.seismic.param_sd1.toFixed(3)} formula="Sd1 = S1 * F1" />
                        <ReportRow label="Bina Doğal Periyodu (T1)" value={results.seismic.period_t1.toFixed(2)} unit="s" formula="T1 = Ct * H^(0.75)" />
                        <ReportRow label="Tasarım İvmesi Sae(T)" value={results.seismic.spectrum_sae.toFixed(3)} unit="g" formula="Sae(T) (Spektrum Fonksiyonu)" />
                        <ReportRow 
                          label="Taban Kesme (Vt)" 
                          value={results.seismic.base_shear.toFixed(0)} 
                          unit="kN" 
                          subtext={`Ağırlık W = ${results.seismic.building_weight.toFixed(0)} kN`}
                          formula="Vt = (W * Sae * I) / Ra"
                          calc={`(${results.seismic.building_weight.toFixed(0)} * ${results.seismic.spectrum_sae.toFixed(2)} * ${state.seismic.I}) / ${state.seismic.Rx}`} 
                        />
                     </div>
                  </div>

                  <div className="bg-white p-6 col-span-1 lg:col-span-2">
                     <h4 className="text-sm font-bold text-orange-600 uppercase mb-4 border-b pb-2">5. RADYE TEMEL KONTROLLERİ</h4>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1">
                           <ReportRow 
                            label="Temel Alanı" 
                            value={((state.dimensions.lx + 2*state.dimensions.foundationCantilever/100) * (state.dimensions.ly + 2*state.dimensions.foundationCantilever/100)).toFixed(1)} 
                            unit="m²" 
                           />
                           <ReportRow 
                            label="Zemin Gerilmesi" 
                            value={results.foundation.stress_actual.toFixed(1)} 
                            unit="kN/m²" 
                            subtext={`Emniyet: ${results.foundation.stress_limit}`} 
                            status={results.foundation.checks.bearing.isSafe}
                            formula="σ = N_total / A_temel"
                            calc={`${(results.seismic.building_weight + (state.dimensions.foundationHeight/100*CONCRETE_DENSITY*40)).toFixed(0)} / A`} 
                           />
                        </div>
                        <div className="space-y-1">
                           <ReportRow label="Zımbalama Yükü (Vpd)" value={results.foundation.punching_force.toFixed(0)} unit="N" formula="Vpd = Nd_kolon" />
                           <ReportRow 
                            label="Zımbalama Gerilmesi" 
                            value={results.foundation.punching_stress.toFixed(2)} 
                            unit="MPa" 
                            formula="τ = Vpd / (Up * d)"
                           />
                           <ReportRow 
                            label="Zımbalama Sınırı" 
                            value={results.foundation.punching_capacity.toFixed(2)} 
                            unit="MPa" 
                            status={results.foundation.checks.punching.isSafe} 
                            formula="fctd (Beton Çekme Dayanımı)"
                           />
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