import React from 'react';
import { Dimensions, Sections } from '../types';

interface Props {
  dimensions: Dimensions;
  sections: Sections;
}

const Visualizer: React.FC<Props> = ({ dimensions, sections }) => {
  // Plan görünüşü için ölçekleme
  const canvasSize = 400;
  const padding = 50;
  const maxDim = Math.max(dimensions.lx, dimensions.ly);
  const scale = (canvasSize - padding * 2) / maxDim;

  const widthPx = dimensions.lx * scale;
  const heightPx = dimensions.ly * scale;
  
  const startX = (canvasSize - widthPx) / 2;
  const startY = (canvasSize - heightPx) / 2;

  // Kolon görsel boyutu (ölçekli ama çok küçük olmasın diye min sınır)
  const colW = Math.max(sections.colWidth * scale / 50, 12); 
  const colH = Math.max(sections.colDepth * scale / 50, 12);

  // --- YAN GÖRÜNÜŞ (KESİT) HESAPLARI ---
  const storyCount = dimensions.storyCount || 1;
  const totalHeight = dimensions.h * storyCount;
  
  // Kesit için yeni ölçek (Yüksekliğe veya genişliğe göre sığdır)
  const elevationHeight = 300; // Kesit çizim alanı yüksekliği
  const maxDimElev = Math.max(dimensions.lx, totalHeight);
  const scaleElev = (elevationHeight - 60) / maxDimElev; // 60px padding

  const elevWidthPx = dimensions.lx * scaleElev;
  const elevTotalHPx = totalHeight * scaleElev;
  const storyHPx = dimensions.h * scaleElev;

  const elevStartX = (canvasSize - elevWidthPx) / 2;
  const elevStartY = padding; // Üstten boşluk (SVG içinde translate ile aşağı iteceğiz)

  // Kiriş ve Kolon kalınlıkları (Kesit için)
  const beamDepthPx = Math.max(sections.beamDepth * scaleElev / 40, 6);
  const colWidthPx = Math.max(sections.colWidth * scaleElev / 40, 8);

  return (
    // DEĞİŞİKLİK BURADA: flex-col yerine grid yapısı kullanılarak yan yana getirildi.
    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
      
      {/* 1. PLAN GÖRÜNÜŞÜ */}
      <div className="flex flex-col items-center bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <h3 className="text-slate-500 text-xs font-bold mb-2 tracking-wider uppercase flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          Kat Planı (Üstten)
        </h3>
        <svg width={canvasSize} height={canvasSize} className="border border-slate-100 bg-slate-50/50 rounded w-full h-auto max-w-[400px]">
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Döşeme / Kirişler */}
          <rect 
            x={startX} 
            y={startY} 
            width={widthPx} 
            height={heightPx} 
            fill="#eff6ff" 
            stroke="#3b82f6" 
            strokeWidth="2" 
            strokeOpacity="0.5"
          />

          {/* Kiriş İsimleri (Opsiyonel) */}
          <text x={startX + widthPx/2} y={startY - 5} textAnchor="middle" className="text-[10px] fill-blue-400 font-mono">K101 (Benzer)</text>
          
          {/* Kolonlar */}
          <rect x={startX - colW/2} y={startY - colH/2} width={colW} height={colH} fill="#1e293b" rx="2" />
          <rect x={startX + widthPx - colW/2} y={startY - colH/2} width={colW} height={colH} fill="#1e293b" rx="2" />
          <rect x={startX - colW/2} y={startY + heightPx - colH/2} width={colW} height={colH} fill="#1e293b" rx="2" />
          <rect x={startX + widthPx - colW/2} y={startY + heightPx - colH/2} width={colW} height={colH} fill="#1e293b" rx="2" />

          {/* Ölçülendirme */}
          <text x={startX + widthPx / 2} y={startY + heightPx + 20} textAnchor="middle" className="text-xs fill-slate-500 font-mono">
            Lx = {dimensions.lx}m
          </text>
          <text x={startX - 20} y={startY + heightPx / 2} textAnchor="middle" transform={`rotate(-90, ${startX - 20}, ${startY + heightPx / 2})`} className="text-xs fill-slate-500 font-mono">
            Ly = {dimensions.ly}m
          </text>
        </svg>
      </div>

      {/* 2. KESİT GÖRÜNÜŞÜ */}
      <div className="flex flex-col items-center bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <h3 className="text-slate-500 text-xs font-bold mb-2 tracking-wider uppercase flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-purple-500"></span>
          A-A Kesiti (Yandan - {storyCount} Kat)
        </h3>
        <svg width={canvasSize} height={elevationHeight} className="border border-slate-100 bg-slate-50/50 rounded w-full h-auto max-w-[400px]">
          <rect width="100%" height="100%" fill="url(#grid)" />
          
          <g transform={`translate(0, ${elevationHeight - padding}) scale(1, -1)`}>
            {/* Zemin Çizgisi */}
            <line x1="20" y1="0" x2={canvasSize-20} y2="0" stroke="#94a3b8" strokeWidth="2" />
            
            {/* Bina Döngüsü */}
            {Array.from({ length: storyCount }).map((_, i) => {
              const yPos = i * storyHPx;
              return (
                <g key={i}>
                  {/* Sol Kolon */}
                  <rect 
                    x={elevStartX - colWidthPx/2} 
                    y={yPos} 
                    width={colWidthPx} 
                    height={storyHPx} 
                    fill="#cbd5e1" 
                    stroke="#475569"
                    strokeWidth="1"
                  />
                  {/* Sağ Kolon */}
                  <rect 
                    x={elevStartX + elevWidthPx - colWidthPx/2} 
                    y={yPos} 
                    width={colWidthPx} 
                    height={storyHPx} 
                    fill="#cbd5e1" 
                    stroke="#475569"
                    strokeWidth="1"
                  />
                  {/* Kiriş (Kat Döşemesi) */}
                  <rect 
                    x={elevStartX} 
                    y={yPos + storyHPx - beamDepthPx} 
                    width={elevWidthPx} 
                    height={beamDepthPx} 
                    fill="#e9d5ff" 
                    stroke="#9333ea"
                    strokeWidth="1"
                  />
                  {/* Kat Etiketi (Ters çevirdiğimiz için scale(1, -1) ile düzeltiyoruz) */}
                  <text 
                    x={elevStartX - 25} 
                    y={-(yPos + storyHPx - beamDepthPx/2 - 4)} 
                    transform="scale(1, -1)" 
                    className="text-[9px] fill-slate-400 font-mono"
                  >
                    {(i+1)}.KAT
                  </text>
                </g>
              );
            })}
          </g>

          {/* Toplam Yükseklik Oku */}
          <line x1={elevStartX + elevWidthPx + 30} y1={elevationHeight - padding} x2={elevStartX + elevWidthPx + 30} y2={elevationHeight - padding - elevTotalHPx} stroke="#94a3b8" strokeWidth="1" />
          {/* Ok Uçları */}
          <path d={`M ${elevStartX + elevWidthPx + 27} ${elevationHeight - padding - elevTotalHPx} L ${elevStartX + elevWidthPx + 30} ${elevationHeight - padding - elevTotalHPx - 5} L ${elevStartX + elevWidthPx + 33} ${elevationHeight - padding - elevTotalHPx}`} fill="none" stroke="#94a3b8" />
          
          {/* Yükseklik Metni */}
          <text 
             x={elevStartX + elevWidthPx + 35} 
             y={elevationHeight - padding - elevTotalHPx / 2} 
             className="text-xs fill-slate-500 font-mono"
             transform={`rotate(90, ${elevStartX + elevWidthPx + 35}, ${elevationHeight - padding - elevTotalHPx / 2})`}
          >
            H = {totalHeight}m
          </text>

        </svg>
      </div>

    </div>
  );
};

export default Visualizer;