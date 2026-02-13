
import { AppState, CalculationResult } from "../types";
import { STEEL_FYD } from "../constants";
import { createStatus, calculateBeamMomentCapacity, calculateProbableMoment } from "./shared";

interface BeamSolverResult {
  beamsResult: CalculationResult['beams'];
  Mr_beam_Nmm: number;
  As_beam_supp_prov: number; // Provided (Mevcut) Donatı Alanı
  As_beam_span_prov: number;
}

export const solveBeams = (
  state: AppState,
  spanLength_m: number,
  // Ayrık Yükler (Zarf Kombinasyonları İçin)
  q_g_N_m: number, // Ölü Yük (Zati + Kaplama)
  q_q_N_m: number, // Hareketli Yük
  fem_M_support_seismic_Nmm: number, // FEM'den gelen Deprem Momenti (Mutlak Değer)
  Vt_total_seismic_N: number, // FEM'den gelen Deprem Kesmesi (Mutlak Değer)
  // Malzeme
  fcd: number,
  fctd: number,
  Ec: number,
  storyHeight: number,
  specific_bw_cm?: number, 
  specific_h_cm?: number   
): BeamSolverResult => {
  const { sections, rebars, grid } = state; 
  
  const L_beam_m = spanLength_m; 
  const L_beam_mm = L_beam_m * 1000;

  const bw_cm = specific_bw_cm || sections.beamWidth;
  const h_cm = specific_h_cm || sections.beamDepth;

  const bw_mm = bw_cm * 10;
  const h_beam_mm = h_cm * 10;
  const d_beam_mm = h_beam_mm - 30; // Paspayı

  // --- STATİK MOMENTLER (Basit Kiriş Yaklaşımı) ---
  const M_g_supp_Nmm = (q_g_N_m * Math.pow(L_beam_m, 2) / 12) * 1000;
  const M_q_supp_Nmm = (q_q_N_m * Math.pow(L_beam_m, 2) / 12) * 1000;
  
  const M_g_span_Nmm = (q_g_N_m * Math.pow(L_beam_m, 2) / 24) * 1000; // Açıklık için yaklaşık qL^2/24 (sürekli) veya qL^2/8 (basit)
  const M_q_span_Nmm = (q_q_N_m * Math.pow(L_beam_m, 2) / 24) * 1000; // Burada güvenli tarafta qL^2/12 - qL^2/24 arası bir kabul yapıyoruz

  // --- YÜK KOMBİNASYONLARI (TS500 & TBDY) ---
  // M_E = fem_M_support_seismic_Nmm (Deprem)
  
  // 1. 1.4G + 1.6Q
  const Md_combo1 = 1.4 * M_g_supp_Nmm + 1.6 * M_q_supp_Nmm;
  
  // 2. G + 1.2Q + E
  const Md_combo2 = 1.0 * M_g_supp_Nmm + 1.2 * M_q_supp_Nmm + 1.0 * fem_M_support_seismic_Nmm;
  
  // 3. 0.9G + E (Hafiflik kontrolü - Çekme yaratabilir, ama donatı hesabında mutlak max'a bakıyoruz)
  const Md_combo3 = 0.9 * M_g_supp_Nmm + 1.0 * fem_M_support_seismic_Nmm;

  // ZARF (Envelope) Tasarım Momenti
  const M_supp_design_Nmm = Math.max(Md_combo1, Md_combo2, Md_combo3);
  
  // Açıklık Momenti (Genelde 1.4G + 1.6Q belirleyici olur)
  // Basitlik için açıklıkta deprem etkisini düşük kabul edip Combo 1'i kullanıyoruz.
  const M_span_design_Nmm = 1.4 * M_g_span_Nmm + 1.6 * M_q_span_Nmm;

  // --- C. DONATI HESABI ---
  const M_beam_supp_Nmm = M_supp_design_Nmm;
  const M_beam_span_Nmm = M_span_design_Nmm;

  const As_beam_supp_req = M_beam_supp_Nmm / (0.9 * STEEL_FYD * d_beam_mm);
  const As_beam_span_req = M_beam_span_Nmm / (0.9 * STEEL_FYD * d_beam_mm);
  
  const As_min_beam = 0.8 * (fctd / STEEL_FYD) * bw_mm * d_beam_mm;
  
  const As_beam_supp_final = Math.max(As_beam_supp_req, As_min_beam);
  const As_beam_span_final = Math.max(As_beam_span_req, As_min_beam);
  
  // Seçilen Donatıya Göre Gerçek Alan
  const barAreaBeam = Math.PI * Math.pow(rebars.beamMainDia / 2, 2);
  const countSupp = Math.ceil(As_beam_supp_final / barAreaBeam);
  const countSpan = Math.ceil(As_beam_span_final / barAreaBeam);
  
  const As_beam_supp_prov = countSupp * barAreaBeam;
  const As_beam_span_prov = countSpan * barAreaBeam;

  const rho_beam_supp = As_beam_supp_prov / (bw_mm * d_beam_mm);
  const rho_beam_span = As_beam_span_prov / (bw_mm * d_beam_mm);
  const rho_beam_min = As_min_beam / (bw_mm * d_beam_mm);
  const rho_beam_max = 0.02;

  const Mr_beam_Nmm = calculateBeamMomentCapacity(bw_mm, h_beam_mm, As_beam_supp_prov, fcd);

  // --- D. KESME HESABI (ZARF) ---
  const V_g = q_g_N_m * L_beam_m / 2;
  const V_q = q_q_N_m * L_beam_m / 2;
  const V_e = Vt_total_seismic_N; // FEM'den gelen deprem kesmesi

  const Vd_combo1 = 1.4 * V_g + 1.6 * V_q;
  const Vd_combo2 = 1.0 * V_g + 1.2 * V_q + 1.0 * V_e;
  const V_beam_design_N = Math.max(Vd_combo1, Vd_combo2);

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

  // --- E. SEHİM HESABI (Sadece Düşey Yükler 1.0G + 1.0Q veya G+Q) ---
  const q_service_N_mm = (q_g_N_m + q_q_N_m) / 1000;
  const I_beam = (bw_mm * Math.pow(h_beam_mm, 3)) / 12;
  const delta_elastic = (5 * q_service_N_mm * Math.pow(L_beam_mm, 4)) / (384 * Ec * (I_beam * 0.5)); 
  const delta_total = delta_elastic * 3; // Sünme etkileri vs.
  const delta_limit = L_beam_mm / 240;

  const beamsResult = {
    load_design: (1.4*q_g_N_m + 1.6*q_q_N_m) / 1000, // Rapor için yaklaşık değer
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
      shear: createStatus(
          V_beam_design_N < Vmax_N, 
          'Kesme Güvenli', 
          'Kesme Kapasitesi Aşıldı', 
          `Vd=${(V_beam_design_N/1000).toFixed(1)} > Vmax=${(Vmax_N/1000).toFixed(1)}`,
          'Kiriş boyutlarını büyütün (B veya H) veya beton sınıfını artırın.'
      ),
      deflection: createStatus(
          delta_total < delta_limit, 
          'Sehim Uygun', 
          'Sehim Sınırı Aşıldı', 
          `Δ=${delta_total.toFixed(1)} > ${delta_limit.toFixed(1)}mm`,
          'Kiriş derinliğini (H) artırın. Atalet momenti derinliğin küpüyle (h³) artar, sehimi en etkili bu azaltır.'
      ),
      min_reinf: createStatus(
          rho_beam_supp >= rho_beam_min, 
          'Min Donatı OK', 
          'Min Donatı Sağlanmıyor',
          undefined,
          'Donatı çapını veya adedini artırın.'
      ),
      max_reinf: createStatus(
          rho_beam_supp <= rho_beam_max, 
          'Max Donatı OK', 
          'Max %4 Donatı Sınırı Aşıldı',
          undefined,
          'Kesit yetersiz kaldığı için aşırı donatı gerekiyor. Kiriş kesitini büyütün.'
      )
    }
  };

  return { beamsResult, Mr_beam_Nmm, As_beam_supp_prov, As_beam_span_prov };
};
