
import React from 'react';
import { AppState, CalculationResult, ElementAnalysisStatus } from '../types';
import { CheckCircle, XCircle, AlertTriangle, Activity, Box, Layers, ArrowDownToLine, Info } from 'lucide-react';

interface Props {
  state: AppState;
  results: CalculationResult;
}

const StatusBadge = ({ isSafe }: { isSafe: boolean }) => 
  isSafe ? 
  <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1 w-fit"><CheckCircle className="w-3 h-3"/> Uygun</span> : 
  <span className="bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1 w-fit"><XCircle className="w-3 h-3"/> Yetersiz</span>;

interface SummaryCardProps {
  title: string;
  value: string;
  subtext: string;
  icon: React.ElementType;
  status: boolean;
  colorClass: string;
}

const SummaryCard = ({ title, value, subtext, icon: Icon, status, colorClass }: SummaryCardProps) => (
  <div className={`bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-between h-full relative overflow-hidden`}>
      <div className={`absolute top-0 right-0 p-3 opacity-10 ${colorClass}`}>
          <Icon className="w-16 h-16" />
      </div>
      <div>
          <h4 className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">{title}</h4>
          <div className="text-2xl font-bold text-slate-800">{value}</div>
          <div className="text-xs text-slate-400 mt-1">{subtext}</div>
      </div>
      <div className="mt-4 pt-3 border-t border-slate-50">
          <StatusBadge isSafe={status} />
      </div>
  </div>
);

