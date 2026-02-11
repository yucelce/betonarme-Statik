// utils/seismicSolver.ts
import { AppState, CalculationResult, CheckStatus } from "../types";
import { getFs, getF1 } from "../constants";
import { createStatus } from "./shared";

interface SeismicSolverResult {
  seismicResult: CalculationResult['seismic'];
  Vt_design_N: number;
  W_total_N: number;
  fi_story_N: number[];
}

export const solveSeismic = (
  state: AppState, 
  g_total_N_m2: number, 
  q_live_N_m2: number,
  g_beam_self_N_m: number,
  g_wall_N_m: number
): SeismicSolverResult => {
  const { dimensions, seismic, sections, materials } = state;
  const { concreteClass } = materials;
  
  // Ec (Elastisite Modülü) Tahmini (Basitleştirilmiş)
  const Ec_map: Record<string, number> = { 'C20': 28000, 'C25': 30000, 'C30': 32000, 'C35': 33000, 'C40': 34000, 'C50': 37000 };
  const Ec = Ec_map[concreteClass] || 30000;

  const storyCount = dimensions.storyCount || 1;
  const h_story = dimensions.h; 
  
  // ... (Ağırlık hesapları önceki kodla aynı - W_total_N hesabı)
  const area_m2 = dimensions.lx * dimensions.ly;
  const W_slab_N = (g_total_N_m2 + 0.3 * q_live_N_m2) * area_m2;
  const W_beam_N = g_beam_self_N_m * 2 * (dimensions.lx + dimensions.ly);
  const W_col_N = (sections.colWidth / 100 * sections.colDepth / 100 * h_story * 25000) * 4; 
  const W_wall_N = g_wall_N_m * 2 * (dimensions.lx + dimensions.ly);
  const Wi_story_N = W_slab_N + W_beam_N + W_col_N + W_wall_N;
  const W_total_N = Wi_story_N * storyCount;

  // ... (Spektrum ve Vt hesabı önceki kodla aynı)
  const Fs = getFs(seismic.ss, seismic.soilClass);
  const F1 = getF1(seismic.s1, seismic.soilClass);
  const Sds = seismic.ss * Fs;
  const Sd1 = seismic.s1 * F1;
  
  const totalHeight_m = h_story * storyCount;
  const T1 = 0.1 * Math.pow(totalHeight_m, 0.75); 

  // Sae Hesabı
  const Sae_coeff = ((T: number): number => {
    const Ta = 0.2 * (Sd1 / Sds);
    const Tb = Sd1 / Sds;
    if (T < Ta) return (0.4 + 0.6 * (T / Ta)) * Sds;
    if (T <= Tb) return Sds;
    return Sd1 / T;
  })(T1);

  const Ra = seismic.Rx || 8;
  const I_bldg = seismic.I || 1.0;
  const Vt_calc_N = (W_total_N * Sae_coeff * I_bldg) / Ra;
  const Vt_min_N = 0.04 * W_total_N * I_bldg * Sds;
  const Vt_design_N = Math.max(Vt_calc_N, Vt_min_N);

  // Kat Kuvvetleri Dağılımı (Fi)
  let sum_Wi_Hi = 0;
  for (let i = 1; i <= storyCount; i++) sum_Wi_Hi += Wi_story_N * (i * h_story);

  const fi_story_N: number[] = [];
  for (let i = 1; i <= storyCount; i++) {
    const Hi = i * h_story;
    const Fi = ((Wi_story_N * Hi) / sum_Wi_Hi) * Vt_design_N;
    fi_story_N.push(Fi);
  }

  // --- YENİ GELİŞTİRME: GÖRELİ ÖTELEME (DRIFT) KONTROLÜ ---
  // TBDY 2018 Madde 4.9.1 (Lambda * delta / h <= 0.008 veya 0.016)
  // Basitleştirilmiş Rijitlik Tahmini: Kolonların kesme rijitliği üzerinden
  
  // Kolon Atalet Momenti (Yaklaşık toplam) - Izgara sayısına göre dinamik olmalı ama şimdilik 4 köşe kabulü
  const Ic_one = (Math.pow(sections.colDepth * 10, 3) * (sections.colWidth * 10)) / 12; // mm4
  const Num_Cols = 4; // Bu modelGenerator'dan dinamik gelebilir ama şimdilik güvenli taraf
  const Sum_Ic = Num_Cols * Ic_one;
  
  // Kat kesme kuvveti (En alt kat için Vt alınır)
  const V_story = Vt_design_N;
  
  // Elastik yer değiştirme (Delta = V * h^3 / 12 * E * I_toplam) - Ankastre kabulü
  // Çatlamış kesit için Ieff = 0.70 * Ic varsayımı
  const I_eff = 0.70 * Sum_Ic;
  const h_mm = h_story * 1000;
  
  // Delta_elastic (mm)
  const delta_elastic_mm = (V_story * Math.pow(h_mm, 3)) / (12 * Ec * I_eff);
  
  // Deprem Yönetmeliği Etkin Göreli Öteleme (delta_max = R * delta_elastic)
  const delta_max_mm = Ra * delta_elastic_mm;
  
  // Göreli Öteleme Oranı
  const drift_ratio = delta_max_mm / h_mm;
  
  // Sınır Değer (Gevrek malzemeli dolgu duvarlar için 0.008, esnek için 0.016)
  // Güvenli tarafta kalarak 0.008 alıyoruz.
  const drift_limit = 0.008;

  const seismicResult = {
    param_sds: Sds,
    param_sd1: Sd1,
    period_t1: T1,
    spectrum_sae: Sae_coeff,
    building_weight: W_total_N / 1000,
    base_shear: Vt_design_N / 1000,
    R_coefficient: seismic.Rx,
    I_coefficient: seismic.I,
    // YENİ DRIFT DATA
    story_drift: {
        check: createStatus(drift_ratio <= drift_limit, 'Öteleme Uygun', 'Öteleme Sınırı Aşıldı'),
        delta_max: delta_max_mm,
        drift_ratio: drift_ratio,
        limit: drift_limit
    }
  };

  return { seismicResult, Vt_design_N, W_total_N, fi_story_N };
};