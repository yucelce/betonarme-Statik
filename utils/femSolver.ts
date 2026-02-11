
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
  floorIndex: number; // 0 = zemin, 1 = 1.kat, vs.
  dofIndices: number[]; // 6 DOF: dx, dy, dz, rx, ry, rz
}

interface Element3D {
  id: string;
  type: 'beam' | 'column';
  node1Index: number;
  node2Index: number;
  E: number; G: number; A: number; Iy: number; Iz: number; J: number;
}

export interface FemResult {
  nodes: Node3D[];
  elements: Element3D[];
  displacements: any[];
  memberForces: Map<string, { fx: number; fy: number; fz: number; mx: number; my: number; mz: number }>;
  storyAnalysis: StoryAnalysisResult[];
}

// --- YARDIMCI MATRİS FONKSİYONLARI ---

// 12x12 Lokal Rijitlik Matrisi
const getLocalStiffnessMatrix = (el: Element3D, L: number): Matrix => {
  const { E, G, A, Iy, Iz, J } = el;
  const k = zeros(12, 12) as Matrix;
  const set = (r: number, c: number, val: number) => {
     k.set([r, c], val);
     k.set([c, r], val); // Simetri
  };

  // Eksenel (x)
  const Ax = (E * A) / L;
  set(0,0, Ax); set(0,6, -Ax); set(6,6, Ax);

  // Burulma (rx)
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

  // Düşey eleman (Kolon) kontrolü
  if (Math.abs(cz) > 0.99) {
     // Kolon: Global Z ekseniyle çakışık
     r = matrix([[0, 0, cz], [0, 1, 0], [-cz, 0, 0]]);
  } else {
     // Yatay/Eğik Eleman (Kiriş)
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
  const { materials, dimensions, sections, grid } = state;
  const props = getConcreteProperties(materials.concreteClass);
  const E_mod = props.Ec * 1000; // kN/m2 -> N/m2 değil, kN/m2 kullanıyoruz. 
  // DİKKAT: Diğer modüllerde birimler N ve mm iken burada kN ve m çalışıyoruz.
  // E = 30000 MPa = 30,000,000 kN/m2
  const E_used = E_mod; 
  const G_mod = E_used / 2.4;

  // 1. Düğüm ve Elemanları Oluştur
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
     const z = i * dimensions.h;
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

  // Kesit Özellikleri (m biriminde)
  const colSec = {
      A: (sections.colWidth * sections.colDepth) / 10000,
      Iy: (sections.colWidth * Math.pow(sections.colDepth,3)) / 1200000000 * 0.7, 
      Iz: (sections.colDepth * Math.pow(sections.colWidth,3)) / 1200000000 * 0.7,
      J: 0.001 
  };
  const beamSec = {
      A: (sections.beamWidth * sections.beamDepth) / 10000,
      Iy: (sections.beamDepth * Math.pow(sections.beamWidth,3)) / 1200000000 * 0.35,
      Iz: (sections.beamWidth * Math.pow(sections.beamDepth,3)) / 1200000000 * 0.35,
      J: 0.001
  };

  // Eleman Tanımları
  // Kolonlar
  for (let i = 0; i < dimensions.storyCount; i++) {
     for (let j = 0; j < nPerFl; j++) {
        elements.push({
            id: `C-${j%nx}-${Math.floor(j/nx)}`, // ID formatını modelGenerator ile eşledik
            type: 'column', node1Index: i*nPerFl+j, node2Index: (i+1)*nPerFl+j,
            E: E_used, G: G_mod, ...colSec
        });
     }
  }
  // Kirişler
  for (let i = 1; i <= dimensions.storyCount; i++) {
     const off = i * nPerFl;
     // X Yönü
     for (let r = 0; r < ny; r++) {
         for (let c = 0; c < nx - 1; c++) {
             elements.push({
                 id: `Bx-${c}-${r}`, type: 'beam',
                 node1Index: off + r*nx + c, node2Index: off + r*nx + c + 1,
                 E: E_used, G: G_mod, ...beamSec
             });
         }
     }
     // Y Yönü
     for (let c = 0; c < nx; c++) {
         for (let r = 0; r < ny - 1; r++) {
             elements.push({
                 id: `By-${c}-${r}`, type: 'beam',
                 node1Index: off + r*nx + c, node2Index: off + (r+1)*nx + c,
                 E: E_used, G: G_mod, ...beamSec
             });
         }
     }
  }

  // 2. Global Matris
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

  // 3. Yük Vektörü (Gerçek Deprem Yükleri)
  const F = zeros(dofCnt, 1) as Matrix;
  
  // Kat deprem yüklerini düğümlere dağıt
  // seismicForces array indeksi: 0 -> 1. Kat, 1 -> 2. Kat ...
  const nodesPerFloor = nx * ny;
  
  nodes.forEach(n => {
      if (!n.isFixed && n.floorIndex > 0) {
          const forceIndex = n.floorIndex - 1; // Array 0-based
          if (forceIndex < seismicForces.length) {
              const F_story_total_N = seismicForces[forceIndex];
              const F_story_total_kN = F_story_total_N / 1000;
              const F_node = F_story_total_kN / nodesPerFloor;
              
              // X yönünde uygula (Basitlik için sadece X depremi analizi)
              if (n.dofIndices[0] !== -1) {
                  F.set([n.dofIndices[0], 0], F_node);
              }
          }
      }
  });

  // 4. Çözüm
  let U: Matrix;
  try {
      U = multiply(inv(K), F);
  } catch(e) {
      console.error("Matris çözülemedi", e);
      return { nodes, elements, displacements: [], memberForces: new Map(), storyAnalysis: [] };
  }

  // 5. Sonuçların İşlenmesi
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
          fx: f_loc.get([0,0]),
          fy: f_loc.get([1,0]),
          fz: f_loc.get([2,0]), 
          mx: f_loc.get([3,0]), 
          my: f_loc.get([4,0]), 
          mz: f_loc.get([5,0]) 
      });
  });

  // --- 6. KAT ANALİZİ VE DÜZENSİZLİK KONTROLÜ (POST-PROCESSING) ---
  const storyAnalysis: StoryAnalysisResult[] = [];
  const u_data = (U as any)._data;

  // Düğümlerin deplasmanlarını map'e al
  const nodeDisps = new Map<number, {dx: number, dy: number}>();
  nodes.forEach(n => {
      const dx = n.dofIndices[0] !== -1 ? u_data[n.dofIndices[0]][0] : 0;
      const dy = n.dofIndices[1] !== -1 ? u_data[n.dofIndices[1]][0] : 0;
      nodeDisps.set(n.id, {dx, dy});
  });

  for (let i = 1; i <= dimensions.storyCount; i++) {
      // Bu kata ait düğümler
      const storyNodes = nodes.filter(n => n.floorIndex === i);
      const lowerNodes = nodes.filter(n => n.floorIndex === i - 1);

      // X Yönü Deplasmanları (Sadece X depremi uyguladığımız için)
      const displacements = storyNodes.map(n => nodeDisps.get(n.id)?.dx || 0);
      
      // Göreli Öteleme için alt katın ortalama deplasmanını al
      const lowerDisps = lowerNodes.map(n => nodeDisps.get(n.id)?.dx || 0);
      const avgLowerDisp = lowerDisps.reduce((a, b) => a + b, 0) / (lowerDisps.length || 1);

      // Göreli Ötelemeler
      const drifts = displacements.map(d => Math.abs(d - avgLowerDisp));
      
      const maxDrift = Math.max(...drifts);
      const avgDrift = drifts.reduce((a,b) => a+b, 0) / drifts.length;
      
      // A1 Burulma Düzensizliği Katsayısı
      const eta_bi = avgDrift > 0 ? maxDrift / avgDrift : 1.0;

      // Göreli Öteleme Oranı
      const h_mm = dimensions.h * 1000;
      const driftRatio = (maxDrift * 1000) / h_mm; // Metre -> mm çevrimi
      
      storyAnalysis.push({
          storyIndex: i,
          height: i * dimensions.h,
          forceApplied: (seismicForces[i-1] || 0) / 1000, // kN
          dispAvg: (avgDrift * 1000), // mm
          dispMax: (maxDrift * 1000), // mm
          drift: (maxDrift * 1000), // mm
          driftRatio: driftRatio,
          eta_bi: eta_bi,
          torsionCheck: createStatus(eta_bi <= 1.2, 'A1 Yok', 'A1 Düzensizliği Var', `η=${eta_bi.toFixed(2)}`),
          driftCheck: createStatus(driftRatio <= 0.008, 'OK', 'Sınır Aşıldı', `R=${driftRatio.toFixed(4)}`)
      });
  }

  return { nodes, elements, displacements: u_data || [], memberForces, storyAnalysis };
};
