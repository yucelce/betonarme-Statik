

import React, { useState, useMemo, useEffect } from 'react';
import { AppState, SoilClass, ConcreteClass, CalculationResult, GridSettings, AxisData, ViewMode, EditorTool, UserElement } from './types';
import { calculateStructure } from './utils/solver';
import { Plus, Trash2, Play, FileText, Settings, LayoutGrid, Eye, EyeOff, X, Download, Upload, BarChart3, Edit3, Undo2, MousePointer2, Box, Square, Grip, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Layers, Weight, HardHat, Activity, Copy, Check, RectangleVertical, ArrowDownToLine } from 'lucide-react';
import Visualizer from './components/Visualizer';
import Report from './utils/report';
import BeamDetailPanel from './components/BeamDetailPanel';
import { generateModel } from './utils/modelGenerator';

const calculateTotalLength = (axes: AxisData[]) => axes.reduce((sum, axis) => sum + axis.spacing, 0);

const INITIAL_STATE: AppState = {
  grid: {
    xAxis: [{ id: 'x1', spacing: 5 }, { id: 'x2', spacing: 4 }],
    yAxis: [{ id: 'y1', spacing: 4 }, { id: 'y2', spacing: 5 }]
  },
  dimensions: {
    storyCount: 2,
    basementCount: 0,
    storyHeights: [4, 3], // Varsayılan kat yükseklikleri
    foundationHeight: 60, // Radye Kalınlığı (cm)
    foundationCantilever: 50, // Ampatman (cm)
    lx: 9, 
    ly: 9  
  },
  sections: {
    beamWidth: 25,
    beamDepth: 50,
    colWidth: 40,
    colDepth: 40,
    slabThickness: 15,
    wallThickness: 25,
    wallLength: 150
  },
  loads: {
    liveLoadKg: 200,
    deadLoadCoatingsKg: 150
  },
  seismic: {
    ss: 1.2, s1: 0.4, soilClass: SoilClass.ZC, Rx: 8, I: 1.0
  },
  materials: { concreteClass: ConcreteClass.C30 },
  rebars: {
    slabDia: 8, beamMainDia: 14, beamStirrupDia: 8,
    colMainDia: 16, colStirrupDia: 8, foundationDia: 14
  },
  definedElements: [] 
};

