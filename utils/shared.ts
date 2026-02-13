
// utils/shared.ts
import { CheckStatus } from "../types";
import { STEEL_FYD, STEEL_ES, STEEL_FYK } from "../constants";

// ============================================================================
// SABİTLER VE ORTAK FONKSİYONLAR
// ============================================================================
export const GRAVITY = 9.81; // m/s2
export const DENSITY_CONCRETE_N_MM3 = (25 * 1000) / 1e9; // ~0.000025 N/mm3

// Durum mesajı oluşturucu
export const createStatus = (
  isSafe: boolean, 
  successMsg: string = 'Uygun', 
  failMsg: string = 'Yetersiz', 
  reason?: string,
  recommendation?: string
): CheckStatus => ({
  isSafe,
  message: isSafe ? successMsg : failMsg,
  reason: isSafe ? undefined : reason,
  recommendation: isSafe ? undefined : recommendation
});

/**
 * ÇELİK GERİLME FONKSİYONU (Elasto-Plastik Davranış)
 */
export const getSteelStress = (strain: number): number => {
  const stress = strain * STEEL_ES;
  if (stress > STEEL_FYD) return STEEL_FYD;
  if (stress < -STEEL_FYD) return -STEEL_FYD;
  return stress;
};

/**
 * KİRİŞ EĞİLME KAPASİTESİ (Basit Eğilme - Dikdörtgen Kesit)
 * Mr = As * fyd * (d - a/2)
 */
export const calculateBeamMomentCapacity = (
  b_mm: number,
  h_mm: number,
  As_mm2: number,
  fcd: number
): number => {
  const paspayi = 30; // mm
  const d = h_mm - paspayi;

  // Eşdeğer basınç bloğu derinliği (a)
  let a = (As_mm2 * STEEL_FYD) / (0.85 * fcd * b_mm);
  if (a > d) a = d;

  // Moment kolu (z = d - a/2)
  const Mr = As_mm2 * STEEL_FYD * (d - a / 2);
  return Mr; // Nmm
};

/**
 * PEKLEŞMELİ MOMENT KAPASİTESİ (Mpr) - TBDY 2018
 * fyk yerine 1.25 * fyk kullanılır.
 * Malzeme katsayısı (gamma_mc) = 1.0 alınır (fcd değil fck kullanılır).
 */
export const calculateProbableMoment = (
  b_mm: number,
  h_mm: number,
  As_mm2: number,
  fck: number
): number => {
  const paspayi = 30;
  const d = h_mm - paspayi;
  
  // TBDY'ye göre pekleşmeli hesapta beton dayanımı karakteristik değer (fck) üzerinden alınır
  // Çelik gerilmesi 1.25 * fyk olarak alınır.
  const f_steel_pr = 1.25 * STEEL_FYK; 
  
  // a = (As * 1.25 * fyk) / (0.85 * fck * b)
  let a = (As_mm2 * f_steel_pr) / (0.85 * fck * b_mm);
  if (a > d) a = d;

  const Mpr = As_mm2 * f_steel_pr * (d - a / 2);
  return Mpr; // Nmm
};

/**
 * KOLON KAPASİTE HESABI (STRAIN COMPATIBILITY METHOD)
 */
