
import { AppState, CalculationResult } from "../types";
import { STEEL_FYD } from "../constants";
import { createStatus, calculateBeamMomentCapacity } from "./shared";

interface BeamSolverResult {
  beamsResult: CalculationResult['beams'];
  Mr_beam_Nmm: number;
  As_beam_supp_final: number;
  As_beam_span_final: number;
}

export const solveBeams = (
  state: AppState,
  spanLength_m: number,
  q_beam_design_N_m: number,
  Vt_total_N: number,
  fcd: number,
  fctd: number,
  Ec: number,
  storyHeight: number,
  specific_bw_cm?: number, // EKLENDİ: Elemana özel genişlik
  specific_h_cm?: number   // EKLENDİ: Elemana özel derinlik
): BeamSolverResult => {
  const { sections, rebars, grid } = state; 
  
  const L_beam_m = spanLength_m; 
  const L_beam_mm = L_beam_m * 1000;

  // Kiriş Boyutlarını Belirle (Özel boyut varsa onu kullan, yoksa globali al)
  // BURASI KRİTİK DÜZELTME: Artık eleman özellikleri hesaplamaya giriyor.
  const bw_cm = specific_bw_cm || sections.beamWidth;
  const h_cm = specific_h_cm || sections.beamDepth;

  const bw_mm = bw_cm * 10;
  const h_beam_mm = h_cm * 10;
  const d_beam_mm = h_beam_mm - 30; // Paspayı

  // --- A. DEPREM ETKİSİ ---
  const numColsX = grid.xAxis.length + 1;
  const numColsY = grid.yAxis.length + 1;
  const totalCols = numColsX * numColsY;
  
  // Kesme kuvvetini kolon sayısına oranla (Yaklaşık Yöntem)
  const V_col_avg_N = Vt_total_N / Math.max(totalCols, 1); 
  
  const M_col_seismic_Nmm = (V_col_avg_N * (storyHeight * 1000)) / 2;
  const joint_factor = 1.0; 
  const M_beam_seismic_Nmm = M_col_seismic_Nmm * joint_factor;

  // --- B. YÜK KOMBİNASYONLARI ---
  const M_supp_static_Nmm = (q_beam_design_N_m * Math.pow(L_beam_m, 2) / 12) * 1000;
  const M_span_static_Nmm = (q_beam_design_N_m * Math.pow(L_beam_m, 2) / 14) * 1000;

  const q_beam_service_N_m = q_beam_design_N_m / 1.45;
  const M_supp_service_Nmm = (q_beam_service_N_m * Math.pow(L_beam_m, 2) / 12) * 1000;
  
  const M_supp_design_Nmm = Math.max(M_supp_static_Nmm, M_supp_service_Nmm + M_beam_seismic_Nmm);
  const M_span_design_Nmm = M_span_static_Nmm;

  // --- C. DONATI HESABI ---
  const M_beam_supp_Nmm = M_supp_design_Nmm;
  const M_beam_span_Nmm = M_span_design_Nmm;

  const As_beam_supp_req = M_beam_supp_Nmm / (0.9 * STEEL_FYD * d_beam_mm);
  const As_beam_span_req = M_beam_span_Nmm / (0.9 * STEEL_FYD * d_beam_mm);
  
  const As_min_beam = 0.8 * (fctd / STEEL_FYD) * bw_mm * d_beam_mm;
  
  const As_beam_supp_final = Math.max(As_beam_supp_req, As_min_beam);
  const As_beam_span_final = Math.max(As_beam_span_req, As_min_beam);
  
  const rho_beam_supp = As_beam_supp_final / (bw_mm * d_beam_mm);
  const rho_beam_span = As_beam_span_final / (bw_mm * d_beam_mm);
  const rho_beam_min = As_min_beam / (bw_mm * d_beam_mm);
  const rho_beam_max = 0.02;

  const barAreaBeam = Math.PI * Math.pow(rebars.beamMainDia / 2, 2);
  const countSupp = Math.ceil(As_beam_supp_final / barAreaBeam);
  const countSpan = Math.ceil(As_beam_span_final / barAreaBeam);

  const Mr_beam_Nmm = calculateBeamMomentCapacity(bw_mm, h_beam_mm, countSupp * barAreaBeam, fcd);

  // --- D. KESME HESABI ---
  const V_beam_design_N = (q_beam_design_N_m * L_beam_m / 2); 
  const Vcr_N = 0.65 * fctd * bw_mm * d_beam_mm;
  const Vmax_N = 0.22 * fcd * bw_mm * d_beam_mm;
  const Vc_beam_N = 0.8 * Vcr_N;

  let Vw_beam_N = 0;
  if (V_beam_design_N > Vcr_N) {
    Vw_beam_N = V_beam_design_N - Vc_beam_N;
  }

  const stirrupDia = rebars.beamStirrupDia || 8;
  const stirrupArea2Legs = 2 * (Math.PI * Math.pow(stirrupDia / 2, 2));

  let s_calc_beam = 999;
  if (V_beam_design_N > Vcr_N) {
    const Vw_req = V_beam_design_N - 0.8 * Vcr_N;
    s_calc_beam = (stirrupArea2Legs * STEEL_FYD * d_beam_mm) / Vw_req;
  }

  const s_supp_beam = Math.floor(Math.min(s_calc_beam, h_beam_mm / 4, 8 * rebars.beamMainDia, 150) / 10) * 10;
  const s_span_beam = Math.floor(Math.min(d_beam_mm / 2, 200) / 10) * 10;
  const s_supp_final_beam = Math.max(s_supp_beam, 50);

  // --- E. SEHİM HESABI ---
  // Inersia momenti artık doğru boyutlarla (bw_mm, h_beam_mm) hesaplanıyor.
  const I_beam = (bw_mm * Math.pow(h_beam_mm, 3)) / 12;
  const q_line_N_mm = q_beam_design_N_m / 1000;
  const delta_elastic = (5 * q_line_N_mm * Math.pow(L_beam_mm, 4)) / (384 * Ec * (I_beam * 0.5)); // 0.5 faktörü çatlamış kesit için
  const delta_total = delta_elastic * 3; // Sünme etkisi yaklaşık 3 kat
  const delta_limit = L_beam_mm / 240;

  const beamsResult = {
    load_design: q_beam_design_N_m / 1000,
    moment_support: M_beam_supp_Nmm / 1e6,
    moment_span: M_beam_span_Nmm / 1e6,
    as_support_req: As_beam_supp_req,
    as_span_req: As_beam_span_req,
    count_support: countSupp,
    count_span: countSpan,
    shear_design: V_beam_design_N / 1000,
    shear_cracking: Vcr_N / 1000,
    shear_limit: Vmax_N / 1000,
    shear_Vc: Vc_beam_N / 1000,
    shear_Vw: Vw_beam_N / 1000,
    rho_support: rho_beam_supp,
    rho_span: rho_beam_span,
    rho_min: rho_beam_min,
    rho_max: rho_beam_max,
    stirrup_result: {
      dia: stirrupDia,
      s_support: s_supp_final_beam / 10,
      s_span: s_span_beam / 10,
      text_support: `Ø${stirrupDia}/${s_supp_final_beam / 10}`,
      text_span: `Ø${stirrupDia}/${s_span_beam / 10}`
    },
    shear_reinf_type: `Ø${stirrupDia}/${s_supp_final_beam / 10} / ${s_span_beam / 10}`,
    deflection: delta_total,
    deflection_limit: delta_limit,
    checks: {
      shear: createStatus(V_beam_design_N < Vmax_N, 'Kesme Güvenli', 'Kesme Kapasitesi Aşıldı', `Vd=${(V_beam_design_N/1000).toFixed(1)} > Vmax=${(Vmax_N/1000).toFixed(1)}`),
      deflection: createStatus(delta_total < delta_limit, 'Sehim Uygun', 'Sehim Sınırı Aşıldı', `Δ=${delta_total.toFixed(1)} > ${delta_limit.toFixed(1)}mm`),
      min_reinf: createStatus(rho_beam_supp >= rho_beam_min, 'Min Donatı OK', 'Min Donatı Sağlanmıyor'),
      max_reinf: createStatus(rho_beam_supp <= rho_beam_max, 'Max Donatı OK', 'Max Donatı Sınırı Aşıldı (ρ>0.02)')
    }
  };

  return { beamsResult, Mr_beam_Nmm, As_beam_supp_final, As_beam_span_final };
};
