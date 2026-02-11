// utils/solver.ts
import { AppState, CalculationResult } from "../types";
import { getConcreteProperties } from "../constants";
import { solveSlab } from "./slabSolver";
import { solveSeismic } from "./seismicSolver";
import { solveBeams } from "./beamSolver";
import { solveColumns } from "./columnSolver";
import { solveFoundation } from "./foundationSolver";

export const calculateStructure = (state: AppState): CalculationResult => {
  const { materials } = state;
  const { fck, fcd, fctd, Ec } = getConcreteProperties(materials.concreteClass);

  // 1. DÖŞEME HESABI
  const { slabResult, q_beam_design_N_m, g_total_N_m2, q_live_N_m2, g_beam_self_N_m, g_wall_N_m } = solveSlab(state);

  // 2. DEPREM HESABI
  const { seismicResult, Vt_design_N, W_total_N } = solveSeismic(state, g_total_N_m2, q_live_N_m2, g_beam_self_N_m, g_wall_N_m);

  // 3. KİRİŞ HESABI
  const { beamsResult, Mr_beam_Nmm, As_beam_supp_final, As_beam_span_final } = solveBeams(
    state, q_beam_design_N_m, Vt_design_N, fcd, fctd, Ec
  );

  // 4. KOLON HESABI
  const { columnsResult, jointResult, Nd_design_N } = solveColumns(
    state, W_total_N, Vt_design_N, Mr_beam_Nmm, As_beam_supp_final, As_beam_span_final,
    g_total_N_m2, q_live_N_m2, g_beam_self_N_m, g_wall_N_m, fck, fcd, fctd, Ec
  );

  // 5. TEMEL HESABI
  const { foundationResult } = solveFoundation(state, W_total_N, Nd_design_N, fctd);

  return {
    slab: slabResult,
    beams: beamsResult,
    columns: columnsResult,
    seismic: seismicResult,
    foundation: foundationResult,
    joint: jointResult
  };
};