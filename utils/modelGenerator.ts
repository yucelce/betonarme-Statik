
// utils/modelGenerator.ts
import { AppState, StructuralModel, NodeEntity, ColumnEntity, BeamEntity, SlabEntity } from "../types";

export const generateModel = (state: AppState): StructuralModel => {
  const { grid, sections, definedElements, dimensions } = state;
  
  const nodes: NodeEntity[] = [];
  const columns: ColumnEntity[] = [];
  const beams: BeamEntity[] = [];
  const slabs: SlabEntity[] = [];

  // 1. Grid Koordinatlarını Hesapla
  const xSpacings = [0, ...grid.xAxis.map(a => a.spacing)];
  const ySpacings = [0, ...grid.yAxis.map(a => a.spacing)];

  const xCoords = xSpacings.map((_, i) => xSpacings.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const yCoords = ySpacings.map((_, i) => ySpacings.slice(0, i + 1).reduce((a, b) => a + b, 0));

  // 2. Tüm Katlar İçin Düğüm Noktaları
  for (let i = 0; i < yCoords.length; i++) {
    for (let j = 0; j < xCoords.length; j++) {
      const nodeId = `N-${j}-${i}`;
      nodes.push({ 
        id: nodeId, 
        x: xCoords[j], 
        y: yCoords[i], 
        axisX: `X${j + 1}`, 
        axisY: `Y${i + 1}` 
      });
    }
  }

  // 3. Kullanıcı Elemanlarını Modele Dönüştür
  definedElements.forEach(el => {
    // GÜVENLİK KONTROLÜ
    if (el.storyIndex >= dimensions.storyCount) return;

    const uniqueId = `${el.id}_S${el.storyIndex}`;
    const isBasement = el.storyIndex < dimensions.basementCount;

    // --- KOLONLAR VE PERDELER ---
    if (el.type === 'column' || el.type === 'shear_wall') {
      const nodeId = `N-${el.x1}-${el.y1}`;
      let b = sections.colWidth;
      let h = sections.colDepth;

      if (el.type === 'shear_wall') {
          const len = el.properties?.width || sections.wallLength;
          const thk = el.properties?.depth || sections.wallThickness;
          const dir = el.properties?.direction || 'x';
          
          if (dir === 'x') { b = len; h = thk; } else { b = thk; h = len; }
      } else {
          b = el.properties?.width || sections.colWidth;
          h = el.properties?.depth || sections.colDepth;
      }

      columns.push({
        id: uniqueId,
        nodeId: nodeId,
        b: b,
        h: h,
        isBasement,
        type: el.type
      });
    }

    // --- KİRİŞLER ---
    else if (el.type === 'beam' && el.x2 !== undefined && el.y2 !== undefined) {
      const n1 = `N-${el.x1}-${el.y1}`;
      const n2 = `N-${el.x2}-${el.y2}`;
      
      const x1_pos = xCoords[el.x1];
      const y1_pos = yCoords[el.y1];
      const x2_pos = xCoords[el.x2];
      const y2_pos = yCoords[el.y2];
      const length = Math.sqrt(Math.pow(x2_pos - x1_pos, 2) + Math.pow(y2_pos - y1_pos, 2));

      let direction: 'X' | 'Y' | 'D' = 'D';
      let axisId = '';
      
      if (Math.abs(y1_pos - y2_pos) < 0.01) { 
        direction = 'X'; 
        axisId = `Y${el.y1 + 1}`; 
      } else if (Math.abs(x1_pos - x2_pos) < 0.01) { 
        direction = 'Y';
        axisId = `X${el.x1 + 1}`; 
      } else {
        direction = 'D'; // Diagonal
        axisId = 'D';
      }

      beams.push({
        id: uniqueId,
        startNodeId: n1,
        endNodeId: n2,
        length: length,
        axisId: axisId,
        direction: direction,
        bw: el.properties?.width || sections.beamWidth,
        h: el.properties?.depth || sections.beamDepth,
        isBasement
      });
    }

    // --- DÖŞEMELER (Üçgen veya Dikdörtgen) ---
    else if (el.type === 'slab' && el.x2 !== undefined && el.y2 !== undefined) {
      const minX = Math.min(el.x1, el.x2);
      const maxX = Math.max(el.x1, el.x2);
      const minY = Math.min(el.y1, el.y2);
      const maxY = Math.max(el.y1, el.y2);

      const n1 = `N-${minX}-${minY}`; // TL
      const n2 = `N-${maxX}-${minY}`; // TR
      const n3 = `N-${maxX}-${maxY}`; // BR
      const n4 = `N-${minX}-${maxY}`; // BL

      const lx = Math.abs(xCoords[maxX] - xCoords[minX]);
      const ly = Math.abs(yCoords[maxY] - yCoords[minY]);
      
      let slabNodes = [n1, n2, n3, n4];
      let area = lx * ly;

      // Üçgen Döşeme İse (Segment varsa)
      if (el.properties?.segment) {
          area = (lx * ly) / 2;
          switch(el.properties.segment) {
              case 'tl': slabNodes = [n1, n2, n4]; break; // TL, TR, BL (Üst-Sol üçgen, BL-TR diyagonali için)
              case 'br': slabNodes = [n2, n3, n4]; break; // TR, BR, BL
              case 'tr': slabNodes = [n1, n2, n3]; break; // TL, TR, BR (TL-BR diyagonali için Üst-Sağ)
              case 'bl': slabNodes = [n1, n3, n4]; break; // TL, BR, BL
          }
      }

      slabs.push({
        id: uniqueId,
        nodes: slabNodes,
        lx: lx,
        ly: ly,
        thickness: el.properties?.thickness || sections.slabThickness,
        area: area
      });
    }
  });

  return { nodes, columns, beams, slabs };
};
