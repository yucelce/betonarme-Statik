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
  // ARTIK DOĞRUDAN HESAPLANMIŞ YÜKLERİ ALIYORUZ:
  Nd_design_N: number, 
  Vt_design_N: number,
  Mr_beam_Nmm: number,
  As_beam_supp_final: number,
  As_beam_span_final: number,
  fck: number,
  fcd: number,
  fctd: number,
  Ec: number
): ColumnSolverResult => {
  const { dimensions, sections, rebars } = state;

  const bc_mm = sections.colWidth * 10;
  const hc_mm = sections.colDepth * 10;
  const Ac_col_mm2 = bc_mm * hc_mm;
  const totalHeight_m = dimensions.h * (dimensions.storyCount || 1);
  const h_beam_mm = sections.beamDepth * 10;

  // Moment Etkisi
  // Kesme kuvvetinin oluşturduğu elastik moment (Düğüm noktası momenti)
  const M_elastic_Nmm = (Vt_design_N * (dimensions.h * 1000)) / 2;
  const Md_design_Nmm = M_elastic_Nmm;
  // Donatı Düzeni
  const barAreaCol = Math.PI * Math.pow(rebars.colMainDia / 2, 2);
  let countCol = Math.max(4, Math.ceil((Ac_col_mm2 * 0.01) / barAreaCol));
  if (countCol % 2 !== 0) countCol++; 

  const As_col_total = countCol * barAreaCol;
  const rho_col = As_col_total / Ac_col_mm2;

  const colCapacity = calculateColumnCapacityForAxialLoad(
    bc_mm, hc_mm, As_col_total, fcd, fck, Nd_design_N
  );
  const Mr_col_Nmm = colCapacity.Mr_Nmm;

  // Güçlü Kolon
  const sum_M_col = 2 * Mr_col_Nmm;
  const sum_M_beam = 1 * Mr_beam_Nmm;
  const sum_M_beam_hardening = sum_M_beam * 1.4;
  const strongColRatio = sum_M_col / (sum_M_beam_hardening + 1);

  // Kesme Güvenliği
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

  const Vr_max_N = 0.22 * fcd * Ac_col_mm2;
  const Vr_col_N = Math.min(Vc_col_N + Vw_col_N, Vr_max_N);
  const Vr_max_col = 0.22 * fcd * Ac_col_mm2;

  const paspayi_col_r = 25; 
  const bk_x = (sections.colWidth * 10) - 2 * paspayi_col_r;
  const bk_y = (sections.colDepth * 10) - 2 * paspayi_col_r;
  const bk_max_val = Math.max(bk_x, bk_y);

  // Narinlik
  const Ic = (bc_mm * Math.pow(hc_mm, 3)) / 12;
  const i_rad = 0.3 * hc_mm;
  const lambda = ln_col_mm / i_rad;
  const isSlender = lambda > 34; 

  let beta = 1.0;
  if (isSlender) {
    const EI = 0.4 * Ec * Ic;
    const Nk = (Math.PI ** 2 * EI) / (ln_col_mm ** 2);
    const Cm = 1.0;
    beta = Cm / (1 - (Nd_design_N / Nk));
    if (beta < 1) beta = 1;
  }
  const Md_col_magnified_Nmm = Md_design_Nmm * beta;

  const columnsResult = {
    axial_load_design: Nd_design_N / 1000,
    axial_capacity_max: colCapacity.N_max_N / 1000,
    moment_design: Md_design_Nmm / 1e6,
    moment_magnified: Md_col_magnified_Nmm / 1e6,
    slenderness: {
      lambda,
      lambda_lim: 34,
      beta,
      isSlender,
      i_rad: i_rad 
    },
    shear: {
      Ve: Ve_col_N / 1000,
      Vr: Vr_col_N / 1000,
      Vc: Vc_col_N / 1000,
      Vw: Vw_col_N / 1000,
      Vr_max: Vr_max_col / 1000 
    },
    confinement: {
      Ash_req: confResult.Ash_req,
      Ash_prov: confResult.Ash_prov,
      s_max: confResult.s_max_code,
      s_conf: confResult.s_conf, 
      s_middle: confResult.s_middle,
      dia_used: confResult.dia_used,
      bk_max: bk_max_val
    },
    interaction_ratio: colCapacity.capacity_ratio,
    strong_col_ratio: strongColRatio,
    req_area: As_col_total,
    rho_provided: rho_col,
    count_main: countCol,
    checks: {
      axial_limit: createStatus(Nd_design_N <= colCapacity.N_max_N, 'Eksenel Yük OK', 'Ezilme Riski', `%${(colCapacity.capacity_ratio * 100).toFixed(0)} Kapasite`),
      moment_capacity: createStatus(Md_col_magnified_Nmm <= Mr_col_Nmm, 'Moment Kapasitesi OK', 'Yetersiz', `M_cap: ${(Mr_col_Nmm / 1e6).toFixed(1)} kNm`),
      shear_capacity: createStatus(Ve_col_N <= Vr_col_N, 'Kesme Güvenli', 'Kesme Yetersiz', 'Ve > Vr'),
      strongColumn: createStatus(strongColRatio >= 1.2, 'Güçlü Kolon OK', 'Zayıf Kolon', `Oran: ${strongColRatio.toFixed(2)}`),
      minDimensions: createStatus(sections.colWidth >= 25 && sections.colDepth >= 25, 'Boyut OK'),
      minRebar: createStatus(rho_col >= 0.01, 'Min Donatı OK'),
      maxRebar: createStatus(rho_col <= 0.04, 'Max Donatı OK'),
      confinement: createStatus(confResult.isSafe, confResult.message, 'Yetersiz Sargı'),
      slendernessCheck: createStatus(lambda <= 100, isSlender ? 'Narin Kolon' : 'Narin Değil', 'Çok Narin')
    }
  };

// ... (Kodun üst kısımları aynı)

  // ==========================================================
  // 3. JOINT (BİRLEŞİM) BÖLGESİ KESME GÜVENLİĞİ KONTROLÜ
  // ==========================================================
  
  // Düğüm noktasına gelen kiriş donatılarının akma kapasitesi
  const F_tensile_total = 1.25 * STEEL_FYK * (As_beam_supp_final + As_beam_span_final);
  
  // Kolon Kesme Kuvveti (Vt_design_N parametresini kullanıyoruz)
  // Ve_joint = As * 1.25 * fyk - V_col
  const Ve_joint_N = Math.max(0, F_tensile_total - Vt_design_N); 

  // bw_mm TANIMI BURADA YAPILMALI:
  const bw_mm = sections.beamWidth * 10; 
  
  // Birleşim genişliği (Kiriş ve kolon genişliğinin küçüğü)
  const bj_mm = Math.min(bc_mm, bw_mm); 

  // Kuşatılmış Birleşim Kontrolü
  // (Kiriş kolonun en az %75'ini örtüyorsa kuşatılmış sayılır - TBDY 7.5.1)
  // Şimdilik güvenli tarafta kalmak için false kabul ediyoruz veya basit bir kontrol ekliyoruz:
  const isConfinedJoint = (bw_mm >= 0.75 * bc_mm); 
  const joint_coeff = isConfinedJoint ? 1.7 : 1.0;
  
  // Birleşim Bölgesi Kesme Kapasitesi (Vmax)
  // TBDY 2018 Denklem 7.11
  const Vmax_joint_N = joint_coeff * Math.sqrt(fck) * bj_mm * hc_mm;

  const jointResult = {
    shear_force: Ve_joint_N / 1000,
    shear_limit: Vmax_joint_N / 1000,
    isSafe: Ve_joint_N <= Vmax_joint_N,
    bj: bj_mm 
  };

  return { columnsResult, jointResult, Nd_design_N };
};