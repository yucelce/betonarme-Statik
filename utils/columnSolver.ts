// utils/columnSolver.ts
import { AppState, CalculationResult } from "../types";
import { STEEL_FYK } from "../constants";
import { createStatus, calculateColumnCapacityForAxialLoad, checkColumnConfinement } from "./shared";

interface ColumnSolverResult {
  columnsResult: CalculationResult['columns'];
  jointResult: CalculationResult['joint'];
  Nd_design_N: number;
}

export const solveColumns = (
  state: AppState,
  Nd_design_N: number, 
  Vt_design_N: number,
  sum_Mr_beams_Nmm: number, // GÜNCELLENDİ: Gerçek Kiriş Moment Toplamı
  As_beam_supp_final: number,
  As_beam_span_final: number,
  isJointConfined: boolean, // GÜNCELLENDİ: Kuşatılmışlık Durumu
  fck: number,
  fcd: number,
  fctd: number,
  Ec: number
): ColumnSolverResult => {
  const { dimensions, sections, rebars } = state;

  const bc_mm = sections.colWidth * 10;
  const hc_mm = sections.colDepth * 10;
  const Ac_col_mm2 = bc_mm * hc_mm;
  const h_beam_mm = sections.beamDepth * 10;

  // Moment (Basit Yaklaşım)
  const M_elastic_Nmm = (Vt_design_N * (dimensions.h * 1000)) / 2;
  const Md_design_Nmm = M_elastic_Nmm;

  // Donatı
  const barAreaCol = Math.PI * Math.pow(rebars.colMainDia / 2, 2);
  let countCol = Math.max(4, Math.ceil((Ac_col_mm2 * 0.01) / barAreaCol));
  if (countCol % 2 !== 0) countCol++; 

  const As_col_total = countCol * barAreaCol;
  const rho_col = As_col_total / Ac_col_mm2;

  // Kapasite Hesabı (P-M Etkileşimi)
  const colCapacity = calculateColumnCapacityForAxialLoad(
    bc_mm, hc_mm, As_col_total, fcd, fck, Nd_design_N
  );
  const Mr_col_Nmm = colCapacity.Mr_Nmm;

  // --- GÜÇLÜ KOLON KONTROLÜ (TBDY 7.3) ---
  const sum_M_col = 2 * Mr_col_Nmm; // Kolon alt + üst
  const sum_M_beam_hardening = sum_Mr_beams_Nmm * 1.4; // Pekleşmeli Kiriş Momenti
  
  // Sıfıra bölme hatasını önle
  const safe_beam_moment = sum_M_beam_hardening === 0 ? 1 : sum_M_beam_hardening;
  const strongColRatio = sum_M_col / safe_beam_moment;

  // Kesme
  const M_capacity_hardening = Mr_col_Nmm * 1.4;
  const ln_col_mm = (dimensions.h * 1000) - h_beam_mm;
  const Ve_col_N = (2 * M_capacity_hardening) / ln_col_mm;

  const d_col_shear = hc_mm - 30; 
  const Vcr_col = 0.65 * fctd * bc_mm * d_col_shear;
  const Vc_col_N = 0.8 * Vcr_col * (1 + (0.07 * Nd_design_N) / Ac_col_mm2);

  const colStirrupDia = rebars.colStirrupDia || 8;
  const confResult = checkColumnConfinement(
    sections.colWidth * 10, sections.colDepth * 10, fck, colStirrupDia, rebars.colMainDia
  );

  const s_used_col = confResult.s_conf; 
  const Asw_col = confResult.Ash_prov;
  const d_col = hc_mm - 30;
  const Vw_col_N = (Asw_col * 420 * d_col) / s_used_col;

  const Vr_max_col = 0.22 * fcd * Ac_col_mm2;
  const Vr_col_N = Math.min(Vc_col_N + Vw_col_N, Vr_max_col);

  // Narinlik
  const Ic = (bc_mm * Math.pow(hc_mm, 3)) / 12;
  const i_rad = 0.3 * hc_mm;
  const lambda = ln_col_mm / i_rad;
  const isSlender = lambda > 34; 

  let beta = 1.0;
  if (isSlender) {
    const EI = 0.4 * Ec * Ic;
    const Nk = (Math.PI ** 2 * EI) / (ln_col_mm ** 2);
    beta = 1.0 / (1 - (Nd_design_N / Nk));
    if (beta < 1) beta = 1;
  }
  const Md_col_magnified_Nmm = Md_design_Nmm * beta;

  // --- JOINT (BİRLEŞİM) KESME GÜVENLİĞİ ---
  const F_tensile_total = 1.25 * STEEL_FYK * (As_beam_supp_final + As_beam_span_final);
  const Ve_joint_N = Math.max(0, F_tensile_total - Vt_design_N); 
  const bw_mm = sections.beamWidth * 10; 
  const bj_mm = Math.min(bc_mm, bw_mm); 

  // Kuşatılmışlık Katsayısı (Parametreden geliyor)
  const joint_coeff = isJointConfined ? 1.7 : 1.0;
  const Vmax_joint_N = joint_coeff * Math.sqrt(fck) * bj_mm * hc_mm;

  const columnsResult = {
    axial_load_design: Nd_design_N / 1000,
    axial_capacity_max: colCapacity.N_max_N / 1000,
    moment_design: Md_design_Nmm / 1e6,
    moment_magnified: Md_col_magnified_Nmm / 1e6,
    slenderness: { lambda, lambda_lim: 34, beta, isSlender, i_rad },
    shear: { Ve: Ve_col_N / 1000, Vr: Vr_col_N / 1000, Vc: Vc_col_N / 1000, Vw: Vw_col_N / 1000, Vr_max: Vr_max_col / 1000 },
    confinement: { ...confResult, bk_max: Math.max(bc_mm, hc_mm)-50 },
    interaction_ratio: colCapacity.capacity_ratio,
    strong_col_ratio: strongColRatio,
    req_area: As_col_total,
    rho_provided: rho_col,
    count_main: countCol,
    checks: {
      axial_limit: createStatus(Nd_design_N <= colCapacity.N_max_N, 'Eksenel Yük OK', 'Ezilme Riski', `%${(colCapacity.capacity_ratio * 100).toFixed(0)}`),
      moment_capacity: createStatus(Md_col_magnified_Nmm <= Mr_col_Nmm, 'Moment Kapasitesi OK', 'Yetersiz', `M_cap: ${(Mr_col_Nmm / 1e6).toFixed(1)}`),
      shear_capacity: createStatus(Ve_col_N <= Vr_col_N, 'Kesme Güvenli', 'Kesme Yetersiz', 'Ve > Vr'),
      strongColumn: createStatus(strongColRatio >= 1.2, 'Güçlü Kolon OK', 'Zayıf Kolon', `Oran: ${strongColRatio.toFixed(2)}`),
      minDimensions: createStatus(sections.colWidth >= 25 && sections.colDepth >= 25, 'Boyut OK'),
      minRebar: createStatus(rho_col >= 0.01, 'Min Donatı OK'),
      maxRebar: createStatus(rho_col <= 0.04, 'Max Donatı OK'),
      confinement: createStatus(confResult.isSafe, confResult.message, 'Yetersiz Sargı'),
      slendernessCheck: createStatus(lambda <= 100, isSlender ? 'Narin Kolon' : 'Narin Değil', 'Çok Narin')
    }
  };

  const jointResult = {
    shear_force: Ve_joint_N / 1000,
    shear_limit: Vmax_joint_N / 1000,
    isSafe: Ve_joint_N <= Vmax_joint_N,
    bj: bj_mm 
  };

  return { columnsResult, jointResult, Nd_design_N };
};