
// utils/femSolver.ts
import { matrix, multiply, inv, zeros, Matrix, index, transpose } from 'mathjs';
import { AppState, StoryAnalysisResult } from '../types';
import { getConcreteProperties } from '../constants';
import { createStatus } from './shared';

// --- TİPLER ---
interface Node3D {
  id: number;
  x: number; y: number; z: number;
  isFixed: boolean;
  floorIndex: number; // 0 = zemin/bodrum
  dofIndices: number[]; // 6 DOF: dx, dy, dz, rx, ry, rz
}

interface Element3D {
  id: string;
  type: 'beam' | 'column';
  node1Index: number;
  node2Index: number;
  E: number; G: number; A: number; Iy: number; Iz: number; J: number;
  floorIndex: number;
}

export interface FemResult {
  nodes: Node3D[];
  elements: Element3D[];
  displacements: any[];
  memberForces: Map<string, { fx: number; fy: number; fz: number; mx: number; my: number; mz: number }>;
  storyAnalysis: StoryAnalysisResult[];
}

// 12x12 Lokal Rijitlik Matrisi
const getLocalStiffnessMatrix = (el: Element3D, L: number): Matrix => {
  const { E, G, A, Iy, Iz, J } = el;
  const k = zeros(12, 12) as Matrix;
  const set = (r: number, c: number, val: number) => {
     k.set([r, c], val);
     k.set([c, r], val); // Simetri
  };

  const Ax = (E * A) / L;
  set(0,0, Ax); set(0,6, -Ax); set(6,6, Ax);

  const GJ = (G * J) / L;
  set(3,3, GJ); set(3,9, -GJ); set(9,9, GJ);

  // Eğilme (Iz etrafında - XY düzlemi)
  const iz12 = (12 * E * Iz) / (L ** 3);
  const iz6 = (6 * E * Iz) / (L ** 2);
  const iz4 = (4 * E * Iz) / L;
  const iz2 = (2 * E * Iz) / L;
  
  set(1,1, iz12); set(1,5, iz6); set(1,7, -iz12); set(1,11, iz6);
  set(5,5, iz4); set(5,7, -iz6); set(5,11, iz2);
  set(7,7, iz12); set(7,11, -iz6);
  set(11,11, iz4);

  // Eğilme (Iy etrafında - XZ düzlemi)
  const iy12 = (12 * E * Iy) / (L ** 3);
  const iy6 = (6 * E * Iy) / (L ** 2);
  const iy4 = (4 * E * Iy) / L;
  const iy2 = (2 * E * Iy) / L;

  set(2,2, iy12); set(2,4, -iy6); set(2,8, -iy12); set(2,10, -iy6);
  set(4,4, iy4); set(4,8, iy6); set(4,10, iy2);
  set(8,8, iy12); set(8,10, iy6);
  set(10,10, iy4);

  return k;
};

// 12x12 Dönüşüm Matrisi (T)
const getTransformationMatrix = (n1: Node3D, n2: Node3D): Matrix => {
  const dx = n2.x - n1.x;
  const dy = n2.y - n1.y;
  const dz = n2.z - n1.z;
  const L = Math.sqrt(dx*dx + dy*dy + dz*dz);
  const cx = dx / L;
  const cy = dy / L;
  const cz = dz / L;

  let r = zeros(3, 3) as Matrix;

  if (Math.abs(cz) > 0.99) {
     r = matrix([[0, 0, cz], [0, 1, 0], [-cz, 0, 0]]);
  } else {
     const D = Math.sqrt(cx*cx + cy*cy);
     r = matrix([
         [cx, cy, cz],
         [-cy/D, cx/D, 0],
         [-cx*cz/D, -cy*cz/D, D]
     ]);
  }
  
  const T = zeros(12, 12) as Matrix;
  for(let i=0; i<4; i++) T.subset(index([i*3, i*3+1, i*3+2], [i*3, i*3+1, i*3+2]), r);
  return T;
};

// --- ANA ÇÖZÜCÜ ---

