import React, { useState, useRef, useMemo } from 'react';
import { AppState } from '../types';
import { generateModel } from '../utils/modelGenerator';

interface Props {
  state: AppState;
}

const Visualizer: React.FC<Props> = ({ state }) => {
  const { dimensions, sections } = state;

  // Modeli oluştur (Grid değiştiğinde yeniden hesaplar)
  const model = useMemo(() => generateModel(state), [state]);
  
  // Node'lara hızlı erişim için Map oluştur
  const nodeMap = useMemo(() => {
    return new Map(model.nodes.map(node => [node.id, node]));
  }, [model]);

  // State for interactivity
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  // Event Handlers (Zoom & Pan)
  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    // Zoom limitleri
    if (zoom < 0.5 && e.deltaY > 0) return;
    if (zoom > 5 && e.deltaY < 0) return;
    
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

  // --- ÇİZİM AYARLARI ---
  const canvasSize = 220;
  const padding = 30; 
  
  // Grid boyutları (0 kontrolü ile NaN hatasını önle)
  const maxDim = Math.max(dimensions.lx, dimensions.ly) || 1;
  const scale = (canvasSize - padding * 2) / maxDim;

  // Çizimi merkeze al
  const drawingWidth = dimensions.lx * scale;
  const drawingHeight = dimensions.ly * scale;
  const startX = (canvasSize - drawingWidth) / 2;
  const startY = (canvasSize - drawingHeight) / 2;

  // Koordinat Dönüştürücü (Metre -> Piksel)
  const toPx = (val: number) => val * scale;

  // Boyutlar (Piksel cinsinden, minimum değerlerle)
  const colW = Math.max(sections.colWidth * scale / 100, 4); 
  const colD = Math.max(sections.colDepth * scale / 100, 4);
  const beamW = Math.max(sections.beamWidth * scale / 100, 2);

  // --- KESİT GÖRÜNÜMÜ AYARLARI (Basitleştirilmiş Yan Görünüş) ---
  // İlk aks boyunca (X Yönü) bir kesit alıyoruz
  const sectionHeight = dimensions.h * dimensions.storyCount;
  const maxSectionDim = Math.max(dimensions.lx, sectionHeight) || 1;
  const sectionScale = (canvasSize - 40) / maxSectionDim;
  const sectionGroundY = canvasSize - 30; // Zemin çizgisi Y koordinatı
  const sectionStartX = (canvasSize - dimensions.lx * sectionScale) / 2;

  // --- 3D GÖRÜNÜŞ AYARLARI ---
  const storyCount = dimensions.storyCount || 1;
  const hStory = dimensions.h;
  const totalH = hStory * storyCount;
  
  // 3D için daha güvenli bir ölçekleme faktörü
  const isoScale = (canvasSize - 80) / (dimensions.lx + dimensions.ly + totalH * 0.5 || 1);
  
  // 3D Merkezleme
  const isoCenterX = canvasSize / 2;
  // Binayı biraz aşağı it (Y ekseni aşağı doğru artar)
  const isoCenterY = canvasSize / 2 + (totalH * isoScale) / 4; 

  const toIso = (x: number, y: number, z: number) => {
    const isoCos = 0.866; // cos(30)
    const isoSin = 0.5;   // sin(30)
    
    // İzometrik dönüşüm
    const xIso = (x - y) * isoCos;
    const yIso = (x + y) * isoSin - z; // z yukarı doğru, svg y aşağı doğru

    return {
      x: isoCenterX + xIso * isoScale,
      y: isoCenterY + yIso * isoScale
    };
  };

  const interactiveGroupProps = {
    transform: `translate(${offset.x}, ${offset.y}) scale(${zoom})`,
    style: { transition: isDragging ? 'none' : 'transform 0.1s ease-out', transformOrigin: 'center' }
  };

  // Grid Çizgileri
  const xGridCoords: number[] = [...new Set(model.nodes.map(n => n.x))].sort((a,b)=>a-b);
  const yGridCoords: number[] = [...new Set(model.nodes.map(n => n.y))].sort((a,b)=>a-b);

  return (
    <div className="w-full h-full grid grid-cols-1 md:grid-cols-3 gap-2 items-stretch overflow-hidden select-none">
      
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

          <g {...interactiveGroupProps}>
             {/* AKS ÇİZGİLERİ */}
             {xGridCoords.map((gridX, i) => (
                <g key={`axis-x-${i}`}>
                   <line 
                     x1={startX + toPx(gridX)} y1={startY - 15} 
                     x2={startX + toPx(gridX)} y2={startY + drawingHeight + 15} 
                     stroke="#94a3b8" strokeWidth="0.5" strokeDasharray="4 2"
                   />
                   <circle cx={startX + toPx(gridX)} cy={startY - 20} r="6" fill="white" stroke="#64748b" strokeWidth="1"/>
                   <text x={startX + toPx(gridX)} y={startY - 18} textAnchor="middle" fontSize="8" fill="#475569" className="font-sans font-bold">
                     {i + 1}
                   </text>
                </g>
             ))}
             {yGridCoords.map((gridY, i) => (
                <g key={`axis-y-${i}`}>
                   <line 
                     x1={startX - 15} y1={startY + toPx(gridY)} 
                     x2={startX + drawingWidth + 15} y2={startY + toPx(gridY)} 
                     stroke="#94a3b8" strokeWidth="0.5" strokeDasharray="4 2"
                   />
                   <circle cx={startX - 20} cy={startY + toPx(gridY)} r="6" fill="white" stroke="#64748b" strokeWidth="1"/>
                   <text x={startX - 20} y={startY + toPx(gridY) + 2} textAnchor="middle" fontSize="8" fill="#475569" className="font-sans font-bold">
                     {String.fromCharCode(65 + i)}
                   </text>
                </g>
             ))}

             {/* KİRİŞLER */}
             {model.beams.map(beam => {
               const n1 = nodeMap.get(beam.startNodeId);
               const n2 = nodeMap.get(beam.endNodeId);
               if(!n1 || !n2) return null;
               
               return (
                 <line 
                   key={beam.id}
                   x1={startX + toPx(n1.x)} y1={startY + toPx(n1.y)} 
                   x2={startX + toPx(n2.x)} y2={startY + toPx(n2.y)}
                   stroke="#e9d5ff"
                   strokeWidth={beamW}
                   strokeLinecap="square"
                 />
               );
             })}
             
             {/* KOLONLAR */}
             {model.columns.map(col => {
               const n = nodeMap.get(col.nodeId);
               if(!n) return null;
               const cx = startX + toPx(n.x);
               const cy = startY + toPx(n.y);
               
               return (
                 <rect 
                    key={col.id}
                    x={cx - colW/2} y={cy - colD/2}
                    width={colW} height={colD}
                    fill="#1e293b"
                    stroke="none"
                 />
               );
             })}

            {/* KİRİŞ ORTA EKSENLERİ */}
             {model.beams.map(beam => {
               const n1 = nodeMap.get(beam.startNodeId);
               const n2 = nodeMap.get(beam.endNodeId);
               if(!n1 || !n2) return null;
               return (
                 <line 
                   key={`ln-${beam.id}`}
                   x1={startX + toPx(n1.x)} y1={startY + toPx(n1.y)} 
                   x2={startX + toPx(n2.x)} y2={startY + toPx(n2.y)}
                   stroke="#9333ea" strokeWidth="0.5"
                 />
               );
             })}
          </g>
        </svg>
      </div>

      {/* 2. KART: KESİT (A-A Basit Görünüm) */}
      <div className="flex flex-col items-center justify-center bg-white rounded-xl shadow-sm border border-slate-200 p-2 min-h-[240px] relative overflow-hidden">
         <h3 className="absolute top-2 left-2 text-slate-500 text-[10px] font-bold z-10 tracking-wider uppercase flex items-center gap-2 pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-purple-500"></span>
          Kesit (Aks-1)
        </h3>
        <svg width="100%" height="100%" viewBox={`0 0 ${canvasSize} ${canvasSize}`} className="bg-slate-50/50">
          <g {...interactiveGroupProps}>
             {/* Zemin Çizgisi */}
             <line x1="0" y1={sectionGroundY} x2={canvasSize} y2={sectionGroundY} stroke="#94a3b8" strokeWidth="1" strokeDasharray="5,5" />
             
             {/* Katlar */}
             {Array.from({ length: storyCount }).map((_, i) => {
                const floorY = sectionGroundY - ((i + 1) * hStory * sectionScale);
                return (
                  <g key={`sec-floor-${i}`}>
                    {/* Kat Çizgisi */}
                    <line 
                      x1={sectionStartX - 20} y1={floorY} 
                      x2={sectionStartX + dimensions.lx * sectionScale + 20} y2={floorY} 
                      stroke="#cbd5e1" strokeWidth="0.5" 
                    />
                    <text x={sectionStartX - 25} y={floorY + 3} textAnchor="end" fontSize="8" fill="#64748b">{i+1}. Kat</text>
                  </g>
                );
             })}

             {/* Kolonlar (Sadece X aksındaki izler) */}
             {xGridCoords.map((xVal, i) => (
                <rect 
                  key={`sec-col-${i}`}
                  x={sectionStartX + xVal * sectionScale - (colW/2)}
                  y={sectionGroundY - (totalH * sectionScale)}
                  width={colW}
                  height={totalH * sectionScale}
                  fill="#1e293b"
                  opacity="0.8"
                />
             ))}

             {/* Kirişler (Basit) */}
             {Array.from({ length: storyCount }).map((_, floorIndex) => {
                 const floorY = sectionGroundY - ((floorIndex + 1) * hStory * sectionScale);
                 return (
                    <rect 
                      key={`sec-beam-${floorIndex}`}
                      x={sectionStartX}
                      y={floorY} // Kiriş üstü kat seviyesinde
                      width={dimensions.lx * sectionScale}
                      height={beamW} // Kiriş derinliği yerine görsel genişlik kullandık
                      fill="#e9d5ff"
                    />
                 );
             })}
          </g>
        </svg>
      </div>

      {/* 3. KART: 3D MODEL */}
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
          3D Model
        </h3>
        <svg width="100%" height="100%" viewBox={`0 0 ${canvasSize} ${canvasSize}`} className="bg-slate-50/50 overflow-visible">
          <g {...interactiveGroupProps}>
             {/* Taban Gölgesi */}
             {(() => {
                 const p1 = toIso(0, 0, 0);
                 const p2 = toIso(dimensions.lx, 0, 0);
                 const p3 = toIso(dimensions.lx, dimensions.ly, 0);
                 const p4 = toIso(0, dimensions.ly, 0);
                 return <path d={`M${p1.x} ${p1.y} L${p2.x} ${p2.y} L${p3.x} ${p3.y} L${p4.x} ${p4.y} Z`} fill="black" fillOpacity="0.05" />;
             })()}

             {Array.from({ length: storyCount }).map((_, floorIndex) => {
               const zBottom = floorIndex * hStory;
               const zTop = (floorIndex + 1) * hStory;
               
               return (
                 <g key={`floor-${floorIndex}`}>
                   {/* KOLONLAR */}
                   {model.columns.map(col => {
                      const n = nodeMap.get(col.nodeId);
                      if(!n) return null;
                      const b = toIso(n.x, n.y, zBottom);
                      const t = toIso(n.x, n.y, zTop);
                      return (
                        <line 
                          key={`c3d-${col.id}-${floorIndex}`}
                          x1={b.x} y1={b.y} x2={t.x} y2={t.y}
                          stroke="#475569" strokeWidth={colW * 0.8} strokeLinecap="round"
                        />
                      );
                   })}

                   {/* KİRİŞLER (Katın üst kotunda) */}
                   {model.beams.map(beam => {
                      const n1 = nodeMap.get(beam.startNodeId);
                      const n2 = nodeMap.get(beam.endNodeId);
                      if(!n1 || !n2) return null;
                      const start = toIso(n1.x, n1.y, zTop);
                      const end = toIso(n2.x, n2.y, zTop);
                      
                      return (
                        <line 
                          key={`b3d-${beam.id}-${floorIndex}`}
                          x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                          stroke="#f97316" strokeWidth={beamW * 0.8}
                        />
                      );
                   })}
                   
                   {/* DÖŞEME (Hafif saydam) */}
                   <path 
                     d={`M${toIso(0,0,zTop).x} ${toIso(0,0,zTop).y} L${toIso(dimensions.lx,0,zTop).x} ${toIso(dimensions.lx,0,zTop).y} L${toIso(dimensions.lx,dimensions.ly,zTop).x} ${toIso(dimensions.lx,dimensions.ly,zTop).y} L${toIso(0,dimensions.ly,zTop).x} ${toIso(0,dimensions.ly,zTop).y} Z`}
                     fill="#fb923c" fillOpacity="0.1" stroke="none"
                   />
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