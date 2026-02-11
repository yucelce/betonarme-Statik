// utils/femSolver.ts
import { matrix, multiply, inv, add, zeros, Matrix, index } from 'mathjs';
import { NodeEntity, BeamEntity, ColumnEntity, MaterialParams } from '../types';
import { getConcreteProperties } from '../constants';

// Basit Düğüm Tipi
interface Node {
  id: string;
  x: number; y: number; z: number;
  dofIndices: number[]; // Global matris indeksleri (0-5 arası x NodeSayısı)
}

// Eleman Tipi (Kiriş veya Kolon)
interface Element {
  id: string;
  startNodeId: string;
  endNodeId: string;
  E: number; // Elastisite Modülü
  G: number; // Kayma Modülü
  A: number; // Kesit Alanı
  Iy: number; // Atalet (Y ekseni etrafında)
  Iz: number; // Atalet (Z ekseni etrafında)
  J: number;  // Burulma Ataleti
}

/**
 * 12x12 Lokal Rijitlik Matrisini Oluşturur (3D Çubuk Eleman)
 */
const getElementStiffnessMatrix = (el: Element, L: number): Matrix => {
  const { E, G, A, Iy, Iz, J } = el;
  
  const k = zeros(12, 12) as Matrix;
  
  // Eksenel
  const k_axial = (E * A) / L;
  
  // Burulma
  const k_torsion = (G * J) / L;
  
  // Eğilme (Y ekseni etrafında - z yönünde deplasman)
  const a_y = (12 * E * Iy) / (L ** 3);
  const b_y = (6 * E * Iy) / (L ** 2);
  const c_y = (4 * E * Iy) / L;
  const d_y = (2 * E * Iy) / L;

  // Eğilme (Z ekseni etrafında - y yönünde deplasman)
  const a_z = (12 * E * Iz) / (L ** 3);
  const b_z = (6 * E * Iz) / (L ** 2);
  const c_z = (4 * E * Iz) / L;
  const d_z = (2 * E * Iz) / L;

  // Matris Atamaları (Sadece diyagonal ve ilişkili terimler örneği)
  // Not: mathjs indexleri 0 tabanlıdır.
  
  // Eksenel (Fx)
  k.set([0, 0], k_axial);   k.set([0, 6], -k_axial);
  k.set([6, 0], -k_axial);  k.set([6, 6], k_axial);

  // Kesme Y (Fy) & Eğilme Z (Mz)
  k.set([1, 1], a_z);      k.set([1, 5], b_z);      k.set([1, 7], -a_z);     k.set([1, 11], b_z);
  k.set([5, 1], b_z);      k.set([5, 5], c_z);      k.set([5, 7], -b_z);     k.set([5, 11], d_z);
  k.set([7, 1], -a_z);     k.set([7, 5], -b_z);     k.set([7, 7], a_z);      k.set([7, 11], -b_z);
  k.set([11, 1], b_z);     k.set([11, 5], d_z);     k.set([11, 7], -b_z);    k.set([11, 11], c_z);

  // Kesme Z (Fz) & Eğilme Y (My)
  k.set([2, 2], a_y);      k.set([2, 4], -b_y);     k.set([2, 8], -a_y);     k.set([2, 10], -b_y);
  k.set([4, 2], -b_y);     k.set([4, 4], c_y);      k.set([4, 8], b_y);      k.set([4, 10], d_y);
  k.set([8, 2], -a_y);     k.set([8, 4], b_y);      k.set([8, 8], a_y);      k.set([8, 10], b_y);
  k.set([10, 2], -b_y);    k.set([10, 4], d_y);     k.set([10, 8], b_y);     k.set([10, 10], c_y);

  // Burulma (Mx)
  k.set([3, 3], k_torsion); k.set([3, 9], -k_torsion);
  k.set([9, 3], -k_torsion); k.set([9, 9], k_torsion);

  return k;
};

// ... Dönüşüm Matrisi (T) ve Global Assembly fonksiyonları buraya eklenecektir.
// Bu yapı, yaklaşık yöntemlerin yerine gerçek matris çözümünün temelini oluşturur.