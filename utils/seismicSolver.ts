
import { AppState, CalculationResult, CheckStatus, IrregularityResult } from "../types";
import { getFs, getF1 } from "../constants";
import { createStatus } from "./shared";

interface SeismicSolverResult {
  seismicResult: CalculationResult['seismic'];
  Vt_design_N: number;
  W_total_N: number;
  fi_story_N: number[];
  // irregularities: IrregularityResult; // Bu artık FEM solver'dan gelecek verilerle birleştirilecek
}

export const solveSeismic = (
  state: AppState, 
  g_total_N_m2: number, 
  q_live_N_m2: number,
  g_beam_self_N_m: number,
  g_wall_N_m: number
): SeismicSolverResult => {
  const { dimensions, seismic, sections, materials, grid } = state;
  const { concreteClass } = materials;
  
  const storyCount = dimensions.storyCount || 1;
  const h_story = dimensions.h; 

  const numNodesX = grid.xAxis.length + 1;
  const numNodesY = grid.yAxis.length + 1;
  const Num_Cols = numNodesX * numNodesY; 
  
  // Ağırlık Hesapları
  const area_m2 = dimensions.lx * dimensions.ly;
  const W_slab_N = (g_total_N_m2 + 0.3 * q_live_N_m2) * area_m2;
  const W_beam_N = g_beam_self_N_m * 2 * (dimensions.lx + dimensions.ly);
  const W_col_N = (sections.colWidth / 100 * sections.colDepth / 100 * h_story * 25000) * Num_Cols; 
  const W_wall_N = g_wall_N_m * 2 * (dimensions.lx + dimensions.ly);
  const Wi_story_N = W_slab_N + W_beam_N + W_col_N + W_wall_N;
  const W_total_N = Wi_story_N * storyCount;

  // Spektrum ve Vt hesabı
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

  // Kat Kuvvetleri Dağılımı (Fi) - Eşdeğer Deprem Yükü Yöntemi
  // TBDY 4.7.2
  // DeltaFn hesabı (N=StoryCount) için 0.0075 N Vt formülü ihmal edildi (basitlik için)
  let sum_Wi_Hi = 0;
  for (let i = 1; i <= storyCount; i++) sum_Wi_Hi += Wi_story_N * (i * h_story);

  const fi_story_N: number[] = [];
  for (let i = 1; i <= storyCount; i++) {
    const Hi = i * h_story;
    const Fi = ((Wi_story_N * Hi) / sum_Wi_Hi) * Vt_design_N;
    fi_story_N.push(Fi);
  }

  // Geçici Boş Sonuç (Asıl sonuçlar Solver.ts içinde birleştirilecek)
  const seismicResult = {
    param_sds: Sds,
    param_sd1: Sd1,
    period_t1: T1,
    spectrum_sae: Sae_coeff,
    building_weight: W_total_N / 1000,
    base_shear: Vt_design_N / 1000,
    R_coefficient: seismic.Rx,
    I_coefficient: seismic.I,
    story_drift: {
        check: createStatus(true, 'FEM Bekleniyor'),
        delta_max: 0,
        drift_ratio: 0,
        limit: 0.008
    },
    irregularities: {
        A1: { eta_bi_max: 0, isSafe: true, message: '', details: [] },
        B1: { eta_ci_min: 0, isSafe: true, message: '' }
    }
  };

  return { seismicResult, Vt_design_N, W_total_N, fi_story_N };
};
