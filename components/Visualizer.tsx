
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { AppState, EditorTool, UserElement, ViewMode, CalculationResult, StructuralModel } from '../types';
import { generateModel } from '../utils/modelGenerator';
import { Scan, MousePointer2, Box, Activity } from 'lucide-react';

interface Props {
  state: AppState;
  activeTool: EditorTool;
  viewMode: ViewMode;
  activeStory: number;
  activeAxisId: string; 
  onElementAdd?: (el: UserElement) => void;
  onElementRemove?: (id: string) => void;
  onElementSelect?: (id: string | null) => void; 
  onMultiElementSelect?: (ids: string[]) => void;
  selectedElementId?: string | null; 
  selectedElementIds?: string[];
  interactive?: boolean; 
  results?: CalculationResult | null;
  displayMode?: 'physical' | 'analysis';
  diagramType?: 'M3' | 'V2';
  model?: StructuralModel;
}

// Yerleşim Tipleri
type AlignmentType = 'center' | 'tl' | 'tr' | 'br' | 'bl';

const Visualizer: React.FC<Props> = ({ 
  state, 
  activeTool, 
  viewMode,
  activeStory,
  activeAxisId,
  onElementAdd, 
  onElementRemove, 
  onElementSelect,
  onMultiElementSelect,
  selectedElementId,
  selectedElementIds = [],
  interactive = true,
  results,
  displayMode = 'physical',
  diagramType = 'M3',
  model
}) => {
  const { dimensions, definedElements, grid } = state;
  const svgRef = useRef<SVGSVGElement>(null);

  // --- STATE ---
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  
  // Placement States (Editor Interaction)
  // 'tl': Top-Left (Elemanın sol üst köşesi imleçte) -> Eleman sağ alta uzanır.
  const [previewAlign, setPreviewAlign] = useState<AlignmentType>('center');
  const [previewDir, setPreviewDir] = useState<'x' | 'y'>('x');

  // Pan States
  const [isPanning, setIsPanning] = useState(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  
  // Box Selection States
  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  const [boxStart, setBoxStart] = useState<{x: number, y: number} | null>(null);
  const [boxEnd, setBoxEnd] = useState<{x: number, y: number} | null>(null);

  const [hoverNode, setHoverNode] = useState<{x: number, y: number} | null>(null);
  const [hoverSegment, setHoverSegment] = useState<{x1: number, y1: number, x2: number, y2: number} | null>(null);
  const [hoverCell, setHoverCell] = useState<{x: number, y: number, segment?: 'tl' | 'br' | 'tr' | 'bl'} | null>(null);
  const [dragStartNode, setDragStartNode] = useState<{x: number, y: number} | null>(null);

  // KEYBOARD HANDLER (Space: Align, R: Rotate)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (!interactive || viewMode !== 'plan') return;

        if (e.code === 'Space') {
            e.preventDefault(); // Sayfa kaydırmayı engelle
            setPreviewAlign(prev => {
                // Döngü: Merkez -> Sol-Üst -> Sağ-Üst -> Sağ-Alt -> Sol-Alt
                if (prev === 'center') return 'tl'; // Top-Left (Eleman sağa aşağı)
                if (prev === 'tl') return 'tr';     // Top-Right (Eleman sola aşağı)
                if (prev === 'tr') return 'br';     // Bottom-Right (Eleman sola yukarı)
                if (prev === 'br') return 'bl';     // Bottom-Left (Eleman sağa yukarı)
                return 'center';
            });
        }
        if (e.code === 'KeyR') {
            setPreviewDir(prev => prev === 'x' ? 'y' : 'x');
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [interactive, viewMode]);

  // Calculate Z Levels for 3D and Elevation
  const zLevels = useMemo(() => {
    const levels = [0];
    let current = 0;
    dimensions.storyHeights.forEach(h => {
        current += h;
        levels.push(current);
    });
    return levels;
  }, [dimensions.storyHeights]);

  // --- RENK FONKSİYONLARI ---
  const getElementColor = (el: UserElement, isSelected: boolean) => {
      if (isSelected) return "#fcd34d"; // Sarı (Highlight)

      // ANALİZ MODU
      if (displayMode === 'analysis' && results && results.elementResults) {
          const status = results.elementResults.get(el.id);
          if (status) {
              return status.isSafe ? "#22c55e" : "#ef4444"; // Yeşil / Kırmızı
          }
          return "#94a3b8"; // Analiz sonucu yoksa gri
      }

      // FİZİKSEL MOD
      switch (el.type) {
          case 'slab': return "#fed7aa";
          case 'beam': return "#94a3b8";
          case 'shear_wall': return "#334155";
          case 'column': return "#475569";
          default: return "#cbd5e1";
      }
  };
  
  const getStrokeColor = (el: UserElement, isSelected: boolean) => {
       if (isSelected) return "#2563eb";

       // ANALİZ MODU
       if (displayMode === 'analysis' && results && results.elementResults) {
           const status = results.elementResults.get(el.id);
           if (status) {
               return status.isSafe ? "#15803d" : "#b91c1c"; // Koyu Yeşil / Koyu Kırmızı
           }
       }

       return el.type === 'beam' ? "#94a3b8" : "none";
  };

  // --- KOORDİNAT SİSTEMİ ---
  const canvasSize = 600;
  const padding = 80; 
  
  const xSpacings = [0, ...grid.xAxis.map(a => a.spacing)];
  const ySpacings = [0, ...grid.yAxis.map(a => a.spacing)];
  const xCoords = xSpacings.map((_, i) => xSpacings.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const yCoords = ySpacings.map((_, i) => ySpacings.slice(0, i + 1).reduce((a, b) => a + b, 0));

  const totalHeight = dimensions.storyHeights.reduce((a,b)=>a+b,0);
  
  // Dynamic Scale Calculation based on View Mode
  let modelWidth = dimensions.lx;
  let modelHeight = dimensions.ly;

  if (viewMode === 'elevation') {
     const isXAxis = activeAxisId.startsWith('X');
     modelWidth = isXAxis ? dimensions.ly : dimensions.lx;
     modelHeight = totalHeight;
  }
  
  if (viewMode === '3d') {
     modelWidth = Math.max(dimensions.lx, dimensions.ly) * 1.5;
     modelHeight = Math.max(dimensions.lx, dimensions.ly) + totalHeight;
  }

  const maxDim = Math.max(modelWidth, modelHeight) || 1;
  const scale = (canvasSize - padding * 2) / maxDim;

  const drawW = modelWidth * scale;
  const drawH = modelHeight * scale;
  const startX = (canvasSize - drawW) / 2;
  const startY = (canvasSize - drawH) / 2;

  const toPx = (val: number) => val * scale;
  
  const getPlanPx = (ix: number, iy: number) => ({
    x: startX + toPx(xCoords[ix]),
    y: startY + toPx(yCoords[iy])
  });

  // --- YARDIMCI: OFFSET HESAPLAMA (Yerleşim için) ---
  const calculateOffset = (wPx: number, hPx: number, align: AlignmentType | string) => {
      // Varsayılan: Merkez
      let ox = -wPx / 2;
      let oy = -hPx / 2;

      if (align === 'tl' || align === 'start') { // Sol Üst (Eleman sağa, aşağı gider)
          ox = 0;
          oy = 0;
      } else if (align === 'tr') { // Sağ Üst (Eleman sola, aşağı gider)
          ox = -wPx;
          oy = 0;
      } else if (align === 'br' || align === 'end') { // Sağ Alt (Eleman sola, yukarı gider)
          ox = -wPx;
          oy = -hPx;
      } else if (align === 'bl') { // Sol Alt (Eleman sağa, yukarı gider)
          ox = 0;
          oy = -hPx;
      }
      // 'center' için varsayılan değerler zaten set edildi.
      return { ox, oy };
  };

  const getAlignmentLabel = (a: AlignmentType) => {
      switch(a) {
          case 'center': return 'Merkez';
          case 'tl': return 'Sol-Üst';
          case 'tr': return 'Sağ-Üst';
          case 'br': return 'Sağ-Alt';
          case 'bl': return 'Sol-Alt';
          default: return a;
      }
  };

  // --- 3D PROJEKSİYON ---
  const project3D = (x: number, y: number, z: number) => {
    const isoX = (x - y) * Math.cos(Math.PI / 6);
    const isoY = (x + y) * Math.sin(Math.PI / 6) - z;
    // Centering for 3D is approximate
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
    
    if (isPanning) {
      setOffset(p => ({ x: p.x + (e.clientX - lastMouseRef.current.x), y: p.y + (e.clientY - lastMouseRef.current.y) }));
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (!svgRef.current) return;
    const CTM = svgRef.current.getScreenCTM();
    if (!CTM) return;
    
    const mouseX = (e.clientX - CTM.e) / CTM.a;
    const mouseY = (e.clientY - CTM.f) / CTM.d;

    if (isBoxSelecting) {
        setBoxEnd({ x: mouseX, y: mouseY });
        return;
    }

    if(viewMode !== 'plan') return; 

    const rawX = (mouseX - offset.x) / zoom;
    const rawY = (mouseY - offset.y) / zoom;

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

    if (activeTool === 'beam' && !nNode) {
        let nSeg = null;
        let minSegDist = 15 / zoom;
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

    if (activeTool === 'slab') {
         for(let i=0; i<yCoords.length-1; i++) {
            for(let j=0; j<xCoords.length-1; j++) {
                const px1 = startX + toPx(xCoords[j]);
                const py1 = startY + toPx(yCoords[i]);
                const px2 = startX + toPx(xCoords[j+1]);
                const py2 = startY + toPx(yCoords[i+1]);
                
                if (rawX > px1 && rawX < px2 && rawY > py1 && rawY < py2) {
                    const diagonalBeam = definedElements.find(b => 
                        b.type === 'beam' && 
                        b.storyIndex === activeStory &&
                        b.x1 !== b.x2 && b.y1 !== b.y2 &&
                        ((b.x1 === j && b.x2 === j+1 && b.y1 === i && b.y2 === i+1) || 
                         (b.x1 === j+1 && b.x2 === j && b.y1 === i+1 && b.y2 === i) ||
                         (b.x1 === j && b.x2 === j+1 && b.y1 === i+1 && b.y2 === i) || 
                         (b.x1 === j+1 && b.x2 === j && b.y1 === i && b.y2 === i+1))
                    );

                    let segment: 'tl' | 'br' | 'tr' | 'bl' | undefined = undefined;

                    if (diagonalBeam) {
                        const isTL_BR = (diagonalBeam.x1 === j && diagonalBeam.y1 === i) || (diagonalBeam.x2 === j && diagonalBeam.y2 === i);
                        const nx = (rawX - px1) / (px2 - px1);
                        const ny = (rawY - py1) / (py2 - py1);

                        if (isTL_BR) {
                            segment = (nx > ny) ? 'tr' : 'bl';
                        } else {
                            segment = (nx + ny < 1) ? 'tl' : 'br';
                        }
                    }

                    setHoverCell({ x: j, y: i, segment });
                    return;
                }
            }
        }
        setHoverCell(null);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
     if(!interactive) return;
     
     if (e.button === 1) {
         e.preventDefault();
         setIsPanning(true);
         lastMouseRef.current = { x: e.clientX, y: e.clientY };
         return;
     }

     if(viewMode !== 'plan') return;

     if (e.button === 0) {
         const target = e.target as Element;
         const isElement = target.getAttribute('data-is-element') === 'true';

         if (!hoverNode && !hoverSegment && !hoverCell && !isElement) {
             if (svgRef.current) {
                 const CTM = svgRef.current.getScreenCTM();
                 if (CTM) {
                     const mouseX = (e.clientX - CTM.e) / CTM.a;
                     const mouseY = (e.clientY - CTM.f) / CTM.d;
                     setIsBoxSelecting(true);
                     setBoxStart({ x: mouseX, y: mouseY });
                     setBoxEnd({ x: mouseX, y: mouseY });
                 }
             }
             return;
         }

         if((activeTool === 'column' || activeTool === 'shear_wall') && hoverNode && onElementAdd) {
             const type = activeTool;
             const id = `${type === 'column' ? 'C' : 'SW'}-${hoverNode.x}-${hoverNode.y}-S${activeStory}`;
             
             onElementAdd({ 
                 id, 
                 type, 
                 x1: hoverNode.x, 
                 y1: hoverNode.y, 
                 storyIndex: activeStory,
                 properties: {
                     width: type === 'shear_wall' ? state.sections.wallLength : state.sections.colWidth,
                     depth: type === 'shear_wall' ? state.sections.wallThickness : state.sections.colDepth,
                     direction: previewDir, // Hem kolon hem perde için yön
                     alignment: previewAlign // Space ile seçilen hizalama
                 }
             });
         }
         else if(activeTool === 'beam' && hoverNode) {
             if(!dragStartNode) setDragStartNode(hoverNode);
             else {
                 if(dragStartNode.x !== hoverNode.x || dragStartNode.y !== hoverNode.y) {
                     const id = `B-${dragStartNode.x}${dragStartNode.y}-${hoverNode.x}${hoverNode.y}-S${activeStory}`;
                     onElementAdd?.({ id, type: 'beam', x1: dragStartNode.x, y1: dragStartNode.y, x2: hoverNode.x, y2: hoverNode.y, storyIndex: activeStory });
                 }
                 setDragStartNode(null);
             }
         }
         else if(activeTool === 'slab' && hoverCell && onElementAdd) {
             const { x, y, segment } = hoverCell;
             const suffix = segment ? `-${segment}` : '';
             const id = `S-${x}${y}${suffix}-S${activeStory}`;
             
             const exists = definedElements.some(e => e.id === id && e.storyIndex === activeStory);
             if (!exists) {
                 onElementAdd({ 
                     id, 
                     type: 'slab', 
                     x1: x, y1: y, 
                     x2: x+1, y2: y+1, 
                     storyIndex: activeStory,
                     properties: segment ? { segment } : undefined
                 });
             }
         }
     }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
      if (isPanning) {
          setIsPanning(false);
      }
      
      if (isBoxSelecting && boxStart && boxEnd) {
          const x1 = Math.min(boxStart.x, boxEnd.x);
          const x2 = Math.max(boxStart.x, boxEnd.x);
          const y1 = Math.min(boxStart.y, boxEnd.y);
          const y2 = Math.max(boxStart.y, boxEnd.y);
          
          const foundIds: string[] = [];
          
          state.definedElements.forEach(el => {
              if (el.storyIndex !== activeStory) return;

              let elMinX, elMaxX, elMinY, elMaxY;
              
              const sx1 = startX + toPx(xCoords[el.x1]);
              const sy1 = startY + toPx(yCoords[el.y1]);
              
              if (el.type === 'beam' || el.type === 'slab') {
                  const sx2 = startX + toPx(xCoords[el.x2!]);
                  const sy2 = startY + toPx(yCoords[el.y2!]);
                  elMinX = Math.min(sx1, sx2);
                  elMaxX = Math.max(sx1, sx2);
                  elMinY = Math.min(sy1, sy2);
                  elMaxY = Math.max(sy1, sy2);
              } else {
                  elMinX = sx1 - 10;
                  elMaxX = sx1 + 10;
                  elMinY = sy1 - 10;
                  elMaxY = sy1 + 10;
              }

              const screenMinX = elMinX * zoom + offset.x;
              const screenMaxX = elMaxX * zoom + offset.x;
              const screenMinY = elMinY * zoom + offset.y;
              const screenMaxY = elMaxY * zoom + offset.y;

              const centerX = (screenMinX + screenMaxX) / 2;
              const centerY = (screenMinY + screenMaxY) / 2;
              
              if (centerX >= x1 && centerX <= x2 && centerY >= y1 && centerY <= y2) {
                  if (activeTool === 'select') {
                      foundIds.push(el.id);
                  } else if (activeTool === el.type) {
                      foundIds.push(el.id);
                  }
              }
          });

          if (onMultiElementSelect) {
              const isClick = Math.abs(boxEnd.x - boxStart.x) < 5 && Math.abs(boxEnd.y - boxStart.y) < 5;
              if (foundIds.length > 0) {
                  onMultiElementSelect(foundIds);
              } else if (isClick || foundIds.length === 0) {
                  onMultiElementSelect([]); 
              }
          }

          setIsBoxSelecting(false);
          setBoxStart(null);
          setBoxEnd(null);
      }
  };

  const handleElementClick = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (activeTool === 'delete') {
          onElementRemove?.(id);
          return;
      }
      
      if (!onMultiElementSelect) return;

      if (activeTool === 'select') {
          if (e.ctrlKey || e.metaKey || e.shiftKey) {
              if (selectedElementIds.includes(id)) {
                  onMultiElementSelect(selectedElementIds.filter(sid => sid !== id));
              } else {
                  onMultiElementSelect([...selectedElementIds, id]);
              }
          } else {
              if (selectedElementIds.length === 1 && selectedElementIds[0] === id) {
              } else {
                  onMultiElementSelect([id]);
              }
          }
      }
  };

  const handleDoubleClick = () => {
  };

  const renderPlan = () => (
    <>
        {/* Foundation Outline */}
        {activeStory === 0 && (
             <rect 
                x={startX - toPx(dimensions.foundationCantilever/100)} 
                y={startY - toPx(dimensions.foundationCantilever/100)} 
                width={drawW + 2*toPx(dimensions.foundationCantilever/100)} 
                height={drawH + 2*toPx(dimensions.foundationCantilever/100)} 
                fill="none" 
                stroke="#94a3b8" 
                strokeWidth="1" 
                strokeDasharray="8 4" 
             />
        )}

        {/* SLABS */}
        {definedElements.filter(e => e.type === 'slab' && e.storyIndex === activeStory).map(el => {
            const minX = Math.min(el.x1, el.x2!);
            const maxX = Math.max(el.x1, el.x2!);
            const minY = Math.min(el.y1, el.y2!);
            const maxY = Math.max(el.y1, el.y2!);

            const sx = startX + toPx(xCoords[minX]);
            const sy = startY + toPx(yCoords[minY]);
            const ex = startX + toPx(xCoords[maxX]);
            const ey = startY + toPx(yCoords[maxY]);
            const w = ex - sx;
            const h = ey - sy;
            
            const isSel = selectedElementIds.includes(el.id);
            const fillColor = getElementColor(el, isSel);
            const opacity = (results && !isSel && displayMode !== 'analysis') ? 0.6 : 0.4;
            const hoverClass = activeTool === 'delete' ? 'hover:fill-red-400' : '';

            // Üçgen döşeme desteği
            if (el.properties?.segment) {
                let points = "";
                switch (el.properties.segment) {
                    case 'tl': points = `${sx},${sy} ${ex},${sy} ${sx},${ey}`; break; 
                    case 'br': points = `${ex},${sy} ${ex},${ey} ${sx},${ey}`; break; 
                    case 'tr': points = `${sx},${sy} ${ex},${sy} ${ex},${ey}`; break; 
                    case 'bl': points = `${sx},${sy} ${sx},${ey} ${ex},${ey}`; break; 
                }
                return <polygon key={el.id} points={points} fill={fillColor} fillOpacity={opacity} stroke="none" onClick={(e)=>handleElementClick(e, el.id)} className={hoverClass} data-is-element="true" />;
            }

            return <rect key={el.id} x={sx} y={sy} width={w} height={h} fill={fillColor} fillOpacity={opacity} stroke="none" onClick={(e)=>handleElementClick(e, el.id)} className={hoverClass} data-is-element="true" />;
        })}

        {/* GRID VE AKS ETİKETLERİ */}
        {xCoords.map((x, i) => (
            <g key={`gx${i}`}>
                <line x1={startX+toPx(x)} y1={startY-20} x2={startX+toPx(x)} y2={startY+drawH+20} stroke="#cbd5e1" strokeDasharray="4 2" />
                {/* AKS ETİKETLERİ (ÜST) */}
                <circle cx={startX+toPx(x)} cy={startY-35} r={10} fill="white" stroke="#64748b" strokeWidth={1} />
                <text x={startX+toPx(x)} y={startY-31} textAnchor="middle" fontSize={10} fill="#475569" fontWeight="bold">{i + 1}</text>
            </g>
        ))}
        {yCoords.map((y, i) => (
            <g key={`gy${i}`}>
                <line x1={startX-20} y1={startY+toPx(y)} x2={startX+drawW+20} y2={startY+toPx(y)} stroke="#cbd5e1" strokeDasharray="4 2" />
                {/* AKS ETİKETLERİ (SOL) */}
                <circle cx={startX-35} cy={startY+toPx(y)} r={10} fill="white" stroke="#64748b" strokeWidth={1} />
                <text x={startX-35} y={startY+toPx(y)+3} textAnchor="middle" fontSize={10} fill="#475569" fontWeight="bold">{String.fromCharCode(65+i)}</text>
            </g>
        ))}
        
        {/* BEAMS */}
        {definedElements.filter(e => e.type === 'beam' && e.storyIndex === activeStory).map(el => {
             const x1 = startX + toPx(xCoords[el.x1]);
             const y1 = startY + toPx(yCoords[el.y1]);
             const x2 = startX + toPx(xCoords[el.x2!]);
             const y2 = startY + toPx(yCoords[el.y2!]);
             const isSel = selectedElementIds.includes(el.id);
             const strokeColor = getStrokeColor(el, isSel);

             return <line key={el.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={strokeColor} strokeWidth={toPx(0.25)} onClick={(e)=>handleElementClick(e, el.id)} className={activeTool==='delete'?'hover:stroke-red-500':''} data-is-element="true" />;
        })}

        {/* COLUMNS & SHEAR WALLS */}
        {definedElements.filter(e => (e.type === 'column' || e.type === 'shear_wall') && e.storyIndex === activeStory).map(el => {
             const cx = startX + toPx(xCoords[el.x1]);
             const cy = startY + toPx(yCoords[el.y1]);
             const isSel = selectedElementIds.includes(el.id);
             const fillColor = getElementColor(el, isSel);
             
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
                 } else {
                     w = toPx(thk);
                     h = toPx(len);
                 }
                 const offsets = calculateOffset(w, h, align as any);
                 offsetX = offsets.ox;
                 offsetY = offsets.oy;

             } else {
                 // Kolonlar için de alignment ve rotation desteği
                 const b_raw = (el.properties?.width || state.sections.colWidth) / 100; 
                 const h_raw = (el.properties?.depth || state.sections.colDepth) / 100;
                 const dir = el.properties?.direction || 'x';
                 const align = el.properties?.alignment || 'center';

                 if (dir === 'y') {
                     w = toPx(h_raw);
                     h = toPx(b_raw);
                 } else {
                     w = toPx(b_raw);
                     h = toPx(h_raw);
                 }

                 const offsets = calculateOffset(w, h, align as any);
                 offsetX = offsets.ox;
                 offsetY = offsets.oy;
             }

             return (
                <rect 
                    key={el.id} 
                    x={cx + offsetX} 
                    y={cy + offsetY} 
                    width={w} 
                    height={h} 
                    fill={fillColor} 
                    onClick={(e)=>handleElementClick(e, el.id)} 
                    className={activeTool==='delete'?'hover:fill-red-500':''}
                    data-is-element="true"
                />
             );
        })}

        {/* INTERACTIVE PREVIEWS (GHOST) */}
        {hoverNode && (activeTool === 'column' || activeTool === 'shear_wall') && (
            (() => {
                let w = 0, h = 0;
                if (activeTool === 'shear_wall') {
                    const len = (state.sections.wallLength) / 100;
                    const thk = (state.sections.wallThickness) / 100;
                    if (previewDir === 'x') { w = toPx(len); h = toPx(thk); } 
                    else { w = toPx(thk); h = toPx(len); }
                } else {
                    // Kolonlar için de rotation
                    const b_raw = state.sections.colWidth / 100;
                    const h_raw = state.sections.colDepth / 100;
                    if (previewDir === 'x') { w = toPx(b_raw); h = toPx(h_raw); }
                    else { w = toPx(h_raw); h = toPx(b_raw); }
                }
                const { ox, oy } = calculateOffset(w, h, previewAlign);
                const px = getPlanPx(hoverNode.x, hoverNode.y).x;
                const py = getPlanPx(hoverNode.x, hoverNode.y).y;

                return (
                    <g pointerEvents="none">
                        <rect 
                            x={px + ox} 
                            y={py + oy} 
                            width={w} 
                            height={h} 
                            fill="none" 
                            stroke="#2563eb" 
                            strokeWidth="2" 
                            strokeDasharray="4 2" 
                            opacity="0.7" 
                        />
                        <circle cx={px} cy={py} r={3} fill="#2563eb" />
                        {/* Alignment Marker - İmleç Konumunu Gösterir */}
                        <circle cx={px} cy={py} r={2} fill="white" stroke="#2563eb" />
                        
                        <text x={px + ox} y={py + oy - 5} fontSize={9} fill="#2563eb" fontWeight="bold">
                            Space: Yerleşim ({getAlignmentLabel(previewAlign)}) | R: Yön ({previewDir.toUpperCase()})
                        </text>
                    </g>
                );
            })()
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
        
        {/* Slab Preview */}
        {activeTool === 'slab' && hoverCell && (
             (() => {
                 const { x, y, segment } = hoverCell;
                 const px1 = startX + toPx(xCoords[x]);
                 const py1 = startY + toPx(yCoords[y]);
                 const px2 = startX + toPx(xCoords[x+1]);
                 const py2 = startY + toPx(yCoords[y+1]);
                 
                 let points = "";
                 if (segment) {
                     switch (segment) {
                         case 'tl': points = `${px1},${py1} ${px2},${py1} ${px1},${py2}`; break;
                         case 'br': points = `${px2},${py1} ${px2},${py2} ${px1},${py2}`; break;
                         case 'tr': points = `${px1},${py1} ${px2},${py1} ${px2},${py2}`; break;
                         case 'bl': points = `${px1},${py1} ${px1},${py2} ${px2},${py2}`; break;
                     }
                     return <polygon points={points} fill="#fb923c" fillOpacity="0.3" stroke="#fb923c" strokeDasharray="4 2" pointerEvents="none" />;
                 } else {
                     return <rect x={px1} y={py1} width={px2-px1} height={py2-py1} fill="#fb923c" fillOpacity="0.3" stroke="#fb923c" strokeDasharray="4 2" pointerEvents="none" />;
                 }
             })()
        )}

        {/* Snap Indicator */}
        {hoverNode && activeTool !== 'column' && activeTool !== 'shear_wall' && <circle cx={getPlanPx(hoverNode.x, hoverNode.y).x} cy={getPlanPx(hoverNode.x, hoverNode.y).y} r={4} fill="red" pointerEvents="none" />}
    </>
  );

  const renderElevation = () => {
    const isXAxis = activeAxisId.startsWith('X');
    const axisIndex = parseInt(activeAxisId.substring(1)) - 1;
    if (isNaN(axisIndex)) return null;

    const axisCoord = isXAxis ? xCoords[axisIndex] : yCoords[axisIndex];
    if (axisCoord === undefined) return null;

    const hCoords = isXAxis ? yCoords : xCoords;
    const hTotal = isXAxis ? dimensions.ly : dimensions.lx;

    return (
        <g>
            {/* Levels Grid */}
            {zLevels.map((z, i) => (
                <g key={`lvl-${i}`}>
                    <line 
                        x1={startX - 20} y1={startY + toPx(totalHeight - z)} 
                        x2={startX + toPx(hTotal) + 20} y2={startY + toPx(totalHeight - z)} 
                        stroke="#e2e8f0" strokeDasharray="4 2" 
                    />
                    <text x={startX - 25} y={startY + toPx(totalHeight - z) + 4} textAnchor="end" fontSize={10} fill="#94a3b8">
                        {z.toFixed(1)}m
                    </text>
                </g>
            ))}
            
            {/* Vertical Grid Lines & Bubbles */}
            {hCoords.map((c, i) => (
                <g key={`vgrid-${i}`}>
                    <line 
                        x1={startX + toPx(c)} y1={startY - 20}
                        x2={startX + toPx(c)} y2={startY + toPx(totalHeight) + 20}
                        stroke="#e2e8f0" strokeDasharray="4 2"
                    />
                    {/* Aks Etiketleri (Kesitte altta göster) */}
                    <circle cx={startX + toPx(c)} cy={startY + toPx(totalHeight) + 35} r={10} fill="white" stroke="#64748b" strokeWidth={1} />
                    <text x={startX + toPx(c)} y={startY + toPx(totalHeight) + 39} textAnchor="middle" fontSize={10} fill="#475569" fontWeight="bold">
                        {isXAxis ? String.fromCharCode(65+i) : (i + 1)}
                    </text>
                </g>
            ))}

            {/* Elements */}
            {definedElements.map(el => {
                if (el.storyIndex >= dimensions.storyCount) return null;
                
                const ex1 = xCoords[el.x1];
                const ey1 = yCoords[el.y1];
                const ex2 = el.x2 !== undefined ? xCoords[el.x2] : ex1;
                const ey2 = el.y2 !== undefined ? yCoords[el.y2] : ey1;

                const isOnAxis = isXAxis 
                    ? (Math.abs(ex1 - axisCoord) < 0.05 && Math.abs(ex2 - axisCoord) < 0.05)
                    : (Math.abs(ey1 - axisCoord) < 0.05 && Math.abs(ey2 - axisCoord) < 0.05);

                if (!isOnAxis) return null;

                const zBottom = zLevels[el.storyIndex];
                const zTop = zLevels[el.storyIndex + 1];

                const isSel = selectedElementIds.includes(el.id);
                const color = getElementColor(el, isSel);
                const stroke = getStrokeColor(el, isSel);

                const mapPt = (val: number, z: number) => ({
                    x: startX + toPx(val),
                    y: startY + toPx(totalHeight - z)
                });

                if (el.type === 'column' || el.type === 'shear_wall') {
                    const hPos = isXAxis ? ey1 : ex1;
                    const pBot = mapPt(hPos, zBottom);
                    const pTop = mapPt(hPos, zTop);
                    
                    let width = 0.4;
                    if (el.type === 'shear_wall') {
                        const dir = el.properties?.direction || 'x';
                        const w = (el.properties?.width || state.sections.wallLength) / 100;
                        const t = (el.properties?.depth || state.sections.wallThickness) / 100;
                        if (isXAxis) width = (dir === 'y') ? w : t;
                        else width = (dir === 'x') ? w : t;
                    } else if (el.type === 'column') {
                        const dir = el.properties?.direction || 'x';
                        const b_raw = (el.properties?.width || state.sections.colWidth) / 100; 
                        const h_raw = (el.properties?.depth || state.sections.colDepth) / 100;
                        
                        // Kesit görünümünde, bakış yönüne dik olan boyut genişliktir.
                        // X aksı kesiti (Y yönünde bakıyoruz): Kolonun Y boyutu görünürse...
                        // Basitleştirilmiş: X Aksında, X boyutu dikkate alınır (kesildiği yer) değil, projeksiyon genişliği.
                        // Eğer X aksındaysak, Y boyunca uzanan genişliği görürüz.
                        // Eğer Y aksındaysak, X boyunca uzanan genişliği görürüz.
                        if (isXAxis) width = (dir === 'y') ? b_raw : h_raw; // Y yönünde dönmüşse B, değilse H
                        else width = (dir === 'x') ? b_raw : h_raw;
                    }

                    const pxWidth = toPx(width);
                    return (
                        <rect key={el.id}
                            x={pTop.x - pxWidth/2} y={pTop.y}
                            width={pxWidth} height={Math.abs(pBot.y - pTop.y)}
                            fill={color} stroke={isSel ? stroke : 'none'}
                            strokeWidth={isSel ? 2 : 0}
                            onClick={(e) => handleElementClick(e, el.id)}
                        />
                    );

                } else if (el.type === 'beam') {
                    const h1 = isXAxis ? ey1 : ex1;
                    const h2 = isXAxis ? ey2 : ex2;
                    
                    const p1 = mapPt(h1, zTop);
                    const p2 = mapPt(h2, zTop);
                    const beamWidth = Math.abs(p2.x - p1.x);
                    const beamHeight = toPx(0.5); // Görsel kalınlık

                    // KİRİŞ DİYAGRAMLARI (Eğer Analiz Modundaysa)
                    let diagram = null;
                    if (displayMode === 'analysis' && results && results.memberResults) {
                        const uniqueId = `${el.id}_S${el.storyIndex}`;
                        const beamRes = results.memberResults.get(uniqueId);
                        
                        if (beamRes && beamWidth > 20) {
                            
                            const maxValM = Math.max(Math.abs(beamRes.maxM), Math.abs(beamRes.minM), 1);
                            const maxValV = beamRes.maxV > 0 ? beamRes.maxV : 1;
                            
                            // Grafik yüksekliği max 25px olsun
                            const scaleM = 25 / maxValM;
                            const scaleV = 25 / maxValV;
                            
                            const pathD = beamRes.diagramData.map((pt, i) => {
                                const px = p1.x + (pt.x / (beamRes.diagramData[beamRes.diagramData.length-1].x)) * beamWidth;
                                
                                let py = p1.y;
                                if (diagramType === 'M3') {
                                    py = p1.y + pt.M * scaleM; 
                                } else {
                                    py = p1.y - pt.V * scaleV; // Kesme için yukarı/aşağı (V pozitif yukarı)
                                }
                                
                                return `${i===0?'M':'L'} ${px} ${py}`;
                            }).join(' ');

                            const fillColor = diagramType === 'M3' ? "rgba(59, 130, 246, 0.6)" : "rgba(249, 115, 22, 0.6)";
                            const strokeColor = diagramType === 'M3' ? "blue" : "orange";

                            diagram = (
                                <path 
                                    d={`${pathD} L ${p2.x} ${p2.y} L ${p1.x} ${p1.y} Z`} 
                                    fill={fillColor}
                                    stroke={strokeColor} 
                                    strokeWidth={1} 
                                    pointerEvents="none"
                                />
                            );
                        }
                    }

                    return (
                        <g key={el.id}>
                            <line
                                x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                                stroke={isSel ? '#2563eb' : (displayMode === 'analysis' ? color : '#94a3b8')} // Analiz modunda çizgi rengi durum rengi olsun
                                strokeWidth={isSel ? 4 : 3}
                                onClick={(e) => handleElementClick(e, el.id)}
                            />
                            {diagram}
                        </g>
                    );
                }
                return null;
            })}
        </g>
    );
  };

  const render3D = () => {
    const renderables: any[] = [];

    definedElements.forEach(el => {
        if (el.storyIndex >= dimensions.storyCount) return;
        
        const zBot = zLevels[el.storyIndex];
        const zTop = zLevels[el.storyIndex + 1];
        
        const elX1 = xCoords[el.x1];
        const elY1 = yCoords[el.y1];
        
        let cx = elX1, cy = elY1, cz = (zBot + zTop)/2;

        if (el.type === 'column' || el.type === 'shear_wall') {
            const pBot = project3D(elX1, elY1, zBot);
            const pTop = project3D(elX1, elY1, zTop);
            
            renderables.push({
                id: el.id,
                type: 'line',
                points: [pBot, pTop],
                depth: elX1 + elY1 + zBot, 
                color: getElementColor(el, selectedElementIds.includes(el.id)),
                strokeWidth: el.type === 'shear_wall' ? 6 : 4
            });
        } else if (el.type === 'beam') {
             const elX2 = xCoords[el.x2!];
             const elY2 = yCoords[el.y2!];
             cx = (elX1 + elX2)/2;
             cy = (elY1 + elY2)/2;
             cz = zTop;

             const p1 = project3D(elX1, elY1, zTop);
             const p2 = project3D(elX2, elY2, zTop);

             renderables.push({
                 id: el.id,
                 type: 'line',
                 points: [p1, p2],
                 depth: cx + cy + cz,
                 color: getStrokeColor(el, selectedElementIds.includes(el.id)),
                 strokeWidth: 2
             });
        } else if (el.type === 'slab') {
             const elX2 = xCoords[el.x2!];
             const elY2 = yCoords[el.y2!];
             
             const z = zTop;
             const p1 = project3D(elX1, elY1, z);
             const p2 = project3D(elX2, elY1, z);
             const p3 = project3D(elX2, elY2, z);
             const p4 = project3D(elX1, elY2, z);

             let pts = [p1, p2, p3, p4];
             cx = (elX1 + elX2)/2; 
             cy = (elY1 + elY2)/2;

             if (el.properties?.segment) {
                  switch(el.properties.segment) {
                      case 'tl': pts = [p1, p2, p4]; break;
                      case 'br': pts = [p2, p3, p4]; break;
                      case 'tr': pts = [p1, p2, p3]; break;
                      case 'bl': pts = [p1, p4, p3]; break;
                  }
             }

             renderables.push({
                 id: el.id,
                 type: 'poly',
                 points: pts,
                 depth: cx + cy + z,
                 color: getElementColor(el, selectedElementIds.includes(el.id)),
                 opacity: 0.5
             });
        }
    });

    zLevels.forEach((z, i) => {
        const p1 = project3D(0, 0, z);
        const p2 = project3D(dimensions.lx, 0, z);
        const p3 = project3D(dimensions.lx, dimensions.ly, z);
        const p4 = project3D(0, dimensions.ly, z);
        
        renderables.push({
            id: `floor-${i}`,
            type: 'poly-stroke',
            points: [p1, p2, p3, p4],
            depth: -1000 + z, 
            color: '#e2e8f0',
            strokeWidth: 1
        });
    });

    renderables.sort((a, b) => a.depth - b.depth);

    return (
        <g>
            {renderables.map((r, i) => {
                const isSelected = selectedElementIds.includes(r.id);
                if (r.type === 'line') {
                    return <line key={r.id} x1={r.points[0].x} y1={r.points[0].y} x2={r.points[1].x} y2={r.points[1].y} stroke={r.color} strokeWidth={isSelected ? r.strokeWidth + 2 : r.strokeWidth} strokeLinecap="round" onClick={(e)=>handleElementClick(e, r.id)} />;
                } else if (r.type === 'poly') {
                    const pts = r.points.map((p: any) => `${p.x},${p.y}`).join(' ');
                    return <polygon key={r.id} points={pts} fill={r.color} fillOpacity={r.opacity} stroke={isSelected ? "#2563eb" : "none"} strokeWidth={isSelected ? 1 : 0} onClick={(e)=>handleElementClick(e, r.id)} />;
                } else if (r.type === 'poly-stroke') {
                    const pts = r.points.map((p: any) => `${p.x},${p.y}`).join(' ');
                    return <polygon key={r.id} points={pts} fill="none" stroke={r.color} strokeWidth={r.strokeWidth} strokeDasharray="4 2" />;
                }
                return null;
            })}
        </g>
    );
  };

  return (
    <div className={`w-full h-full bg-slate-50 border border-slate-200 rounded-xl overflow-hidden relative select-none group shadow-inner ${!interactive ? 'pointer-events-none' : ''}`}>
      <div className="absolute top-2 left-2 z-10 flex gap-2">
          <div className="bg-white/90 backdrop-blur px-2 py-1 rounded border shadow-sm text-[10px] text-slate-500 font-bold uppercase pointer-events-none flex gap-2 items-center">
            <span>{viewMode === 'plan' ? `PLAN: ${activeStory < dimensions.basementCount ? `${activeStory - dimensions.basementCount}. BODRUM` : activeStory - dimensions.basementCount === 0 ? 'ZEMİN KAT' : `${activeStory - dimensions.basementCount}. KAT`}` : viewMode === 'elevation' ? `KESİT: AKS ${activeAxisId}` : '3D GÖRÜNÜM'}</span>
            {selectedElementIds.length > 0 && <span className="bg-blue-100 text-blue-700 px-1 rounded">{selectedElementIds.length} Seçili</span>}
          </div>
          {displayMode === 'analysis' && (
              <div className="bg-white/90 backdrop-blur px-2 py-1 rounded border shadow-sm text-[10px] font-bold uppercase pointer-events-none flex gap-2 items-center animate-pulse">
                  <Activity className="w-3 h-3 text-green-600"/> <span>Analiz Sonuçları</span>
              </div>
          )}
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
         onContextMenu={(e) => e.preventDefault()}
         className={interactive ? (isPanning ? 'cursor-move' : (activeTool==='select'?'cursor-default':'cursor-crosshair')) : ''}
      >
         <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          
          <g transform={`translate(${offset.x}, ${offset.y}) scale(${zoom})`} style={{ transition: isPanning ? 'none' : 'transform 0.1s ease-out' }}>
             {viewMode === 'plan' && renderPlan()}
             {viewMode === 'elevation' && renderElevation()}
             {viewMode === '3d' && render3D()}
          </g>

          {/* BOX SELECTION OVERLAY */}
          {isBoxSelecting && boxStart && boxEnd && (
              <rect 
                  x={Math.min(boxStart.x, boxEnd.x)}
                  y={Math.min(boxStart.y, boxEnd.y)}
                  width={Math.abs(boxEnd.x - boxStart.x)}
                  height={Math.abs(boxEnd.y - boxStart.y)}
                  fill="#3b82f6"
                  fillOpacity="0.2"
                  stroke="#2563eb"
                  strokeWidth="1"
                  strokeDasharray="4 2"
                  pointerEvents="none"
              />
          )}
      </svg>
    </div>
  );
};

export default Visualizer;
