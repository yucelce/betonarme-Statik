import { AppState, CalculationResult } from "../types";
import { getFs, getF1 } from "../constants";
import { createStatus, GRAVITY } from "./shared";

interface SeismicSolverResult {
  seismicResult: CalculationResult['seismic'];
  Vt_design_N: number;
  W_total_N: number;
}

export const solveSeismic = (
  state: AppState, 
  g_total_N_m2: number, 
  q_live_N_m2: number
): SeismicSolverResult => {
  const { dimensions, seismic, sections } = state;

  const storyCount = dimensions.storyCount || 1;
  const totalHeight_m = dimensions.h * storyCount;
  
  // Ağırlık Hesabı
  const area_m2 = dimensions.lx * dimensions.ly;
  const bw_m = sections.beamWidth / 100;
  const h_beam_m = sections.beamDepth / 100;
  const g_beam_self_N_m = bw_m * h_beam_m * 25000;
  const g_wall_N_m = 3500;

  const W_slab_N = (g_total_N_m2 + 0.3 * q_live_N_m2) * area_m2;
  const W_beam_N = g_beam_self_N_m * 2 * (dimensions.lx + dimensions.ly);
  const W_col_N = (sections.colWidth / 100 * sections.colDepth / 100 * dimensions.h * 25000) * 4;
  const W_wall_N = g_wall_N_m * 2 * (dimensions.lx + dimensions.ly);

  const W_story_N = W_slab_N + W_beam_N + W_col_N + W_wall_N;
  const W_total_N = W_story_N * storyCount;

  // Spektrum
  const Fs = getFs(seismic.ss, seismic.soilClass);
  const F1 = getF1(seismic.s1, seismic.soilClass);
  const Sds = seismic.ss * Fs;
  const Sd1 = seismic.s1 * F1;

  const T1 = 0.1 * Math.pow(totalHeight_m, 0.75);

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

  const seismicResult = {
    param_sds: Sds,
    param_sd1: Sd1,
    period_t1: T1,
    spectrum_sae: Sae_coeff,
    building_weight: W_total_N / 1000,
    base_shear: Vt_design_N / 1000,
    story_drift_check: createStatus(true, 'Göreli Öteleme Kontrol Edilmeli'),
    R_coefficient: seismic.Rx,
    I_coefficient: seismic.I
  };

  return { seismicResult, Vt_design_N, W_total_N };
};