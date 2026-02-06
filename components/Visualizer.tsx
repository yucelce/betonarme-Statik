import React from 'react';
import { Dimensions, Sections } from '../types';

interface Props {
  dimensions: Dimensions;
  sections: Sections;
}

const Visualizer: React.FC<Props> = ({ dimensions, sections }) => {
  // Scaling factors for SVG
  const canvasSize = 400;
  const padding = 60;
  const maxDim = Math.max(dimensions.lx, dimensions.ly);
  const scale = (canvasSize - padding * 2) / maxDim;

  const widthPx = dimensions.lx * scale;
  const heightPx = dimensions.ly * scale;
  
  const startX = (canvasSize - widthPx) / 2;
  const startY = (canvasSize - heightPx) / 2;

  // Column visual size (exaggerated for visibility)
  const colW = Math.max(sections.colWidth * scale / 50, 15); 
  const colH = Math.max(sections.colDepth * scale / 50, 15);

  return (
    <div className="w-full flex flex-col items-center bg-white rounded-xl shadow-inner border border-slate-200 p-4">
      <h3 className="text-slate-500 text-sm font-bold mb-2 tracking-wider">YAPI PLANI (Ölçekli)</h3>
      <svg width={canvasSize} height={canvasSize} className="border border-slate-100 bg-slate-50 rounded">
        {/* Grid Lines */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* Beams */}
        <rect 
          x={startX} 
          y={startY} 
          width={widthPx} 
          height={heightPx} 
          fill="#eff6ff" 
          stroke="#3b82f6" 
          strokeWidth="4" 
        />

        {/* Columns */}
        {/* Top Left */}
        <rect x={startX - colW/2} y={startY - colH/2} width={colW} height={colH} fill="#1e293b" />
        {/* Top Right */}
        <rect x={startX + widthPx - colW/2} y={startY - colH/2} width={colW} height={colH} fill="#1e293b" />
        {/* Bottom Left */}
        <rect x={startX - colW/2} y={startY + heightPx - colH/2} width={colW} height={colH} fill="#1e293b" />
        {/* Bottom Right */}
        <rect x={startX + widthPx - colW/2} y={startY + heightPx - colH/2} width={colW} height={colH} fill="#1e293b" />

        {/* Labels */}
        <text x={startX + widthPx / 2} y={startY - 15} textAnchor="middle" className="text-xs fill-slate-500 font-mono">
          Lx = {dimensions.lx}m
        </text>
        <text x={startX - 15} y={startY + heightPx / 2} textAnchor="middle" transform={`rotate(-90, ${startX - 15}, ${startY + heightPx / 2})`} className="text-xs fill-slate-500 font-mono">
          Ly = {dimensions.ly}m
        </text>

        {/* Center Annotation */}
        <text x={canvasSize/2} y={canvasSize/2} textAnchor="middle" className="text-xs fill-blue-400 font-bold opacity-50">
          DÖŞEME h={dimensions.slabThickness}cm
        </text>
      </svg>
      <div className="mt-4 flex gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-slate-800"></div> Kolon ({sections.colWidth}x{sections.colDepth})
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-blue-100 border border-blue-500"></div> Kiriş ({sections.beamWidth}x{sections.beamDepth})
        </div>
      </div>
    </div>
  );
};

export default Visualizer;
