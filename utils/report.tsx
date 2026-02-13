
import React, { useState } from 'react';
import { AppState, CalculationResult, ElementAnalysisStatus } from '../types';
import { CheckCircle, XCircle, AlertTriangle, Activity, Box, Layers, ArrowDownToLine, Info, Lightbulb, FileText, LayoutList } from 'lucide-react';

interface Props {
  state: AppState;
  results: CalculationResult;
}

const StatusBadge = ({ isSafe, text }: { isSafe: boolean; text?: string }) => 
  isSafe ? 
  <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1 w-fit"><CheckCircle className="w-3 h-3"/> {text || 'Uygun'}</span> : 
  <span className="bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1 w-fit"><XCircle className="w-3 h-3"/> {text || 'Yetersiz'}</span>;

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
  const [activeTab, setActiveTab] = useState<'summary' | 'beams' | 'columns' | 'slabs'>('summary');

  // Özet Verileri Hazırla
  const maxColRatio = results.columns.interaction_ratio;
  const colStatus = results.columns.checks.axial_limit.isSafe && results.columns.checks.shear_capacity.isSafe && results.columns.checks.strongColumn.isSafe;
  
  const beamDeflectionRatio = results.beams.deflection / results.beams.deflection_limit;
  const beamStatus = results.beams.checks.shear.isSafe && results.beams.checks.deflection.isSafe;

  const foundStressRatio = results.foundation.stress_actual / results.foundation.stress_limit;
  const foundStatus = results.foundation.checks.bearing.isSafe && results.foundation.checks.punching.isSafe;

  // Hatalı Elemanları Filtrele
  const failedElements = (Array.from(results.elementResults.values()) as ElementAnalysisStatus[]).filter(e => !e.isSafe);

  // Sekmeler
  const tabs = [
      { id: 'summary', label: 'Proje Özeti', icon: Activity },
      { id: 'beams', label: 'Kirişler', icon: LayoutList },
      { id: 'columns', label: 'Kolonlar & Perdeler', icon: Box },
      { id: 'slabs', label: 'Döşemeler', icon: Layers },
  ];

  const renderSummary = () => (
      <div className="space-y-6">
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

          {/* 1.5 ANALİZ YÖNTEMİ KONTROLÜ */}
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
                        <span className="text-sm font-medium">Taban Kesme Kuvveti (Vt,x)</span>
                        <span className="font-mono font-bold">{results.seismic.base_shear_x.toFixed(1)} kN</span>
                    </div>
                    
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
                        {results.seismic.irregularities.A1.details.slice().reverse().map(s => {
                            const h = state.dimensions.storyHeights[s.storyIndex - 1] || 3;
                            const force = Math.max(s.forceAppliedX, s.forceAppliedY);
                            const disp = Math.max(s.dispAvgX, s.dispAvgY);
                            const eta = Math.max(s.eta_bi_x, s.eta_bi_y);
                            const drift = Math.max(s.driftX, s.driftY);
                            const driftRatio = drift / (h * 1000);

                            return (
                                <tr key={s.storyIndex} className="hover:bg-slate-50">
                                    <td className="p-3 font-bold">{s.storyIndex}. Kat</td>
                                    <td className="p-3">{force.toFixed(1)} kN</td>
                                    <td className="p-3">{disp.toFixed(2)} mm</td>
                                    <td className={`p-3 font-bold ${eta > 1.2 ? 'text-red-600' : 'text-slate-600'}`}>{eta.toFixed(2)}</td>
                                    <td className="p-3">{driftRatio.toFixed(5)}</td>
                                    <td className="p-3 flex justify-center">
                                        <StatusBadge isSafe={s.driftCheck.isSafe && s.torsionCheck.isSafe} />
                                    </td>
                                </tr>
                            );
                        })}
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {failedElements.map((el, i) => (
                          <div key={i} className="bg-white border border-red-100 rounded-lg p-4 text-xs flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow">
                              <div className="flex justify-between items-center mb-2 border-b border-red-50 pb-2">
                                  <span className="font-bold font-mono text-slate-800 text-sm">{el.id}</span>
                                  <span className="text-slate-400 capitalize bg-slate-50 px-2 py-0.5 rounded border border-slate-100">{el.type}</span>
                              </div>
                              <div className="flex flex-wrap gap-1 mb-3">
                                  {el.messages.map((msg, idx) => (
                                      <span key={idx} className="bg-red-50 text-red-600 px-2 py-1 rounded border border-red-100 text-[10px] font-bold w-full text-center">
                                          {msg}
                                      </span>
                                  ))}
                              </div>
                              {el.recommendations.length > 0 && (
                                  <div className="bg-blue-50 border border-blue-100 rounded p-2 mt-auto">
                                      <div className="text-blue-800 font-bold flex items-center gap-1 mb-1">
                                          <Lightbulb className="w-3 h-3" /> Çözüm Önerisi:
                                      </div>
                                      <ul className="list-disc list-inside text-slate-600 space-y-1">
                                          {el.recommendations.map((rec, idx) => (
                                              <li key={idx}>{rec}</li>
                                          ))}
                                      </ul>
                                  </div>
                              )}
                          </div>
                      ))}
                  </div>
              </section>
          )}
      </div>
  );

  const renderBeamTable = () => (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-600 font-bold uppercase border-b">
                      <tr>
                          <th className="p-3">Eleman</th>
                          <th className="p-3">Boyut (cm)</th>
                          <th className="p-3 text-right">Vd (kN)</th>
                          <th className="p-3 text-right">Vr (kN)</th>
                          <th className="p-3 text-right">M-Mesnet (kNm)</th>
                          <th className="p-3 text-right">M-Açıklık (kNm)</th>
                          <th className="p-3 text-right">Donatı (Mesnet)</th>
                          <th className="p-3 text-right">Donatı (Açıklık)</th>
                          <th className="p-3 text-right">Sehim (mm)</th>
                          <th className="p-3 text-center">Durum</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y">
                      {Array.from(results.detailedBeams.entries()).map(([id, res]) => {
                          const beamEl = state.definedElements.find(e => e.id === id);
                          const w = beamEl?.properties?.width ?? state.sections.beamWidth;
                          const h = beamEl?.properties?.depth ?? state.sections.beamDepth;
                          const status = res.checks.shear.isSafe && res.checks.deflection.isSafe && res.checks.min_reinf.isSafe && res.checks.max_reinf.isSafe;

                          return (
                              <tr key={id} className="hover:bg-slate-50 transition-colors">
                                  <td className="p-3 font-mono font-bold text-slate-800">{id}</td>
                                  <td className="p-3 text-slate-500">{w}/{h}</td>
                                  <td className="p-3 text-right font-medium">{res.shear_design.toFixed(1)}</td>
                                  <td className="p-3 text-right text-slate-500">{res.shear_limit.toFixed(1)}</td>
                                  <td className="p-3 text-right">{res.moment_support.toFixed(1)}</td>
                                  <td className="p-3 text-right">{res.moment_span.toFixed(1)}</td>
                                  <td className="p-3 text-right font-mono text-blue-600">{res.count_support}Ø{state.rebars.beamMainDia}</td>
                                  <td className="p-3 text-right font-mono text-blue-600">{res.count_span}Ø{state.rebars.beamMainDia}</td>
                                  <td className={`p-3 text-right ${!res.checks.deflection.isSafe ? 'text-red-600 font-bold':''}`}>{res.deflection.toFixed(1)}</td>
                                  <td className="p-3 text-center"><StatusBadge isSafe={status} text={status ? 'OK' : 'HATA'} /></td>
                              </tr>
                          );
                      })}
                  </tbody>
              </table>
          </div>
      </div>
  );

  const renderColumnTable = () => (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-600 font-bold uppercase border-b">
                      <tr>
                          <th className="p-3">Eleman</th>
                          <th className="p-3">Boyut (cm)</th>
                          <th className="p-3 text-right">Nd (kN)</th>
                          <th className="p-3 text-right">Nmax (kN)</th>
                          <th className="p-3 text-right">Oran</th>
                          <th className="p-3 text-right">Ve (kN)</th>
                          <th className="p-3 text-right">Vr (kN)</th>
                          <th className="p-3 text-right">Donatı</th>
                          <th className="p-3 text-right">Sargı</th>
                          <th className="p-3 text-center">Durum</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y">
                      {Array.from(results.detailedColumns.entries()).map(([id, res]) => {
                          const colEl = state.definedElements.find(e => e.id === id);
                          const w = colEl?.properties?.width ?? (colEl?.type === 'shear_wall' ? state.sections.wallLength : state.sections.colWidth);
                          const d = colEl?.properties?.depth ?? (colEl?.type === 'shear_wall' ? state.sections.wallThickness : state.sections.colDepth);
                          
                          const status = res.checks.axial_limit.isSafe && res.checks.shear_capacity.isSafe && res.checks.moment_capacity.isSafe;

                          return (
                              <tr key={id} className="hover:bg-slate-50 transition-colors">
                                  <td className="p-3 font-mono font-bold text-slate-800">{id}</td>
                                  <td className="p-3 text-slate-500">{w}/{d}</td>
                                  <td className="p-3 text-right font-medium">{res.axial_load_design.toFixed(0)}</td>
                                  <td className="p-3 text-right text-slate-500">{res.axial_capacity_max.toFixed(0)}</td>
                                  <td className={`p-3 text-right font-bold ${res.interaction_ratio > 1 ? 'text-red-600' : 'text-slate-700'}`}>%{ (res.interaction_ratio * 100).toFixed(0) }</td>
                                  <td className="p-3 text-right">{res.shear.Ve.toFixed(1)}</td>
                                  <td className="p-3 text-right text-slate-500">{res.shear.Vr.toFixed(1)}</td>
                                  <td className="p-3 text-right font-mono text-blue-600">{res.count_main}Ø{state.rebars.colMainDia}</td>
                                  <td className="p-3 text-right font-mono text-slate-500">Ø{res.confinement.dia_used}/{res.confinement.s_conf/10}</td>
                                  <td className="p-3 text-center"><StatusBadge isSafe={status} text={status ? 'OK' : 'HATA'} /></td>
                              </tr>
                          );
                      })}
                  </tbody>
              </table>
          </div>
      </div>
  );

  const renderSlabTable = () => (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-600 font-bold uppercase border-b">
                      <tr>
                          <th className="p-3">Eleman</th>
                          <th className="p-3 text-right">Kalınlık (cm)</th>
                          <th className="p-3 text-right">Hareketli Yük (kg/m²)</th>
                          <th className="p-3 text-right">Min Kalınlık (cm)</th>
                          <th className="p-3 text-right">Gereken Donatı (mm²/m)</th>
                          <th className="p-3 text-right">Donatı Aralığı (cm)</th>
                          <th className="p-3 text-center">Durum</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y">
                      {state.definedElements.filter(e => e.type === 'slab').map(el => {
                          const t = el.properties?.thickness || state.sections.slabThickness;
                          const q = el.properties?.liveLoad || state.loads.liveLoadKg;
                          // Tüm döşemeler için aynı analizi kullanıyoruz (Basitleştirme)
                          const res = results.slab; 
                          const isSafe = t >= res.min_thickness_calculated && t >= res.min_thickness_limit;

                          return (
                              <tr key={el.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="p-3 font-mono font-bold text-slate-800">{el.id}</td>
                                  <td className="p-3 text-right font-bold">{t}</td>
                                  <td className="p-3 text-right">{q}</td>
                                  <td className="p-3 text-right text-slate-500">{Math.max(res.min_thickness_calculated, res.min_thickness_limit).toFixed(1)}</td>
                                  <td className="p-3 text-right">{res.as_req.toFixed(0)}</td>
                                  <td className="p-3 text-right font-mono text-blue-600">Ø{state.rebars.slabDia}/{res.spacing/10}</td>
                                  <td className="p-3 text-center"><StatusBadge isSafe={isSafe} text={isSafe ? 'OK' : 'KALINLIK'} /></td>
                              </tr>
                          );
                      })}
                  </tbody>
              </table>
          </div>
      </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6 font-sans text-slate-800 pb-20">
      
      <div className="flex justify-between items-end border-b border-slate-200 pb-4">
        <div>
            <h1 className="text-2xl font-bold text-slate-900">Yapısal Analiz Raporu</h1>
            <p className="text-sm text-slate-500">TS500 & TBDY 2018 Standartlarına Göre Detaylı Döküm</p>
        </div>
        <div className="text-right text-xs text-slate-400">
            {new Date().toLocaleDateString('tr-TR')}
        </div>
      </div>

      {/* TAB NAVIGATION */}
      <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg w-fit">
          {tabs.map(tab => (
              <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                      activeTab === tab.id 
                      ? 'bg-white text-blue-600 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
              >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
              </button>
          ))}
      </div>

      {/* TAB CONTENT */}
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          {activeTab === 'summary' && renderSummary()}
          {activeTab === 'beams' && renderBeamTable()}
          {activeTab === 'columns' && renderColumnTable()}
          {activeTab === 'slabs' && renderSlabTable()}
      </div>

    </div>
  );
};

export default Report;
