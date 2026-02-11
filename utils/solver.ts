// utils/solver.ts
import { AppState, AnalysisSummary, CheckStatus } from "../types";
import { generateModel } from "./modelGenerator";
import { GRAVITY, createStatus } from "./shared";
import { getConcreteProperties, getFs, getF1 } from "../constants";

// Basitleştirilmiş: Her elemanı kritik açıklık gibi çözer.
// İleri seviyede matris çözümü eklenebilir.

export const calculateFullStructure = (state: AppState): AnalysisSummary => {
  // 1. Modeli Oluştur
  const model = generateModel(state);
  const { concreteClass } = state.materials;
  const { fck, fcd, Ec } = getConcreteProperties(concreteClass);

  let totalWeight_N = 0;
  let maxSlabMoment = 0;
  let maxBeamMoment = 0;

  const storyCount = state.dimensions.storyCount;

  // --- A. DÖŞEME HESAPLARI ---
  let totalSlabArea = 0;
  
  model.slabs.forEach(slab => {
    const area = slab.lx * slab.ly;
    totalSlabArea += area;
    
    // Yükler
    const g_slab = (slab.thickness / 100) * 25000; // N/m2
    const g_coat = state.loads.deadLoadCoatingsKg * GRAVITY;
    const q_live = state.loads.liveLoadKg * GRAVITY;
    
    const pd = 1.4 * (g_slab + g_coat) + 1.6 * q_live;
    
    // Moment (Basit Yaklaşım: alpha * Pd * l^2)
    const m_ratio = Math.max(slab.lx, slab.ly) / Math.min(slab.lx, slab.ly);
    let alpha = 0.049; // Basit mesnet kabulü (Ortalama)
    
    const M_slab = alpha * pd * Math.pow(Math.min(slab.lx, slab.ly), 2) / 1000; // kNm
    if (M_slab > maxSlabMoment) maxSlabMoment = M_slab;

    // Ağırlık Toplama (Tüm katlar)
    const w_slab = (g_slab + g_coat + 0.3 * q_live) * area;
    totalWeight_N += w_slab * storyCount;
  });

  // --- B. KİRİŞ HESAPLARI ---
  model.beams.forEach(beam => {
    // Öz ağırlık
    const g_beam = (beam.bw / 100) * (beam.h / 100) * 25000; // N/m
    const g_wall = 3500; // Duvar yükü N/m
    const q_design = 1.4 * (g_beam + g_wall) + 15000; // Döşemeden gelen yaklaşık yük (15kN/m varsayım)
    
    const L = beam.length;
    const M_beam = (q_design * L * L) / 10 / 1000; // kNm (qL2/10 sürekli kiriş yaklaşımı)
    
    if (M_beam > maxBeamMoment) maxBeamMoment = M_beam;

    // Ağırlık
    const w_beam = (g_beam + g_wall) * L;
    totalWeight_N += w_beam * storyCount;
  });

  // --- C. KOLON HESAPLARI ---
  // Toplam yükü kolon sayısına bölerek ortalama bir kolon hesabı yapıyoruz (Yaklaşık)
  // Gerçek çözümde "Tributary Area" hesabı gerekir.
  const totalColCount = model.columns.length;
  model.columns.forEach(col => {
      const colVol = (col.b/100) * (col.h/100) * state.dimensions.h;
      const w_col = colVol * 25000;
      totalWeight_N += w_col * storyCount;
  });

  const avgLoadPerCol_N = totalWeight_N / Math.max(1, totalColCount);
  const Nd_design = 1.4 * avgLoadPerCol_N; // Kabaca tasarım yükü
  const maxColAxial_kN = Nd_design / 1000;

  // --- D. DEPREM HESABI (Tüm Bina) ---
  const { ss, s1, soilClass, Rx, I } = state.seismic;
  const Fs = getFs(ss, soilClass);
  const Sds = ss * Fs;
  
  // Basit Taban Kesme Formülü
  const totalHeight = state.dimensions.h * storyCount;
  const T1 = 0.07 * Math.pow(totalHeight, 0.75); // Betonarme Çerçeve yaklaşık periyot
  
  // Spektrum katsayısı (Basitleştirilmiş max değer)
  const Sae = Sds; 
  const Vt = (totalWeight_N * Sae * I) / Rx;

  return {
    totalWeight_kN: totalWeight_N / 1000,
    baseShear_kN: Vt / 1000,
    totalSlabArea_m2: totalSlabArea,
    maxSlabMoment_kNm: maxSlabMoment,
    maxBeamMoment_kNm: maxBeamMoment,
    maxColAxial_kN: maxColAxial_kN,
    status: createStatus(true, "Analiz Tamamlandı")
  };
};