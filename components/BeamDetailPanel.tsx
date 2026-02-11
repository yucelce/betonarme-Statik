
import React from 'react';
import { DetailedBeamResult } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { X, Info } from 'lucide-react';

interface Props {
  data: DetailedBeamResult;
  onClose: () => void;
}

const BeamDetailPanel: React.FC<Props> = ({ data, onClose }) => {
  
  // Pozitif ve Negatif alanları ayırmak için Gradient Offset hesabı
  const getGradientOffset = (key: 'M' | 'V') => {
    const dataMax = Math.max(...data.diagramData.map((i) => i[key]));
    const dataMin = Math.min(...data.diagramData.map((i) => i[key]));
  
    if (dataMax <= 0) return 0;
    if (dataMin >= 0) return 1;
  
    return dataMax / (dataMax - dataMin);
  };
  
  const offM = getGradientOffset('M');
  const offV = getGradientOffset('V');

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 absolute top-16 right-4 w-[500px] z-50 animate-in fade-in slide-in-from-right-10 flex flex-col gap-4">
      <div className="flex justify-between items-center border-b pb-2 bg-slate-50 -m-4 mb-0 p-4 rounded-t-xl">
        <div>
          <h3 className="font-bold text-slate-800 text-lg">Kiriş Detayı: {data.beamId}</h3>
          <div className="text-xs text-slate-500">İç Kuvvet Diyagramları (M & V)</div>
        </div>
        <button onClick={onClose} className="bg-white p-1 rounded-full border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 transition-all shadow-sm">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* MOMENT GRAFİĞİ */}
      <div className="mt-2">
        <div className="flex justify-between items-end mb-1 px-1">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-600"></span> Eğilme Momenti (M3)
            </h4>
            <div className="text-[10px] font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600 border flex gap-2">
                 <span>Mesnet(-): <b className="text-red-600">{data.minM.toFixed(1)}</b></span>
                 <span>Açıklık(+): <b className="text-blue-600">{data.maxM.toFixed(1)}</b> kNm</span>
            </div>
        </div>
        <div className="h-56 w-full bg-white rounded border border-slate-200 p-2 shadow-inner relative">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.diagramData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="splitColorM" x1="0" y1="0" x2="0" y2="1">
                  {/* Reversed Axis olduğu için sıralama görsel olarak ters işleyebilir, ancak mantık aynıdır */}
                  <stop offset={offM} stopColor="#2563eb" stopOpacity={0.4} /> {/* Pozitif (Aşağı/Mavi) */}
                  <stop offset={offM} stopColor="#dc2626" stopOpacity={0.4} /> {/* Negatif (Yukarı/Kırmızı) */}
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#f1f5f9" />
              <XAxis dataKey="x" hide />
              {/* reversed={true}: Pozitif değerler aşağı, Negatif değerler yukarı çizilir (Çekme Tarafı) */}
              <YAxis 
                reversed={true} 
                tick={{fontSize: 10, fill: '#64748b'}} 
                tickCount={5}
                width={30}
              />
              <Tooltip 
                contentStyle={{fontSize: '11px', borderRadius: '6px', border: '1px solid #e2e8f0'}} 
                itemStyle={{padding: 0, fontWeight: 600}}
                formatter={(val: number) => [`${val.toFixed(2)} kNm`, 'Moment']}
                labelFormatter={(label) => `Mesafe: ${label} m`}
              />
              {/* Kiriş Ekseni (Kalın Siyah Çizgi) */}
              <ReferenceLine y={0} stroke="#0f172a" strokeWidth={2} />
              
              <Area 
                type="monotone" // Parabolik davranış için
                dataKey="M" 
                stroke="#1e293b" 
                strokeWidth={2} 
                fill="url(#splitColorM)" 
                animationDuration={1000}
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="absolute top-2 right-2 text-[9px] bg-white/80 px-1 rounded text-slate-400 border border-slate-100">
             Çekme Tarafı
          </div>
        </div>
      </div>

      {/* KESME GRAFİĞİ */}
      <div>
        <div className="flex justify-between items-end mb-1 px-1">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-500"></span> Kesme Kuvveti (V2)
            </h4>
            <div className="text-[10px] font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600 border">
                 Max: <span className="text-orange-600 font-bold">{data.maxV.toFixed(1)}</span> kN
            </div>
        </div>
        <div className="h-40 w-full bg-white rounded border border-slate-200 p-2 shadow-inner">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.diagramData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="splitColorV" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={offV} stopColor="#f97316" stopOpacity={0.4} />
                  <stop offset={offV} stopColor="#f97316" stopOpacity={0.2} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#f1f5f9" />
              <XAxis 
                dataKey="x" 
                tick={{fontSize: 10, fill: '#64748b'}} 
                tickLine={false}
                unit=" m"
              />
              <YAxis 
                 tick={{fontSize: 10, fill: '#64748b'}} 
                 tickCount={5}
                 width={30}
              />
              <Tooltip 
                 contentStyle={{fontSize: '11px', borderRadius: '6px', border: '1px solid #e2e8f0'}}
                 formatter={(val: number) => [`${val.toFixed(2)} kN`, 'Kesme']}
                 labelFormatter={(label) => `Mesafe: ${label} m`}
              />
              <ReferenceLine y={0} stroke="#0f172a" strokeWidth={2} />
              
              <Area 
                type="linear" // Yayılı yükte kesme kuvveti lineer değişir
                dataKey="V" 
                stroke="#c2410c" 
                strokeWidth={2} 
                fill="url(#splitColorV)" 
                animationDuration={1000}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      <div className="flex gap-2 items-start bg-blue-50 p-2 rounded text-[10px] text-blue-800 border border-blue-100">
        <Info className="w-4 h-4 shrink-0" />
        <div>
          <strong>Mühendislik Gösterimi:</strong> Moment diyagramı "Çekme Tarafına" çizilmiştir. 
          Açıklıklarda aşağıya (pozitif), mesnetlerde yukarıya (negatif) doğru değişim gösterir.
        </div>
      </div>
    </div>
  );
};

export default BeamDetailPanel;
