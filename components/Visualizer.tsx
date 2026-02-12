
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { AppState, EditorTool, UserElement, ViewMode } from '../types';
import { generateModel } from '../utils/modelGenerator';
import { Scan, MousePointer2, Box } from 'lucide-react';

interface Props {
  state: AppState;
  activeTool: EditorTool;
  viewMode: ViewMode;
  activeStory: number;
  activeAxisId: string; 
  onElementAdd?: (el: UserElement) => void;
  onElementRemove?: (id: string) => void;
  onElementSelect?: (id: string | null) => void;
  selectedElementId?: string | null;
  interactive?: boolean; 
}

const Visualizer: React.FC<Props> = ({ 
  state, 
  activeTool, 
  viewMode,
  activeStory,
  activeAxisId,
  onElementAdd, 
  onElementRemove, 
  onElementSelect, 
  selectedElementId,
  interactive = true
}) => {
  const { dimensions, definedElements, grid } = state;
  const model = useMemo(() => generateModel(state), [state]);
  const svgRef = useRef<SVGSVGElement>(null);

  // --- STATE ---
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const lastMouseRef = useRef({ x: 0, y: 0 });
  
  const [hoverNode, setHoverNode] = useState<{x: number, y: number} | null>(null);
  const [hoverSegment, setHoverSegment] = useState<{x1: number, y1: number, x2: number, y2: number} | null>(null);
  const [hoverCell, setHoverCell] = useState<{x: number, y: number} | null>(null);
  const [dragStartNode, setDragStartNode] = useState<{x: number, y: number} | null>(null);

  // --- KOORDİNAT SİSTEMİ ---
  const canvasSize = 600;
  const padding = 60;
  
  const xSpacings = [0, ...grid.xAxis.map(a => a.spacing)];
  const ySpacings = [0, ...grid.yAxis.map(a => a.spacing)];
  const xCoords = xSpacings.map((_, i) => xSpacings.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const yCoords = ySpacings.map((_, i) => ySpacings.slice(0, i + 1).reduce((a, b) => a + b, 0));

  const maxDimX = dimensions.lx;
  const totalHeight = dimensions.storyHeights.reduce((a,b)=>a+b,0);
  const maxDimY = viewMode === 'elevation' ? totalHeight : dimensions.ly;
  
  const maxDim = Math.max(maxDimX, maxDimY) || 1;
  const scale = (canvasSize - padding * 2) / maxDim;

  const drawW = maxDimX * scale;
  const drawH = maxDimY * scale;
  const startX = (canvasSize - drawW) / 2;
  const startY = (canvasSize - drawH) / 2;

  const toPx = (val: number) => val * scale;
  
  const getPlanPx = (ix: number, iy: number) => ({
    x: startX + toPx(xCoords[ix]),
    y: startY + toPx(yCoords[iy])
  });

  // --- 3D PROJEKSİYON ---
  const project3D = (x: number, y: number, z: number) => {
    const isoX = (x - y) * Math.cos(Math.PI / 6);
    const isoY = (x + y) * Math.sin(Math.PI / 6) - z;
    return { 
        x: canvasSize/2 + isoX * scale * 0.7, 
        y: canvasSize/2 + canvasSize/4 + isoY * scale * 0.7 
    };
  };

  // --- EVENT HANDLERS ---
  const handleWheel = (e: React.WheelEvent) => {
    if(!interactive) return;
    e.stopPropagation();
    const f = 1.05;
    setZoom(z => Math.min(Math.max(e.deltaY < 0 ? z * f : z / f, 0.2), 10));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if(!interactive) return;
    if (isDragging) {
      setOffset(p => ({ x: p.x + (e.clientX - lastMouseRef.current.x), y: p.y + (e.clientY - lastMouseRef.current.y) }));
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if(viewMode !== 'plan') return; 

    if (!svgRef.current) return;
    
    const CTM = svgRef.current.getScreenCTM();
    if (!CTM) return;
    
    const mouseX = (e.clientX - CTM.e) / CTM.a;
    const mouseY = (e.clientY - CTM.f) / CTM.d;

    const rawX = (mouseX - offset.x) / zoom;
    const rawY = (mouseY - offset.y) / zoom;

    // 1. SNAP NODE 
    let nNode = null;
    let minDist = 30 / zoom; 

    for(let i=0; i<yCoords.length; i++) {
        for(let j=0; j<xCoords.length; j++) {
            const px = startX + toPx(xCoords[j]);
            const py = startY + toPx(yCoords[i]);
            const dist = Math.sqrt((rawX - px)**2 + (rawY - py)**2);
            if (dist < minDist) {
                minDist = dist;
                nNode = { x: j, y: i };
            }
        }
    }
    setHoverNode(nNode);

    if (nNode) {
        setHoverSegment(null);
        setHoverCell(null);
        return;
    }

    // 2. SNAP SEGMENT (Beam) - Sadece kiriş modundaysa ve hoverNode yoksa
    if (activeTool === 'beam' && !nNode) {
        let nSeg = null;
        let minSegDist = 15 / zoom;
        // Yatay
        for(let i=0; i<yCoords.length; i++) {
            const py = startY + toPx(yCoords[i]);
            if (Math.abs(rawY - py) < minSegDist) {
                for(let j=0; j<xCoords.length-1; j++) {
                    const px1 = startX + toPx(xCoords[j]);
                    const px2 = startX + toPx(xCoords[j+1]);
                    if (rawX >= px1 && rawX <= px2) nSeg = { x1: j, y1: i, x2: j+1, y2: i };
                }
            }
        }
        // Dikey
        if (!nSeg) {
             for(let j=0; j<xCoords.length; j++) {
                const px = startX + toPx(xCoords[j]);
                if (Math.abs(rawX - px) < minSegDist) {
                    for(let i=0; i<yCoords.length-1; i++) {
                        const py1 = startY + toPx(yCoords[i]);
                        const py2 = startY + toPx(yCoords[i+1]);
                        if (rawY >= py1 && rawY <= py2) nSeg = { x1: j, y1: i, x2: j, y2: i+1 };
                    }
                }
             }
        }
        setHoverSegment(nSeg);
    } else {
        setHoverSegment(null);
    }

    // 3. SNAP CELL (Slab)
    if (activeTool === 'slab') {
         for(let i=0; i<yCoords.length-1; i++) {
            for(let j=0; j<xCoords.length-1; j++) {
                const px1 = startX + toPx(xCoords[j]);
                const py1 = startY + toPx(yCoords[i]);
                const px2 = startX + toPx(xCoords[j+1]);
                const py2 = startY + toPx(yCoords[i+1]);
                if (rawX > px1 && rawX < px2 && rawY > py1 && rawY < py2) {
                    setHoverCell({ x: j, y: i });
                    return;
                }
            }
        }
        setHoverCell(null);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
     if(!interactive) return;
     
     if(activeTool === 'select' || e.button === 1 || viewMode !== 'plan') {
         setIsDragging(true);
         setDragStartPos({ x: e.clientX, y: e.clientY });
         lastMouseRef.current = { x: e.clientX, y: e.clientY };
         return;
     }

     if(!onElementAdd) return;

     // KOLON veya PERDE EKLEME
     if((activeTool === 'column' || activeTool === 'shear_wall') && hoverNode) {
         const type = activeTool;
         const id = `${type === 'column' ? 'C' : 'SW'}-${hoverNode.x}-${hoverNode.y}`;
         onElementAdd({ 
             id, 
             type, 
             x1: hoverNode.x, 
             y1: hoverNode.y, 
             storyIndex: activeStory,
             properties: type === 'shear_wall' ? {
                 width: state.sections.wallLength, // Varsayılan uzunluk
                 depth: state.sections.wallThickness, // Varsayılan kalınlık
                 direction: 'x',
                 alignment: 'center'
             } : undefined
         });
     }
     else if(activeTool === 'beam' && hoverNode) {
         if(!dragStartNode) setDragStartNode(hoverNode);
         else {
             if(dragStartNode.x !== hoverNode.x || dragStartNode.y !== hoverNode.y) {
                 const id = `B-${dragStartNode.x}${dragStartNode.y}-${hoverNode.x}${hoverNode.y}`;
                 onElementAdd({ id, type: 'beam', x1: dragStartNode.x, y1: dragStartNode.y, x2: hoverNode.x, y2: hoverNode.y, storyIndex: activeStory });
             }
             setDragStartNode(null);
         }
     }
     else if(activeTool === 'slab' && hoverNode) {
         if(!dragStartNode) setDragStartNode(hoverNode);
         else {
             if(dragStartNode.x !== hoverNode.x && dragStartNode.y !== hoverNode.y) {
                 const id = `S-${dragStartNode.x}${dragStartNode.y}`;
                 onElementAdd({ id, type: 'slab', x1: dragStartNode.x, y1: dragStartNode.y, x2: hoverNode.x, y2: hoverNode.y, storyIndex: activeStory });
             }
             setDragStartNode(null);
         }
     }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
      setIsDragging(false);
  };

  const handleDoubleClick = () => {
      if(!interactive || !onElementAdd || viewMode !== 'plan') return;
      if(activeTool === 'beam' && hoverSegment) {
          const { x1, y1, x2, y2 } = hoverSegment;
          const id = `B-${x1}${y1}-${x2}${y2}`;
          onElementAdd({ id, type: 'beam', x1, y1, x2, y2, storyIndex: activeStory });
      }
      if(activeTool === 'slab' && hoverCell) {
          const { x, y } = hoverCell;
          const id = `S-${x}${y}`;
          onElementAdd({ id, type: 'slab', x1: x, y1: y, x2: x+1, y2: y+1, storyIndex: activeStory });
      }
  };

  // --- RENDER HELPERS ---
  const renderPlan = () => (
    <>
        {/* SLABS */}
        {definedElements.filter(e => e.type === 'slab' && e.storyIndex === activeStory).map(el => {
            const minX = Math.min(el.x1, el.x2!);
            const maxX = Math.max(el.x1, el.x2!);
            const minY = Math.min(el.y1, el.y2!);
            const maxY = Math.max(el.y1, el.y2!);

            const sx = xCoords[minX];
            const sy = yCoords[minY];
            const sw = Math.abs(xCoords[maxX] - xCoords[minX]);
            const sh = Math.abs(yCoords[maxY] - yCoords[minY]);
            
            const isSel = selectedElementId === el.id;
            const fillColor = isSel ? "#fcd34d" : "#fed7aa";
            const hoverClass = activeTool === 'delete' ? 'hover:fill-red-400' : '';

            // Çapraz Kiriş Kontrolü
            const diagonalBeam = definedElements.find(b => 
                b.type === 'beam' && 
                b.storyIndex === activeStory &&
                b.x1 !== b.x2 && b.y1 !== b.y2 &&
                ((b.x1 === minX && b.x2 === maxX && b.y1 === minY && b.y2 === maxY) ||
                 (b.x1 === maxX && b.x2 === minX && b.y1 === maxY && b.y2 === minY) ||
                 (b.x1 === minX && b.x2 === maxX && b.y1 === maxY && b.y2 === minY) ||
                 (b.x1 === maxX && b.x2 === minX && b.y1 === minY && b.y2 === maxY))
            );

            if (diagonalBeam) {
                const px1 = startX + toPx(sx);
                const py1 = startY + toPx(sy);
                const px2 = startX + toPx(sx + sw);
                const py2 = startY + toPx(sy + sh);
                
                const isTL_BR = (diagonalBeam.x1 === minX && diagonalBeam.y1 === minY) || (diagonalBeam.x2 === minX && diagonalBeam.y2 === minY);
                
                let points1 = "", points2 = "";
                if (isTL_BR) {
                    points1 = `${px1},${py1} ${px2},${py1} ${px2},${py2}`; 
                    points2 = `${px1},${py1} ${px1},${py2} ${px2},${py2}`; 
                } else {
                    points1 = `${px1},${py1} ${px2},${py1} ${px1},${py2}`; 
                    points2 = `${px2},${py1} ${px2},${py2} ${px1},${py2}`; 
                }
                
                return (
                    <g key={el.id} onClick={(e)=>{e.stopPropagation(); onElementSelect?.(el.id); if(activeTool==='delete') onElementRemove?.(el.id);}} className={hoverClass} >
                        <polygon points={points1} fill={fillColor} fillOpacity={0.4} stroke="none" />
                        <polygon points={points2} fill={fillColor} fillOpacity={0.4} stroke="none" />
                    </g>
                );
            }

            return <rect key={el.id} x={startX+toPx(sx)} y={startY+toPx(sy)} width={toPx(sw)} height={toPx(sh)} fill={fillColor} fillOpacity={0.4} stroke="none" onClick={(e)=>{e.stopPropagation(); onElementSelect?.(el.id); if(activeTool==='delete') onElementRemove?.(el.id);}} className={hoverClass} />;
        })}

        {/* GRID */}
        {xCoords.map((x, i) => <line key={`gx${i}`} x1={startX+toPx(x)} y1={startY-20} x2={startX+toPx(x)} y2={startY+drawH+20} stroke="#cbd5e1" strokeDasharray="4 2" />)}
        {yCoords.map((y, i) => <line key={`gy${i}`} x1={startX-20} y1={startY+toPx(y)} x2={startX+drawW+20} y2={startY+toPx(y)} stroke="#cbd5e1" strokeDasharray="4 2" />)}
        
        {/* BEAMS */}
        {definedElements.filter(e => e.type === 'beam' && e.storyIndex === activeStory).map(el => {
             const x1 = startX + toPx(xCoords[el.x1]);
             const y1 = startY + toPx(yCoords[el.y1]);
             const x2 = startX + toPx(xCoords[el.x2!]);
             const y2 = startY + toPx(yCoords[el.y2!]);
             const isSel = selectedElementId === el.id;
             return <line key={el.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={isSel?"#2563eb":"#94a3b8"} strokeWidth={toPx(0.25)} onClick={(e)=>{e.stopPropagation(); onElementSelect?.(el.id); if(activeTool==='delete') onElementRemove?.(el.id);}} className={activeTool==='delete'?'hover:stroke-red-500':''} />;
        })}

        {/* COLUMNS & SHEAR WALLS */}
        {definedElements.filter(e => (e.type === 'column' || e.type === 'shear_wall') && e.storyIndex === activeStory).map(el => {
             const cx = startX + toPx(xCoords[el.x1]);
             const cy = startY + toPx(yCoords[el.y1]);
             const isSel = selectedElementId === el.id;
             
             let w = 0, h = 0;
             let offsetX = 0, offsetY = 0;

             if (el.type === 'shear_wall') {
                 const len = (el.properties?.width || state.sections.wallLength) / 100; // m
                 const thk = (el.properties?.depth || state.sections.wallThickness) / 100; // m
                 const dir = el.properties?.direction || 'x';
                 const align = el.properties?.alignment || 'center';

                 if (dir === 'x') {
                     w = toPx(len); 
                     h = toPx(thk);
                     // Alignment Logic for X Direction
                     if (align === 'start') offsetX = 0;
                     else if (align === 'end') offsetX = -w;
                     else offsetX = -w / 2; // center
                     offsetY = -h / 2;
                 } else {
                     w = toPx(thk);
                     h = toPx(len);
                     // Alignment Logic for Y Direction
                     if (align === 'start') offsetY = 0;
                     else if (align === 'end') offsetY = -h;
                     else offsetY = -h / 2; // center
                     offsetX = -w / 2;
                 }
             } else {
                 // Standart Kolon
                 w = toPx(0.4); 
                 h = toPx(0.4);
                 offsetX = -w / 2;
                 offsetY = -h / 2;
             }

             return (
                <rect 
                    key={el.id} 
                    x={cx + offsetX} 
                    y={cy + offsetY} 
                    width={w} 
                    height={h} 
                    fill={isSel ? "#2563eb" : (el.type === 'shear_wall' ? "#334155" : "#475569")} 
                    onClick={(e)=>{e.stopPropagation(); onElementSelect?.(el.id); if(activeTool==='delete') onElementRemove?.(el.id);}} 
                    className={activeTool==='delete'?'hover:fill-red-500':''} 
                />
             );
        })}

        {/* INTERACTIVE PREVIEWS */}
        {hoverNode && (activeTool === 'column' || activeTool === 'shear_wall') && (
            <g pointerEvents="none">
                <rect 
                    x={getPlanPx(hoverNode.x, hoverNode.y).x - toPx(0.2)} 
                    y={getPlanPx(hoverNode.x, hoverNode.y).y - toPx(0.2)} 
                    width={toPx(0.4)} 
                    height={toPx(0.4)} 
                    fill="none" 
                    stroke="#2563eb" 
                    strokeWidth="2" 
                    strokeDasharray="4 2" 
                    opacity="0.7" 
                />
                <circle cx={getPlanPx(hoverNode.x, hoverNode.y).x} cy={getPlanPx(hoverNode.x, hoverNode.y).y} r={4} fill="#2563eb" />
            </g>
        )}
        
        {/* Beam Drag Line */}
        {activeTool === 'beam' && dragStartNode && hoverNode && (
            <line 
               x1={getPlanPx(dragStartNode.x, dragStartNode.y).x} 
               y1={getPlanPx(dragStartNode.x, dragStartNode.y).y} 
               x2={getPlanPx(hoverNode.x, hoverNode.y).x} 
               y2={getPlanPx(hoverNode.x, hoverNode.y).y} 
               stroke="#2563eb" strokeWidth="2" strokeDasharray="4 2" pointerEvents="none" 
            />
        )}
        
        {/* Slab Drag Rect */}
        {activeTool === 'slab' && dragStartNode && hoverNode && (
             <rect 
                x={getPlanPx(Math.min(dragStartNode.x, hoverNode.x), Math.min(dragStartNode.y, hoverNode.y)).x}
                y={getPlanPx(Math.min(dragStartNode.x, hoverNode.x), Math.min(dragStartNode.y, hoverNode.y)).y}
                width={Math.abs(getPlanPx(hoverNode.x, hoverNode.y).x - getPlanPx(dragStartNode.x, dragStartNode.y).x)}
                height={Math.abs(getPlanPx(hoverNode.x, hoverNode.y).y - getPlanPx(dragStartNode.x, dragStartNode.y).y)}
                fill="#fb923c" fillOpacity="0.3" stroke="#fb923c" strokeDasharray="4 2" pointerEvents="none"
             />
        )}

        {/* Snap Indicator */}
        {hoverNode && activeTool !== 'column' && activeTool !== 'shear_wall' && <circle cx={getPlanPx(hoverNode.x, hoverNode.y).x} cy={getPlanPx(hoverNode.x, hoverNode.y).y} r={4} fill="red" pointerEvents="none" />}
    </>
  );

  const renderElevation = () => {
      const isXAxis = activeAxisId.startsWith('X'); 
      const axisIndex = parseInt(activeAxisId.substring(1)) - 1;
      if(isNaN(axisIndex)) return <text x="50%" y="50%">Aks Seçilmedi</text>;

      let cumH = 0;
      const zLevels = [0, ...dimensions.storyHeights.map(h => { cumH += h; return cumH; })];
      const maxZ = zLevels[zLevels.length-1];

      const horzCoords = isXAxis ? yCoords : xCoords;
      const H_DRAW = maxDimY * scale; 
      
      const getElevPx = (dist: number, z: number) => ({
          x: startX + toPx(dist),
          y: startY + H_DRAW - toPx(z)
      });

      return (
          <>
             {/* Zemin Çizgisi */}
             <line x1={startX-20} y1={startY+H_DRAW} x2={startX+drawW+20} y2={startY+H_DRAW} stroke="#000" strokeWidth="2" />
             
             {/* Kot Çizgileri */}
             {zLevels.map((z, i) => (
                 <g key={`zl-${i}`}>
                     <line x1={startX-10} y1={getElevPx(0, z).y} x2={startX+drawW+10} y2={getElevPx(0, z).y} stroke="#cbd5e1" strokeDasharray="2 2" />
                     <text x={startX-15} y={getElevPx(0, z).y} textAnchor="end" fontSize="10" dy="3">{z.toFixed(1)}m</text>
                 </g>
             ))}

             {/* Grid */}
             {horzCoords.map((h, i) => (
                 <line key={`gl-${i}`} x1={getElevPx(h, 0).x} y1={getElevPx(h, 0).y} x2={getElevPx(h, maxZ).x} y2={getElevPx(h, maxZ).y} stroke="#e2e8f0" />
             ))}

             {/* ELEMANLAR */}
             {definedElements.filter(e => (e.type === 'column' || e.type === 'shear_wall')).map(col => {
                 const isOnAxis = isXAxis ? col.x1 === axisIndex : col.y1 === axisIndex;
                 if(!isOnAxis) return null;
                 const posH = isXAxis ? yCoords[col.y1] : xCoords[col.x1];
                 const zBottom = zLevels[col.storyIndex];
                 const zTop = zLevels[col.storyIndex + 1];
                 const p1 = getElevPx(posH, zBottom);
                 const p2 = getElevPx(posH, zTop);
                 return <rect key={col.id} x={p1.x - 5} y={p2.y} width={10} height={p1.y - p2.y} fill={col.type === 'shear_wall' ? "#334155" : "#475569"} stroke="black" strokeWidth="1" />;
             })}

             {definedElements.filter(e => e.type === 'beam').map(beam => {
                 const zLevel = zLevels[beam.storyIndex + 1];
                 let isParallel = false;
                 if (isXAxis) { 
                     if (beam.x1 === axisIndex && beam.x2 === axisIndex) isParallel = true;
                 } else { 
                     if (beam.y1 === axisIndex && beam.y2 === axisIndex) isParallel = true;
                 }

                 if (isParallel) {
                     const h1 = isXAxis ? yCoords[beam.y1] : xCoords[beam.x1];
                     const h2 = isXAxis ? yCoords[beam.y2!] : xCoords[beam.x2!];
                     const p1 = getElevPx(Math.min(h1,h2), zLevel);
                     const p2 = getElevPx(Math.max(h1,h2), zLevel);
                     return <rect key={beam.id} x={p1.x} y={p1.y} width={p2.x - p1.x} height={10} fill="#94a3b8" />;
                 }
                 return null;
             })}
          </>
      );
  };

  const render3D = () => {
    let cumH = 0;
    const zLevels = [0, ...dimensions.storyHeights.map(h => { cumH += h; return cumH; })];

    return (
        <g>
            {/* TABAN GRID */}
            {xCoords.map((x, i) => {
                const p1 = project3D(x, yCoords[0], 0);
                const p2 = project3D(x, yCoords[yCoords.length-1], 0);
                return <line key={`b-gx${i}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#e2e8f0" />;
            })}
             {yCoords.map((y, i) => {
                const p1 = project3D(xCoords[0], y, 0);
                const p2 = project3D(xCoords[xCoords.length-1], y, 0);
                return <line key={`b-gy${i}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#e2e8f0" />;
            })}

            {/* KOLONLAR & PERDELER */}
            {definedElements.filter(e => (e.type === 'column' || e.type === 'shear_wall')).map(col => {
                 const x = xCoords[col.x1];
                 const y = yCoords[col.y1];
                 const zBot = zLevels[col.storyIndex];
                 const zTop = zLevels[col.storyIndex+1];
                 
                 const p1 = project3D(x, y, zBot);
                 const p2 = project3D(x, y, zTop);
                 
                 // Perdeleri biraz daha kalın çiz
                 const strokeW = col.type === 'shear_wall' ? 8 : 4;
                 
                 return <line key={col.id} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={col.type === 'shear_wall' ? "#334155" : "#475569"} strokeWidth={strokeW} strokeLinecap="round" />;
            })}

            {/* KİRİŞLER */}
            {definedElements.filter(e => e.type === 'beam').map(beam => {
                const z = zLevels[beam.storyIndex + 1];
                const x1 = xCoords[beam.x1]; const y1 = yCoords[beam.y1];
                const x2 = xCoords[beam.x2!]; const y2 = yCoords[beam.y2!];
                
                const p1 = project3D(x1, y1, z);
                const p2 = project3D(x2, y2, z);

                return <line key={beam.id} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#2563eb" strokeWidth="2" />;
            })}
        </g>
    )
  };

  return (
    <div className={`w-full h-full bg-slate-50 border border-slate-200 rounded-xl overflow-hidden relative select-none group shadow-inner ${!interactive ? 'pointer-events-none' : ''}`}>
      {/* Title Badge */}
      <div className="absolute top-2 left-2 z-10 bg-white/90 backdrop-blur px-2 py-1 rounded border shadow-sm text-[10px] text-slate-500 font-bold uppercase pointer-events-none">
         {viewMode === 'plan' ? `PLAN: ${activeStory < dimensions.basementCount ? `${activeStory - dimensions.basementCount}. BODRUM` : activeStory - dimensions.basementCount === 0 ? 'ZEMİN KAT' : `${activeStory - dimensions.basementCount}. KAT`}` : viewMode === 'elevation' ? `KESİT: AKS ${activeAxisId}` : '3D GÖRÜNÜM'}
      </div>

      {interactive && (
        <button onClick={() => { setZoom(1); setOffset({x:0, y:0}); }} className="absolute bottom-4 right-4 z-10 bg-white p-2 rounded-full shadow-lg hover:scale-110 transition-transform">
            <Scan className="w-5 h-5 text-slate-600" />
        </button>
      )}

      <svg 
         ref={svgRef}
         width="100%" height="100%" 
         viewBox={`0 0 ${canvasSize} ${canvasSize}`}
         onMouseDown={handleMouseDown}
         onMouseMove={handleMouseMove}
         onMouseUp={handleMouseUp}
         onMouseLeave={handleMouseUp}
         onWheel={handleWheel}
         onDoubleClick={handleDoubleClick}
         className={interactive ? (activeTool==='select'?'cursor-default':'cursor-crosshair') : ''}
      >
         <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          
          <g transform={`translate(${offset.x}, ${offset.y}) scale(${zoom})`} style={{ transition: isDragging ? 'none' : 'transform 0.1s ease-out' }}>
             {viewMode === 'plan' && renderPlan()}
             {viewMode === 'elevation' && renderElevation()}
             {viewMode === '3d' && render3D()}
          </g>
      </svg>
    </div>
  );
};

export default Visualizer;
