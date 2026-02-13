
import { AppState, CalculationResult, CheckStatus, IrregularityResult } from "../types";
import { getFs, getF1 } from "../constants";
import { createStatus, GRAVITY } from "./shared";

interface SeismicSolverResult {
  seismicResult: CalculationResult['seismic'];
  Vt_design_X: number;
  Vt_design_Y: number;
  W_total_N: number;
  fi_story_X: number[];
  fi_story_Y: number[];
  weightsPerStory: number[];
}

/**
 * Rayleigh Metodu ile Doğal Titreşim Periyodu Hesabı
 * T = 2 * PI * sqrt( sum(mi * di^2) / sum(Fi * di) )
 */
export const calculateRayleighPeriod = (
    data: { mass: number; force: number; displacement: number }[]
): number => {
    let sum_m_d2 = 0;
    let sum_F_d = 0;

    data.forEach(d => {
        // mass (ton) -> kg için * 1000
        // force (kN) -> N için * 1000
        // displacement (mm) -> m için / 1000
        const m_kg = d.mass * 1000;
        const F_N = d.force * 1000;
        const disp_m = d.displacement / 1000;

        sum_m_d2 += m_kg * Math.pow(disp_m, 2);
        sum_F_d += F_N * disp_m;
    });

    if (sum_F_d === 0) return 0;
    return 2 * Math.PI * Math.sqrt(sum_m_d2 / sum_F_d);
};

export const solveSeismic = (
  state: AppState, 
  g_total_N_m2: number, 
  q_live_N_m2: number,
  g_beam_self_N_m: number,
  g_wall_N_m: number,
  periodOverride?: { Tx?: number, Ty?: number } // İterasyon için opsiyonel periyotlar
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
      weightsPerStory.push(Wi); // N biriminde
      W_total_N += Wi;
  }

  // Spektrum
  const Fs = getFs(seismic.ss, seismic.soilClass);
  const F1 = getF1(seismic.s1, seismic.soilClass);
  const Sds = seismic.ss * Fs;
  const Sd1 = seismic.s1 * F1;
  
  // Ampirik Periyot (Başlangıç veya Kontrol)
  const Hn = currentHeightAboveGround;
  const Ct = 0.1; 
  const T_empirical = Ct * Math.pow(Hn, 0.75); 

  // Periyot Belirleme (Override varsa kullan, yoksa ampirik)
  // TBDY 4.7.3.1: Hesaplanan periyot, ampirik periyodun 1.4 katından fazla olamaz.
  let Tx = periodOverride?.Tx || T_empirical;
  let Ty = periodOverride?.Ty || T_empirical;

  const T_max_limit = 1.4 * T_empirical;
  if (Tx > T_max_limit) Tx = T_max_limit;
  if (Ty > T_max_limit) Ty = T_max_limit;

  const getSae = (T: number): number => {
    const Ta = 0.2 * (Sd1 / Sds);
    const Tb = Sd1 / Sds;
    if (T < Ta) return (0.4 + 0.6 * (T / Ta)) * Sds;
    if (T <= Tb) return Sds;
    return Sd1 / T;
  };

  const Sae_X = getSae(Tx);
  const Sae_Y = getSae(Ty);

  const Ra = seismic.Rx || 8;
  const I_bldg = seismic.I || 1.0;
  
  // Taban Kesme Kuvvetleri
  const Vt_calc_N_X = (W_total_N * Sae_X * I_bldg) / Ra;
  const Vt_calc_N_Y = (W_total_N * Sae_Y * I_bldg) / Ra;
  
  const Vt_min_N = 0.04 * W_total_N * I_bldg * Sds;
  
  const Vt_design_X = Math.max(Vt_calc_N_X, Vt_min_N);
  const Vt_design_Y = Math.max(Vt_calc_N_Y, Vt_min_N);

  // Kat Kuvvetleri Dağılımı
  let sum_Wi_Hi = 0;
  for (let i = 0; i < storyCount; i++) {
      sum_Wi_Hi += weightsPerStory[i] * heightsPerStory[i];
  }

  const fi_story_X: number[] = [];
  const fi_story_Y: number[] = [];
  
  for (let i = 0; i < storyCount; i++) {
    const ratio = sum_Wi_Hi > 0 ? ((weightsPerStory[i] * heightsPerStory[i]) / sum_Wi_Hi) : 0;
    fi_story_X.push(ratio * Vt_design_X);
    fi_story_Y.push(ratio * Vt_design_Y);
  }

  const isHeightSafe = Hn <= 40;
  
  const seismicResult = {
    param_sds: Sds,
    param_sd1: Sd1,
    period_t1: T_empirical,
    period_rayleigh_x: Tx,
    period_rayleigh_y: Ty,
    spectrum_sae: Math.max(Sae_X, Sae_Y),
    building_weight: W_total_N / 1000,
    base_shear_x: Vt_design_X / 1000,
    base_shear_y: Vt_design_Y / 1000,
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

  return { seismicResult, Vt_design_X, Vt_design_Y, W_total_N, fi_story_X, fi_story_Y, weightsPerStory };
};
