import React from 'react';
import { Dimensions, Sections } from '../types';

interface Props {
  dimensions: Dimensions;
  sections: Sections;
}

const Visualizer: React.FC<Props> = ({ dimensions, sections }) => {
  // --- BOYUT AYARLARI ---
  // "Yapı & Temel" kartının yüksekliğine denk gelmesi için boyutu küçültüyoruz.
  const canvasSize = 280;
  const padding = 30; // Padding'i de biraz azalttık
  const maxDim = Math.max(dimensions.lx, dimensions.ly);
  const scale = (canvasSize - padding * 2) / maxDim;

  const widthPx = dimensions.lx * scale;
  const heightPx = dimensions.ly * scale;

  const startX = (canvasSize - widthPx) / 2;
  const startY = (canvasSize - heightPx) / 2;

  // Kolon görsel boyutu
  const colW = Math.max(sections.colWidth * scale / 50, 8);
  const colH = Math.max(sections.colDepth * scale / 50, 8);

  // --- YAN GÖRÜNÜŞ (KESİT) HESAPLARI ---
  const storyCount = dimensions.storyCount || 1;
  const totalHeight = dimensions.h * storyCount;

  const elevationHeight = 280; // Yüksekliği de eşitledik
  const maxDimElev = Math.max(dimensions.lx, totalHeight);
  const scaleElev = (elevationHeight - 40) / maxDimElev;

  const elevWidthPx = dimensions.lx * scaleElev;
  const elevTotalHPx = totalHeight * scaleElev;
  const storyHPx = dimensions.h * scaleElev;

  const elevStartX = (canvasSize - elevWidthPx) / 2;
  // const elevStartY = padding; 

  const beamDepthPx = Math.max(sections.beamDepth * scaleElev / 100, 2);
  const colWidthPx = Math.max(sections.colWidth * scaleElev / 100, 2);

  return (
    // İki görseli yan yana ve ortalayarak gösteren kapsayıcı
    <div className="w-full h-full grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">

      {/* 1. PLAN GÖRÜNÜŞÜ */}
      <div className="flex flex-col items-center justify-center bg-white rounded-xl shadow-sm border border-slate-200 p-2 h-full">
        <h3 className="text-slate-500 text-[10px] font-bold mb-2 tracking-wider uppercase flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          Kat Planı
        </h3>
        <svg width={canvasSize} height={canvasSize} className="border border-slate-100 bg-slate-50/50 rounded">
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Döşeme */}
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

          {/* Kiriş Etiketi */}
          <text x={startX + widthPx / 2} y={startY - 5} textAnchor="middle" className="text-[9px] fill-blue-400 font-mono">K101</text>

          {/* Kolonlar */}
          <rect x={startX - colW / 2} y={startY - colH / 2} width={colW} height={colH} fill="#1e293b" rx="1" />
          <rect x={startX + widthPx - colW / 2} y={startY - colH / 2} width={colW} height={colH} fill="#1e293b" rx="1" />
          <rect x={startX - colW / 2} y={startY + heightPx - colH / 2} width={colW} height={colH} fill="#1e293b" rx="1" />
          <rect x={startX + widthPx - colW / 2} y={startY + heightPx - colH / 2} width={colW} height={colH} fill="#1e293b" rx="1" />

          {/* Ölçüler */}
          <text x={startX + widthPx / 2} y={startY + heightPx + 15} textAnchor="middle" className="text-[10px] fill-slate-500 font-mono">Lx={dimensions.lx}</text>
          <text x={startX - 15} y={startY + heightPx / 2} textAnchor="middle" transform={`rotate(-90, ${startX - 15}, ${startY + heightPx / 2})`} className="text-[10px] fill-slate-500 font-mono">Ly={dimensions.ly}</text>
        </svg>
      </div>

      {/* 2. KESİT GÖRÜNÜŞÜ */}
      <div className="flex flex-col items-center justify-center bg-white rounded-xl shadow-sm border border-slate-200 p-2 h-full">
        <h3 className="text-slate-500 text-[10px] font-bold mb-2 tracking-wider uppercase flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-purple-500"></span>
          A-A Kesiti
        </h3>
        <svg width={canvasSize} height={elevationHeight} className="border border-slate-100 bg-slate-50/50 rounded">
          <rect width="100%" height="100%" fill="url(#grid)" />

          <g transform={`translate(0, ${elevationHeight - padding}) scale(1, -1)`}>
            <line x1="20" y1="0" x2={canvasSize - 20} y2="0" stroke="#94a3b8" strokeWidth="2" />

            {Array.from({ length: storyCount }).map((_, i) => {
              const yPos = i * storyHPx;
              return (
                <g key={i}>
                  <rect x={elevStartX - colWidthPx / 2} y={yPos} width={colWidthPx} height={storyHPx} fill="#cbd5e1" stroke="#475569" strokeWidth="1" />
                  <rect x={elevStartX + elevWidthPx - colWidthPx / 2} y={yPos} width={colWidthPx} height={storyHPx} fill="#cbd5e1" stroke="#475569" strokeWidth="1" />
                  <rect x={elevStartX} y={yPos + storyHPx - beamDepthPx} width={elevWidthPx} height={beamDepthPx} fill="#e9d5ff" stroke="#9333ea" strokeWidth="1" />
                </g>
              );
            })}
          </g>

          <line x1={elevStartX + elevWidthPx + 20} y1={elevationHeight - padding} x2={elevStartX + elevWidthPx + 20} y2={elevationHeight - padding - elevTotalHPx} stroke="#94a3b8" strokeWidth="1" />
          <text x={elevStartX + elevWidthPx + 25} y={elevationHeight - padding - elevTotalHPx / 2} className="text-[10px] fill-slate-500 font-mono" transform={`rotate(90, ${elevStartX + elevWidthPx + 25}, ${elevationHeight - padding - elevTotalHPx / 2})`}>H={totalHeight}</text>
        </svg>
      </div>

    </div>
  );
};

export default Visualizer;