export const calculateColumnCapacityForAxialLoad = (
  b_mm: number,
  h_mm: number,
  As_total_mm2: number,
  fcd: number,
  fck: number,
  Nd_N: number
): { Mr_Nmm: number; capacity_ratio: number; N_max_N: number; failure_mode: string } => {

  const paspayi = 40; // mm
  const d = h_mm - paspayi;
  const d_prime = paspayi;
  const As_s1 = As_total_mm2 / 2;
  const As_s2 = As_total_mm2 / 2;

  const Ac = b_mm * h_mm;
  const N_max_limit = 0.40 * fck * Ac;

  if (Nd_N > N_max_limit) {
    return { Mr_Nmm: 0, capacity_ratio: Nd_N / N_max_limit, N_max_N: N_max_limit, failure_mode: 'Eksenel Yük Sınırı Aşıldı' };
  }

  const STEP_COUNT = 200;
  let max_Mr_within_tolerance = 0;
  let found_valid_solution = false;
  let fallback_Mr = 0;
  let min_diff_N = Number.MAX_VALUE;
  const TOLERANCE = Math.max(Nd_N * 0.005, 1000);

  for (let i = 1; i <= STEP_COUNT; i++) {
    const c = (h_mm * 1.5) * (i / STEP_COUNT);
    const eps_cu = 0.003;
    const eps_s1 = eps_cu * (c - d) / c;
    const eps_s2 = eps_cu * (c - d_prime) / c;

    const sigma_s1 = getSteelStress(eps_s1);
    const sigma_s2 = getSteelStress(eps_s2);

    const Fs1 = As_s1 * sigma_s1;
    const Fs2 = As_s2 * sigma_s2;

    let k1 = 0.85;
    if (fck > 25) {
      k1 = 0.85 - 0.006 * (fck - 25);
      if (k1 < 0.70) k1 = 0.70;
    }
    let a = k1 * c;
    if (a > h_mm) a = h_mm;

    const Fc = 0.85 * fcd * b_mm * a;
    const N_internal = Fc + Fs1 + Fs2;
    const diff = Math.abs(N_internal - Nd_N);

    const h_half = h_mm / 2;
    const M_concrete = Fc * (h_half - a / 2);
    const Mr_calc = M_concrete + Fs2 * (h_half - d_prime) + Fs1 * (h_half - d);

    if (diff <= TOLERANCE) {
      found_valid_solution = true;
      if (Mr_calc > max_Mr_within_tolerance) {
        max_Mr_within_tolerance = Mr_calc;
      }
    }

    if (diff < min_diff_N) {
      min_diff_N = diff;
      fallback_Mr = Mr_calc;
    }
  }

  let final_Mr = found_valid_solution ? max_Mr_within_tolerance : fallback_Mr;

  return {
    Mr_Nmm: Math.max(0, final_Mr),
    capacity_ratio: Nd_N / N_max_limit,
    N_max_N: N_max_limit,
    failure_mode: 'Bileşik Eğilme'
  };
};

/**
 * KOLON SARILMA (ETRİYE) KONTROLÜ
 */
export const checkColumnConfinement = (
  bw_mm: number,
  hw_mm: number,
  fck: number,
  userStirrupDia_mm: number,
  colMainDia_mm: number
): { isSafe: boolean; message: string; s_conf: number; s_middle: number; Ash_prov: number; Ash_req: number; s_max_code: number; dia_used: number } => {

  const fywk = 420;
  const paspayi_mm = 25;
  const bk_x = bw_mm - 2 * paspayi_mm;
  const bk_y = hw_mm - 2 * paspayi_mm;
  const bk_max = Math.max(bk_x, bk_y);

  const Ac = bw_mm * hw_mm;
  const Ack = bk_x * bk_y;
  const b_min = Math.min(bw_mm, hw_mm);

  let n_legs_estimate = 2;
  const max_dim = Math.max(bw_mm, hw_mm);

  if (max_dim <= 350) n_legs_estimate = 2;
  else if (max_dim <= 600) n_legs_estimate = 3;
  else n_legs_estimate = 4;

  let diametersToTry = [userStirrupDia_mm];
  if (userStirrupDia_mm < 10) diametersToTry.push(10);
  if (userStirrupDia_mm < 12) diametersToTry.push(12);
  diametersToTry = [...new Set(diametersToTry)].sort((a, b) => a - b);

  let best_result = {
    isSafe: false, message: 'Hesaplanamadı', s_conf: 50, s_middle: 100,
    Ash_prov: 0, Ash_req: 0, s_max_code: 100, dia_used: userStirrupDia_mm
  };

  for (const currentDia of diametersToTry) {
    const A_stirrup_one = Math.PI * Math.pow(currentDia / 2, 2);
    const Ash_provided_per_set = n_legs_estimate * A_stirrup_one;

    const s_conf_limit_1 = b_min / 3;
    const s_conf_limit_2 = 150;
    const s_conf_limit_3 = 6 * colMainDia_mm;
    const s_conf_geom_limit = Math.floor(Math.min(s_conf_limit_1, s_conf_limit_2, s_conf_limit_3) / 10) * 10;

    const s_mid_limit_1 = b_min / 2;
    const s_mid_limit_2 = 200;
    const s_middle_calc = Math.floor(Math.min(s_mid_limit_1, s_mid_limit_2) / 10) * 10;

    let found_s_conf = 50;
    let isFound = false;
    let calculated_Ash_req = 0;

    const start_s = Math.max(50, s_conf_geom_limit);
    if (start_s < 50) continue;

    for (let s = start_s; s >= 50; s -= 10) {
      const Ash_req_1 = 0.30 * s * bk_max * (fck / fywk) * ((Ac / Ack) - 1);
      const Ash_req_2 = 0.075 * s * bk_max * (fck / fywk);
      const val_Ash_req = Math.max(Ash_req_1, Ash_req_2);

      if (Ash_provided_per_set >= val_Ash_req) {
        found_s_conf = s;
        calculated_Ash_req = val_Ash_req;
        isFound = true;
        break;
      }
      calculated_Ash_req = val_Ash_req;
    }

    best_result = {
      isSafe: isFound,
      message: isFound ? (currentDia > userStirrupDia_mm ? `Otomatik: Ø${currentDia}/${found_s_conf / 10}/${s_middle_calc / 10}` : `Uygun`) : 'Yetersiz Donatı',
      s_conf: isFound ? found_s_conf : 50,
      s_middle: s_middle_calc,
      Ash_prov: Ash_provided_per_set,
      Ash_req: calculated_Ash_req,
      s_max_code: s_conf_geom_limit,
      dia_used: currentDia
    };
    if (isFound) break;
  }
  return best_result;
};

