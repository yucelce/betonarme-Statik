// utils/femSolver.ts
import { matrix, multiply, inv, add, zeros, Matrix, index, subset, transpose, subtract } from 'mathjs';
import { AppState, StructuralModel } from '../types';
import { getConcreteProperties } from '../constants';

// --- TİPLER ---

interface Node3D {
  id: number;          // Global Node Index (0, 1, 2...)
  x: number;
  y: number;
  z: number;
  isFixed: boolean;    // Mesnet durumu (Temel ise true)
  dofIndices: number[]; // Global Denklem Numaraları (0..5)
}

interface Element3D {
  id: string;
  type: 'beam' | 'column';
  node1Index: number;
  node2Index: number;
  E: number;  // Elastisite Modülü (kN/m2)
  G: number;  // Kayma Modülü (kN/m2)
  A: number;  // Kesit Alanı (m2)
  Iy: number; // Atalet (Lokal y - Zayıf eksen) (m4)
  Iz: number; // Atalet (Lokal z - Güçlü eksen) (m4)
  J: number;  // Burulma Ataleti (m4)
}

// --- YARDIMCI FONKSİYONLAR ---

/**
 * 12x12 Lokal Rijitlik Matrisi (3D Çubuk)
 */
const getLocalStiffnessMatrix = (el: Element3D, L: number): Matrix => {
  const { E, G, A, Iy, Iz, J } = el;
  
  // Terimlerin Hesaplanması
  const A_x = (E * A) / L;
  const G_J = (G * J) / L;
  
  const I_y_12 = (12 * E * Iy) / (L ** 3);
  const I_y_6  = (6 * E * Iy) / (L ** 2);
  const I_y_4  = (4 * E * Iy) / L;
  const I_y_2  = (2 * E * Iy) / L;

  const I_z_12 = (12 * E * Iz) / (L ** 3);
  const I_z_6  = (6 * E * Iz) / (L ** 2);
  const I_z_4  = (4 * E * Iz) / L;
  const I_z_2  = (2 * E * Iz) / L;

  // Matris Doldurma (Sıfır matris üzerine)
  // DOF Sırası: dx1, dy1, dz1, rx1, ry1, rz1, dx2, dy2, dz2, rx2, ry2, rz2
  const k = zeros(12, 12) as Matrix;
  const set = (r: number, c: number, val: number) => k.set([r, c], val);

  // Eksenel (x)
  set(0,0, A_x);   set(0,6, -A_x);
  set(6,0, -A_x);  set(6,6, A_x);

  // Burulma (rx)
  set(3,3, G_J);   set(3,9, -G_J);
  set(9,3, -G_J);  set(9,9, G_J);

  // Eğilme (xy düzlemi - Iz etrafında dönme - dy öteleme) -> Kuvvet Y, Moment Z
  set(1,1, I_z_12);  set(1,5, I_z_6);   set(1,7, -I_z_12); set(1,11, I_z_6);
  set(5,1, I_z_6);   set(5,5, I_z_4);   set(5,7, -I_z_6);  set(5,11, I_z_2);
  set(7,1, -I_z_12); set(7,5, -I_z_6);  set(7,7, I_z_12);  set(7,11, -I_z_6);
  set(11,1, I_z_6);  set(11,5, I_z_2);  set(11,7, -I_z_6); set(11,11, I_z_4);

  // Eğilme (xz düzlemi - Iy etrafında dönme - dz öteleme) -> Kuvvet Z, Moment Y
  // Not: İşaretler koordinat sistemine göre değişebilir, standart pozitif yön kabulü
  set(2,2, I_y_12);  set(2,4, -I_y_6);  set(2,8, -I_y_12); set(2,10, -I_y_6);
  set(4,2, -I_y_6);  set(4,4, I_y_4);   set(4,8, I_y_6);   set(4,10, I_y_2);
  set(8,2, -I_y_12); set(8,4, I_y_6);   set(8,8, I_y_12);  set(8,10, I_y_6);
  set(10,2, -I_y_6); set(10,4, I_y_2);  set(10,8, I_y_6);  set(10,10, I_y_4);

  return k;
};

/**
 * 12x12 Dönüşüm Matrisi (T)
 * Global eksenlerden Lokal eksenlere dönüşüm
 */
