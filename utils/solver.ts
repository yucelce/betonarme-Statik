// utils/solver.ts
import { AppState, CalculationResult } from "../types";
import { getConcreteProperties } from "../constants";
import { solveSlab } from "./slabSolver";
import { solveSeismic } from "./seismicSolver";
import { solveBeams } from "./beamSolver";
import { solveColumns } from "./columnSolver";
import { solveFoundation } from "./foundationSolver";

/**
 * ANA HESAPLAMA FONKSİYONU
 * ----------------------------------------------------------------------------
 */
export const calculateStructure = (state: AppState): CalculationResult => {
  // 0. Malzeme
  const { fck, fcd, fctd, Ec } = getConcreteProperties(state.materials.concreteClass);

  // 1. Döşeme & Yük Analizi
  const { slabResult, q_beam_design_N_m, pd_N_m2, g_total_N_m2, q_live_N_m2 } = solveSlab(state);

  // 2. Deprem (Ağırlıklar buradan gelir)
  const { seismicResult, Vt_design_N, W_total_N } = solveSeismic(state, g_total_N_m2, q_live_N_m2);

  // 3. Kiriş
  const { beamsResult, Mr_beam_Nmm, As_beam_supp_final, As_beam_span_final } = solveBeams(
    state,
    q_beam_design_N_m,
    Vt_design_N,
    fcd,
    fctd,
    Ec
  );

  // 4. Kolon (Kiriş ve Yük Sonuçlarını Alır)
  const g_beam_self_N_m = (state.sections.beamWidth / 100) * (state.sections.beamDepth / 100) * 25000;
  const g_wall_N_m = 3500;

  const { columnsResult, jointResult, Nd_design_N } = solveColumns(
    state,
    W_total_N,
    Vt_design_N,
    Mr_beam_Nmm,
    As_beam_supp_final,
    As_beam_span_final,
    g_total_N_m2,
    q_live_N_m2,
    g_beam_self_N_m,
    g_wall_N_m,
    fck,
    fcd,
    fctd,
    Ec
  );

  // 5. Temel (Toplam Ağırlık ve Kolon Yükünü Alır)
  const { foundationResult } = solveFoundation(state, W_total_N, Nd_design_N, fctd);

  // 6. Sonuç Birleştirme
  return {
    slab: slabResult,
    beams: beamsResult,
    columns: columnsResult,
    seismic: seismicResult,
    foundation: foundationResult,
    joint: jointResult
  };
};