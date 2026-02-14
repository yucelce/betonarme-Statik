
import React, { useState, useMemo, useEffect } from 'react';
import { AppState, SoilClass, ConcreteClass, CalculationResult, GridSettings, AxisData, ViewMode, EditorTool, UserElement, StandardType } from './types';
import { calculateStructure } from './utils/solver';
import { Plus, Trash2, Play, FileText, Settings, LayoutGrid, Eye, EyeOff, X, Download, Upload, BarChart3, Edit3, Undo2, MousePointer2, Box, Square, Grip, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Layers, Weight, HardHat, Activity, Copy, Check, RectangleVertical, ArrowDownToLine, MousePointerClick, Activity as ActivityIcon, BarChart2, RefreshCw, Loader2, Tag, PenLine } from 'lucide-react';
import Visualizer from './components/Visualizer';
import Report from './utils/report';
import BeamDetailPanel from './components/BeamDetailPanel';
import { generateModel } from './utils/modelGenerator';
import { resolveElementProperties } from './utils/shared';

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
  standardTypes: [
      { id: 'T1', name: 'K30x60', type: 'beam', properties: { width: 30, depth: 60, wallLoad: 5.0 } },
      { id: 'T2', name: 'S40x40', type: 'column', properties: { width: 40, depth: 40 } },
      { id: 'T3', name: 'Döşeme 15cm', type: 'slab', properties: { thickness: 15, liveLoad: 200 } }
  ],
  definedElements: [] 
};

