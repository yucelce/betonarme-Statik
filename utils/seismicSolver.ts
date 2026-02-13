
import { AppState, CalculationResult, CheckStatus, IrregularityResult } from "../types";
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
  const { dimensions, seismic, sections, materials, grid } = state;
  const storyCount = dimensions.storyCount || 1;
  const basementCount = dimensions.basementCount || 0;
  const storyHeights = dimensions.storyHeights;

  const numNodesX = grid.xAxis.length + 1;
  const numNodesY = grid.yAxis.length + 1;
  const Num_Cols = numNodesX * numNodesY; 
  
  const area_m2 = dimensions.lx * dimensions.ly;
  const W_slab_N = (g_total_N_m2 + 0.3 * q_live_N_m2) * area_m2;
  const W_beam_N = g_beam_self_N_m * 2 * (dimensions.lx + dimensions.ly);
  const W_wall_N = g_wall_N_m * 2 * (dimensions.lx + dimensions.ly);

  let W_total_N = 0;
  const weightsPerStory: number[] = [];
  const heightsPerStory: number[] = []; 
  
  let currentHeightAboveGround = 0;

  for (let i = 0; i < storyCount; i++) {
      const h = storyHeights[i] || 3;
      const isBasement = i < basementCount;
      
      if (!isBasement) {
         currentHeightAboveGround += h;
         heightsPerStory.push(currentHeightAboveGround);
      } else {
         heightsPerStory.push(0); 
      }
      
      const W_col_N = (sections.colWidth / 100 * sections.colDepth / 100 * h * 25000) * Num_Cols; 
      const Wi = W_slab_N + W_beam_N + W_col_N + W_wall_N;
      weightsPerStory.push(Wi);
      W_total_N += Wi;
  }

  // Spektrum ve Vt hesabı
  const Fs = getFs(seismic.ss, seismic.soilClass);
  const F1 = getF1(seismic.s1, seismic.soilClass);
  const Sds = seismic.ss * Fs;
  const Sd1 = seismic.s1 * F1;
  
  // T1 Periyodu
  const Hn = currentHeightAboveGround;
  const T1 = 0.1 * Math.pow(Hn, 0.75); 

  const Sae_coeff = ((T: number): number => {
    const Ta = 0.2 * (Sd1 / Sds);
    const Tb = Sd1 / Sds;
    if (T < Ta) return (0.4 + 0.6 * (T / Ta)) * Sds;
    if (T <= Tb) return Sds;
    return Sd1 / T;
  })(T1);

  const Ra = seismic.Rx || 8;
  const I_bldg = seismic.I || 1.0;
  
  // Taban kesme kuvveti
  const Vt_calc_N = (W_total_N * Sae_coeff * I_bldg) / Ra;
  const Vt_min_N = 0.04 * W_total_N * I_bldg * Sds;
  const Vt_design_N = Math.max(Vt_calc_N, Vt_min_N);

  // Kat Kuvvetleri Dağılımı
  let sum_Wi_Hi = 0;
  for (let i = 0; i < storyCount; i++) {
      sum_Wi_Hi += weightsPerStory[i] * heightsPerStory[i];
  }

  const fi_story_N: number[] = [];
  for (let i = 0; i < storyCount; i++) {
    const Fi = sum_Wi_Hi > 0 ? ((weightsPerStory[i] * heightsPerStory[i]) / sum_Wi_Hi) * Vt_design_N : 0;
    fi_story_N.push(Fi);
  }

  const isHeightSafe = Hn <= 40;
  
  const seismicResult = {
    param_sds: Sds,
    param_sd1: Sd1,
    period_t1: T1,
    spectrum_sae: Sae_coeff,
    building_weight: W_total_N / 1000,
    base_shear: Vt_design_N / 1000,
    R_coefficient: seismic.Rx,
    I_coefficient: seismic.I,
    method_check: {
        isApplicable: true, 
        reason: '',
        checks: {
            height: createStatus(isHeightSafe, `Hn = ${Hn.toFixed(1)}m ≤ 40m`, 'Bina Yüksekliği Sınırı Aşıldı', `Hn = ${Hn.toFixed(1)}m`),
            torsion: createStatus(true, 'Kontrol Bekleniyor')
        }
    },
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
