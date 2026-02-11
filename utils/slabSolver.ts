import { AppState, CalculationResult } from "../types";
import { STEEL_FYD } from "../constants";
import { createStatus, GRAVITY } from "./shared";

interface SlabSolverResult {
  slabResult: CalculationResult['slab'];
  q_beam_design_N_m: number; // Kiriş hesabına aktarılacak
  pd_N_m2: number; // Deprem hesabına aktarılacak
  g_total_N_m2: number; // Ölü yük toplamı
  q_live_N_m2: number; // Hareketli yük toplamı
  g_beam_self_N_m: number;
  g_wall_N_m: number;
}

export const solveSlab = (state: AppState): SlabSolverResult => {
  const { dimensions, loads, rebars, sections } = state;

  const lx_m = Math.min(dimensions.lx, dimensions.ly);
  const ly_m = Math.max(dimensions.lx, dimensions.ly);
  const m_ratio = ly_m / lx_m;

  // 1. YÜK ANALİZİ
  const h_slab_m = sections.slabThickness / 100;
  const g_slab_N_m2 = h_slab_m * 25000;
  const g_coating_N_m2 = loads.deadLoadCoatingsKg * GRAVITY;
  const q_live_N_m2 = loads.liveLoadKg * GRAVITY;
  
  const g_total_N_m2 = g_slab_N_m2 + g_coating_N_m2;
  const pd_N_m2 = 1.4 * g_total_N_m2 + 1.6 * q_live_N_m2;

  // Kiriş Yükleri (N/m)
  const load_triangle_base = (pd_N_m2 * lx_m) / 3;
  const trapezoidal_factor = (1.5 - (0.5 / (m_ratio * m_ratio)));
  const q_eq_slab_N_m = load_triangle_base * trapezoidal_factor;

  const bw_m = sections.beamWidth / 100;
  const h_beam_m = sections.beamDepth / 100;
  const g_beam_self_N_m = bw_m * h_beam_m * 25000;
  const g_wall_N_m = 3500;

  const q_beam_design_N_m = q_eq_slab_N_m + 1.4 * g_beam_self_N_m + 1.4 * g_wall_N_m;

  // 2. DÖŞEME HESABI
  let alpha = 0.049;
  if (m_ratio > 2.0) alpha = 0.083;
  else if (m_ratio <= 1.2) alpha = 0.035;

  const M_slab_Nm = alpha * pd_N_m2 * Math.pow(lx_m, 2);
  const M_slab_Nmm = M_slab_Nm * 1000;

  const d_slab_mm = sections.slabThickness * 10 - 20;

  const As_req_slab = M_slab_Nmm / (0.9 * STEEL_FYD * d_slab_mm);
  const As_min_slab = 0.002 * 1000 * (sections.slabThickness * 10);
  const As_slab_design = Math.max(As_req_slab, As_min_slab);

  const rho_slab = As_slab_design / (1000 * d_slab_mm);
  const ln_slab_cm = Math.min(dimensions.lx, dimensions.ly) * 100;
  const min_thick_calc = ln_slab_cm / 30;
  const min_thick_limit = 8;

  const barAreaSlab = Math.PI * Math.pow(rebars.slabDia / 2, 2);
  const spacingSlab = Math.floor(Math.min((barAreaSlab * 1000) / As_slab_design, 200) / 10) * 10;

  const slabResult = {
    pd: pd_N_m2 / 1000,
    alpha,
    d: d_slab_mm,
    m_x: M_slab_Nm / 1000,
    as_req: As_req_slab,
    as_min: As_min_slab,
    spacing: spacingSlab,
    min_thickness_calculated: min_thick_calc,
    min_thickness_limit: min_thick_limit,
    rho: rho_slab,
    thicknessStatus: createStatus(
      sections.slabThickness >= min_thick_calc && sections.slabThickness >= min_thick_limit,
      'Uygun',
      'Kalınlık Yetersiz',
      `Gereken: ${Math.max(min_thick_calc, min_thick_limit).toFixed(1)} cm`
    ),
    status: createStatus(true)
  };

  return { slabResult, q_beam_design_N_m, pd_N_m2, g_total_N_m2, q_live_N_m2, g_beam_self_N_m, g_wall_N_m };
};