export const solveFEM = (state: AppState, seismicForces: number[]): FemResult => {
  const { materials, dimensions, sections, grid, definedElements } = state;
  const props = getConcreteProperties(materials.concreteClass);
  const E_base = props.Ec * 1000; // kN/m2
  
  // Düğüm ve Elemanları Oluştur
  const nodes: Node3D[] = [];
  const elements: Element3D[] = [];
  
  const xAx = [0, ...grid.xAxis.map(a => a.spacing)];
  const yAx = [0, ...grid.yAxis.map(a => a.spacing)];
  const xC = xAx.map((_, i) => xAx.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const yC = yAx.map((_, i) => yAx.slice(0, i + 1).reduce((a, b) => a + b, 0));
  
  const nx = xC.length;
  const ny = yC.length;
  const nPerFl = nx * ny;
  let dofCnt = 0;

  for (let i = 0; i <= dimensions.storyCount; i++) {
     let z = 0;
     for (let k = 0; k < i; k++) {
         z += dimensions.storyHeights[k] || 3;
     }

     const isFixed = (i === 0);
     for (let r = 0; r < ny; r++) {
       for (let c = 0; c < nx; c++) {
           nodes.push({
               id: i * nPerFl + r * nx + c,
               x: xC[c], y: yC[r], z, 
               isFixed,
               floorIndex: i,
               dofIndices: isFixed ? Array(6).fill(-1) : Array.from({length:6}, ()=> dofCnt++)
           });
       }
     }
  }

  // Elemanları Modelden Al (modelGenerator'a gerek yok, user defined elements ile doğrudan çalışabiliriz)
  // Ancak coordinate mapping için grid index kullanıyoruz.
  
  // RİJİT BODRUM KATSAYISI
  const BASEMENT_RIGIDITY_FACTOR = 10.0;

  definedElements.forEach(el => {
      const isBasement = el.storyIndex < dimensions.basementCount;
      const E_used = isBasement ? E_base * BASEMENT_RIGIDITY_FACTOR : E_base;
      const G_used = E_used / 2.4;

      if(el.type === 'column') {
         const w = (el.properties?.width || sections.colWidth) / 100; // m
         const d = (el.properties?.depth || sections.colDepth) / 100; // m
         const n1 = el.storyIndex * nPerFl + el.y1 * nx + el.x1;
         const n2 = (el.storyIndex + 1) * nPerFl + el.y1 * nx + el.x1;
         
         elements.push({
            id: `${el.id}_S${el.storyIndex}`,
            type: 'column',
            node1Index: n1, node2Index: n2,
            E: E_used, G: G_used,
            A: w * d,
            Iy: (w * d**3)/12 * 0.7,
            Iz: (d * w**3)/12 * 0.7,
            J: 0.001,
            floorIndex: el.storyIndex
         });
      } else if (el.type === 'beam' && el.x2 !== undefined && el.y2 !== undefined) {
         const w = (el.properties?.width || sections.beamWidth) / 100;
         const d = (el.properties?.depth || sections.beamDepth) / 100;
         const n1 = (el.storyIndex + 1) * nPerFl + el.y1 * nx + el.x1;
         const n2 = (el.storyIndex + 1) * nPerFl + el.y2 * nx + el.x2;

         elements.push({
            id: `${el.id}_S${el.storyIndex}`,
            type: 'beam',
            node1Index: n1, node2Index: n2,
            E: E_used, G: G_used,
            A: w * d,
            Iy: (d * w**3)/12 * 0.35,
            Iz: (w * d**3)/12 * 0.35,
            J: 0.001,
            floorIndex: el.storyIndex
         });
      }
  });


  // Global Matris
  const K = zeros(dofCnt, dofCnt) as Matrix;
  
  elements.forEach(el => {
      const n1 = nodes[el.node1Index];
      const n2 = nodes[el.node2Index];
      const L = Math.sqrt((n2.x-n1.x)**2 + (n2.y-n1.y)**2 + (n2.z-n1.z)**2);
      
      const k_loc = getLocalStiffnessMatrix(el, L);
      const T = getTransformationMatrix(n1, n2);
      const k_glob = multiply(multiply(transpose(T), k_loc), T) as Matrix;

      const indices = [...n1.dofIndices, ...n2.dofIndices];
      for(let r=0; r<12; r++) {
          if(indices[r] === -1) continue;
          for(let c=0; c<12; c++) {
              if(indices[c] === -1) continue;
              const val = k_glob.get([r,c]);
              K.set([indices[r], indices[c]], K.get([indices[r], indices[c]]) + val);
          }
      }
  });

  // Yük Vektörü
  const F = zeros(dofCnt, 1) as Matrix;
  const nodesPerFloor = nx * ny;
  
  nodes.forEach(n => {
      if (!n.isFixed && n.floorIndex > 0) {
          // Bodrum kat hariç tutulmaz, kuvvetler tüm katlara etki ettirilir.
          // Ancak seismicSolver'da kat kuvvetleri (Fi) bodrum katlar dahil hesaplanmış olmalı 
          // (fakat bodrum kütlesi periyot hesabına katılmaz).
          const forceIndex = n.floorIndex - 1; 
          if (forceIndex < seismicForces.length) {
              const F_story_total_N = seismicForces[forceIndex];
              const F_story_total_kN = F_story_total_N / 1000;
              const F_node = F_story_total_kN / nodesPerFloor;
              
              if (n.dofIndices[0] !== -1) F.set([n.dofIndices[0], 0], F_node);
          }
      }
  });

  // Çözüm
  let U: Matrix;
  try {
      U = multiply(inv(K), F);
  } catch(e) {
      console.error("Matris çözülemedi", e);
      return { nodes, elements, displacements: [], memberForces: new Map(), storyAnalysis: [] };
  }

  // Sonuçlar
  const memberForces = new Map<string, { fx: number; fy: number; fz: number; mx: number; my: number; mz: number }>();
  
  elements.forEach(el => {
      const n1 = nodes[el.node1Index];
      const n2 = nodes[el.node2Index];
      const L = Math.sqrt((n2.x-n1.x)**2 + (n2.y-n1.y)**2 + (n2.z-n1.z)**2);
      
      const u_glob = zeros(12, 1) as Matrix;
      [...n1.dofIndices, ...n2.dofIndices].forEach((dof, idx) => {
          if(dof !== -1) u_glob.set([idx, 0], U.get([dof, 0]));
      });

      const T = getTransformationMatrix(n1, n2);
      const k_loc = getLocalStiffnessMatrix(el, L);
      const u_loc = multiply(T, u_glob);
      const f_loc = multiply(k_loc, u_loc) as Matrix;

      memberForces.set(el.id, {
          fx: f_loc.get([0,0]), fy: f_loc.get([1,0]), fz: f_loc.get([2,0]), 
          mx: f_loc.get([3,0]), my: f_loc.get([4,0]), mz: f_loc.get([5,0]) 
      });
  });

  // Kat Analizi
  const storyAnalysis: StoryAnalysisResult[] = [];
  const u_data = (U as any)._data;
  const nodeDisps = new Map<number, {dx: number, dy: number}>();
  
  nodes.forEach(n => {
      const dx = n.dofIndices[0] !== -1 ? u_data[n.dofIndices[0]][0] : 0;
      const dy = n.dofIndices[1] !== -1 ? u_data[n.dofIndices[1]][0] : 0;
      nodeDisps.set(n.id, {dx, dy});
  });

  for (let i = 1; i <= dimensions.storyCount; i++) {
      const isBasement = (i - 1) < dimensions.basementCount; // i=1 -> Zemin Kat (0. indis), BasementCount=1 ise True
      
      const storyNodes = nodes.filter(n => n.floorIndex === i);
      const lowerNodes = nodes.filter(n => n.floorIndex === i - 1);

      const displacements = storyNodes.map(n => nodeDisps.get(n.id)?.dx || 0);
      const lowerDisps = lowerNodes.map(n => nodeDisps.get(n.id)?.dx || 0);
      const avgLowerDisp = lowerDisps.reduce((a, b) => a + b, 0) / (lowerDisps.length || 1);

      const drifts = displacements.map(d => Math.abs(d - avgLowerDisp));
      const maxDrift = Math.max(...drifts);
      const avgDrift = drifts.reduce((a,b) => a+b, 0) / drifts.length;
      
      const eta_bi = avgDrift > 0 ? maxDrift / avgDrift : 1.0;
      const h_mm = (dimensions.storyHeights[i-1] || 3) * 1000;
      const driftRatio = (maxDrift * 1000) / h_mm; 
      
      let z = 0;
      for (let k = 0; k < i; k++) { z += dimensions.storyHeights[k] || 3; }

      // Bodrum katlarda deplasman kontrolü gevşetilebilir veya rijit olduğu için çok düşük çıkar.
      const driftLimit = 0.008;

      storyAnalysis.push({
          storyIndex: i,
          height: z,
          forceApplied: (seismicForces[i-1] || 0) / 1000,
          dispAvg: (avgDrift * 1000),
          dispMax: (maxDrift * 1000),
          drift: (maxDrift * 1000),
          driftRatio: driftRatio,
          eta_bi: eta_bi,
          torsionCheck: createStatus(eta_bi <= 1.2, 'A1 Yok', 'A1 Düzensizliği', `η=${eta_bi.toFixed(2)}`),
          driftCheck: createStatus(driftRatio <= driftLimit, 'OK', 'Sınır Aşıldı', `R=${driftRatio.toFixed(4)}`),
          isBasement: isBasement
      });
  }

  return { nodes, elements, displacements: u_data || [], memberForces, storyAnalysis };
};
