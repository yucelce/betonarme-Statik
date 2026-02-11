import React from 'react';
import { DetailedBeamResult } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ReferenceLine } from 'recharts';
import { X } from 'lucide-react';

interface Props {
  data: DetailedBeamResult;
  onClose: () => void;
}

const BeamDetailPanel: React.FC<Props> = ({ data, onClose }) => {
  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 absolute top-4 right-4 w-96 z-50 animate-in fade-in slide-in-from-right-10">
      <div className="flex justify-between items-center mb-4 border-b pb-2">
        <div>
          <h3 className="font-bold text-slate-800">Kiriş Detayı: {data.beamId}</h3>
          <div className="text-xs text-slate-500">Moment ve Kesme Diyagramları</div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-red-500 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* MOMENT GRAFİĞİ */}
      <div className="mb-6">
        <h4 className="text-xs font-bold text-blue-600 mb-2 flex justify-between">
            <span>Eğilme Momenti (M3)</span>
            <span>Max: {data.maxM.toFixed(1)} kNm</span>
        </h4>
        <div className="h-40 w-full bg-slate-50 rounded border border-slate-100 p-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.diagramData}>
              <defs>
                <linearGradient id="colorM" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="x" hide />
              <YAxis domain={['auto', 'auto']} width={30} tick={{fontSize: 10}} />
              <Tooltip 
                contentStyle={{fontSize: '10px', borderRadius: '8px'}} 
                itemStyle={{padding: 0}}
                formatter={(val: number) => [`${val} kNm`, 'Moment']}
                labelFormatter={(label) => `${label} m`}
              />
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Area type="monotone" dataKey="M" stroke="#2563eb" fillOpacity={1} fill="url(#colorM)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* KESME GRAFİĞİ */}
      <div>
        <h4 className="text-xs font-bold text-orange-600 mb-2 flex justify-between">
            <span>Kesme Kuvveti (V2)</span>
            <span>Max: {data.maxV.toFixed(1)} kN</span>
        </h4>
        <div className="h-40 w-full bg-slate-50 rounded border border-slate-100 p-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.diagramData}>
              <defs>
                <linearGradient id="colorV" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="x" tick={{fontSize: 10}} unit="m" />
              <YAxis domain={['auto', 'auto']} width={30} tick={{fontSize: 10}} />
              <Tooltip 
                 contentStyle={{fontSize: '10px', borderRadius: '8px'}}
                 formatter={(val: number) => [`${val} kN`, 'Kesme']}
                 labelFormatter={(label) => `${label} m`}
              />
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Area type="monotone" dataKey="V" stroke="#ea580c" fillOpacity={1} fill="url(#colorV)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      <div className="mt-4 pt-2 border-t text-[10px] text-slate-400 text-center">
        Grafikler analiz modelinden alınan uç kuvvetler ve uniform yük varsayımı ile oluşturulmuştur.
      </div>
    </div>
  );
};

export default BeamDetailPanel;