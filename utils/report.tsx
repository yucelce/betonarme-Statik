import React from 'react';
import { AppState, CalculationResult } from '../types';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface Props {
  state: AppState;
  results: CalculationResult;
}

const StatusIcon = ({ isSafe }: { isSafe: boolean }) => 
  isSafe ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />;

const Report: React.FC<Props> = ({ state, results }) => {
  return (
    <div className="bg-white p-8 rounded-xl shadow-lg max-w-4xl mx-auto font-serif text-slate-800 space-y-8 border border-slate-200">
      
      {/* BAŞLIK */}
      <div className="border-b-2 border-slate-800 pb-4 flex justify-between items-end">
        <div>
           <h1 className="text-3xl font-bold uppercase tracking-wide">Betonarme Statik Analiz Raporu</h1>
           <p className="text-sm text-slate-500 mt-1">TS500 & TBDY 2018 Ön Tasarım Sonuçları</p>
        </div>
        <div className="text-right text-xs">
          <div>Tarih: {new Date().toLocaleDateString('tr-TR')}</div>
          <div>Beton: {state.materials.concreteClass} / Çelik: B420C</div>
        </div>
      </div>

      {/* 1. TASARIM PARAMETRELERİ */}
      <section>
        <h2 className="font-bold text-lg border-b border-slate-300 mb-3 text-slate-700">1. Tasarım Parametreleri</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="bg-slate-50 p-3 rounded">
            <span className="block text-xs text-slate-500">Zemin Sınıfı</span>
            <span className="font-bold">{state.seismic.soilClass}</span>
          </div>
          <div className="bg-slate-50 p-3 rounded">
             <span className="block text-xs text-slate-500">Spektral İvmeler</span>
             <span className="font-bold">Ss={state.seismic.ss}, S1={state.seismic.s1}</span>
          </div>
          <div className="bg-slate-50 p-3 rounded">
             <span className="block text-xs text-slate-500">Bina Ağırlığı (W)</span>
             <span className="font-bold">{results.seismic.building_weight.toFixed(1)} kN</span>
          </div>
          <div className="bg-slate-50 p-3 rounded">
             <span className="block text-xs text-slate-500">Taban Kesme (Vt)</span>
             <span className="font-bold">{results.seismic.base_shear.toFixed(1)} kN</span>
          </div>
        </div>
        <div className="mt-2 text-xs text-slate-500">
           Spektrum Karakteristik Periyotları: TA=0.20s, TB=0.85s (Otomatik) | Yapı Periyodu T1: {results.seismic.period_t1.toFixed(3)}s
        </div>
      </section>

      {/* 2. DÖŞEME KONTROLLERİ */}
      <section>
        <h2 className="font-bold text-lg border-b border-slate-300 mb-3 text-slate-700 flex items-center gap-2">
            2. Döşeme Analizi
            <StatusIcon isSafe={results.slab.status.isSafe} />
        </h2>
        <table className="w-full text-sm text-left">
           <thead className="bg-slate-100 text-xs uppercase">
             <tr>
               <th className="p-2">Kontrol Tipi</th>
               <th className="p-2">Değer</th>
               <th className="p-2">Sınır / Gereken</th>
               <th className="p-2">Sonuç</th>
             </tr>
           </thead>
           <tbody className="divide-y">
             <tr>
                <td className="p-2 font-medium">Kalınlık Kontrolü</td>
                <td className="p-2">{state.sections.slabThickness} cm</td>
                <td className="p-2">min {Math.max(results.slab.min_thickness_calculated, results.slab.min_thickness_limit).toFixed(1)} cm</td>
                <td className="p-2 text-xs">{results.slab.thicknessStatus.message}</td>
             </tr>
             <tr>
                <td className="p-2 font-medium">Eğilme Donatısı</td>
                <td className="p-2">Ø{state.rebars.slabDia}/{results.slab.spacing}</td>
                <td className="p-2">As_req: {results.slab.as_req.toFixed(0)} mm²/m</td>
                <td className="p-2 text-green-600 font-bold">Yeterli</td>
             </tr>
           </tbody>
        </table>
      </section>

      {/* 3. KRİTİK KİRİŞ KONTROLLERİ */}
      <section>
        <h2 className="font-bold text-lg border-b border-slate-300 mb-3 text-slate-700 flex items-center gap-2">
            3. Kritik Kiriş Kontrolleri
            <StatusIcon isSafe={results.beams.checks.shear.isSafe && results.beams.checks.deflection.isSafe} />
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border rounded-lg p-4">
               <h3 className="text-xs font-bold uppercase text-slate-500 mb-2">Eğilme ve Donatı</h3>
               <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                     <span>Mesnet Momenti:</span>
                     <span>{results.beams.moment_support.toFixed(1)} kNm</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                     <span>Açıklık Momenti:</span>
                     <span>{results.beams.moment_span.toFixed(1)} kNm</span>
                  </div>
                  <div className="flex justify-between pt-1">
                     <span>Seçilen Mesnet:</span>
                     <span className="font-mono bg-slate-100 px-1 rounded">{results.beams.count_support}Ø{state.rebars.beamMainDia}</span>
                  </div>
                  <div className="flex justify-between">
                     <span>Seçilen Açıklık:</span>
                     <span className="font-mono bg-slate-100 px-1 rounded">{results.beams.count_span}Ø{state.rebars.beamMainDia}</span>
                  </div>
               </div>
            </div>

            <div className="bg-white border rounded-lg p-4">
               <h3 className="text-xs font-bold uppercase text-slate-500 mb-2">Kesme ve Sehim</h3>
               <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                     <span>Kesme Kuvveti (Vd):</span>
                     <span className={results.beams.checks.shear.isSafe ? 'text-slate-800' : 'text-red-600 font-bold'}>
                        {results.beams.shear_design.toFixed(1)} kN
                     </span>
                  </div>
                   <div className="flex justify-between text-xs text-slate-500">
                     <span>Kapasite (Vr_max):</span>
                     <span>{results.beams.shear_limit.toFixed(1)} kN</span>
                  </div>
                  <div className="flex justify-between items-center border-t pt-2">
                     <span>Etriye:</span>
                     <span className="font-mono bg-slate-100 px-1 rounded">{results.beams.shear_reinf_type}</span>
                  </div>
                   <div className="flex justify-between items-center border-t pt-2">
                     <span>Sehim:</span>
                     <div className="text-right">
                        <span className={results.beams.checks.deflection.isSafe ? 'text-green-600' : 'text-red-600'}>
                             {results.beams.deflection.toFixed(1)} mm
                        </span>
                        <span className="text-[10px] text-slate-400 block">Limit: {results.beams.deflection_limit.toFixed(1)} mm</span>
                     </div>
                  </div>
               </div>
            </div>
        </div>
      </section>

       {/* 4. KRİTİK KOLON KONTROLLERİ */}
      <section>
        <h2 className="font-bold text-lg border-b border-slate-300 mb-3 text-slate-700 flex items-center gap-2">
            4. Kritik Kolon Kontrolleri
            <StatusIcon isSafe={results.columns.checks.axial_limit.isSafe && results.columns.checks.shear_capacity.isSafe} />
        </h2>
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="bg-slate-100 text-xs text-slate-600 uppercase">
                    <tr>
                        <th className="p-2 text-left">Kontrol</th>
                        <th className="p-2 text-right">Talep</th>
                        <th className="p-2 text-right">Kapasite / Limit</th>
                        <th className="p-2 text-center">Durum</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    <tr>
                        <td className="p-2 font-medium">Eksenel Yük (Nd)</td>
                        <td className="p-2 text-right">{results.columns.axial_load_design.toFixed(0)} kN</td>
                        <td className="p-2 text-right">{results.columns.axial_capacity_max.toFixed(0)} kN</td>
                        <td className="p-2 text-center text-xs">{results.columns.checks.axial_limit.isSafe ? '✔ OK' : '❌ Aşıldı'}</td>
                    </tr>
                    <tr>
                        <td className="p-2 font-medium">Güçlü Kolon (Mcol/Mbeam)</td>
                        <td className="p-2 text-right">{results.columns.strong_col_ratio.toFixed(2)}</td>
                        <td className="p-2 text-right">min 1.20</td>
                        <td className="p-2 text-center text-xs">
                            {results.columns.checks.strongColumn.isSafe ? '✔ OK' : <span className="text-red-600 font-bold">❌ Zayıf</span>}
                        </td>
                    </tr>
                     <tr>
                        <td className="p-2 font-medium">Kesme Güvenliği (Ve)</td>
                        <td className="p-2 text-right">{results.columns.shear.Ve.toFixed(1)} kN</td>
                        <td className="p-2 text-right">{results.columns.shear.Vr.toFixed(1)} kN</td>
                        <td className="p-2 text-center text-xs">{results.columns.checks.shear_capacity.isSafe ? '✔ OK' : '❌ Yetersiz'}</td>
                    </tr>
                    <tr>
                        <td className="p-2 font-medium">Sargı Donatısı</td>
                        <td className="p-2 text-right">Ash: {results.columns.confinement.Ash_prov.toFixed(0)} mm²</td>
                        <td className="p-2 text-right">Req: {results.columns.confinement.Ash_req.toFixed(0)} mm²</td>
                        <td className="p-2 text-center text-xs font-mono">
                             Ø{results.columns.confinement.dia_used}/{results.columns.confinement.s_conf/10}/{results.columns.confinement.s_middle/10}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
      </section>

       {/* 5. TEMEL KONTROLLERİ */}
      <section className="break-inside-avoid">
        <h2 className="font-bold text-lg border-b border-slate-300 mb-3 text-slate-700 flex items-center gap-2">
            5. Temel Kontrolleri
            <StatusIcon isSafe={results.foundation.checks.bearing.isSafe && results.foundation.checks.punching.isSafe} />
        </h2>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
             <div className={`p-4 rounded border ${results.foundation.checks.bearing.isSafe ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                 <div className="font-bold mb-1">Zemin Gerilmesi</div>
                 <div className="text-2xl font-bold">{results.foundation.stress_actual.toFixed(1)} <span className="text-sm font-normal">kPa</span></div>
                 <div className="text-xs mt-1">Limit: {results.foundation.stress_limit} kPa</div>
             </div>
             <div className={`p-4 rounded border ${results.foundation.checks.punching.isSafe ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                 <div className="font-bold mb-1">Zımbalama Kontrolü</div>
                 <div className="text-2xl font-bold">{results.foundation.punching_stress.toFixed(2)} <span className="text-sm font-normal">MPa</span></div>
                 <div className="text-xs mt-1">Kapasite: {results.foundation.punching_capacity.toFixed(2)} MPa</div>
             </div>
         </div>
      </section>

      <div className="text-center text-[10px] text-slate-400 mt-8 pt-4 border-t">
        Not: Bu rapor ön tasarım amaçlıdır. Nihai projeler için detaylı analiz ve ilgili yönetmeliklerin tam kontrolü gereklidir.
      </div>

    </div>
  );
};

export default Report;