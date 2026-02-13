
import { AppState, CalculationResult } from "../types";
import { STEEL_FYK, STEEL_FYD } from "../constants";
import { createStatus, calculateColumnCapacityForAxialLoad, checkColumnConfinement, calculateProbableMoment } from "./shared";

interface ColumnSolverResult {
  columnsResult: CalculationResult['columns'];
  jointResult: CalculationResult['joint'];
  Nd_design_N: number;
}

export const solveColumns = (
  state: AppState,
  // Eksenel Yük Bileşenleri
  Nd_g_N: number, // Ölü Yük
  Nd_q_N: number, // Hareketli Yük
  Nd_e_N: number, // Deprem (Mutlak)
  // Moment Bileşenleri (Deprem ve Düşey)
  Md_e_Nmm: number, // Deprem Momenti (Mutlak)
  // Kesme Bileşenleri
  V_e_N: number, // Deprem Kesmesi (Mutlak)
  
  // Güçlü Kolon ve Joint için Gerekli Kiriş Bilgileri
  connectedBeamsData: { 
      b_mm: number, 
      h_mm: number, 
      As_prov_mm2: number 
  }[],
  isJointConfined: boolean, // Geometrik kontrolden gelen değer
  fck: number,
  fcd: number,
  fctd: number,
  Ec: number,
  storyHeight: number,
  specific_b_cm?: number, 
  specific_h_cm?: number  
): ColumnSolverResult => {
  const { sections, rebars } = state;

  const b_cm = specific_b_cm || sections.colWidth;
  const h_cm = specific_h_cm || sections.colDepth;

  const bc_mm = b_cm * 10;
  const hc_mm = h_cm * 10;
  const Ac_col_mm2 = bc_mm * hc_mm;
  const h_beam_mm = sections.beamDepth * 10; 

  // --- YÜK KOMBİNASYONLARI (ZARF) ---
  // Eksenel Yük (Basınç Pozitif)
  const Nd_1 = 1.4 * Nd_g_N + 1.6 * Nd_q_N;
  const Nd_2 = 1.0 * Nd_g_N + 1.2 * Nd_q_N + 1.0 * Nd_e_N;
  const Nd_3 = 0.9 * Nd_g_N - 1.0 * Nd_e_N; // Çekme kontrolü için min yük
  
  // Tasarım için en kritik basınç yükü (Maksimum)
  const Nd_design_N = Math.max(Nd_1, Nd_2);
  
  // Moment (Kolonda düşey yüklerden gelen moment genellikle azdır, burada deprem momenti esas alınır)
  // Ancak eksenel yükün değişimi (P-M) kapasiteyi etkiler. 
  // Basitleştirme: Max Eksenel + Max Moment durumunu kontrol ediyoruz.
  // Combo 2: 1.0E + ...
  const Md_design_Nmm = 1.0 * Md_e_Nmm; 

  // Kesme
  const V_design_N = 1.0 * V_e_N; // Kesme esas olarak depremden gelir

  // Donatı
  const barAreaCol = Math.PI * Math.pow(rebars.colMainDia / 2, 2);
  let countCol = Math.max(4, Math.ceil((Ac_col_mm2 * 0.01) / barAreaCol));
  if (countCol % 2 !== 0) countCol++; 

  const As_col_total = countCol * barAreaCol;
  const rho_col = As_col_total / Ac_col_mm2;

  // Kapasite Hesabı (P-M Etkileşimi) -> Mr (Taşıma Gücü Momenti)
  const colCapacity = calculateColumnCapacityForAxialLoad(
    bc_mm, hc_mm, As_col_total, fcd, fck, Nd_design_N
  );
  const Mr_col_Nmm = colCapacity.Mr_Nmm;

  // --- GÜÇLÜ KOLON KONTROLÜ (TBDY 7.3) ---
  // Kolonların Pekleşmeli Moment Kapasiteleri Toplamı (Mra + Mrü >= 1.2 * (Mri + Mrj))
  // TBDY 7.3.2.1: Kolonlar için Md (tasarım momenti) yerine 1.4*Mr_col alınabilir (yaklaşık).
  const sum_M_col_ultimate = 2 * (1.4 * Mr_col_Nmm); 

  // Kirişlerin Pekleşmeli Moment Kapasiteleri (Mpr) Toplamı
  let sum_Mpr_beams = 0;
  connectedBeamsData.forEach(beam => {
      // Mpr = 1.25 * fyk * As * (d - a/2)
      sum_Mpr_beams += calculateProbableMoment(beam.b_mm, beam.h_mm, beam.As_prov_mm2, fck);
  });

  const safe_beam_moment = sum_Mpr_beams === 0 ? 1 : sum_Mpr_beams;
  const strongColRatio = sum_M_col_ultimate / safe_beam_moment;

  // Kesme (TBDY 7.3.7) -> Ve = (Mra + Mrü) / ln
  const ln_col_mm = (storyHeight * 1000) - h_beam_mm;
  // Ve (Kapasite Tasarımı Kesmesi)
  const Ve_col_cap_N = sum_M_col_ultimate / ln_col_mm;
  
  // Tasarım Kesmesi (Max of Analyze or Capacity)
  const Ve_col_N = Math.max(V_design_N, Ve_col_cap_N);

  const d_col_shear = hc_mm - 30; 
  const Vcr_col = 0.65 * fctd * bc_mm * d_col_shear;
  const Vc_col_N = 0.8 * Vcr_col * (1 + (0.07 * Nd_design_N) / Ac_col_mm2);

  const colStirrupDia = rebars.colStirrupDia || 8;
  const confResult = checkColumnConfinement(
    bc_mm, hc_mm, fck, colStirrupDia, rebars.colMainDia
  );

  const s_used_col = confResult.s_conf; 
  const Asw_col = confResult.Ash_prov;
  const d_col = hc_mm - 30;
  const Vw_col_N = (Asw_col * STEEL_FYD * d_col) / s_used_col; // fyd = 420/1.15

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

  // --- JOINT (BİRLEŞİM) KESME GÜVENLİĞİ (TBDY 7.5) ---
  let F_tensile_total = 0;
  connectedBeamsData.forEach(b => {
      F_tensile_total += 1.25 * STEEL_FYK * b.As_prov_mm2;
  });
  
  // Basitleştirilmiş: Joint Kesmesi kiriş donatısı akma kuvveti eksi kolon kesmesi
  const Ve_joint_N = Math.max(0, F_tensile_total - V_design_N); 
  
  const bj_mm = Math.min(bc_mm, sections.beamWidth * 10); 

  // Kuşatılmış Birleşim: 1.7 * sqrt(fck) * bj * h
  // Kuşatılmamış: 1.0 * sqrt(fck) * bj * h
  const joint_coeff = isJointConfined ? 1.7 : 1.0;
  const Vmax_joint_N = joint_coeff * Math.sqrt(fck) * bj_mm * hc_mm;

  const columnsResult = {
    axial_load_design: Nd_design_N / 1000,
    axial_capacity_max: colCapacity.N_max_N / 1000,
    moment_design: Md_design_Nmm / 1e6,
    moment_magnified: Md_col_magnified_Nmm / 1e6,
    slenderness: { lambda, lambda_lim: 34, beta, isSlender, i_rad },
    shear: { Ve: Ve_col_N / 1000, Vr: Vr_col_N / 1000, Vc: Vc_col_N / 1000, Vw: Vw_col_N / 1000, Vr_max: Vr_max_col / 1000 },
    confinement: { 
      Ash_req: confResult.Ash_req,
      Ash_prov: confResult.Ash_prov,
      s_max: confResult.s_max_code,
      s_conf: confResult.s_conf,
      s_middle: confResult.s_middle,
      dia_used: confResult.dia_used,
      bk_max: Math.max(bc_mm, hc_mm) - 50 
    },
    interaction_ratio: colCapacity.capacity_ratio,
    strong_col_ratio: strongColRatio,
    req_area: As_col_total,
    rho_provided: rho_col,
    count_main: countCol,
    checks: {
      axial_limit: createStatus(
          Nd_design_N <= colCapacity.N_max_N, 
          'Eksenel Yük OK', 
          'Ezilme Riski', 
          `%${(colCapacity.capacity_ratio * 100).toFixed(0)}`,
          'Kolon boyutlarını (B/H) büyütün veya beton dayanım sınıfını (Cxx) artırın.'
      ),
      moment_capacity: createStatus(
          Md_col_magnified_Nmm <= Mr_col_Nmm, 
          'Moment Kapasitesi OK', 
          'Yetersiz', 
          `M_cap: ${(Mr_col_Nmm / 1e6).toFixed(1)}`,
          'Kolon boyutlarını artırın veya boyuna donatıyı artırın.'
      ),
      shear_capacity: createStatus(
          Ve_col_N <= Vr_col_N, 
          'Kesme Güvenli', 
          'Kesme Yetersiz', 
          'Ve > Vr',
          'Kolon boyutlarını artırın veya etriye çapını/sıklığını artırın.'
      ),
      strongColumn: createStatus(
          strongColRatio >= 1.2, 
          'Güçlü Kolon OK', 
          'Zayıf Kolon', 
          `Oran: ${strongColRatio.toFixed(2)}`,
          'Kolon boyutlarını kirişlere göre daha büyük seçin. Kolon moment kapasitesi artmalı.'
      ),
      minDimensions: createStatus(
          b_cm >= 25 && h_cm >= 25, 
          'Boyut OK', 
          'Min. 25cm olmalı',
          undefined,
          'Kolon boyutlarını yönetmelik sınırlarına (min 25x25 veya 30cm çap) getirin.'
      ),
      minRebar: createStatus(
          rho_col >= 0.01, 
          'Min Donatı OK', 
          'Min %1 Donatı',
          undefined,
          'Kolon donatı adedini veya çapını artırın.'
      ),
      maxRebar: createStatus(
          rho_col <= 0.04, 
          'Max Donatı OK', 
          'Max %4 Donatı',
          undefined,
          'Kesit yetersiz kaldığı için aşırı donatı gerekiyor. Kolon boyutlarını büyütün.'
      ),
      confinement: createStatus(
          confResult.isSafe, 
          confResult.message, 
          'Yetersiz Sargı',
          undefined,
          'Etriye aralığını sıklaştırın veya etriye çapını artırın.'
      ),
      slendernessCheck: createStatus(
          lambda <= 100, 
          isSlender ? 'Narin Kolon' : 'Narin Değil', 
          'Çok Narin',
          undefined,
          'Kolon çok narin. Kesit boyutlarını artırın veya serbest boyu azaltın.'
      )
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