const getTransformationMatrix = (n1: Node3D, n2: Node3D, rollAngleRad: number = 0): Matrix => {
  const dx = n2.x - n1.x;
  const dy = n2.y - n1.y;
  const dz = n2.z - n1.z;
  const L = Math.sqrt(dx*dx + dy*dy + dz*dz);

  // Direction Cosines of local x-axis (cx, cy, cz)
  const cx = dx / L;
  const cy = dy / L;
  const cz = dz / L;

  // Düğüm Dönüşüm Matrisi (3x3)
  let r = zeros(3, 3) as Matrix;

  // Eğer eleman vertikal ise (Kolon gibi) özel durum
  // Toleranslı kontrol: |cz| ~= 1
  if (Math.abs(cz) > 0.9999) {
     // Düşey eleman (Kolon)
     // Global Z ile çakışık.
     // cz = 1 (Yukarı) -> x'=Z, y'=Y, z'=-X (Genel kabul)
     // Ancak burada basitlik için Global Y'yi Lokal Y'ye hizalayalım
     const sign = (cz > 0) ? 1 : -1; 
     r = matrix([
         [0, 0, sign],    // local x = global Z (sign)
         [0, 1, 0],       // local y = global Y
         [-1 * sign, 0, 0] // local z = -global X (sign)
     ]);
  } else {
     // Yatay veya Eğik Eleman
     // local x = (cx, cy, cz)
     // local y = (-cx*cy, sqrt(cx^2+cz^2), -cy*cz) / sqrt(...) -> Bu karmaşık formül yerine:
     // Basit yöntem: Global Z ekseni (k vektörü) ile cross product alarak local z'yi bul (yatay eksen).
     // v_z = unit(x_local X k_global)
     
     // x_local vektörü
     const vx = [cx, cy, cz];
     
     // Geçici global Y vektörü (Up vector) - Genelde Y yukarıysa Y, Z yukarıysa Z.
     // Bizim sistemde Z yukarı (Story height).
     // Ancak kirişler için "Web" genelde Z yönündedir (kesit yüksekliği).
     // Zayıf eksen (Iy) y ekseni, Güçlü eksen (Iz) z ekseni olur.
     
     const D = Math.sqrt(cx*cx + cy*cy);
     
     // Standart Dönüşüm Matrisi (Z yukarı sistemler için)
     // R = [
     //   cx, cy, cz
     //   -cy/D, cx/D, 0  (Bu local y olur, global XY düzleminde)
     //   -cx*cz/D, -cy*cz/D, D (Bu local z olur, düşeyle ilişkili)
     // ]
     
     // TBDY/İnşaat Mühendisliği notasyonu:
     // Kirişler için:
     // Local x: Eleman ekseni
     // Local z: Global Z ile ilişkili (Kesit derinliği yönü)
     // Local y: Global XY düzleminde (Kesit genişliği yönü)
     
     // Matris (Local y yatay, Local z düşey olsun - Kiriş gibi):
     r = matrix([
         [cx, cy, cz],                  // Local x
         [-cy/D, cx/D, 0],              // Local y (Yatay)
         [-cx*cz/D, -cy*cz/D, D]        // Local z (Düşeye dik izdüşüm)
     ]);
  }
  
  // 12x12 T Matrisi (4 adet 3x3 blok)
  const T = zeros(12, 12) as Matrix;
  // Blokları yerleştir (Diagonal)
  for(let i=0; i<4; i++) {
     const offset = i*3;
     // r matrisini T içine kopyala
     T.subset(index([offset, offset+1, offset+2], [offset, offset+1, offset+2]), r);
  }
  
  return T;
};

// --- ANA ÇÖZÜCÜ ---

