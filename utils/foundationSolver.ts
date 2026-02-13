
import { AppState, CalculationResult } from "../types";
import { STEEL_FYD } from "../constants";
import { createStatus } from "./shared";

interface FoundationSolverResult {
  foundationResult: CalculationResult['foundation'];
}

export const solveFoundation = (
  state: AppState,
  W_total_N: number,
  Nd_design_N: number,
  fctd: number
): FoundationSolverResult => {
  const { dimensions, rebars } = state;
  const lx_m = Math.min(dimensions.lx, dimensions.ly);
  const ly_m = Math.max(dimensions.lx, dimensions.ly);

  const h_found_m = dimensions.foundationHeight / 100;
  const cant_m = (dimensions.foundationCantilever || 50) / 100;
  const Lx_found = lx_m + 2 * cant_m;
  const Ly_found = ly_m + 2 * cant_m;
  const Area_found = Lx_found * Ly_found;

  const W_found_self_N = Area_found * h_found_m * 25000;
  const Total_Load_Found_N = W_total_N + W_found_self_N;

  const sigma_zemin_Pa = Total_Load_Found_N / Area_found; 
  const sigma_zemin_kPa = sigma_zemin_Pa / 1000;

  // Zımbalama
  const bc_mm = state.sections.colWidth * 10;
  const hc_mm = state.sections.colDepth * 10;
  const d_found_mm = h_found_m * 1000 - 50;
  const up_mm = 2 * ((bc_mm + d_found_mm) + (hc_mm + d_found_mm));
  
  const Vpd_N = Nd_design_N;
  const moment_factor_punching = 1.40; 
  const tau_pd = (Vpd_N * moment_factor_punching) / (up_mm * d_found_mm);

  // Eğilme Donatısı
  const l_cant_mm = cant_m * 1000;
  const sigma_zemin_MPa = sigma_zemin_Pa / 1e6;
  const M_found_Nmm = (sigma_zemin_MPa * Math.pow(l_cant_mm, 2) / 2) * 1000; 

  const As_found_req = M_found_Nmm / (0.9 * STEEL_FYD * d_found_mm);
  const As_found_min = 0.002 * 1000 * (h_found_m * 1000);
  const As_found_final = Math.max(As_found_req, As_found_min);

  const barAreaFound = Math.PI * Math.pow(rebars.foundationDia / 2, 2);
  const spacingFound = Math.floor((barAreaFound * 1000) / As_found_final);

  const foundationResult = {
    stress_actual: sigma_zemin_kPa,
    stress_limit: 200,
    punching_force: Vpd_N / 1000,
    punching_stress: tau_pd,
    punching_capacity: fctd,
    moment_design: M_found_Nmm / 1e6,
    as_req: As_found_final,
    as_provided_spacing: spacingFound,
    min_thickness_check: dimensions.foundationHeight >= 30,
    checks: {
      bearing: createStatus(
          sigma_zemin_kPa <= 200, 
          'Zemin Emniyetli', 
          'Zemin Yetersiz',
          undefined,
          'Temel ampatmanlarını (taşma payını) artırarak temel alanını büyütün.'
      ),
      punching: createStatus(
          tau_pd <= fctd, 
          'Zımbalama OK', 
          'Zımbalama Riski', 
          `τ=${tau_pd.toFixed(2)} MPa`,
          'Temel (radye) kalınlığını artırın veya kolon boyutlarını büyütün.'
      ),
      bending: createStatus(true, 'Eğilme Donatısı OK')
    }
  };

  return { foundationResult };
};
