
import { AppState, CalculationResult } from "../types";
import { STEEL_FYD } from "../constants";
import { createStatus } from "./shared";

interface FoundationSolverResult {
  foundationResult: CalculationResult['foundation'];
}

export const solveFoundation = (
  state: AppState,
  W_total_N: number,
  Nd_max_col_N: number, // Zımbalama için kritik kolon yükü
  fctd: number,
  Mx_overturning: number, // Toplam Devrilme Momenti X (kNm) -> Nmm çevrilecek
  My_overturning: number  // Toplam Devrilme Momenti Y (kNm)
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

  // --- GERİLME ANALİZİ (Trapez Dağılım) ---
  // Ix ve Iy (Atalet Momentleri)
  const Ix_found = (Lx_found * Math.pow(Ly_found, 3)) / 12; // m4
  const Iy_found = (Ly_found * Math.pow(Lx_found, 3)) / 12; // m4
  
  const Wx_found = Ix_found / (Ly_found / 2); // m3
  const Wy_found = Iy_found / (Lx_found / 2); // m3

  const Mx_over_Nm = Mx_overturning * 1000;
  const My_over_Nm = My_overturning * 1000;

  // Zemin Gerilmesi (q = N/A ± Mx/Wx ± My/Wy)
  const sigma_avg = Total_Load_Found_N / Area_found; // Pa
  const sigma_bending_x = Mx_over_Nm / Wx_found; // Pa
  const sigma_bending_y = My_over_Nm / Wy_found; // Pa

  const sigma_max_Pa = sigma_avg + Math.abs(sigma_bending_x) + Math.abs(sigma_bending_y);
  const sigma_min_Pa = sigma_avg - Math.abs(sigma_bending_x) - Math.abs(sigma_bending_y);

  const sigma_max_kPa = sigma_max_Pa / 1000;
  const sigma_min_kPa = sigma_min_Pa / 1000;

  // --- ZIMBALAMA KONTROLÜ ---
  const bc_mm = state.sections.colWidth * 10;
  const hc_mm = state.sections.colDepth * 10;
  const d_found_mm = h_found_m * 1000 - 50;
  const up_mm = 2 * ((bc_mm + d_found_mm) + (hc_mm + d_found_mm));
  
  const Vpd_N = Nd_max_col_N;
  const moment_factor_punching = 1.40; 
  const tau_pd = (Vpd_N * moment_factor_punching) / (up_mm * d_found_mm);

  // --- EĞİLME DONATISI ---
  // Konsol moment hesabı için max gerilmeyi güvenli tarafta kalarak kullan
  const l_cant_mm = cant_m * 1000;
  const sigma_design_MPa = sigma_max_Pa / 1e6;
  const M_found_Nmm = (sigma_design_MPa * Math.pow(l_cant_mm, 2) / 2) * 1000; 

  const As_found_req = M_found_Nmm / (0.9 * STEEL_FYD * d_found_mm);
  const As_found_min = 0.002 * 1000 * (h_found_m * 1000);
  const As_found_final = Math.max(As_found_req, As_found_min);

  const barAreaFound = Math.PI * Math.pow(rebars.foundationDia / 2, 2);
  const spacingFound = Math.floor((barAreaFound * 1000) / As_found_final);

  const foundationResult = {
    stress_actual: sigma_max_kPa,
    stress_limit: 300, // Zemin emniyet gerilmesi varsayımı
    punching_force: Vpd_N / 1000,
    punching_stress: tau_pd,
    punching_capacity: fctd,
    moment_design: M_found_Nmm / 1e6,
    as_req: As_found_final,
    as_provided_spacing: spacingFound,
    min_thickness_check: dimensions.foundationHeight >= 30,
    checks: {
      bearing: createStatus(
          sigma_max_kPa <= 300 && sigma_min_kPa >= 0, 
          sigma_min_kPa < 0 ? 'Negatif Gerilme (Şahlanma) Var' : 'Zemin Emniyetli', 
          'Zemin Yetersiz',
          sigma_min_kPa < 0 ? 'Zemin çekme alamaz (Uplift)' : `σmax=${sigma_max_kPa.toFixed(0)} > 300`,
          'Temel alanını genişletin veya bina ağırlığını artırın (uplift için).'
      ),
      punching: createStatus(
          tau_pd <= fctd, 
          'Zımbalama OK', 
          'Zımbalama Riski', 
          `τ=${tau_pd.toFixed(2)} MPa > fctd=${fctd.toFixed(2)}`,
          'Temel (radye) kalınlığını artırın veya kolon boyutlarını büyütün.'
      ),
      bending: createStatus(true, 'Eğilme Donatısı OK')
    }
  };

  return { foundationResult };
};