const Report: React.FC<Props> = ({ state, results }) => {
  // Özet Verileri Hazırla
  const maxColRatio = results.columns.interaction_ratio;
  const colStatus = results.columns.checks.axial_limit.isSafe && results.columns.checks.shear_capacity.isSafe && results.columns.checks.strongColumn.isSafe;
  
  const beamDeflectionRatio = results.beams.deflection / results.beams.deflection_limit;
  const beamStatus = results.beams.checks.shear.isSafe && results.beams.checks.deflection.isSafe;

  const foundStressRatio = results.foundation.stress_actual / results.foundation.stress_limit;
  const foundStatus = results.foundation.checks.bearing.isSafe && results.foundation.checks.punching.isSafe;

  // Hatalı Elemanları Filtrele
  const failedElements = (Array.from(results.elementResults.values()) as ElementAnalysisStatus[]).filter(e => !e.isSafe);

  return (
    <div className="max-w-6xl mx-auto space-y-6 font-sans text-slate-800 pb-20">
      
      <div className="flex justify-between items-end border-b border-slate-200 pb-4">
        <div>
            <h1 className="text-2xl font-bold text-slate-900">Yapısal Analiz Özeti</h1>
            <p className="text-sm text-slate-500">Performans Göstergeleri ve Kritik Kontroller</p>
        </div>
        <div className="text-right text-xs text-slate-400">
            TS500 & TBDY 2018
        </div>
      </div>

      {/* 1. DASHBOARD KARTLARI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SummaryCard 
             title="Kritik Kolon Kapasitesi"
             value={`%${(maxColRatio * 100).toFixed(0)}`}
             subtext="Maksimum Eksenel Yük Oranı"
             icon={Box}
             status={colStatus}
             colorClass="text-blue-600"
          />
          <SummaryCard 
             title="Kiriş Sehim Durumu"
             value={`%${(beamDeflectionRatio * 100).toFixed(0)}`}
             subtext={`Maks: ${results.beams.deflection.toFixed(1)} mm / Lim: ${results.beams.deflection_limit.toFixed(1)} mm`}
             icon={Activity}
             status={beamStatus}
             colorClass="text-purple-600"
          />
          <SummaryCard 
             title="Temel & Zemin"
             value={`%${(foundStressRatio * 100).toFixed(0)}`}
             subtext={`Gerilme: ${results.foundation.stress_actual.toFixed(1)} kPa`}
             icon={Layers}
             status={foundStatus}
             colorClass="text-green-600"
          />
      </div>

      {/* 1.5 ANALİZ YÖNTEMİ KONTROLÜ (TBDY 2018 4.3.2) */}
      <section className={`rounded-xl shadow-sm border p-6 ${results.seismic.method_check.isApplicable ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
              <Info className="w-5 h-5" /> Analiz Yöntemi Kontrolü (TBDY 2018 4.3)
          </h3>
          <p className="text-sm mb-4">
             {results.seismic.method_check.reason}
          </p>
          <div className="bg-white rounded-lg border overflow-hidden">
             <table className="w-full text-xs text-left">
                 <thead className="bg-slate-50 font-bold text-slate-600">
                    <tr>
                        <th className="p-2">Kontrol</th>
                        <th className="p-2">Kriter</th>
                        <th className="p-2">Değer</th>
                        <th className="p-2">Sonuç</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y">
                    <tr>
                        <td className="p-2 font-medium">Bina Yüksekliği (Hn)</td>
                        <td className="p-2">≤ 40m</td>
                        <td className="p-2">{results.seismic.method_check.checks.height.reason}</td>
                        <td className="p-2"><StatusBadge isSafe={results.seismic.method_check.checks.height.isSafe} /></td>
                    </tr>
                    <tr>
                        <td className="p-2 font-medium">Burulma Düzensizliği (ηbi)</td>
                        <td className="p-2">≤ 2.0</td>
                        <td className="p-2">{results.seismic.method_check.checks.torsion.reason}</td>
                        <td className="p-2"><StatusBadge isSafe={results.seismic.method_check.checks.torsion.isSafe} /></td>
                    </tr>
                 </tbody>
             </table>
          </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 2. DEPREM VE DÜZENSİZLİK */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-orange-500" /> Deprem Analizi (TBDY 2018)
            </h3>
            
            <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                    <span className="text-sm font-medium">Bina Ağırlığı (W)</span>
                    <span className="font-mono font-bold">{results.seismic.building_weight.toFixed(1)} kN</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                    <span className="text-sm font-medium">Taban Kesme Kuvveti (Vt)</span>
                    <span className="font-mono font-bold">{results.seismic.base_shear.toFixed(1)} kN</span>
                </div>
                
                {/* Düzensizlik Tablosu */}
                <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-slate-100 font-bold text-slate-600">
                            <tr>
                                <th className="p-2">Düzensizlik</th>
                                <th className="p-2">Durum</th>
                                <th className="p-2 text-right">Değer</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            <tr>
                                <td className="p-2">A1 - Burulma Düzensizliği</td>
                                <td className="p-2"><StatusBadge isSafe={results.seismic.irregularities.A1.isSafe} /></td>
                                <td className="p-2 text-right font-mono">η = {results.seismic.irregularities.A1.eta_bi_max.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td className="p-2">Göreli Kat Ötelemesi</td>
                                <td className="p-2"><StatusBadge isSafe={results.seismic.story_drift.check.isSafe} /></td>
                                <td className="p-2 text-right font-mono">R = {results.seismic.story_drift.drift_ratio.toFixed(5)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </section>

        {/* 3. KRİTİK ELEMAN DETAYLARI */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" /> Kritik Eleman Kontrolleri
            </h3>
            
            <div className="space-y-3 text-sm">
                <div className="p-3 border rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="flex justify-between font-bold mb-1">
                        <span>Güçlü Kolon Kontrólu</span>
                        <span className={results.columns.checks.strongColumn.isSafe ? 'text-green-600' : 'text-red-600'}>
                            {results.columns.strong_col_ratio.toFixed(2)} {results.columns.checks.strongColumn.isSafe ? '≥' : '<'} 1.20
                        </span>
                    </div>
                    <div className="text-xs text-slate-500">Kolon momenti kiriş momentlerinden %20 fazla olmalıdır.</div>
                </div>

                <div className="p-3 border rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="flex justify-between font-bold mb-1">
                        <span>Kolon Kesme Güvenliği (Ve)</span>
                        <span className={results.columns.checks.shear_capacity.isSafe ? 'text-green-600' : 'text-red-600'}>
                             {results.columns.shear.Ve.toFixed(1)} kN
                        </span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500 mt-1">
                         <span>Kapasite (Vr): {results.columns.shear.Vr.toFixed(1)} kN</span>
                         <span>Sargı: Ø{results.columns.confinement.dia_used}/{results.columns.confinement.s_conf/10}</span>
                    </div>
                </div>

                <div className="p-3 border rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="flex justify-between font-bold mb-1">
                        <span>Temel Zımbalama</span>
                        <StatusBadge isSafe={results.foundation.checks.punching.isSafe} />
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                        Gerilme: {results.foundation.punching_stress.toFixed(2)} MPa (Limit: {results.foundation.punching_capacity.toFixed(2)} MPa)
                    </div>
                </div>
            </div>
        </section>

      </div>

      {/* DETAY TABLOSU (KATLAR) */}
      <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 p-4 border-b font-bold text-slate-700 text-sm">
              Kat Bazlı Deprem Analizi Detayları
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-center">
                <thead className="text-slate-500 font-bold border-b">
                    <tr>
                        <th className="p-3">Kat</th>
                        <th className="p-3">Kuvvet (Fi)</th>
                        <th className="p-3">Deplasman (d)</th>
                        <th className="p-3">Burulma (η)</th>
                        <th className="p-3">Drift (R)</th>
                        <th className="p-3">Durum</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {results.seismic.irregularities.A1.details.slice().reverse().map(s => (
                        <tr key={s.storyIndex} className="hover:bg-slate-50">
                            <td className="p-3 font-bold">{s.storyIndex}. Kat</td>
                            <td className="p-3">{s.forceApplied.toFixed(1)} kN</td>
                            <td className="p-3">{s.dispMax.toFixed(2)} mm</td>
                            <td className={`p-3 font-bold ${s.eta_bi > 1.2 ? 'text-red-600' : 'text-slate-600'}`}>{s.eta_bi.toFixed(2)}</td>
                            <td className="p-3">{s.driftRatio.toFixed(5)}</td>
                            <td className="p-3 flex justify-center">
                                <StatusBadge isSafe={s.driftCheck.isSafe && s.torsionCheck.isSafe} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
          </div>
      </section>

      {/* YETERSİZ ELEMANLAR LİSTESİ */}
      {failedElements.length > 0 && (
          <section className="bg-red-50 rounded-xl shadow-sm border border-red-200 p-6">
              <h3 className="font-bold text-lg mb-4 text-red-800 flex items-center gap-2">
                  <XCircle className="w-5 h-5" /> Kontrolleri Sağlamayan Elemanlar ({failedElements.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {failedElements.map((el, i) => (
                      <div key={i} className="bg-white border border-red-100 rounded-lg p-3 text-xs flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex justify-between items-center mb-2 border-b border-red-50 pb-1">
                              <span className="font-bold font-mono text-slate-800 text-sm">{el.id}</span>
                              <span className="text-slate-400 capitalize bg-slate-50 px-2 py-0.5 rounded">{el.type}</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                              {el.messages.map((msg, idx) => (
                                  <span key={idx} className="bg-red-50 text-red-600 px-2 py-1 rounded border border-red-100 text-[10px] font-bold w-full text-center">
                                      {msg}
                                  </span>
                              ))}
                          </div>
                      </div>
                  ))}
              </div>
          </section>
      )}

    </div>
  );
};

export default Report;
