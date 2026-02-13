// utils/femSolver.ts
import { matrix, multiply, zeros, Matrix, index, transpose, lusolve } from 'mathjs';
import { AppState, StoryAnalysisResult } from '../types';
import { getConcreteProperties } from '../constants';
import { createStatus } from './shared';

// --- TİPLER ---
interface Node3D {
  id: number;
  x: number; y: number; z: number;
  isFixed: boolean;
  floorIndex: number; // 0 = temel, 1..N = katlar
  dofIndices: {
    z: number;
    rx: number;
    ry: number;
  }; 
}

interface FloorMaster {
  floorIndex: number;
  z: number;
  massCenter: { x: number, y: number };
  dofIndices: {
    x: number;
    y: number;
    rz: number;
  }
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
const getLocalStiffnessMatrix = (el: Element3D, L: number): number[][] => {
  const { E, G, A, Iy, Iz, J } = el;
  const k = Array(12).fill(0).map(() => Array(12).fill(0));
  
  const set = (r: number, c: number, val: number) => {
     k[r][c] = val;
     k[c][r] = val; // Simetri
  };

  const Ax = (E * A) / L;
  set(0,0, Ax); set(0,6, -Ax); set(6,6, Ax);

  const GJ = (G * J) / L;
  set(3,3, GJ); set(3,9, -GJ); set(9,9, GJ);

  const iz12 = (12 * E * Iz) / (L ** 3);
  const iz6 = (6 * E * Iz) / (L ** 2);
  const iz4 = (4 * E * Iz) / L;
  const iz2 = (2 * E * Iz) / L;
  
  set(1,1, iz12); set(1,5, iz6); set(1,7, -iz12); set(1,11, iz6);
  set(5,5, iz4); set(5,7, -iz6); set(5,11, iz2);
  set(7,7, iz12); set(7,11, -iz6);
  set(11,11, iz4);

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
const getTransformationMatrix = (n1: Node3D, n2: Node3D): number[][] => {
  const dx = n2.x - n1.x;
  const dy = n2.y - n1.y;
  const dz = n2.z - n1.z;
  const L = Math.sqrt(dx*dx + dy*dy + dz*dz);
  const cx = dx / L;
  const cy = dy / L;
  const cz = dz / L;

  let R: number[][] = [];

  if (Math.abs(cz) > 0.99) {
     const sign = cz > 0 ? 1 : -1;
     R = [
         [0, 0, sign],
         [0, 1, 0],
         [-1 * sign, 0, 0]
     ];
  } else {
     const D = Math.sqrt(cx*cx + cy*cy);
     R = [
         [cx, cy, cz],
         [-cy/D, cx/D, 0],
         [-cx*cz/D, -cy*cz/D, D]
     ];
  }
  
  const T = Array(12).fill(0).map(() => Array(12).fill(0));
  for(let i=0; i<4; i++) {
      for(let r=0; r<3; r++) {
          for(let c=0; c<3; c++) {
              T[i*3 + r][i*3 + c] = R[r][c];
          }
      }
  }
  return T;
};

// --- ANA ÇÖZÜCÜ ---

export const solveFEM = (state: AppState, seismicForces: number[], direction: 'X' | 'Y' = 'X'): FemResult => {
  const { materials, dimensions, sections, grid, definedElements } = state;
  const props = getConcreteProperties(materials.concreteClass);
  const E_base = props.Ec * 1000; 
  
  // 1. DÜĞÜM NOKTALARINI VE KATLARI OLUŞTUR
  const nodes: Node3D[] = [];
  const floors: FloorMaster[] = [];
  const elements: Element3D[] = [];
  
  const xAx = [0, ...grid.xAxis.map(a => a.spacing)];
  const yAx = [0, ...grid.yAxis.map(a => a.spacing)];
  const xC = xAx.map((_, i) => xAx.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const yC = yAx.map((_, i) => yAx.slice(0, i + 1).reduce((a, b) => a + b, 0));
  
  const nx = xC.length;
  const ny = yC.length;
  const nPerFl = nx * ny;
  
  let globalEqCount = 0;

  for (let i = 1; i <= dimensions.storyCount; i++) {
      let z = 0;
      for (let k = 0; k < i; k++) z += dimensions.storyHeights[k] || 3;
      
      const centerX = xC[xC.length - 1] / 2;
      const centerY = yC[yC.length - 1] / 2;

      floors.push({
          floorIndex: i,
          z: z,
          massCenter: { x: centerX, y: centerY },
          dofIndices: {
              x: globalEqCount++,
              y: globalEqCount++,
              rz: globalEqCount++
          }
      });
  }

  for (let i = 0; i <= dimensions.storyCount; i++) {
     let z = 0;
     for (let k = 0; k < i; k++) z += dimensions.storyHeights[k] || 3;
     const isFixed = (i === 0); // Zemin kat

     for (let r = 0; r < ny; r++) {
       for (let c = 0; c < nx; c++) {
           nodes.push({
               id: i * nPerFl + r * nx + c,
               x: xC[c], y: yC[r], z, 
               isFixed,
               floorIndex: i,
               dofIndices: {
                   z: isFixed ? -1 : globalEqCount++,
                   rx: isFixed ? -1 : globalEqCount++,
                   ry: isFixed ? -1 : globalEqCount++
               }
           });
       }
     }
  }

  // 2. ELEMANLARI OLUŞTUR
  const BASEMENT_RIGIDITY_FACTOR = 10.0;

  definedElements.forEach(el => {
      // GÜVENLİK KONTROLÜ: Eğer elemanın kat indeksi, mevcut kat sayısından büyükse veya eşitse (0-indexli), bu elemanı modele dahil etme.
      if (el.storyIndex >= dimensions.storyCount) return;

      const isBasement = el.storyIndex < dimensions.basementCount;
      const E_used = isBasement ? E_base * BASEMENT_RIGIDITY_FACTOR : E_base;
      const G_used = E_used / 2.4; 

      if(el.type === 'column' || el.type === 'shear_wall') {
         let w = 0, d = 0;
         if (el.type === 'shear_wall') {
             const len = (el.properties?.width || sections.wallLength) / 100;
             const thk = (el.properties?.depth || sections.wallThickness) / 100;
             const dir = el.properties?.direction || 'x';
             if (dir === 'x') { w = len; d = thk; } else { w = thk; d = len; }
         } else {
             w = (el.properties?.width || sections.colWidth) / 100; 
             d = (el.properties?.depth || sections.colDepth) / 100;
         }

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
            J: el.type === 'shear_wall' ? 1.0 : 0.001,
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

  // 3. GLOBAL RİJİTLİK MATRİSİNİ OLUŞTUR
  const K = Array(globalEqCount).fill(0).map(() => Array(globalEqCount).fill(0));

  const addElementStiffness = (el: Element3D) => {
      const n1 = nodes[el.node1Index];
      const n2 = nodes[el.node2Index];
      const L = Math.sqrt((n2.x-n1.x)**2 + (n2.y-n1.y)**2 + (n2.z-n1.z)**2);
      
      const k_loc = getLocalStiffnessMatrix(el, L);
      const T = getTransformationMatrix(n1, n2);
      
      const k_glob = Array(12).fill(0).map(() => Array(12).fill(0));
      for(let i=0; i<12; i++) {
          for(let j=0; j<12; j++) {
              let sum = 0;
              for(let k=0; k<12; k++) { 
                  let term = 0;
                  for(let m=0; m<12; m++) {
                      term += k_loc[k][m] * T[m][j];
                  }
                  sum += T[k][i] * term; 
              }
              k_glob[i][j] = sum;
          }
      }

      const mapDofToEq = (node: Node3D, localDof: number): { eq: number, factor: number }[] => {
          if (node.isFixed) return []; 

          const floor = floors.find(f => f.floorIndex === node.floorIndex);
          
          if (localDof === 2) return node.dofIndices.z !== -1 ? [{ eq: node.dofIndices.z, factor: 1 }] : []; 
          if (localDof === 3) return node.dofIndices.rx !== -1 ? [{ eq: node.dofIndices.rx, factor: 1 }] : []; 
          if (localDof === 4) return node.dofIndices.ry !== -1 ? [{ eq: node.dofIndices.ry, factor: 1 }] : []; 

          if (!floor) return [];

          const dx = node.x - floor.massCenter.x;
          const dy = node.y - floor.massCenter.y;

          if (localDof === 0) {
              return [
                  { eq: floor.dofIndices.x, factor: 1 },
                  { eq: floor.dofIndices.rz, factor: -dy }
              ];
          }
          if (localDof === 1) { 
              return [
                  { eq: floor.dofIndices.y, factor: 1 },
                  { eq: floor.dofIndices.rz, factor: dx }
              ];
          }
          if (localDof === 5) {
              return [{ eq: floor.dofIndices.rz, factor: 1 }];
          }

          return [];
      };

      for(let r=0; r<12; r++) {
          const nodeRow = r < 6 ? n1 : n2;
          const localDofRow = r % 6;
          const eqMapRow = mapDofToEq(nodeRow, localDofRow);

          for(let c=0; c<12; c++) {
              const nodeCol = c < 6 ? n1 : n2;
              const localDofCol = c % 6;
              const eqMapCol = mapDofToEq(nodeCol, localDofCol);
              
              const val = k_glob[r][c];
              if (val === 0) continue;

              for(const mR of eqMapRow) {
                  for(const mC of eqMapCol) {
                      K[mR.eq][mC.eq] += val * mR.factor * mC.factor;
                  }
              }
          }
      }
  };

  elements.forEach(el => addElementStiffness(el));

  // 4. YÜK VEKTÖRÜNÜ OLUŞTUR (YÖNE GÖRE)
  const F = Array(globalEqCount).fill(0);
  
  seismicForces.forEach((force, idx) => {
      const floorIdx = idx + 1; 
      const floor = floors.find(f => f.floorIndex === floorIdx);
      if (floor) {
          const F_kN = force / 1000;
          
          if (direction === 'X') {
              F[floor.dofIndices.x] += F_kN; 
              // %5 Ek Dışmerkezlik (X yönü yüklemesinde Y yönü kaçıklığı)
              const ey = 0.05 * dimensions.ly; 
              const M_torsion = F_kN * ey; // Fx * ey
              F[floor.dofIndices.rz] += M_torsion; 
          } else {
              F[floor.dofIndices.y] += F_kN; 
              // %5 Ek Dışmerkezlik (Y yönü yüklemesinde X yönü kaçıklığı)
              const ex = 0.05 * dimensions.lx; 
              const M_torsion = F_kN * ex; // Fy * ex
              F[floor.dofIndices.rz] += M_torsion; 
          }
      }
  });

  // 5. SİSTEMİ ÇÖZ
  let U_system: any;
  try {
      if(globalEqCount > 0) {
          U_system = lusolve(matrix(K), matrix(F));
      } else {
          U_system = matrix(zeros(0));
      }
  } catch(e) {
      console.error("Matris çözülemedi", e);
      return { nodes, elements, displacements: [], memberForces: new Map(), storyAnalysis: [] };
  }

  // 6. SONUÇLARI İŞLE
  const U_array = (U_system as any)._data ? (U_system as any)._data : (U_system as any);
  const displacements = U_array.flat(); 

  const memberForces = new Map<string, { fx: number; fy: number; fz: number; mx: number; my: number; mz: number }>();
  
  elements.forEach(el => {
      const n1 = nodes[el.node1Index];
      const n2 = nodes[el.node2Index];
      const L = Math.sqrt((n2.x-n1.x)**2 + (n2.y-n1.y)**2 + (n2.z-n1.z)**2);
      
      const u_glob_el = Array(12).fill(0);
      
      const fillNodeDisp = (node: Node3D, offset: number) => {
          if (node.isFixed) return;
          const floor = floors.find(f => f.floorIndex === node.floorIndex);
          if (!floor) return;

          const dx = node.x - floor.massCenter.x;
          const dy = node.y - floor.massCenter.y;
          
          const Um_x = displacements[floor.dofIndices.x];
          const Um_y = displacements[floor.dofIndices.y];
          const Um_rz = displacements[floor.dofIndices.rz];
          
          u_glob_el[offset + 0] = Um_x - dy * Um_rz;
          u_glob_el[offset + 1] = Um_y + dx * Um_rz;
          u_glob_el[offset + 2] = node.dofIndices.z !== -1 ? displacements[node.dofIndices.z] : 0;
          u_glob_el[offset + 3] = node.dofIndices.rx !== -1 ? displacements[node.dofIndices.rx] : 0;
          u_glob_el[offset + 4] = node.dofIndices.ry !== -1 ? displacements[node.dofIndices.ry] : 0;
          u_glob_el[offset + 5] = Um_rz;
      };

      fillNodeDisp(n1, 0);
      fillNodeDisp(n2, 6);

      const T = getTransformationMatrix(n1, n2);
      const k_loc = getLocalStiffnessMatrix(el, L);
      
      const u_loc = Array(12).fill(0);
      for(let i=0; i<12; i++) {
          for(let j=0; j<12; j++) {
              u_loc[i] += T[i][j] * u_glob_el[j];
          }
      }

      const f_loc = Array(12).fill(0);
      for(let i=0; i<12; i++) {
          for(let j=0; j<12; j++) {
              f_loc[i] += k_loc[i][j] * u_loc[j];
          }
      }

      memberForces.set(el.id, {
          fx: f_loc[0], fy: f_loc[1], fz: f_loc[2], 
          mx: f_loc[3], my: f_loc[4], mz: f_loc[5] 
      });
  });

  const storyAnalysis: StoryAnalysisResult[] = [];
  
  for (let i = 1; i <= dimensions.storyCount; i++) {
      const isBasement = (i - 1) < dimensions.basementCount;
      const floor = floors.find(f => f.floorIndex === i);
      const lowerFloor = floors.find(f => f.floorIndex === i - 1); 
      
      const dispX = floor ? displacements[floor.dofIndices.x] : 0;
      const lowerDispX = lowerFloor ? displacements[lowerFloor.dofIndices.x] : 0;
      
      const dispY = floor ? displacements[floor.dofIndices.y] : 0;
      const lowerDispY = lowerFloor ? displacements[lowerFloor.dofIndices.y] : 0;

      const deltaX = Math.abs(dispX - lowerDispX);
      const deltaY = Math.abs(dispY - lowerDispY);
      
      const h_mm = (dimensions.storyHeights[i-1] || 3) * 1000;
      const driftRatioX = (deltaX * 1000) / h_mm;
      const driftRatioY = (deltaY * 1000) / h_mm;
      
      // Burulma Hesabı (Sadece analiz yönünde anlamlıdır ama burada ortalama alabiliriz veya yönü kontrol edebiliriz)
      // Bu solver tek yön için çalışıyor, o yüzden sadece o yönün drift ve burulması önemli.
      // Basitleştirmek için o anki yöne göre max drift ve eta hesaplayacağız.
      
      let maxD = (direction === 'X' ? deltaX : deltaY);
      let avgD = maxD; // Torsiyon yoksa

      if (floor) {
          const rotCurrent = displacements[floor.dofIndices.rz];
          const rotLower = lowerFloor ? displacements[lowerFloor.dofIndices.rz] : 0;
          const rotation = rotCurrent - rotLower;

          // Bina boyutuna göre en uzak köşe deplasmanı
          const DimPerp = direction === 'X' ? dimensions.ly : dimensions.lx; // X yüklemesinde Y kolu (veya tam tersi) - Basit dikdörtgen
          const torsionDisp = (DimPerp/2) * Math.abs(rotation);
          
          const deltaCore = (direction === 'X' ? deltaX : deltaY);
          maxD = deltaCore + torsionDisp;
          const minD = Math.max(0, deltaCore - torsionDisp);
          avgD = (maxD + minD) / 2;
      }
      
      const eta_bi = avgD > 0.000001 ? maxD / avgD : 1.0;
      const driftLimit = 0.008;

      // Hangi yönde analiz yapıyorsak sonuçları oraya yazalım, diğerleri 0 kalsın
      storyAnalysis.push({
          storyIndex: i,
          height: floor ? floor.z : 0,
          mass: 0, // Placeholder as mass is calculated in seismicSolver/solver logic, but required by type
          forceAppliedX: direction === 'X' ? (seismicForces[i-1] || 0) / 1000 : 0,
          forceAppliedY: direction === 'Y' ? (seismicForces[i-1] || 0) / 1000 : 0,
          dispAvgX: direction === 'X' ? avgD * 1000 : 0,
          dispAvgY: direction === 'Y' ? avgD * 1000 : 0,
          driftX: direction === 'X' ? maxD * 1000 : 0,
          driftY: direction === 'Y' ? maxD * 1000 : 0,
          eta_bi_x: direction === 'X' ? eta_bi : 0,
          eta_bi_y: direction === 'Y' ? eta_bi : 0,
          torsionCheck: createStatus(
              eta_bi <= 1.2, 
              'A1 Yok', 
              'A1 Düzensizliği', 
              `η=${eta_bi.toFixed(2)}`,
              'Bina çevresine perde ekleyerek veya rijitlik merkezini kütle merkezine yaklaştırarak burulmayı azaltın.'
          ),
          driftCheck: createStatus(
              (direction === 'X' ? driftRatioX : driftRatioY) <= driftLimit, 
              'OK', 
              'Sınır Aşıldı', 
              `R=${(direction === 'X' ? driftRatioX : driftRatioY).toFixed(4)}`,
              'Yatay rijitliği artırmak için perde ekleyin veya kolon boyutlarını büyütün.'
          ),
          isBasement
      });
  }

  return { nodes, elements, displacements, memberForces, storyAnalysis };
};