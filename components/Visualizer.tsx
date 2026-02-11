import React, { useState, useRef } from 'react';
import { Dimensions, Sections } from '../types';

interface Props {
  dimensions: Dimensions;
  sections: Sections;
}

const Visualizer: React.FC<Props> = ({ dimensions, sections }) => {
  // State for interactivity
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  // Event Handlers
  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    const scaleFactor = 1.1;
    setZoom(prev => e.deltaY < 0 ? prev * scaleFactor : prev / scaleFactor);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;
    setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => setIsDragging(false);

  // --- ORTAK AYARLAR ---
  const canvasSize = 220; 
  const padding = 20;

  // 1. PLAN GÖRÜNÜŞ AYARLARI
  const maxDimPlan = Math.max(dimensions.lx, dimensions.ly);
  const scalePlan = (canvasSize - padding * 2) / maxDimPlan;
  
  const widthPx = dimensions.lx * scalePlan;
  const heightPx = dimensions.ly * scalePlan;
  const startX_Plan = (canvasSize - widthPx) / 2;
  const startY_Plan = (canvasSize - heightPx) / 2;

  // Ölçekli Kolon Boyutları
  const colW_Plan = Math.max(sections.colWidth * scalePlan / 100, 3);
  const colH_Plan = Math.max(sections.colDepth * scalePlan / 100, 3);


  // 2. KESİT GÖRÜNÜŞ AYARLARI
  const storyCount = dimensions.storyCount || 1;
  const totalHeight = dimensions.h * storyCount;
  const elevationHeight = 220; 
  
  const maxDimElev = Math.max(dimensions.lx, totalHeight);
  const scaleElev = (elevationHeight - 30) / maxDimElev;

  const elevWidthPx = dimensions.lx * scaleElev;
  const storyHPx = dimensions.h * scaleElev;
  const elevTotalHPx = totalHeight * scaleElev;

  const elevStartX = (canvasSize - elevWidthPx) / 2;
  
  const beamDepthPx = Math.max(sections.beamDepth * scaleElev / 100, 2);
  const colWidthPx_Elev = Math.max(sections.colWidth * scaleElev / 100, 2);


  // 3. 3D (İZOMETRİK) GÖRÜNÜŞ HESAPLARI
  const isoCos = Math.cos(Math.PI / 6);
  const isoSin = Math.sin(Math.PI / 6);

  // Ölçek Faktörü
  const isoScale = (canvasSize - 40) / (dimensions.lx + dimensions.ly + totalHeight * 0.8);

  // --- MERKEZLEME (DİKEY ORTALAMA) ---
  const totalDrawingHeight = totalHeight * isoScale;
  const centerY = (canvasSize / 2) + (totalDrawingHeight / 2) * 0.9;
  
  const toIso = (x: number, y: number, z: number) => {
    const centerX = canvasSize / 2;
    
    const xIso = (x - y) * isoCos;
    const yIso = (x + y) * isoSin - z;

    return {
      x: centerX + xIso * isoScale,
      y: centerY + yIso * isoScale
    };
  };

  // Dinamik Kalınlıklar
  const colStroke3D = Math.max((sections.colWidth / 100) * isoScale, 2);
  const beamStroke3D = Math.max((sections.beamDepth / 100) * isoScale, 2); 

  const lx = dimensions.lx;
  const ly = dimensions.ly;
  const h = dimensions.h;

  const interactiveGroupProps = {
    transform: `translate(${offset.x}, ${offset.y}) scale(${zoom})`,
    style: { transition: isDragging ? 'none' : 'transform 0.1s ease-out' }
  };

  return (
    <div className="w-full h-full grid grid-cols-1 md:grid-cols-3 gap-2 items-stretch overflow-hidden">
      
      {/* 1. KART: KAT PLANI */}
      <div 
        className="flex flex-col items-center justify-center bg-white rounded-xl shadow-sm border border-slate-200 p-2 min-h-[240px] cursor-move relative overflow-hidden"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <h3 className="absolute top-2 left-2 text-slate-500 text-[10px] font-bold z-10 tracking-wider uppercase flex items-center gap-2 pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          Kat Planı
        </h3>
        <svg width="100%" height="100%" viewBox={`0 0 ${canvasSize} ${canvasSize}`} className="bg-slate-50/50">
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          <g {...interactiveGroupProps} transform-origin="center">
             <rect 
                x={startX_Plan} 
                y={startY_Plan} 
                width={widthPx} 
                height={heightPx} 
                fill="#eff6ff" 
                stroke="#3b82f6" 
                strokeWidth="1.5" 
                strokeOpacity="0.5"
             />
             <rect x={startX_Plan - colW_Plan/2} y={startY_Plan - colH_Plan/2} width={colW_Plan} height={colH_Plan} fill="#1e293b" />
             <rect x={startX_Plan + widthPx - colW_Plan/2} y={startY_Plan - colH_Plan/2} width={colW_Plan} height={colH_Plan} fill="#1e293b" />
             <rect x={startX_Plan - colW_Plan/2} y={startY_Plan + heightPx - colH_Plan/2} width={colW_Plan} height={colH_Plan} fill="#1e293b" />
             <rect x={startX_Plan + widthPx - colW_Plan/2} y={startY_Plan + heightPx - colH_Plan/2} width={colW_Plan} height={colH_Plan} fill="#1e293b" />
             
             {/* Ölçüler */}
             <text x={startX_Plan + widthPx / 2} y={startY_Plan + heightPx + 12} textAnchor="middle" className="text-[9px] fill-slate-500 font-mono" fontSize="8">Lx={dimensions.lx}m</text>
             <text x={startX_Plan - 8} y={startY_Plan + heightPx / 2} textAnchor="middle" transform={`rotate(-90, ${startX_Plan - 8}, ${startY_Plan + heightPx / 2})`} className="text-[9px] fill-slate-500 font-mono" fontSize="8">Ly={dimensions.ly}m</text>
          </g>
        </svg>
      </div>

      {/* 2. KART: KESİT (A-A) */}
      <div 
         className="flex flex-col items-center justify-center bg-white rounded-xl shadow-sm border border-slate-200 p-2 min-h-[240px] cursor-move relative overflow-hidden"
         onWheel={handleWheel}
         onMouseDown={handleMouseDown}
         onMouseMove={handleMouseMove}
         onMouseUp={handleMouseUp}
         onMouseLeave={handleMouseUp}
      >
        <h3 className="absolute top-2 left-2 text-slate-500 text-[10px] font-bold z-10 tracking-wider uppercase flex items-center gap-2 pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-purple-500"></span>
          A-A Kesiti
        </h3>
        <svg width="100%" height="100%" viewBox={`0 0 ${canvasSize} ${elevationHeight}`} className="bg-slate-50/50">
          <rect width="100%" height="100%" fill="url(#grid)" />
          
          <g {...interactiveGroupProps} transform-origin="center">
            <g transform={`translate(0, ${elevationHeight - 20}) scale(1, -1)`}>
                <line x1="-1000" y1="0" x2="1000" y2="0" stroke="#94a3b8" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>
                
                {Array.from({ length: storyCount }).map((_, i) => {
                const yPos = i * storyHPx;
                return (
                    <g key={i}>
                    <rect x={elevStartX - colWidthPx_Elev/2} y={yPos} width={colWidthPx_Elev} height={storyHPx} fill="#cbd5e1" stroke="#475569" strokeWidth="0.5"/>
                    <rect x={elevStartX + elevWidthPx - colWidthPx_Elev/2} y={yPos} width={colWidthPx_Elev} height={storyHPx} fill="#cbd5e1" stroke="#475569" strokeWidth="0.5"/>
                    <rect x={elevStartX} y={yPos + storyHPx - beamDepthPx} width={elevWidthPx} height={beamDepthPx} fill="#e9d5ff" stroke="#9333ea" strokeWidth="0.5"/>
                    </g>
                );
                })}
            </g>

            <line x1={elevStartX + elevWidthPx + 10} y1={elevationHeight - 20} x2={elevStartX + elevWidthPx + 10} y2={elevationHeight - 20 - elevTotalHPx} stroke="#94a3b8" strokeWidth="1" />
            <text 
                x={elevStartX + elevWidthPx + 18} 
                y={elevationHeight - 20 - elevTotalHPx / 2} 
                className="text-[9px] fill-slate-500 font-mono" 
                transform={`rotate(90, ${elevStartX + elevWidthPx + 18}, ${elevationHeight - 20 - elevTotalHPx / 2})`}
                fontSize="8"
            >
                H={totalHeight}m
            </text>
          </g>
        </svg>
      </div>

      {/* 3. KART: 3D PROFİL */}
      <div 
         className="flex flex-col items-center justify-center bg-white rounded-xl shadow-sm border border-slate-200 p-2 min-h-[240px] cursor-move relative overflow-hidden"
         onWheel={handleWheel}
         onMouseDown={handleMouseDown}
         onMouseMove={handleMouseMove}
         onMouseUp={handleMouseUp}
         onMouseLeave={handleMouseUp}
      >
        <h3 className="absolute top-2 left-2 text-slate-500 text-[10px] font-bold z-10 tracking-wider uppercase flex items-center gap-2 pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-orange-500"></span>
          3D Profil
        </h3>
        <svg width="100%" height="100%" viewBox={`0 0 ${canvasSize} ${canvasSize}`} className="bg-slate-50/50 overflow-visible">
           <defs>
             <radialGradient id="shadowGradient" cx="50%" cy="50%" r="50%">
               <stop offset="0%" stopColor="#000" stopOpacity="0.1" />
               <stop offset="100%" stopColor="#000" stopOpacity="0" />
             </radialGradient>
           </defs>

          <g {...interactiveGroupProps} transform-origin="center">
            {/* Gölge */}
            {(() => {
                const p1 = toIso(0, 0, 0);
                const p2 = toIso(lx, 0, 0);
                const p3 = toIso(lx, ly, 0);
                const p4 = toIso(0, ly, 0);
                return (
                <path 
                    d={`M${p1.x} ${p1.y} L${p2.x} ${p2.y} L${p3.x} ${p3.y} L${p4.x} ${p4.y} Z`} 
                    fill="url(#shadowGradient)" 
                    transform="translate(0, 10)"
                />
                );
            })()}

            {Array.from({ length: storyCount }).map((_, i) => {
                const currentZ = i * h;
                const nextZ = (i + 1) * h;
                
                const c0_b = toIso(0, 0, currentZ);
                const c1_b = toIso(lx, 0, currentZ);
                const c2_b = toIso(lx, ly, currentZ);
                const c3_b = toIso(0, ly, currentZ);

                const c0_t = toIso(0, 0, nextZ);
                const c1_t = toIso(lx, 0, nextZ);
                const c2_t = toIso(lx, ly, nextZ);
                const c3_t = toIso(0, ly, nextZ);

                const drawBeam = (p1: {x:number, y:number}, p2: {x:number, y:number}) => (
                <g>
                    <line 
                    x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} 
                    stroke="#fb923c" 
                    strokeWidth={beamStroke3D} 
                    strokeOpacity="0.4"
                    strokeLinecap="butt"
                    />
                    <line 
                    x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} 
                    stroke="#ea580c" 
                    strokeWidth={0.5} 
                    strokeOpacity="0.8"
                    />
                </g>
                );

                return (
                <g key={`story-${i}`}>
                    {/* Arka Kolon */}
                    <line x1={c2_b.x} y1={c2_b.y} x2={c2_t.x} y2={c2_t.y} stroke="#cbd5e1" strokeWidth={colStroke3D} strokeLinecap="round" />

                    {/* Döşeme */}
                    <path 
                    d={`M${c0_t.x} ${c0_t.y} L${c1_t.x} ${c1_t.y} L${c2_t.x} ${c2_t.y} L${c3_t.x} ${c3_t.y} Z`} 
                    fill="#fed7aa" 
                    fillOpacity="0.1" 
                    stroke="none"
                    />

                    {/* Kirişler */}
                    {drawBeam(c0_t, c1_t)}
                    {drawBeam(c1_t, c2_t)}
                    {drawBeam(c2_t, c3_t)}
                    {drawBeam(c3_t, c0_t)}

                    {/* Ön Kolonlar */}
                    <line x1={c0_b.x} y1={c0_b.y} x2={c0_t.x} y2={c0_t.y} stroke="#334155" strokeWidth={colStroke3D} strokeLinecap="round" />
                    <line x1={c1_b.x} y1={c1_b.y} x2={c1_t.x} y2={c1_t.y} stroke="#334155" strokeWidth={colStroke3D} strokeLinecap="round" />
                    <line x1={c3_b.x} y1={c3_b.y} x2={c3_t.x} y2={c3_t.y} stroke="#334155" strokeWidth={colStroke3D} strokeLinecap="round" />
                </g>
                );
            })}
           </g>
        </svg>
      </div>

    </div>
  );
};

export default Visualizer;