type AccordionSection = 'grid' | 'stories' | 'sections' | 'loads' | 'seismic' | 'foundation' | null;

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [results, setResults] = useState<CalculationResult | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'inputs' | 'report'>('inputs');
  const [activeTool, setActiveTool] = useState<EditorTool>('select');
  const [openSection, setOpenSection] = useState<AccordionSection>('grid');

  // Copy Story Modal State
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyTargets, setCopyTargets] = useState<number[]>([]);

  // AKS EKLEME STATE'LERİ
  const [newAxisSpacingX, setNewAxisSpacingX] = useState(4);
  const [newAxisSpacingY, setNewAxisSpacingY] = useState(4);

  // VIEW STATE
  const [mainViewMode, setMainViewMode] = useState<ViewMode>('plan');
  const [activeStory, setActiveStory] = useState(0); // 0 = En alt kat (Bodrum veya Zemin)
  const [activeAxisId, setActiveAxisId] = useState('X1');

  // Başlangıçta örnek yapı
  useEffect(() => {
     if (state.definedElements.length === 0) {
        // Her iki kat için de eleman ekleyelim
        const els: UserElement[] = [];
        for(let s=0; s<state.dimensions.storyCount; s++) {
            els.push(
                { id: `C-0-0-S${s}`, type: 'column', x1: 0, y1: 0, storyIndex: s },
                { id: `C-1-0-S${s}`, type: 'column', x1: 1, y1: 0, storyIndex: s },
                { id: `C-0-1-S${s}`, type: 'column', x1: 0, y1: 1, storyIndex: s },
                { id: `C-1-1-S${s}`, type: 'column', x1: 1, y1: 1, storyIndex: s },
                { id: `B-00-10-S${s}`, type: 'beam', x1: 0, y1: 0, x2: 1, y2: 0, storyIndex: s },
                { id: `B-00-01-S${s}`, type: 'beam', x1: 0, y1: 0, x2: 0, y2: 1, storyIndex: s },
                { id: `B-10-11-S${s}`, type: 'beam', x1: 1, y1: 0, x2: 1, y2: 1, storyIndex: s },
                { id: `B-01-11-S${s}`, type: 'beam', x1: 0, y1: 1, x2: 1, y2: 1, storyIndex: s },
                { id: `S-00-S${s}`, type: 'slab', x1: 0, y1: 0, x2: 1, y2: 1, storyIndex: s }
            );
        }
        setState(prev => ({...prev, definedElements: els}));
     }
  }, []);

  const updateState = (section: keyof AppState, payload: any) => {
    setState(prev => {
      const newState = { ...prev, [section]: { ...prev[section], ...payload } };
      if (section === 'grid') {
        newState.dimensions.lx = calculateTotalLength(newState.grid.xAxis);
        newState.dimensions.ly = calculateTotalLength(newState.grid.yAxis);
      }
      return newState;
    });
    setResults(null);
  };

  const toggleSection = (section: AccordionSection) => {
      setOpenSection(prev => prev === section ? null : section);
  };

  // Kat Yüksekliği Güncelleme
  const updateStoryHeight = (index: number, val: number) => {
      const newHeights = [...state.dimensions.storyHeights];
      newHeights[index] = val;
      updateState('dimensions', { storyHeights: newHeights });
  };
  
  // Kat Sayısı Güncelleme
  const updateStoryCount = (count: number) => {
      const current = state.dimensions.storyHeights;
      let newHeights = [...current];
      if (count > current.length) {
          // Yeni katlar ekle (varsayılan 3m)
          newHeights = [...newHeights, ...Array(count - current.length).fill(3)];
      } else {
          // Kat sil
          newHeights = newHeights.slice(0, count);
      }
      updateState('dimensions', { storyCount: count, storyHeights: newHeights });
  };

  const updateBasementCount = (count: number) => {
      if(count < 0 || count >= state.dimensions.storyCount) return;
      updateState('dimensions', { basementCount: count });
  };

  // --- ELEMAN YÖNETİMİ ---
  const handleElementAdd = (el: UserElement) => {
      // 1. OTOMATİK PARÇALAMA (AUTO-SEGMENTATION) - Sadece Ortogonal Kirişler İçin
      // Çapraz (Diagonal) kirişler bölünmez.
      const isDiagonal = el.type === 'beam' && el.x1 !== el.x2 && el.y1 !== el.y2;

      if (!isDiagonal && el.type === 'beam' && el.x2 !== undefined && el.y2 !== undefined) {
          const { x1, y1, x2, y2, storyIndex } = el;
          
          // Bu kattaki kolonları VE perdeleri al (Perdeler de kolon gibidir)
          const existingVerticals = state.definedElements.filter(e => (e.type === 'column' || e.type === 'shear_wall') && e.storyIndex === storyIndex);

          // Kiriş güzergahı üzerindeki dikey elemanları bul
          const intersectingElements = existingVerticals.filter(vert => {
              // Yatay Kiriş (y sabit, x değişiyor)
              if (y1 === y2 && vert.y1 === y1) {
                  return vert.x1 > Math.min(x1, x2) && vert.x1 < Math.max(x1, x2);
              }
              // Dikey Kiriş (x sabit, y değişiyor)
              if (x1 === x2 && vert.x1 === x1) {
                  return vert.y1 > Math.min(y1, y2) && vert.y1 < Math.max(y1, y2);
              }
              return false;
          });

          if (intersectingElements.length > 0) {
              intersectingElements.sort((a, b) => {
                 const distA = Math.abs(a.x1 - x1) + Math.abs(a.y1 - y1);
                 const distB = Math.abs(b.x1 - x1) + Math.abs(b.y1 - y1);
                 return distA - distB;
              });

              const newBeams: UserElement[] = [];
              let startX = x1;
              let startY = y1;
              const points = [...intersectingElements, { x1: x2, y1: y2 } as any]; 

              points.forEach((pt: any) => {
                  const endX = pt.x1; 
                  const endY = pt.y1;
                  const segId = `B-${startX}${startY}-${endX}${endY}`;
                  newBeams.push({
                      ...el, 
                      id: segId,
                      x1: startX,
                      y1: startY,
                      x2: endX,
                      y2: endY
                  });
                  startX = endX;
                  startY = endY;
              });

              setState(prev => ({ ...prev, definedElements: [...prev.definedElements, ...newBeams] }));
              setResults(null);
              return; 
          }
      }
      setState(prev => ({ ...prev, definedElements: [...prev.definedElements, el] }));
      setResults(null);
  };

  const handleElementRemove = (id: string) => {
      setState(prev => ({ ...prev, definedElements: prev.definedElements.filter(e => e.id !== id) }));
      setSelectedElementId(null);
      setResults(null);
  };
  
  const handleElementPropertyUpdate = (props: Partial<NonNullable<UserElement['properties']>>) => {
     if (!selectedElementId) return;
     setState(prev => ({
         ...prev,
         definedElements: prev.definedElements.map(el => {
             if (el.id === selectedElementId) {
                 return { ...el, properties: { ...el.properties, ...props } };
             }
             return el;
         })
     }));
     setResults(null);
  };

  const resetElementProperty = () => {
    if (!selectedElementId) return;
    setState(prev => ({
        ...prev,
        definedElements: prev.definedElements.map(el => el.id === selectedElementId ? { ...el, properties: undefined } : el)
    }));
    setResults(null);
  };

  // --- KAT KOPYALAMA ---
  const handleCopyStory = () => {
      if (copyTargets.length === 0) return;

      const sourceElements = state.definedElements.filter(e => e.storyIndex === activeStory);
      // Hedef katlardaki eski elemanları temizle
      let newDefinedElements = state.definedElements.filter(e => !copyTargets.includes(e.storyIndex));

      // Yeni elemanları oluştur
      const copiedElements: UserElement[] = [];
      copyTargets.forEach(targetIndex => {
          sourceElements.forEach(el => {
              // ID'yi benzersiz yap
              let newId = el.id.replace(`-S${activeStory}`, `-S${targetIndex}`);
              if (newId === el.id) {
                  newId = `${el.type}-${el.x1}-${el.y1}-${Math.random().toString(36).substr(2,4)}-S${targetIndex}`;
              }
              
              copiedElements.push({
                  ...el,
                  id: newId,
                  storyIndex: targetIndex
              });
          });
      });

      setState(prev => ({ ...prev, definedElements: [...newDefinedElements, ...copiedElements] }));
      setShowCopyModal(false);
      setCopyTargets([]);
      setResults(null);
      alert(`${sourceElements.length} eleman ${copyTargets.length} kata kopyalandı.`);
  };

  const toggleCopyTarget = (index: number) => {
      if (index === activeStory) return;
      setCopyTargets(prev => prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]);
  };

  // --- ANALİZ ---
  const handleCalculate = () => {
    try {
      const res = calculateStructure(state);
      setResults(res);
      setActiveTab('report');
    } catch (e) {
      console.error(e);
      alert("Hesaplama hatası. Lütfen yapının stabil olduğundan emin olun.");
    }
  };

  // Grid Fonksiyonları
  const addAxis = (axis: 'x' | 'y') => {
    const spacing = axis === 'x' ? newAxisSpacingX : newAxisSpacingY;
    if (spacing <= 0) return;
    const newAxis = { id: Math.random().toString(36).substr(2, 5), spacing };
    const currentAxes = axis === 'x' ? state.grid.xAxis : state.grid.yAxis;
    updateState('grid', { [axis === 'x' ? 'xAxis' : 'yAxis']: [...currentAxes, newAxis] });
  };
  
  const removeAxis = (axis: 'x' | 'y', index: number) => {
    const currentAxes = axis === 'x' ? state.grid.xAxis : state.grid.yAxis;
    if (currentAxes.length <= 1) return;
    const newAxes = [...currentAxes];
    newAxes.splice(index, 1);
    updateState('grid', { [axis === 'x' ? 'xAxis' : 'yAxis']: newAxes });
  };

  // AKS DEĞİŞTİRME MANTIĞI
  const axesList = [
      ...state.grid.xAxis.map((_, i) => `X${i+1}`),
      ...state.grid.yAxis.map((_, i) => `Y${i+1}`)
  ];
  const cycleAxis = (dir: 1 | -1) => {
      const idx = axesList.indexOf(activeAxisId);
      if(idx === -1) return;
      const newIdx = (idx + dir + axesList.length) % axesList.length;
      setActiveAxisId(axesList[newIdx]);
  };

  // KAT DEĞİŞTİRME
  const cycleStory = (dir: 1 | -1) => {
      setActiveStory(prev => {
          const next = prev + dir;
          if (next < 0) return 0;
          if (next >= state.dimensions.storyCount) return state.dimensions.storyCount - 1;
          return next;
      });
  };

  // Helper for Story Label
  const getStoryLabel = (index: number) => {
      if (index < state.dimensions.basementCount) {
          return `${index - state.dimensions.basementCount}. Bodrum`;
      }
      const aboveGroundIndex = index - state.dimensions.basementCount;
      return aboveGroundIndex === 0 ? 'Zemin Kat' : `${aboveGroundIndex}. Kat`;
  };

  return (
    <div className="h-screen bg-slate-100 flex flex-col font-sans text-slate-900 overflow-hidden relative">
      
      {/* HEADER */}
      <header className="bg-slate-900 text-white p-3 shadow-md z-20 shrink-0">
        <div className="container mx-auto flex flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-blue-400" />
            <div>
              <h1 className="text-lg font-bold tracking-tight">Betonarme CAD</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
             <div className="flex bg-slate-800 rounded-lg p-1 mr-2">
                <button onClick={() => setActiveTab('inputs')} className={`px-3 py-1 rounded-md text-xs flex items-center gap-2 ${activeTab === 'inputs' ? 'bg-blue-600' : 'text-slate-400'}`}><Edit3 className="w-3 h-3" /> Editör</button>
                <button onClick={() => results ? setActiveTab('report') : alert('Önce analiz yapmalısınız.')} className={`px-3 py-1 rounded-md text-xs flex items-center gap-2 ${activeTab === 'report' ? 'bg-blue-600' : 'text-slate-400'}`}><FileText className="w-3 h-3" /> Rapor</button>
             </div>
             {activeTab === 'inputs' && (
               <button onClick={() => setShowCopyModal(true)} className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 mr-2 border border-slate-600">
                  <Copy className="w-3 h-3" /> Kat Kopyala
               </button>
             )}
             <button onClick={handleCalculate} className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg font-bold text-sm flex items-center gap-2"><Play className="w-3 h-3 fill-current" /> ANALİZ</button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* LEFT PANEL (TOOLBAR ACCORDION) */}
        {activeTab === 'inputs' && (
          <div className="w-80 bg-white border-r border-slate-200 shadow-sm flex flex-col h-full z-10 shrink-0">
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
              
              {/* SECTION: GRID */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                 <button onClick={() => toggleSection('grid')} className="w-full bg-slate-50 p-3 border-b border-slate-100 flex items-center justify-between hover:bg-slate-100 transition-colors">
                    <span className="font-bold text-slate-700 text-sm flex items-center gap-2"><LayoutGrid className="w-4 h-4 text-blue-500"/> Aks Sistemi</span>
                    {openSection === 'grid' ? <ChevronUp className="w-4 h-4 text-slate-400"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
                 </button>
                 {openSection === 'grid' && (
                     <div className="p-3 bg-white space-y-4 animate-in slide-in-from-top-2 fade-in duration-200">
                        <div>
                            <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">X Yönü Açıklıklar (m)</div>
                            <div className="space-y-1">
                                {state.grid.xAxis.map((axis, i) => (
                                    <div key={axis.id} className="flex gap-1 items-center">
                                        <span className="w-6 text-center text-xs text-slate-400 font-mono">{i+1}</span>
                                        <input type="number" className="w-full border rounded p-1 text-xs bg-slate-50" value={axis.spacing} disabled />
                                        <button onClick={() => removeAxis('x', i)} className="text-red-300 hover:text-red-500 p-1"><Trash2 className="w-3 h-3"/></button>
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-1 mt-2 border-t pt-2">
                                <input type="number" className="w-full border rounded p-1 text-xs" placeholder="Mesafe (m)" value={newAxisSpacingX} onChange={(e) => setNewAxisSpacingX(Number(e.target.value))} />
                                <button onClick={() => addAxis('x')} className="bg-blue-600 text-white px-2 rounded text-xs"><Plus className="w-3 h-3"/></button>
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Y Yönü Açıklıklar (m)</div>
                            <div className="space-y-1">
                                {state.grid.yAxis.map((axis, i) => (
                                    <div key={axis.id} className="flex gap-1 items-center">
                                        <span className="w-6 text-center text-xs text-slate-400 font-mono">{String.fromCharCode(65+i)}</span>
                                        <input type="number" className="w-full border rounded p-1 text-xs bg-slate-50" value={axis.spacing} disabled />
                                        <button onClick={() => removeAxis('y', i)} className="text-red-300 hover:text-red-500 p-1"><Trash2 className="w-3 h-3"/></button>
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-1 mt-2 border-t pt-2">
                                <input type="number" className="w-full border rounded p-1 text-xs" placeholder="Mesafe (m)" value={newAxisSpacingY} onChange={(e) => setNewAxisSpacingY(Number(e.target.value))} />
                                <button onClick={() => addAxis('y')} className="bg-blue-600 text-white px-2 rounded text-xs"><Plus className="w-3 h-3"/></button>
                            </div>
                        </div>
                     </div>
                 )}
              </div>

              {/* SECTION: STORIES */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                 <button onClick={() => toggleSection('stories')} className="w-full bg-slate-50 p-3 border-b border-slate-100 flex items-center justify-between hover:bg-slate-100 transition-colors">
                    <span className="font-bold text-slate-700 text-sm flex items-center gap-2"><Layers className="w-4 h-4 text-purple-500"/> Katlar & Bodrum</span>
                    {openSection === 'stories' ? <ChevronUp className="w-4 h-4 text-slate-400"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
                 </button>
                 {openSection === 'stories' && (
                     <div className="p-3 bg-white space-y-3 text-xs animate-in slide-in-from-top-2 fade-in duration-200">
                         <div>
                             <label className="block text-slate-500 mb-1">Toplam Kat Adedi</label>
                             <input type="number" min="1" max="20" className="w-full border rounded p-1" value={state.dimensions.storyCount} onChange={(e) => updateStoryCount(Number(e.target.value))} />
                         </div>
                         <div>
                             <label className="block text-slate-500 mb-1 flex items-center gap-1"><HardHat className="w-3 h-3"/> Bodrum Kat Sayısı</label>
                             <input type="number" min="0" max={state.dimensions.storyCount-1} className="w-full border rounded p-1" value={state.dimensions.basementCount} onChange={(e) => updateBasementCount(Number(e.target.value))} />
                             <p className="text-[10px] text-slate-400 mt-1">Bodrum katlar yüksek rijitlikli kabul edilir.</p>
                         </div>
                         <div className="border-t pt-2 mt-2">
                             <label className="block text-slate-500 mb-1 font-bold">Kat Yükseklikleri (m)</label>
                             <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                                 {state.dimensions.storyHeights.map((h, i) => (
                                     <div key={i} className="flex items-center gap-2">
                                         <span className={`w-20 ${i < state.dimensions.basementCount ? 'text-purple-600 font-bold' : 'text-slate-400'}`}>
                                             {getStoryLabel(i)}
                                         </span>
                                         <input type="number" step="0.1" className="flex-1 border rounded p-1" value={h} onChange={(e) => updateStoryHeight(i, Number(e.target.value))} />
                                     </div>
                                 ))}
                             </div>
                         </div>
                     </div>
                 )}
              </div>

               {/* SECTION: FOUNDATION (YENİ) */}
               <div className="border border-slate-200 rounded-lg overflow-hidden">
                 <button onClick={() => toggleSection('foundation')} className="w-full bg-slate-50 p-3 border-b border-slate-100 flex items-center justify-between hover:bg-slate-100 transition-colors">
                    <span className="font-bold text-slate-700 text-sm flex items-center gap-2"><ArrowDownToLine className="w-4 h-4 text-emerald-600"/> Temel (Radye)</span>
                    {openSection === 'foundation' ? <ChevronUp className="w-4 h-4 text-slate-400"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
                 </button>
                 {openSection === 'foundation' && (
                     <div className="p-3 bg-white grid grid-cols-2 gap-2 text-xs animate-in slide-in-from-top-2 fade-in duration-200">
                        <div>
                            <label className="block text-slate-400 mb-0.5">Radye Kalınlığı (cm)</label>
                            <input type="number" className="w-full border rounded p-1" value={state.dimensions.foundationHeight} onChange={(e) => updateState('dimensions', { foundationHeight: Number(e.target.value) })} />
                        </div>
                        <div>
                            <label className="block text-slate-400 mb-0.5">Ampatman (cm)</label>
                            <input type="number" className="w-full border rounded p-1" value={state.dimensions.foundationCantilever} onChange={(e) => updateState('dimensions', { foundationCantilever: Number(e.target.value) })} />
                        </div>
                        <div className="col-span-2 text-[10px] text-slate-400 bg-slate-50 p-1.5 rounded border border-slate-100 mt-1">
                            Not: Tüm yapının altına, dış akslardan ampatman kadar taşan tek parça radye temel tanımlanır.
                        </div>
                     </div>
                 )}
              </div>

              {/* SECTION: SECTIONS */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                 <button onClick={() => toggleSection('sections')} className="w-full bg-slate-50 p-3 border-b border-slate-100 flex items-center justify-between hover:bg-slate-100 transition-colors">
                    <span className="font-bold text-slate-700 text-sm flex items-center gap-2"><Settings className="w-4 h-4 text-slate-500"/> Genel Kesitler</span>
                    {openSection === 'sections' ? <ChevronUp className="w-4 h-4 text-slate-400"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
                 </button>
                 {openSection === 'sections' && (
                     <div className="p-3 bg-white grid grid-cols-2 gap-2 text-xs animate-in slide-in-from-top-2 fade-in duration-200">
                        <div><label className="block text-slate-400 mb-0.5">Kiriş B/H</label><div className="flex gap-1"><input value={state.sections.beamWidth} onChange={(e)=>updateState('sections', {beamWidth:Number(e.target.value)})} className="w-full border rounded p-1" /><input value={state.sections.beamDepth} onChange={(e)=>updateState('sections', {beamDepth:Number(e.target.value)})} className="w-full border rounded p-1" /></div></div>
                        <div><label className="block text-slate-400 mb-0.5">Kolon B/H</label><div className="flex gap-1"><input value={state.sections.colWidth} onChange={(e)=>updateState('sections', {colWidth:Number(e.target.value)})} className="w-full border rounded p-1" /><input value={state.sections.colDepth} onChange={(e)=>updateState('sections', {colDepth:Number(e.target.value)})} className="w-full border rounded p-1" /></div></div>
                        <div><label className="block text-slate-400 mb-0.5">Döşeme Kal. (cm)</label><input type="number" value={state.sections.slabThickness} onChange={(e)=>updateState('sections', {slabThickness:Number(e.target.value)})} className="w-full border rounded p-1" /></div>
                        <div><label className="block text-slate-400 mb-0.5">Perde B/L</label><div className="flex gap-1"><input value={state.sections.wallThickness} onChange={(e)=>updateState('sections', {wallThickness:Number(e.target.value)})} className="w-full border rounded p-1" title="Kalınlık"/><input value={state.sections.wallLength} onChange={(e)=>updateState('sections', {wallLength:Number(e.target.value)})} className="w-full border rounded p-1" title="Uzunluk"/></div></div>
                     </div>
                 )}
              </div>

              {/* SECTION: LOADS */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                 <button onClick={() => toggleSection('loads')} className="w-full bg-slate-50 p-3 border-b border-slate-100 flex items-center justify-between hover:bg-slate-100 transition-colors">
                    <span className="font-bold text-slate-700 text-sm flex items-center gap-2"><Weight className="w-4 h-4 text-orange-500"/> Yükler</span>
                    {openSection === 'loads' ? <ChevronUp className="w-4 h-4 text-slate-400"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
                 </button>
                 {openSection === 'loads' && (
                     <div className="p-3 bg-white grid grid-cols-2 gap-2 text-xs animate-in slide-in-from-top-2 fade-in duration-200">
                        <div>
                            <label className="block text-slate-400 mb-0.5">Hareketli (kg/m²)</label>
                            <input type="number" className="w-full border rounded p-1" value={state.loads.liveLoadKg} onChange={(e) => updateState('loads', { liveLoadKg: Number(e.target.value) })} />
                        </div>
                        <div>
                            <label className="block text-slate-400 mb-0.5">Kaplama (kg/m²)</label>
                            <input type="number" className="w-full border rounded p-1" value={state.loads.deadLoadCoatingsKg} onChange={(e) => updateState('loads', { deadLoadCoatingsKg: Number(e.target.value) })} />
                        </div>
                     </div>
                 )}
              </div>

               {/* SECTION: SEISMIC & SOIL */}
               <div className="border border-slate-200 rounded-lg overflow-hidden">
                 <button onClick={() => toggleSection('seismic')} className="w-full bg-slate-50 p-3 border-b border-slate-100 flex items-center justify-between hover:bg-slate-100 transition-colors">
                    <span className="font-bold text-slate-700 text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-red-500"/> Deprem & Zemin</span>
                    {openSection === 'seismic' ? <ChevronUp className="w-4 h-4 text-slate-400"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
                 </button>
                 {openSection === 'seismic' && (
                     <div className="p-3 bg-white space-y-3 text-xs animate-in slide-in-from-top-2 fade-in duration-200">
                         <div>
                             <label className="block text-slate-500 mb-1">Zemin Sınıfı</label>
                             <select 
                                className="w-full border rounded p-1 bg-slate-50"
                                value={state.seismic.soilClass}
                                onChange={(e) => updateState('seismic', { soilClass: e.target.value as SoilClass })}
                             >
                                {Object.values(SoilClass).map(sc => <option key={sc} value={sc}>{sc}</option>)}
                             </select>
                         </div>
                         <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-slate-500 mb-0.5">Ss (Kısa Periyot)</label>
                                <input type="number" step="0.1" className="w-full border rounded p-1" value={state.seismic.ss} onChange={(e) => updateState('seismic', { ss: Number(e.target.value) })} />
                            </div>
                            <div>
                                <label className="block text-slate-500 mb-0.5">S1 (1 sn Periyot)</label>
                                <input type="number" step="0.1" className="w-full border rounded p-1" value={state.seismic.s1} onChange={(e) => updateState('seismic', { s1: Number(e.target.value) })} />
                            </div>
                         </div>
                         <div className="grid grid-cols-2 gap-2">
                             <div>
                                 <label className="block text-slate-500 mb-0.5">Rx (Davranış)</label>
                                 <input type="number" className="w-full border rounded p-1" value={state.seismic.Rx} onChange={(e) => updateState('seismic', { Rx: Number(e.target.value) })} />
                             </div>
                             <div>
                                 <label className="block text-slate-500 mb-0.5">I (Önem Kat.)</label>
                                 <input type="number" step="0.1" className="w-full border rounded p-1" value={state.seismic.I} onChange={(e) => updateState('seismic', { I: Number(e.target.value) })} />
                             </div>
                         </div>
                     </div>
                 )}
              </div>

            </div>
          </div>
        )}

        {/* VISUALIZER AREA */}
        <div className="flex-1 relative bg-slate-100 h-full overflow-hidden flex flex-col">
           
           {/* TOOLBAR (Only in Plan Mode) */}
           {activeTab === 'inputs' && mainViewMode === 'plan' && (
               <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 bg-white p-1.5 rounded-lg shadow-md border border-slate-200">
                   {[
                       { id: 'select', icon: MousePointer2, label: 'Seç' },
                       { id: 'column', icon: Box, label: 'Kolon' },
                       { id: 'shear_wall', icon: RectangleVertical, label: 'Perde' },
                       { id: 'beam', icon: Grip, label: 'Kiriş' },
                       { id: 'slab', icon: Square, label: 'Döşeme' },
                       { id: 'delete', icon: Trash2, label: 'Sil' },
                   ].map(tool => (
                       <button 
                         key={tool.id}
                         onClick={() => setActiveTool(tool.id as EditorTool)}
                         className={`p-2 rounded transition-colors flex items-center justify-center relative group ${activeTool === tool.id ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                         title={tool.label}
                       >
                           <tool.icon className="w-5 h-5" />
                       </button>
                   ))}
               </div>
           )}

           {/* NAVIGATION CONTROLS */}
           {activeTab === 'inputs' && (
               <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-4">
                   {/* Story Nav */}
                   {mainViewMode === 'plan' && (
                       <div className="bg-white p-1 rounded-full shadow-lg border border-slate-200 flex items-center gap-2 px-3">
                           <button onClick={() => cycleStory(-1)} className="p-1 hover:bg-slate-100 rounded-full"><ChevronDown className="w-5 h-5"/></button>
                           <div className="text-sm font-bold w-32 text-center whitespace-nowrap">{getStoryLabel(activeStory)}</div>
                           <button onClick={() => cycleStory(1)} className="p-1 hover:bg-slate-100 rounded-full"><ChevronUp className="w-5 h-5"/></button>
                       </div>
                   )}
                   {/* Axis Nav */}
                   {mainViewMode === 'elevation' && (
                       <div className="bg-white p-1 rounded-full shadow-lg border border-slate-200 flex items-center gap-2 px-3">
                           <button onClick={() => cycleAxis(-1)} className="p-1 hover:bg-slate-100 rounded-full"><ChevronLeft className="w-5 h-5"/></button>
                           <div className="text-sm font-bold w-24 text-center">AKS: {activeAxisId}</div>
                           <button onClick={() => cycleAxis(1)} className="p-1 hover:bg-slate-100 rounded-full"><ChevronRight className="w-5 h-5"/></button>
                       </div>
                   )}
               </div>
           )}
           
           {/* MAIN CANVAS */}
           <div className="flex-1 w-full h-full relative p-0 bg-slate-200/50">
                <Visualizer 
                    state={state} 
                    activeTool={activeTool}
                    viewMode={mainViewMode}
                    activeStory={activeStory}
                    activeAxisId={activeAxisId}
                    onElementAdd={handleElementAdd}
                    onElementRemove={handleElementRemove}
                    onElementSelect={setSelectedElementId}
                    selectedElementId={selectedElementId}
                    interactive={true}
                    results={results} // Results prop olarak eklendi
                />
           </div>

           {/* MINI PREVIEWS (Top Right) */}
           {activeTab === 'inputs' && (
             <div className="absolute top-4 right-4 z-20 flex flex-col gap-3">
                 {/* Mini Elevation/Axis View */}
                 {mainViewMode !== 'elevation' && (
                     <div 
                        onClick={() => setMainViewMode('elevation')}
                        className="w-40 h-32 bg-white rounded-lg shadow-lg border-2 border-white hover:border-blue-400 cursor-pointer overflow-hidden relative group transition-all"
                     >
                        <div className="absolute inset-0 pointer-events-none">
                            <Visualizer state={state} activeTool="select" viewMode="elevation" activeStory={activeStory} activeAxisId={activeAxisId} interactive={false} results={results}/>
                        </div>
                        <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1 rounded">KESİT</div>
                     </div>
                 )}

                 {/* Mini Plan View */}
                 {mainViewMode !== 'plan' && (
                     <div 
                        onClick={() => setMainViewMode('plan')}
                        className="w-40 h-32 bg-white rounded-lg shadow-lg border-2 border-white hover:border-blue-400 cursor-pointer overflow-hidden relative group transition-all"
                     >
                        <div className="absolute inset-0 pointer-events-none">
                            <Visualizer state={state} activeTool="select" viewMode="plan" activeStory={activeStory} activeAxisId={activeAxisId} interactive={false} results={results} />
                        </div>
                        <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1 rounded">PLAN</div>
                     </div>
                 )}

                 {/* Mini 3D View */}
                 {mainViewMode !== '3d' && (
                     <div 
                        onClick={() => setMainViewMode('3d')}
                        className="w-40 h-32 bg-white rounded-lg shadow-lg border-2 border-white hover:border-blue-400 cursor-pointer overflow-hidden relative group transition-all"
                     >
                        <div className="absolute inset-0 pointer-events-none">
                            <Visualizer state={state} activeTool="select" viewMode="3d" activeStory={activeStory} activeAxisId={activeAxisId} interactive={false} results={results}/>
                        </div>
                        <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1 rounded">3D</div>
                     </div>
                 )}
             </div>
           )}

           {/* Element Properties Popup */}
           {selectedElementId && activeTool === 'select' && activeTab === 'inputs' && (
                <div className="absolute bottom-4 left-4 w-60 bg-white rounded-lg shadow-xl border border-slate-200 p-4 animate-in fade-in slide-in-from-left-4 z-20">
                    <div className="flex justify-between items-center mb-2 border-b pb-2">
                            <h4 className="font-bold text-xs text-slate-700">ELEMAN ÖZELLİKLERİ</h4>
                            <button onClick={() => setSelectedElementId(null)}><X className="w-3 h-3 text-slate-400"/></button>
                    </div>
                    {(() => {
                        const el = state.definedElements.find(e => e.id === selectedElementId);
                        if (!el) return null;
                        
                        // Perde mi?
                        const isWall = el.type === 'shear_wall';
                        
                        const w = el.properties?.width ?? (el.type === 'beam' ? state.sections.beamWidth : (isWall ? state.sections.wallLength : state.sections.colWidth));
                        const d = el.properties?.depth ?? (el.type === 'beam' ? state.sections.beamDepth : (isWall ? state.sections.wallThickness : state.sections.colDepth));
                        const t = el.properties?.thickness ?? state.sections.slabThickness;
                        const wallL = el.properties?.wallLoad ?? 3.5;
                        const liveL = el.properties?.liveLoad ?? state.loads.liveLoadKg;
                        
                        // Perde Properties
                        const direction = el.properties?.direction || 'x';
                        const alignment = el.properties?.alignment || 'center';

                        return (
                            <div className="space-y-3">
                                <div className="text-[10px] font-mono bg-slate-50 p-1 text-center rounded text-slate-500 border border-slate-100">{el.id}</div>
                                
                                {/* KİRİŞ VE KOLON/PERDE BOYUTLARI */}
                                {(el.type === 'column' || el.type === 'beam' || isWall) && (
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400">{isWall ? 'UZUNLUK (cm)' : 'GENİŞLİK (cm)'}</label>
                                            <input type="number" className="w-full border rounded p-1 text-sm font-semibold text-slate-700" value={w} onChange={(e) => handleElementPropertyUpdate({ width: Number(e.target.value) })} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400">{isWall ? 'KALINLIK (cm)' : 'YÜKSEKLİK (cm)'}</label>
                                            <input type="number" className="w-full border rounded p-1 text-sm font-semibold text-slate-700" value={d} onChange={(e) => handleElementPropertyUpdate({ depth: Number(e.target.value) })} />
                                        </div>
                                    </div>
                                )}
                                
                                {/* PERDE ÖZEL AYARLARI */}
                                {isWall && (
                                    <>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400">YÖN</label>
                                            <div className="flex gap-2">
                                                <button onClick={()=>handleElementPropertyUpdate({direction:'x'})} className={`flex-1 text-xs border rounded p-1 ${direction==='x'?'bg-blue-100 border-blue-300 text-blue-700':'bg-slate-50 text-slate-500'}`}>X Yönü</button>
                                                <button onClick={()=>handleElementPropertyUpdate({direction:'y'})} className={`flex-1 text-xs border rounded p-1 ${direction==='y'?'bg-blue-100 border-blue-300 text-blue-700':'bg-slate-50 text-slate-500'}`}>Y Yönü</button>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400">YERLEŞİM (Düğüm Noktası)</label>
                                            <select 
                                                className="w-full border rounded p-1 text-xs bg-slate-50"
                                                value={alignment}
                                                onChange={(e) => handleElementPropertyUpdate({ alignment: e.target.value as any })}
                                            >
                                                <option value="center">Merkez</option>
                                                <option value="start">Sol / Üst</option>
                                                <option value="end">Sağ / Alt</option>
                                            </select>
                                        </div>
                                    </>
                                )}
                                
                                {/* KİRİŞ YÜKÜ */}
                                {el.type === 'beam' && (
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400">DUVAR YÜKÜ (kN/m)</label>
                                        <input type="number" step="0.1" className="w-full border rounded p-1 text-sm font-semibold text-slate-700" value={wallL} onChange={(e) => handleElementPropertyUpdate({ wallLoad: Number(e.target.value) })} />
                                    </div>
                                )}

                                {/* DÖŞEME ÖZELLİKLERİ */}
                                {el.type === 'slab' && (
                                    <div className="space-y-2">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400">KALINLIK (cm)</label>
                                            <input type="number" className="w-full border rounded p-1 text-sm font-semibold text-slate-700" value={t} onChange={(e) => handleElementPropertyUpdate({ thickness: Number(e.target.value) })} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400">HAREKETLİ YÜK (kg/m²)</label>
                                            <input type="number" className="w-full border rounded p-1 text-sm font-semibold text-slate-700" value={liveL} onChange={(e) => handleElementPropertyUpdate({ liveLoad: Number(e.target.value) })} />
                                        </div>
                                    </div>
                                )}

                                {el.properties && <button onClick={resetElementProperty} className="text-xs text-red-500 w-full text-center hover:underline">Varsayılana Dön</button>}
                            </div>
                        )
                    })()}
                </div>
           )}

           {activeTab === 'report' && results && (
             <div className="absolute inset-0 bg-white z-30 overflow-auto p-6">
                <button onClick={() => setActiveTab('inputs')} className="fixed top-20 right-8 bg-slate-800 text-white p-2 rounded-full shadow-lg z-50 hover:bg-slate-700"><X className="w-6 h-6"/></button>
                <Report state={state} results={results} />
             </div>
           )}
        </div>

        {/* COPY STORY MODAL */}
        {showCopyModal && (
            <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md animate-in zoom-in-95 duration-200">
                    <div className="flex justify-between items-center border-b pb-4 mb-4">
                        <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Copy className="w-5 h-5"/> Kat Kopyala</h3>
                        <button onClick={() => setShowCopyModal(false)}><X className="w-5 h-5 text-slate-400 hover:text-red-500"/></button>
                    </div>
                    <div className="mb-4">
                        <p className="text-sm text-slate-600 mb-2">
                            Kaynak Kat: <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">{getStoryLabel(activeStory)}</span>
                        </p>
                        <p className="text-xs text-slate-500 mb-3">
                            Aşağıdaki katları seçtiğinizde, kaynak kattaki tüm elemanlar (kolon, kiriş, döşeme) hedef katlara kopyalanacak ve hedef katlardaki mevcut elemanlar silinecektir.
                        </p>
                        <div className="max-h-60 overflow-y-auto border rounded-lg divide-y">
                            {state.dimensions.storyHeights.map((_, idx) => (
                                <div 
                                    key={idx} 
                                    onClick={() => toggleCopyTarget(idx)}
                                    className={`p-3 text-sm flex items-center justify-between cursor-pointer transition-colors ${idx === activeStory ? 'bg-slate-50 opacity-50 cursor-not-allowed' : 'hover:bg-slate-50'}`}
                                >
                                    <span className={idx === activeStory ? 'text-slate-400' : 'text-slate-700'}>{getStoryLabel(idx)} {idx === activeStory && '(Kaynak)'}</span>
                                    {copyTargets.includes(idx) && <Check className="w-4 h-4 text-green-600"/>}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                        <button onClick={() => setShowCopyModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">İptal</button>
                        <button 
                            onClick={handleCopyStory} 
                            disabled={copyTargets.length === 0}
                            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-bold"
                        >
                            Kopyala ({copyTargets.length})
                        </button>
                    </div>
                </div>
            </div>
        )}

      </main>
    </div>
  );
};

export default App;
