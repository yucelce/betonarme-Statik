
import React from 'react';
import { DetailedBeamResult } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { X } from 'lucide-react';

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
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 absolute top-16 right-4 w-[450px] z-50 animate-in fade-in slide-in-from-right-10 flex flex-col gap-4">
      <div className="flex justify-between items-center border-b pb-2 bg-slate-50 -m-4 mb-0 p-4 rounded-t-xl">
        <div>
          <h3 className="font-bold text-slate-800 text-lg">Kiriş Detayı: {data.beamId}</h3>
          <div className="text-xs text-slate-500">İç Kuvvet Diyagramları</div>
        </div>
        <button onClick={onClose} className="bg-white p-1 rounded-full border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 transition-all shadow-sm">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* MOMENT GRAFİĞİ */}
      <div className="mt-2">
        <div className="flex justify-between items-end mb-1 px-1">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span> Eğilme Momenti (M3)
            </h4>
            <div className="text-[10px] font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600 border">
                 Min: <span className="text-red-600 font-bold">{data.minM.toFixed(1)}</span> / Max: <span className="text-blue-600 font-bold">{data.maxM.toFixed(1)}</span> kNm
            </div>
        </div>
        <div className="h-48 w-full bg-white rounded border border-slate-200 p-2 shadow-inner">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.diagramData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="splitColorM" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={offM} stopColor="#3b82f6" stopOpacity={0.6} /> {/* Pozitif: Mavi */}
                  <stop offset={offM} stopColor="#ef4444" stopOpacity={0.6} /> {/* Negatif: Kırmızı */}
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#f1f5f9" />
              <XAxis dataKey="x" hide />
              <YAxis 
                tick={{fontSize: 10, fill: '#64748b'}} 
                tickCount={5}
              />
              <Tooltip 
                contentStyle={{fontSize: '11px', borderRadius: '6px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} 
                itemStyle={{padding: 0, fontWeight: 600}}
                formatter={(val: number) => [`${val.toFixed(2)} kNm`, 'Moment']}
                labelFormatter={(label) => `Mesafe: ${label} m`}
              />
              <ReferenceLine y={0} stroke="#0f172a" strokeWidth={1} />
              <Area 
                type="monotone" 
                dataKey="M" 
                stroke="#1e293b" 
                strokeWidth={1.5} 
                fill="url(#splitColorM)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* KESME GRAFİĞİ */}
      <div>
        <div className="flex justify-between items-end mb-1 px-1">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-500"></span> Kesme Kuvveti (V2)
            </h4>
            <div className="text-[10px] font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600 border">
                 Max Mutlak: <span className="text-orange-600 font-bold">{data.maxV.toFixed(1)}</span> kN
            </div>
        </div>
        <div className="h-48 w-full bg-white rounded border border-slate-200 p-2 shadow-inner">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.diagramData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="splitColorV" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={offV} stopColor="#f97316" stopOpacity={0.6} />
                  <stop offset={offV} stopColor="#f97316" stopOpacity={0.3} />
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
              />
              <Tooltip 
                 contentStyle={{fontSize: '11px', borderRadius: '6px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                 formatter={(val: number) => [`${val.toFixed(2)} kN`, 'Kesme']}
                 labelFormatter={(label) => `Mesafe: ${label} m`}
              />
              <ReferenceLine y={0} stroke="#0f172a" strokeWidth={1} />
              <Area 
                type="step" 
                dataKey="V" 
                stroke="#c2410c" 
                strokeWidth={1.5} 
                fill="url(#splitColorV)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      <div className="text-[9px] text-slate-400 text-center font-mono bg-slate-50 p-1 rounded">
        * Moment: Pozitif (Mavi) = Açıklık / Negatif (Kırmızı) = Mesnet
      </div>
    </div>
  );
};

export default BeamDetailPanel;