type AccordionSection = 'grid' | 'stories' | 'loads' | 'seismic' | 'foundation' | 'types' | null;

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [results, setResults] = useState<CalculationResult | null>(null);
  const [isDirty, setIsDirty] = useState(false); // Yeni Dirty State
  const [isAnalyzing, setIsAnalyzing] = useState(false); // Yükleme Durumu
  const [showAnalysisSuccess, setShowAnalysisSuccess] = useState(false); // Başarı Bildirimi
  
  // ÇOKLU SEÇİM İÇİN STATE
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  
  // KESİT TİPLERİ UI STATE
  const [activeTypeId, setActiveTypeId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'inputs' | 'report'>('inputs');
  const [activeTool, setActiveTool] = useState<EditorTool>('select');
  const [openSection, setOpenSection] = useState<AccordionSection>('grid');

  // Copy Story Modal State
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyTargets, setCopyTargets] = useState<number[]>([]);

  // AKS EKLEME STATE'LERİ
  const [newAxisSpacingX, setNewAxisSpacingX] = useState(4);
  const [newAxisSpacingY, setNewAxisSpacingY] = useState(4);

  // TYPE EKLEME STATE'LERİ
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeKind, setNewTypeKind] = useState<'column' | 'beam' | 'slab' | 'shear_wall'>('column');

  // VIEW STATE
  const [mainViewMode, setMainViewMode] = useState<ViewMode>('plan');
  const [activeStory, setActiveStory] = useState(0); // 0 = En alt kat (Bodrum veya Zemin)
  const [activeAxisId, setActiveAxisId] = useState('X1');
  
  // ANALİZ SONUÇ GÖRÜNÜM MODU
  const [displayMode, setDisplayMode] = useState<'physical' | 'analysis'>('physical');
  const [diagramType, setDiagramType] = useState<'M3' | 'V2'>('M3');

  // Memoize Model Generation
  const generatedModel = useMemo(() => generateModel(state), [state.grid, state.dimensions, state.definedElements, state.standardTypes]);

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

  useEffect(() => {
      if (showAnalysisSuccess) {
          const timer = setTimeout(() => setShowAnalysisSuccess(false), 3000);
          return () => clearTimeout(timer);
      }
  }, [showAnalysisSuccess]);

  const updateState = (section: keyof AppState, payload: any) => {
    setState(prev => {
      const newState = { ...prev, [section]: { ...prev[section], ...payload } };
      if (section === 'grid') {
        newState.dimensions.lx = calculateTotalLength(newState.grid.xAxis);
        newState.dimensions.ly = calculateTotalLength(newState.grid.yAxis);
      }
      return newState;
    });
    setIsDirty(true); // Veri değiştiğinde dirty olarak işaretle
    setDisplayMode('physical'); 
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
      
      const validElements = state.definedElements.filter(e => e.storyIndex < count);

      if (count > current.length) {
          newHeights = [...newHeights, ...Array(count - current.length).fill(3)];
      } else {
          newHeights = newHeights.slice(0, count);
      }

      const newBasementCount = Math.min(state.dimensions.basementCount, count - 1 < 0 ? 0 : count - 1);

      setState(prev => ({
          ...prev,
          dimensions: { 
              ...prev.dimensions, 
              storyCount: count, 
              storyHeights: newHeights,
              basementCount: newBasementCount 
          },
          definedElements: validElements
      }));
      setIsDirty(true);
      
      if (activeStory >= count) {
          setActiveStory(Math.max(0, count - 1));
      }
  };

  const updateBasementCount = (count: number) => {
      if(count < 0 || count >= state.dimensions.storyCount) return;
      updateState('dimensions', { basementCount: count });
  };

  // --- TYPE MANAGEMENT ---
  const addStandardType = () => {
      if (!newTypeName.trim()) return;
      const newId = `T-${Date.now()}`;
      const newType: StandardType = {
          id: newId,
          name: newTypeName,
          type: newTypeKind,
          properties: {
              width: newTypeKind === 'column' ? state.sections.colWidth : (newTypeKind === 'shear_wall' ? state.sections.wallLength : (newTypeKind === 'beam' ? state.sections.beamWidth : undefined)),
              depth: newTypeKind === 'column' ? state.sections.colDepth : (newTypeKind === 'shear_wall' ? state.sections.wallThickness : (newTypeKind === 'beam' ? state.sections.beamDepth : undefined)),
              thickness: newTypeKind === 'slab' ? state.sections.slabThickness : undefined,
              wallLoad: newTypeKind === 'beam' ? 3.5 : undefined,
              liveLoad: newTypeKind === 'slab' ? state.loads.liveLoadKg : undefined
          }
      };
      
      setState(prev => ({ ...prev, standardTypes: [...prev.standardTypes, newType] }));
      setNewTypeName('');
      setActiveTypeId(newId); // Yeni ekleneni otomatik aç
      setIsDirty(true);
  };

  const removeStandardType = (id: string, e: React.MouseEvent) => {
      e.stopPropagation(); // Parent click'i engelle
      setState(prev => ({
          ...prev,
          standardTypes: prev.standardTypes.filter(t => t.id !== id),
          // Bu tipe bağlı elemanların tipini sıfırla
          definedElements: prev.definedElements.map(el => el.typeId === id ? { ...el, typeId: undefined } : el)
      }));
      if(activeTypeId === id) setActiveTypeId(null);
      setIsDirty(true);
  };

  const updateStandardType = (id: string, props: Partial<StandardType['properties']>) => {
      setState(prev => ({
          ...prev,
          standardTypes: prev.standardTypes.map(t => t.id === id ? { ...t, properties: { ...t.properties, ...props } } : t)
      }));
      setIsDirty(true);
  };

  // --- TOOL DEĞİŞİMİ VE FİLTRELEME ---
  const handleToolChange = (toolId: EditorTool) => {
      setActiveTool(toolId);
      
      // İSTEK: Tool değişince seçimi o tiple filtrele
      if (toolId !== 'select' && toolId !== 'delete') {
          // Eğer seçim varsa, o tipteki elemanları filtrele
          if (selectedElementIds.length > 0) {
              const filtered = selectedElementIds.filter(id => {
                  const el = state.definedElements.find(e => e.id === id);
                  return el?.type === toolId;
              });
              
              if (filtered.length > 0) {
                  setSelectedElementIds(filtered);
              } else {
                  // Seçimde bu tip yoksa seçimi temizle, çizim moduna geç
                  setSelectedElementIds([]);
              }
          }
      }
  };

  // --- ELEMAN YÖNETİMİ ---
  const handleElementAdd = (el: UserElement) => {
      // 1. DÜŞEY ELEMAN ÇAKIŞMA KONTROLÜ (Kolon vs Perde)
      // Kullanıcı bir kolon veya perde eklemeye çalışıyorsa, o noktada başka bir düşey eleman olup olmadığını kontrol et.
      if (el.type === 'column' || el.type === 'shear_wall') {
          const occupiedNode = state.definedElements.find(existing => 
              existing.storyIndex === el.storyIndex &&
              (existing.type === 'column' || existing.type === 'shear_wall') &&
              existing.x1 === el.x1 && existing.y1 === el.y1
          );

          if (occupiedNode) {
              alert(`Bu düğüm noktasında zaten bir düşey taşıyıcı (${occupiedNode.type === 'column' ? 'Kolon' : 'Perde'}) mevcut. Aynı noktaya birden fazla düşey taşıyıcı eklenemez.`);
              return;
          }
      }

      // 2. GENEL ÇAKIŞMA KONTROLÜ (Overlap Check - Aynı tipteki elemanların çakışması)
      const isDuplicate = state.definedElements.some(existing => {
          if (existing.storyIndex !== el.storyIndex) return false;
          if (existing.type !== el.type) return false;

          // Noktasal Elemanlar (Kolon, Perde)
          // Bu kısım aslında yukarıdaki check ile kapsanıyor ama aynı tip için (Kolon-Kolon) burada kalması güvenli.
          if (el.type === 'column' || el.type === 'shear_wall') {
              return existing.x1 === el.x1 && existing.y1 === el.y1;
          }

          // Çizgisel Elemanlar (Kiriş) - Yön bağımsız kontrol
          if (el.type === 'beam') {
              const sameDir = existing.x1 === el.x1 && existing.y1 === el.y1 && existing.x2 === el.x2 && existing.y2 === el.y2;
              const reverseDir = existing.x1 === el.x2 && existing.y1 === el.y2 && existing.x2 === el.x1 && existing.y2 === el.y1;
              return sameDir || reverseDir;
          }

          // Alan Elemanlar (Döşeme)
          if (el.type === 'slab') {
              // Üçgen ise segment kontrolü de yapılmalı
              if (el.properties?.segment && existing.properties?.segment) {
                  return existing.x1 === el.x1 && existing.y1 === el.y1 && 
                         existing.x2 === el.x2 && existing.y2 === el.y2 && 
                         existing.properties.segment === el.properties.segment;
              }
              return existing.x1 === el.x1 && existing.y1 === el.y1 && existing.x2 === el.x2 && existing.y2 === el.y2;
          }

          return false;
      });

      if (isDuplicate) {
          console.warn("Bu noktada zaten aynı tipte bir eleman mevcut.");
          return; // Ekleme yapma
      }

      const isDiagonal = el.type === 'beam' && el.x1 !== el.x2 && el.y1 !== el.y2;

      // KİRİŞ BÖLME MANTIĞI (Mevcut Logic)
      if (!isDiagonal && el.type === 'beam' && el.x2 !== undefined && el.y2 !== undefined) {
          const { x1, y1, x2, y2, storyIndex } = el;
          const existingVerticals = state.definedElements.filter(e => (e.type === 'column' || e.type === 'shear_wall') && e.storyIndex === storyIndex);

          const intersectingElements = existingVerticals.filter(vert => {
              if (y1 === y2 && vert.y1 === y1) {
                  return vert.x1 > Math.min(x1, x2) && vert.x1 < Math.max(x1, x2);
              }
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
                  // Kiriş bölerken de ID'ye story suffix ekle
                  const segId = `B-${startX}${startY}-${endX}${endY}-S${storyIndex}`;
                  
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
              setIsDirty(true);
              return; 
          }
      }
      setState(prev => ({ ...prev, definedElements: [...prev.definedElements, el] }));
      setIsDirty(true);
  };

  const handleElementRemove = (id: string) => {
      setState(prev => ({ ...prev, definedElements: prev.definedElements.filter(e => e.id !== id) }));
      setSelectedElementIds(prev => prev.filter(selId => selId !== id));
      setIsDirty(true);
  };
  
  // TOPLU GÜNCELLEME İÇİN DEĞİŞTİRİLDİ
  const handleElementPropertyUpdate = (updates: Partial<UserElement['properties']> & { typeId?: string }) => {
     if (selectedElementIds.length === 0) return;
     
     const { typeId, ...props } = updates;

     setState(prev => ({
         ...prev,
         definedElements: prev.definedElements.map(el => {
             // Seçili olan TÜM elemanları güncelle
             if (selectedElementIds.includes(el.id)) {
                 const newEl = { ...el };
                 
                 // Tip güncelleniyorsa ata
                 if (typeId !== undefined) {
                     newEl.typeId = typeId || undefined; // Boş string ise undefined yap
                 }

                 // Özellikler güncelleniyorsa ata (Manuel override)
                 if (Object.keys(props).length > 0) {
                     newEl.properties = { ...newEl.properties, ...props };
                 }
                 
                 return newEl;
             }
             return el;
         })
     }));
     setIsDirty(true);
  };

  const resetElementProperty = () => {
    if (selectedElementIds.length === 0) return;
    setState(prev => ({
        ...prev,
        definedElements: prev.definedElements.map(el => selectedElementIds.includes(el.id) ? { ...el, properties: undefined, typeId: undefined } : el)
    }));
    setIsDirty(true);
  };

  // --- ÇOKLU SEÇİM LOGIC ---
  const handleMultiSelect = (ids: string[]) => {
    setSelectedElementIds(ids);
  };

  // --- KAT KOPYALAMA ---
  const handleCopyStory = () => {
      if (copyTargets.length === 0) return;

      const sourceElements = state.definedElements.filter(e => e.storyIndex === activeStory);
      // Hedef katlardaki eski elemanları temizle
      let newDefinedElements = state.definedElements.filter(e => !copyTargets.includes(e.storyIndex));

      const copiedElements: UserElement[] = [];
      const stats = { beams: 0, columns: 0, slabs: 0 };

      copyTargets.forEach(targetIndex => {
          sourceElements.forEach(el => {
              // ID Üretimi: Mevcut ID'nin sonundaki -S{activeStory} kısmını -S{targetIndex} ile değiştir
              const suffix = `-S${activeStory}`;
              let newId = el.id;
              
              if (newId.endsWith(suffix)) {
                  newId = newId.slice(0, -suffix.length) + `-S${targetIndex}`;
              } else {
                  // Eğer manuel eklenmiş eski tip bir ID ise (suffix yoksa), yeni suffix ekle
                  newId = `${newId}-S${targetIndex}`;
              }
              
              copiedElements.push({
                  ...el,
                  id: newId,
                  storyIndex: targetIndex
              });

              if (el.type === 'beam') stats.beams++;
              else if (el.type === 'slab') stats.slabs++;
              else stats.columns++;
          });
      });

      setState(prev => ({ ...prev, definedElements: [...newDefinedElements, ...copiedElements] }));
      setShowCopyModal(false);
      setCopyTargets([]);
      setIsDirty(true);
      
      const totalCopied = stats.beams + stats.columns + stats.slabs;
      alert(`${totalCopied} eleman kopyalandı:\n- ${stats.columns} Kolon/Perde\n- ${stats.beams} Kiriş\n- ${stats.slabs} Döşeme`);
  };

  const toggleCopyTarget = (index: number) => {
      if (index === activeStory) return;
      setCopyTargets(prev => prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]);
  };

  // --- ANALİZ (ASYNC) ---
  const handleCalculate = async () => {
    setIsAnalyzing(true);
    
    // UI'ın render edilmesi için kısa bir gecikme
    setTimeout(() => {
        try {
            const res = calculateStructure(state);
            setResults(res);
            setIsDirty(false); 
            setActiveTab('report');
            setDisplayMode('analysis');
            setShowAnalysisSuccess(true);
        } catch (e) {
            console.error(e);
            alert("Hesaplama hatası. Lütfen yapının stabil olduğundan emin olun.");
        } finally {
            setIsAnalyzing(false);
        }
    }, 500); // 500ms simüle edilmiş işlem süresi veya render fırsatı
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

  const cycleStory = (dir: 1 | -1) => {
      setActiveStory(prev => {
          const next = prev + dir;
          if (next < 0) return 0;
          if (next >= state.dimensions.storyCount) return state.dimensions.storyCount - 1;
          return next;
      });
  };

  const getStoryLabel = (index: number) => {
      if (index < state.dimensions.basementCount) {
          return `${index - state.dimensions.basementCount}. Bodrum`;
      }
      const aboveGroundIndex = index - state.dimensions.basementCount;
      return aboveGroundIndex === 0 ? 'Zemin Kat' : `${aboveGroundIndex}. Kat`;
  };

  // --- SEÇİLEN ELEMANLARIN ORTAK TİPİNİ BULMA VE PANEL HAZIRLIĞI ---
  const getSelectedElementsSummary = () => {
      if (selectedElementIds.length === 0) return null;
      
      const selectedEls = state.definedElements.filter(e => selectedElementIds.includes(e.id));
      if (selectedEls.length === 0) return null;

      // Hangi tipler seçili?
      const types = new Set(selectedEls.map(e => e.type));
      
      // Eğer tek tip varsa (örn: Sadece Kolonlar)
      if (types.size === 1) {
          return {
              type: Array.from(types)[0],
              count: selectedEls.length,
              elements: selectedEls
          };
      }

      // Karışık tip varsa, 'Mixed' dön
      return {
          type: 'mixed',
          count: selectedEls.length,
          elements: selectedEls
      };
  };

  const selectionSummary = getSelectedElementsSummary();

  return (
    <div className="h-screen bg-slate-100 flex flex-col font-sans text-slate-900 overflow-hidden relative">
      
      {/* ANALİZ LOADING OVERLAY */}
      {isAnalyzing && (
          <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-200">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
              <h2 className="text-xl font-bold text-slate-800">Analiz Yapılıyor...</h2>
              <p className="text-slate-500 mt-2">Lütfen bekleyiniz, yapı modeli çözülüyor.</p>
          </div>
      )}

      {/* ANALİZ BAŞARI BİLDİRİMİ */}
      {showAnalysisSuccess && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-6 py-3 rounded-lg shadow-xl flex items-center gap-3 animate-in slide-in-from-top-4 fade-in duration-300">
              <Check className="w-5 h-5" />
              <span className="font-bold">Analiz Başarıyla Tamamlandı</span>
          </div>
      )}

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
             <button 
                onClick={handleCalculate} 
                disabled={isAnalyzing}
                className={`px-4 py-1.5 rounded-lg font-bold text-sm flex items-center gap-2 transition-all shadow-md ${isDirty ? 'bg-orange-500 hover:bg-orange-600 text-white animate-pulse' : 'bg-green-600 hover:bg-green-700 text-white'} disabled:opacity-50 disabled:cursor-not-allowed`}
             >
                {isAnalyzing ? <RefreshCw className="w-3 h-3 animate-spin"/> : (isDirty ? <RefreshCw className="w-3 h-3"/> : <Play className="w-3 h-3 fill-current" />)} 
                {isAnalyzing ? 'HESAPLANIYOR' : (isDirty ? 'ANALİZİ GÜNCELLE' : 'ANALİZ')}
             </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* LEFT PANEL */}
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

               {/* SECTION: FOUNDATION */}
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

              {/* SECTION: STANDARD TYPES (YENİ) */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                 <button onClick={() => toggleSection('types')} className="w-full bg-slate-50 p-3 border-b border-slate-100 flex items-center justify-between hover:bg-slate-100 transition-colors">
                    <span className="font-bold text-slate-700 text-sm flex items-center gap-2"><Tag className="w-4 h-4 text-pink-500"/> Kesit Tipleri</span>
                    {openSection === 'types' ? <ChevronUp className="w-4 h-4 text-slate-400"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
                 </button>
                 {openSection === 'types' && (
                     <div className="p-3 bg-white space-y-3 text-xs animate-in slide-in-from-top-2 fade-in duration-200">
                         
                         {/* Tip Listesi (Yenilenmiş - Accordion Style) */}
                         <div className="space-y-2">
                             {state.standardTypes.map(t => (
                                 <div 
                                    key={t.id} 
                                    className={`border rounded overflow-hidden transition-all ${activeTypeId === t.id ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-100' : 'bg-slate-50 hover:bg-slate-100 border-slate-200'}`}
                                 >
                                     <div 
                                        className="flex justify-between items-center p-2 cursor-pointer select-none"
                                        onClick={() => setActiveTypeId(prev => prev === t.id ? null : t.id)}
                                     >
                                         <div className="font-bold text-slate-700 flex items-center gap-2">
                                             {t.type === 'column' && <Box className="w-3 h-3 text-slate-500"/>}
                                             {t.type === 'beam' && <Grip className="w-3 h-3 text-slate-500"/>}
                                             {t.type === 'slab' && <Square className="w-3 h-3 text-slate-500"/>}
                                             {t.type === 'shear_wall' && <RectangleVertical className="w-3 h-3 text-slate-500"/>}
                                             <span className={activeTypeId === t.id ? 'text-blue-700' : ''}>{t.name}</span>
                                         </div>
                                         <div className="flex items-center gap-1">
                                             {activeTypeId === t.id ? <ChevronUp className="w-3 h-3 text-slate-400"/> : <ChevronDown className="w-3 h-3 text-slate-400"/>}
                                             <button onClick={(e) => removeStandardType(t.id, e)} className="p-1 hover:bg-red-100 rounded text-slate-400 hover:text-red-500 transition-colors">
                                                 <X className="w-3 h-3"/>
                                             </button>
                                         </div>
                                     </div>
                                     
                                     {/* Expanded Content */}
                                     {activeTypeId === t.id && (
                                         <div className="p-2 border-t border-blue-200 bg-white grid grid-cols-2 gap-2 animate-in slide-in-from-top-1 fade-in duration-200">
                                             {t.type !== 'slab' && (
                                                 <>
                                                    <div><label className="text-[9px] text-slate-400 block mb-0.5">Genişlik (cm)</label><input type="number" className="w-full border rounded p-1 text-xs" value={t.properties.width || ''} onChange={(e) => updateStandardType(t.id, {width: Number(e.target.value)})} /></div>
                                                    <div><label className="text-[9px] text-slate-400 block mb-0.5">{t.type === 'shear_wall' ? 'Kalınlık (cm)' : 'Derinlik (cm)'}</label><input type="number" className="w-full border rounded p-1 text-xs" value={t.properties.depth || ''} onChange={(e) => updateStandardType(t.id, {depth: Number(e.target.value)})} /></div>
                                                 </>
                                             )}
                                             {t.type === 'slab' && (
                                                 <>
                                                    <div><label className="text-[9px] text-slate-400 block mb-0.5">Kalınlık (cm)</label><input type="number" className="w-full border rounded p-1 text-xs" value={t.properties.thickness || ''} onChange={(e) => updateStandardType(t.id, {thickness: Number(e.target.value)})} /></div>
                                                    <div><label className="text-[9px] text-slate-400 block mb-0.5">Yük (kg/m²)</label><input type="number" className="w-full border rounded p-1 text-xs" value={t.properties.liveLoad || ''} onChange={(e) => updateStandardType(t.id, {liveLoad: Number(e.target.value)})} /></div>
                                                 </>
                                             )}
                                             {t.type === 'beam' && (
                                                 <div className="col-span-2"><label className="text-[9px] text-slate-400 block mb-0.5">Duvar Yükü (kN/m)</label><input type="number" className="w-full border rounded p-1 text-xs" value={t.properties.wallLoad || ''} onChange={(e) => updateStandardType(t.id, {wallLoad: Number(e.target.value)})} /></div>
                                             )}
                                         </div>
                                     )}
                                 </div>
                             ))}
                         </div>

                         {/* Yeni Tip Ekleme */}
                         <div className="border-t pt-2 mt-2">
                             <label className="block text-slate-500 mb-1 font-bold flex items-center gap-1"><PenLine className="w-3 h-3"/> Yeni Tip Oluştur</label>
                             <div className="flex gap-1 mb-1">
                                 <input className="w-full border rounded p-1" placeholder="İsim (Örn: K1)" value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)}/>
                                 <select className="border rounded p-1 bg-white text-xs" value={newTypeKind} onChange={(e) => setNewTypeKind(e.target.value as any)}>
                                     <option value="column">Kolon</option>
                                     <option value="beam">Kiriş</option>
                                     <option value="slab">Döşeme</option>
                                     <option value="shear_wall">Perde</option>
                                 </select>
                             </div>
                             <button onClick={addStandardType} className="w-full bg-blue-600 text-white p-1 rounded flex items-center justify-center gap-1 hover:bg-blue-700 disabled:opacity-50 transition-colors text-xs font-bold shadow-sm" disabled={!newTypeName}><Plus className="w-3 h-3"/> Ekle</button>
                         </div>
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

               {/* SECTION: SEISMIC */}
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
           
           {/* TOOLBAR */}
           {activeTab === 'inputs' && (
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
                         onClick={() => handleToolChange(tool.id as EditorTool)}
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
                   {(mainViewMode === 'plan' || mainViewMode === '3d') && (
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
                    
                    selectedElementIds={selectedElementIds} 
                    onMultiElementSelect={handleMultiSelect} 

                    interactive={true}
                    results={results} 
                    displayMode={displayMode} 
                    diagramType={diagramType}
                    model={generatedModel} // Memoize edilmiş model gönderiliyor
                />
           </div>

           {/* MINI PREVIEWS (Top Right) */}
           {activeTab === 'inputs' && (
             <div className="absolute top-4 right-4 z-20 flex flex-col gap-3">
                 
                 {/* GÖRÜNÜM MODU SEÇİCİ (Eğer sonuç varsa) */}
                 {results && (
                     <div className="flex flex-col gap-2">
                         <div className="bg-white p-1 rounded-lg shadow-md border border-slate-200 flex gap-1">
                             <button 
                                onClick={() => setDisplayMode('physical')}
                                className={`flex-1 text-[10px] font-bold px-2 py-1 rounded flex items-center justify-center gap-1 ${displayMode === 'physical' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                             >
                                 <Box className="w-3 h-3"/> Fiziksel
                             </button>
                             <button 
                                onClick={() => setDisplayMode('analysis')}
                                className={`flex-1 text-[10px] font-bold px-2 py-1 rounded flex items-center justify-center gap-1 ${displayMode === 'analysis' ? 'bg-green-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                             >
                                 <ActivityIcon className="w-3 h-3"/> Sonuçlar
                             </button>
                         </div>
                         
                         {/* DİYAGRAM TİPİ SEÇİCİ (Sadece Analiz Modunda ve Kesit Görünümünde) */}
                         {displayMode === 'analysis' && mainViewMode === 'elevation' && (
                             <div className="bg-white p-1 rounded-lg shadow-md border border-slate-200 flex gap-1 animate-in fade-in slide-in-from-right-2">
                                <button 
                                    onClick={() => setDiagramType('M3')}
                                    className={`flex-1 text-[10px] font-bold px-2 py-1 rounded flex items-center justify-center gap-1 ${diagramType === 'M3' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                                >
                                    <ActivityIcon className="w-3 h-3"/> M3
                                </button>
                                <button 
                                    onClick={() => setDiagramType('V2')}
                                    className={`flex-1 text-[10px] font-bold px-2 py-1 rounded flex items-center justify-center gap-1 ${diagramType === 'V2' ? 'bg-orange-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                                >
                                    <BarChart2 className="w-3 h-3"/> V2
                                </button>
                             </div>
                         )}
                     </div>
                 )}

                 {/* Mini Elevation */}
                 {mainViewMode !== 'elevation' && (
                     <div 
                        onClick={() => setMainViewMode('elevation')}
                        className="w-40 h-32 bg-white rounded-lg shadow-lg border-2 border-white hover:border-blue-400 cursor-pointer overflow-hidden relative group transition-all"
                     >
                        <div className="absolute inset-0 pointer-events-none">
                            <Visualizer state={state} activeTool="select" viewMode="elevation" activeStory={activeStory} activeAxisId={activeAxisId} interactive={false} results={results} selectedElementIds={[]} displayMode={displayMode} diagramType={diagramType} model={generatedModel}/>
                        </div>
                        <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1 rounded">KESİT</div>
                     </div>
                 )}
                 {/* Mini Plan */}
                 {mainViewMode !== 'plan' && (
                     <div 
                        onClick={() => setMainViewMode('plan')}
                        className="w-40 h-32 bg-white rounded-lg shadow-lg border-2 border-white hover:border-blue-400 cursor-pointer overflow-hidden relative group transition-all"
                     >
                        <div className="absolute inset-0 pointer-events-none">
                            <Visualizer state={state} activeTool="select" viewMode="plan" activeStory={activeStory} activeAxisId={activeAxisId} interactive={false} results={results} selectedElementIds={[]} displayMode={displayMode} model={generatedModel}/>
                        </div>
                        <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1 rounded">PLAN</div>
                     </div>
                 )}
                 {/* Mini 3D */}
                 {mainViewMode !== '3d' && (
                     <div 
                        onClick={() => setMainViewMode('3d')}
                        className="w-40 h-32 bg-white rounded-lg shadow-lg border-2 border-white hover:border-blue-400 cursor-pointer overflow-hidden relative group transition-all"
                     >
                        <div className="absolute inset-0 pointer-events-none">
                            <Visualizer state={state} activeTool="select" viewMode="3d" activeStory={activeStory} activeAxisId={activeAxisId} interactive={false} results={results} selectedElementIds={[]} displayMode={displayMode} model={generatedModel}/>
                        </div>
                        <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1 rounded">3D</div>
                     </div>
                 )}
             </div>
           )}

           {/* ELEMAN ÖZELLİK PANELİ */}
           {selectionSummary && activeTab === 'inputs' && (
                <div className="absolute bottom-4 left-4 w-64 bg-white rounded-lg shadow-xl border border-slate-200 p-4 animate-in fade-in slide-in-from-left-4 z-20">
                    <div className="flex justify-between items-center mb-2 border-b pb-2">
                            <h4 className="font-bold text-xs text-slate-700 flex items-center gap-2">
                                <MousePointerClick className="w-3 h-3"/>
                                {selectionSummary.count > 1 ? `SEÇİM (${selectionSummary.count})` : 'ELEMAN ÖZELLİKLERİ'}
                            </h4>
                            <button onClick={() => setSelectedElementIds([])}><X className="w-3 h-3 text-slate-400"/></button>
                    </div>
                    {(() => {
                        if (selectionSummary.type === 'mixed') {
                            return (
                                <div className="text-xs text-slate-500 text-center py-2">
                                    <p>Farklı tipte elemanlar seçildi.</p>
                                    <p className="mt-1">Düzenleme yapmak için tek tip eleman seçiniz.</p>
                                    <button onClick={() => {
                                        state.definedElements.forEach(el => {
                                            if (selectedElementIds.includes(el.id)) handleElementRemove(el.id);
                                        });
                                    }} className="mt-3 bg-red-50 text-red-600 px-3 py-1 rounded w-full border border-red-100 flex items-center justify-center gap-1 hover:bg-red-100">
                                        <Trash2 className="w-3 h-3"/> Seçilenleri Sil
                                    </button>
                                </div>
                            );
                        }

                        // Ortak Tip İçin Form (İlk elemandan varsayılan değerleri alalım)
                        const sampleEl = selectionSummary.elements[0];
                        const isWall = sampleEl.type === 'shear_wall';
                        const elType = sampleEl.type;
                        
                        // Önce tipten veya manuelden resolve edilmiş verileri al
                        const resolvedProps = resolveElementProperties(state, sampleEl);

                        // Kullanıcı arayüzünde "Manuel" değer olup olmadığını anlamak için direkt el.properties'e bakıyoruz
                        const manualProps = sampleEl.properties || {};
                        const currentTypeId = sampleEl.typeId || "";

                        // Mevcut tipe uygun standart tipleri filtrele
                        const availableTypes = state.standardTypes.filter(t => t.type === elType);

                        const w = manualProps.width ?? resolvedProps.width;
                        const d = manualProps.depth ?? resolvedProps.depth;
                        const t = manualProps.thickness ?? resolvedProps.thickness;
                        const wallL = manualProps.wallLoad ?? resolvedProps.wallLoad;
                        const liveL = manualProps.liveLoad ?? resolvedProps.liveLoad;
                        
                        const direction = resolvedProps.direction;
                        const alignment = resolvedProps.alignment;

                        return (
                            <div className="space-y-3">
                                {selectionSummary.count === 1 && <div className="text-[10px] font-mono bg-slate-50 p-1 text-center rounded text-slate-500 border border-slate-100">{sampleEl.id}</div>}
                                
                                {/* TİP SEÇİMİ */}
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 flex items-center gap-1"><Tag className="w-3 h-3"/> KESİT TİPİ</label>
                                    <select 
                                        className="w-full border rounded p-1 text-xs font-semibold text-slate-700 bg-white"
                                        value={currentTypeId}
                                        onChange={(e) => handleElementPropertyUpdate({ typeId: e.target.value })}
                                    >
                                        <option value="">Manuel / Varsayılan</option>
                                        {availableTypes.map(typ => (
                                            <option key={typ.id} value={typ.id}>{typ.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* KİRİŞ VE KOLON/PERDE BOYUTLARI */}
                                {(elType === 'column' || elType === 'beam' || isWall) && (
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400">{isWall ? 'UZUNLUK (cm)' : 'GENİŞLİK (cm)'}</label>
                                            <input type="number" className={`w-full border rounded p-1 text-sm font-semibold ${manualProps.width !== undefined ? 'text-blue-600 bg-blue-50 border-blue-200' : 'text-slate-700'}`} placeholder={selectionSummary.count > 1 ? "(Çoklu)" : ""} value={w} onChange={(e) => handleElementPropertyUpdate({ width: Number(e.target.value) })} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400">{isWall ? 'KALINLIK (cm)' : 'YÜKSEKLİK (cm)'}</label>
                                            <input type="number" className={`w-full border rounded p-1 text-sm font-semibold ${manualProps.depth !== undefined ? 'text-blue-600 bg-blue-50 border-blue-200' : 'text-slate-700'}`} placeholder={selectionSummary.count > 1 ? "(Çoklu)" : ""} value={d} onChange={(e) => handleElementPropertyUpdate({ depth: Number(e.target.value) })} />
                                        </div>
                                    </div>
                                )}
                                
                                {/* PERDE ÖZEL AYARLARI */}
                                {isWall && (
                                    <>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400">YÖN</label>
                                            <div className="flex gap-2">
                                                <button onClick={()=>handleElementPropertyUpdate({direction:'x'})} className={`flex-1 text-xs border rounded p-1 ${direction==='x' && selectionSummary.count === 1 ? 'bg-blue-100 border-blue-300 text-blue-700':'bg-slate-50 text-slate-500'}`}>X Yönü</button>
                                                <button onClick={()=>handleElementPropertyUpdate({direction:'y'})} className={`flex-1 text-xs border rounded p-1 ${direction==='y' && selectionSummary.count === 1 ? 'bg-blue-100 border-blue-300 text-blue-700':'bg-slate-50 text-slate-500'}`}>Y Yönü</button>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400">YERLEŞİM</label>
                                            <select 
                                                className="w-full border rounded p-1 text-xs bg-slate-50"
                                                defaultValue={selectionSummary.count > 1 ? "" : alignment}
                                                onChange={(e) => handleElementPropertyUpdate({ alignment: e.target.value as any })}
                                            >
                                                {selectionSummary.count > 1 && <option value="" disabled>Seçiniz</option>}
                                                <option value="center">Merkez</option>
                                                <option value="start">Sol / Üst</option>
                                                <option value="end">Sağ / Alt</option>
                                            </select>
                                        </div>
                                    </>
                                )}
                                
                                {/* KİRİŞ YÜKÜ */}
                                {elType === 'beam' && (
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400">DUVAR YÜKÜ (kN/m)</label>
                                        <input type="number" step="0.1" className={`w-full border rounded p-1 text-sm font-semibold ${manualProps.wallLoad !== undefined ? 'text-blue-600 bg-blue-50 border-blue-200' : 'text-slate-700'}`} placeholder={selectionSummary.count > 1 ? "(Çoklu)" : ""} value={wallL} onChange={(e) => handleElementPropertyUpdate({ wallLoad: Number(e.target.value) })} />
                                    </div>
                                )}

                                {/* DÖŞEME ÖZELLİKLERİ */}
                                {elType === 'slab' && (
                                    <div className="space-y-2">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400">KALINLIK (cm)</label>
                                            <input type="number" className={`w-full border rounded p-1 text-sm font-semibold ${manualProps.thickness !== undefined ? 'text-blue-600 bg-blue-50 border-blue-200' : 'text-slate-700'}`} placeholder={selectionSummary.count > 1 ? "(Çoklu)" : ""} value={t} onChange={(e) => handleElementPropertyUpdate({ thickness: Number(e.target.value) })} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400">HAREKETLİ YÜK (kg/m²)</label>
                                            <input type="number" className={`w-full border rounded p-1 text-sm font-semibold ${manualProps.liveLoad !== undefined ? 'text-blue-600 bg-blue-50 border-blue-200' : 'text-slate-700'}`} placeholder={selectionSummary.count > 1 ? "(Çoklu)" : ""} value={liveL} onChange={(e) => handleElementPropertyUpdate({ liveLoad: Number(e.target.value) })} />
                                        </div>
                                    </div>
                                )}

                                <div className="pt-2 border-t flex gap-2">
                                    <button onClick={resetElementProperty} className="flex-1 text-xs text-slate-500 border rounded py-1 hover:bg-slate-50" title="Tüm manuel ayarları ve tip seçimini sıfırlar">Sıfırla</button>
                                    {selectionSummary.count > 1 && (
                                        <button onClick={() => {
                                            state.definedElements.forEach(el => {
                                                if (selectedElementIds.includes(el.id)) handleElementRemove(el.id);
                                            });
                                        }} className="text-xs text-red-500 border border-red-200 bg-red-50 rounded py-1 px-2 hover:bg-red-100"><Trash2 className="w-3 h-3"/></button>
                                    )}
                                </div>
                            </div>
                        )
                    })()}
                </div>
           )}

           {/* activeTab === 'report' ... same code ... */}
           {activeTab === 'report' && results && (
             <div className="absolute inset-0 bg-white z-30 overflow-auto p-6">
                <button onClick={() => setActiveTab('inputs')} className="fixed top-20 right-8 bg-slate-800 text-white p-2 rounded-full shadow-lg z-50 hover:bg-slate-700"><X className="w-6 h-6"/></button>
                <Report state={state} results={results} />
             </div>
           )}
        </div>

        {/* COPY STORY MODAL (Same as before) */}
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