export interface InteractionPoint {
  M: number; // kNm
  N: number; // kN
  label?: string;
}

/**
 * P-M Etkileşim Diyagramı Verisi Üretir
 */
export const generateInteractionDiagramData = (
  b_mm: number,
  h_mm: number,
  As_total_mm2: number,
  fcd: number,
  fck: number
): InteractionPoint[] => {
  const points: InteractionPoint[] = [];
  const paspayi = 40; 
  const d = h_mm - paspayi;
  const d_prime = paspayi;
  const As_s1 = As_total_mm2 / 2; // Çekme/Basınç tarafı donatısı
  const As_s2 = As_total_mm2 / 2;

  // 1. Saf Çekme
  const N_tensile = -As_total_mm2 * (420 / 1.15); // fyd
  points.push({ M: 0, N: N_tensile / 1000, label: 'Saf Çekme' });

  // 2. Dengeli Durum ve Ara Noktalar
  const steps = 30;
  for (let i = 1; i <= steps; i++) {
    const c = (h_mm * 1.5) * (i / steps);
    let k1 = 0.85; 
    if (fck > 25) k1 = Math.max(0.70, 0.85 - 0.006 * (fck - 25));
    
    let a = k1 * c;
    if (a > h_mm) a = h_mm; 

    const eps_cu = 0.003;
    const eps_s1 = eps_cu * (c - d) / c;      
    const eps_s2 = eps_cu * (c - d_prime) / c; 

    const sigma_s1 = getSteelStress(eps_s1);
    const sigma_s2 = getSteelStress(eps_s2);

    const Fc = 0.85 * fcd * b_mm * a; 
    const Fs1 = As_s1 * sigma_s1;     
    const Fs2 = As_s2 * sigma_s2;     

    const N_res = Fc + Fs1 + Fs2; 
    const h_half = h_mm / 2;
    const M_conc = Fc * (h_half - a / 2);
    const M_s2 = Fs2 * (h_half - d_prime);
    const M_s1 = Fs1 * (h_half - d);
    
    const M_res = M_conc + M_s2 + M_s1;

    points.push({ 
        N: N_res / 1000, // kN
        M: M_res / 1e6,  // kNm
    });
  }

  // 3. Saf Basınç (N_max)
  const N_max = 0.85 * fcd * (b_mm * h_mm) + As_total_mm2 * (420 / 1.15); 
  points.push({ M: 0, N: N_max / 1000, label: 'Saf Basınç' });

  return points.sort((a, b) => a.N - b.N);
};