export const solveFEM = (state: AppState) => {
  const { materials, dimensions, sections, grid } = state;
  const { concreteClass } = materials;
  const props = getConcreteProperties(concreteClass);
  const E_modulus = props.Ec * 1000; // MPa -> kN/m2 (Yaklaşık)
  const G_modulus = E_modulus / (2 * (1 + 0.2)); // Poisson 0.2

  // 1. 3D Modelin Oluşturulması (Node ve Element Genişletme)
  // Grid üzerindeki düğümleri kat sayısı kadar çoğaltacağız.
  
  const nodes: Node3D[] = [];
  const elements: Element3D[] = [];
  
  const xSpacings = [0, ...grid.xAxis.map(a => a.spacing)];
  const ySpacings = [0, ...grid.yAxis.map(a => a.spacing)];
  const xCoords = xSpacings.map((s, i) => xSpacings.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const yCoords = ySpacings.map((s, i) => ySpacings.slice(0, i + 1).reduce((a, b) => a + b, 0));
  
  const nx = xCoords.length;
  const ny = yCoords.length;
  const nPerFloor = nx * ny;
  const numStories = dimensions.storyCount;

  // Düğümler
  let dofCounter = 0;
  // i: kat (0 = temel, 1 = 1. kat...)
  for (let i = 0; i <= numStories; i++) {
     const z = i * dimensions.h;
     const isFixed = (i === 0); // Zemin kat ankastre

     for (let r = 0; r < ny; r++) {
       for (let c = 0; c < nx; c++) {
           const id = i * nPerFloor + r * nx + c;
           
           // Serbestlik Dereceleri (Fixed düğümler için -1 veya pasif)
           // Denklem numaralarını sadece serbest düğümlere verelim.
           const dofs = isFixed ? [-1,-1,-1,-1,-1,-1] : 
                        [dofCounter++, dofCounter++, dofCounter++, dofCounter++, dofCounter++, dofCounter++];

           nodes.push({
               id,
               x: xCoords[c],
               y: yCoords[r],
               z: z,
               isFixed,
               dofIndices: dofs
           });
       }
     }
  }

  const totalDOF = dofCounter;
  
  // Eleman Kesit Özellikleri (Basitleştirilmiş - m biriminde)
  const colSec = {
      A: (sections.colWidth/100) * (sections.colDepth/100),
      Iy: (sections.colDepth/100 * Math.pow(sections.colWidth/100, 3))/12 * 0.7, // Çatlamış kesit
      Iz: (sections.colWidth/100 * Math.pow(sections.colDepth/100, 3))/12 * 0.7,
      J: 0.001 // Burulma ihmal veya küçük
  };
  
  const beamSec = {
      A: (sections.beamWidth/100) * (sections.beamDepth/100),
      Iy: (sections.beamDepth/100 * Math.pow(sections.beamWidth/100, 3))/12 * 0.35,
      Iz: (sections.beamWidth/100 * Math.pow(sections.beamDepth/100, 3))/12 * 0.35,
      J: 0.001
  };

  // Elemanlar (Kolonlar ve Kirişler)
  // Kolonlar: Katlar arası düşey bağlantı
  for (let i = 0; i < numStories; i++) {
     for (let j = 0; j < nPerFloor; j++) {
        const bottomNode = i * nPerFloor + j;
        const topNode = (i + 1) * nPerFloor + j;
        elements.push({
            id: `C-${i}-${j}`, type: 'column',
            node1Index: bottomNode, node2Index: topNode,
            E: E_modulus, G: G_modulus, ...colSec
        });
     }
  }

  // Kirişler: Her katta yatay bağlantı
  for (let i = 1; i <= numStories; i++) { // 0. kat (temel) kirişi yok varsayıyoruz
     const offset = i * nPerFloor;
     
     // X Yönü Kirişleri
     for (let r = 0; r < ny; r++) {
         for (let c = 0; c < nx - 1; c++) {
             const n1 = offset + r * nx + c;
             const n2 = offset + r * nx + c + 1;
             elements.push({
                 id: `Bx-${i}-${r}-${c}`, type: 'beam',
                 node1Index: n1, node2Index: n2,
                 E: E_modulus, G: G_modulus, ...beamSec
             });
         }
     }
     
     // Y Yönü Kirişleri
     for (let c = 0; c < nx; c++) {
         for (let r = 0; r < ny - 1; r++) {
             const n1 = offset + r * nx + c;
             const n2 = offset + (r + 1) * nx + c;
             elements.push({
                 id: `By-${i}-${r}-${c}`, type: 'beam',
                 node1Index: n1, node2Index: n2,
                 E: E_modulus, G: G_modulus, ...beamSec
             });
         }
     }
  }

  // 2. Global Rijitlik Matrisi Montajı
  // mathjs Sparse Matrix desteği sınırlı, boyut küçükse Dense kullanabiliriz.
  // Büyük sistemler için optimizasyon gerekir.
  
  // Başlangıçta 0 matrisi (Dense)
  // Dikkat: Boyut çok büyükse tarayıcıda bellek sorunu olabilir.
  // 3 katlı, 4x4 akslı bina -> ~16 kolon * 3 = 48 düğüm * 6 = 288 DOF. 288x288 matris uygundur.
  let K_global = zeros(totalDOF, totalDOF) as Matrix;

  elements.forEach(el => {
     const n1 = nodes[el.node1Index];
     const n2 = nodes[el.node2Index];
     
     const dx = n2.x - n1.x;
     const dy = n2.y - n1.y;
     const dz = n2.z - n1.z;
     const L = Math.sqrt(dx*dx + dy*dy + dz*dz);
     
     // Lokal k
     const k_local = getLocalStiffnessMatrix(el, L);
     
     // Dönüşüm T
     const T = getTransformationMatrix(n1, n2);
     const T_trans = transpose(T);
     
     // Global k = T' * k * T
     const k_global = multiply(multiply(T_trans, k_local), T) as Matrix;
     
     // Montaj (Assembly)
     const globalIndices = [...n1.dofIndices, ...n2.dofIndices]; // 12 indeks
     
     for(let r=0; r<12; r++) {
         const globalRow = globalIndices[r];
         if (globalRow === -1) continue; // Ankastre DOF
         
         for(let c=0; c<12; c++) {
             const globalCol = globalIndices[c];
             if (globalCol === -1) continue;
             
             const val = k_global.get([r, c]);
             const current = K_global.get([globalRow, globalCol]);
             K_global.set([globalRow, globalCol], current + val);
         }
     }
  });

  // 3. Yük Vektörü (F) Oluşturma
  // Basitlik için: Sadece yatay deprem yükü (Eşdeğer Deprem Yükü) uygulayalım.
  // Gerçek çözümde: Döşeme yükleri kirişlere, kirişlerden düğümlere (Fixed End Forces) aktarılmalı.
  const F_load = zeros(totalDOF, 1) as Matrix;
  
  // Örnek: Her katın kütle merkezine veya düğümlerine yatay yük
  // State'ten gelen toplam kesme kuvvetini (Vt) katlara dağıtalım.
  // (Burada mevcut `seismicSolver` sonuçlarını kullanmak gerekirdi ama bağımsız çalışması için basit bir dağılım yapıyoruz)
  
  // Varsayım: Toplam 1000 kN yükü katlara üçgen dağıt.
  // Bu kısım `solver.ts` içinden parametre olarak gelmeli. Şimdilik demo.
  const nodePerFloorCount = nPerFloor;
  const lateralLoadPerNode = 10; // kN (Örnek değer)
  
  for (let i = 1; i <= numStories; i++) {
      for (let j = 0; j < nPerFloor; j++) {
          const nodeIdx = i * nPerFloor + j;
          const node = nodes[nodeIdx];
          const dofX = node.dofIndices[0]; // X yönü
          
          if (dofX !== -1) {
              const currentF = F_load.get([dofX, 0]);
              F_load.set([dofX, 0], currentF + lateralLoadPerNode);
          }
      }
  }

  // 4. Çözüm (K * d = F) -> d = inv(K) * F
  // Matris tersini almak yerine lineer denklem çözücü (LUP decomposition) daha iyidir ama mathjs 'inv' kullanır.
  let displacements;
  try {
      const K_inv = inv(K_global);
      displacements = multiply(K_inv, F_load);
  } catch (error) {
      console.error("Matris tekil veya çözülemedi:", error);
      return { error: "Singular Matrix" };
  }
  
  // 5. Sonuçları İşleme
  // Düğümlere deplasmanları geri yaz
  const nodeDisplacements = nodes.map(n => {
      const disp = { dx:0, dy:0, dz:0, rx:0, ry:0, rz:0 };
      if (!n.isFixed) {
          // mathjs matrix output extraction
          // displacements bir Matrix veya Array olabilir.
          const getD = (idx: number) => (displacements as Matrix).get([idx, 0]);
          
          disp.dx = getD(n.dofIndices[0]);
          disp.dy = getD(n.dofIndices[1]);
          disp.dz = getD(n.dofIndices[2]);
          disp.rx = getD(n.dofIndices[3]);
          disp.ry = getD(n.dofIndices[4]);
          disp.rz = getD(n.dofIndices[5]);
      }
      return { id: n.id, ...disp };
  });

  return {
      nodes,
      elements,
      displacements: nodeDisplacements,
      // memberForces: ... (Burada her eleman için u_global -> u_local -> k_local * u_local işlemi yapılmalı)
  };
};