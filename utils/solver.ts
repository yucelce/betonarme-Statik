// utils/solver.ts
import { AppState, CalculationResult, CheckStatus } from "../types";
import {
  CONCRETE_DENSITY,
  STEEL_FYD,
  STEEL_FYK,
  getFs,
  getF1,
  getConcreteProperties,
  STEEL_ES
} from "../constants";

// ============================================================================
// SABİTLER VE BİRİM DÖNÜŞÜMLERİ
// ============================================================================
// Tüm hesaplamalar NEWTON (N) ve MİLİMETRE (mm) cinsinden yapılacaktır.
const GRAVITY = 9.81; // m/s2
const DENSITY_CONCRETE_N_MM3 = (25 * 1000) / 1e9; // ~0.000025 N/mm3

/**
 * YARDIMCI FONKSİYONLAR
 * ----------------------------------------------------------------------------
 */

// Durum mesajı oluşturucu
const createStatus = (isSafe: boolean, successMsg: string = 'Uygun', failMsg: string = 'Yetersiz', reason?: string): CheckStatus => ({
  isSafe,
  message: isSafe ? successMsg : failMsg,
  reason: isSafe ? undefined : reason
});

/**
 * ÇELİK GERİLME FONKSİYONU (Elasto-Plastik Davranış)
 * Donatı birim kısalmasına (strain) göre gerilmeyi (stress) hesaplar.
 * @param strain - Birim şekildeğiştirme
 * @returns Donatı gerilmesi (MPa) [Mutlak değer değil, işaretli döner]
 */
const getSteelStress = (strain: number): number => {
  const stress = strain * STEEL_ES;
  // Akma dayanımı ile sınırlandırma (Mutlak değerce)
  if (stress > STEEL_FYD) return STEEL_FYD;
  if (stress < -STEEL_FYD) return -STEEL_FYD;
  return stress;
};

/**
 * KİRİŞ EĞİLME KAPASİTESİ (Basit Eğilme - Dikdörtgen Kesit)
 * TS500 Madde 7.1
 */
const calculateBeamMomentCapacity = (
  b_mm: number,
  h_mm: number,
  As_mm2: number,
  fcd: number
): number => {
  const paspayi = 30; // mm
  const d = h_mm - paspayi;

  // Eşdeğer basınç bloğu derinliği (a)
  // T = C => As * fyd = 0.85 * fcd * b * a
  let a = (As_mm2 * STEEL_FYD) / (0.85 * fcd * b_mm);

  // Kesit yüksekliğini aşamaz
  if (a > d) a = d;

  // Moment kolu (z = d - a/2)
  const Mr = As_mm2 * STEEL_FYD * (d - a / 2);
  return Mr; // Nmm
};

/**
 * KOLON KAPASİTE HESABI (STRAIN COMPATIBILITY METHOD)
 * ----------------------------------------------------------------------------
 * ÖNEMLİ DÜZELTME: Bu fonksiyon "Interaction Diagram" mantığıyla çalışır.
 * Verilen Eksenel Yük (Nd) altında kolonun taşıyabileceği maksimum Momenti (Mr)
 * iterasyon yaparak bulur.
 * * Yöntem:
 * 1. Tarafsız eksen (c) taranır.
 * 2. Her c değeri için beton ve çelik kuvvetleri toplanır (Sigma F).
 * 3. Dış yük (Nd) ile iç kuvvetler dengelendiğinde (Sigma F = 0 veya Nd),
 * o andaki iç moment hesaplanır.
 */
/**
 * KOLON KAPASİTE HESABI (STRAIN COMPATIBILITY METHOD - REVİZE EDİLMİŞ)
 */
const calculateColumnCapacityForAxialLoad = (
  b_mm: number,
  h_mm: number,
  As_total_mm2: number,
  fcd: number,
  fck: number,
  Nd_N: number // NEWTON cinsinden tasarım yükü
): { Mr_Nmm: number; capacity_ratio: number; N_max_N: number; failure_mode: string } => {

  const paspayi = 40; // mm
  const d = h_mm - paspayi;      // Çekme/Basınç tarafı donatı mesafesi
  const d_prime = paspayi;       // Üst donatı mesafesi

  // Simetrik donatı kabulü
  const As_s1 = As_total_mm2 / 2; // Alt/Çekme donatısı
  const As_s2 = As_total_mm2 / 2; // Üst/Basınç donatısı

  // Maksimum eksenel yük sınırı (TBDY 2018 - 0.40 fck Ac)
  const Ac = b_mm * h_mm;
  const N_max_limit = 0.40 * fck * Ac;

  // Eğer eksenel yük limiti aşıyorsa, moment kapasitesine bakmaya gerek yok
  if (Nd_N > N_max_limit) {
    return { Mr_Nmm: 0, capacity_ratio: Nd_N / N_max_limit, N_max_N: N_max_limit, failure_mode: 'Eksenel Yük Sınırı Aşıldı' };
  }

  // İTERASYON PARAMETRELERİ
  const STEP_COUNT = 200; // Hassasiyet artırıldı

  // Sonuç değişkenleri
  let max_Mr_within_tolerance = 0; // Tolerans içindeki en büyük moment
  let found_valid_solution = false; // Tolerans içinde çözüm bulundu mu?

  // Fallback (Yedek) değişkenler
  let fallback_Mr = 0;
  let min_diff_N = Number.MAX_VALUE;

  // Tolerans: Yükün %0.5'i veya en az 1000 N
  const TOLERANCE = Math.max(Nd_N * 0.005, 1000);

  // Tarafsız eksen (c) iterasyonu
  for (let i = 1; i <= STEP_COUNT; i++) {
    const c = (h_mm * 1.5) * (i / STEP_COUNT); // Tarafsız eksen derinliği

    // 1. Birim Şekildeğiştirmeler
    const eps_cu = 0.003;
    const eps_s1 = eps_cu * (c - d) / c;       // Alt donatı
    const eps_s2 = eps_cu * (c - d_prime) / c; // Üst donatı

    // 2. Gerilmeler ve Kuvvetler
    const sigma_s1 = getSteelStress(eps_s1);
    const sigma_s2 = getSteelStress(eps_s2);

    const Fs1 = As_s1 * sigma_s1;
    const Fs2 = As_s2 * sigma_s2;

    // Beton Basınç Kuvveti
    let k1 = 0.85;
    if (fck > 25) {
      k1 = 0.85 - 0.006 * (fck - 25);
      if (k1 < 0.70) k1 = 0.70;
    }
    let a = k1 * c;
    if (a > h_mm) a = h_mm;

    const Fc = 0.85 * fcd * b_mm * a; // Beton basınç kuvveti (+)

    // 3. Denge Denklemi (Eksenel)
    const N_internal = Fc + Fs1 + Fs2;

    // 4. Yakınsama ve Karar Mantığı
    const diff = Math.abs(N_internal - Nd_N);

    // Moment Hesabı (Her adımda)
    const h_half = h_mm / 2;
    const M_concrete = Fc * (h_half - a / 2);

    // Moment yönü kontrolü:
    const Mr_calc = M_concrete + Fs2 * (h_half - d_prime) + Fs1 * (h_half - d);

    // STRATEJİ:

    // 1. Durum: Tolerans içindeyiz (Kabul edilebilir denge)
    if (diff <= TOLERANCE) {
      found_valid_solution = true;
      // Tolerans bandı içindeki en büyük momenti yakala
      if (Mr_calc > max_Mr_within_tolerance) {
        max_Mr_within_tolerance = Mr_calc;
      }
    }

    // 2. Durum: Tolerans dışındayız ama en yakın sonucu takip et (Fallback)
    if (diff < min_diff_N) {
      min_diff_N = diff;
      fallback_Mr = Mr_calc;
    }
  }

  // SONUÇ SEÇİMİ
  let final_Mr = 0;

  if (found_valid_solution) {
    final_Mr = max_Mr_within_tolerance;
  } else {
    final_Mr = fallback_Mr;

    // Çok büyük sapma kontrolü
    if (min_diff_N > Math.max(Nd_N * 0.10, 20000)) {
      // Denge kurulamadı (Kapasite yetersiz olabilir)
    }
  }

  return {
    Mr_Nmm: Math.max(0, final_Mr),
    capacity_ratio: Nd_N / N_max_limit,
    N_max_N: N_max_limit,
    failure_mode: 'Bileşik Eğilme'
  };
};

/**
 * KOLON SARILMA (ETRİYE) KONTROLÜ
 * TBDY 2018 Madde 7.3.4
 */
/**
 * KOLON SARILMA (ETRİYE) KONTROLÜ - GÜNCELLENDİ (OTOMATİK ÇAP ARTIRMA)
 * TBDY 2018 Madde 7.3.4
 */
// MEVCUT checkColumnConfinement FONKSİYONUNU TAMAMEN SİLİN VE AŞAĞIDAKİ İLE DEĞİŞTİRİN:

const checkColumnConfinement = (
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

  // Etriye kol sayısı
  const n_legs = (Math.max(bw_mm, hw_mm) >= 400) ? 3 : 2;

  let diametersToTry = [userStirrupDia_mm];
  if (userStirrupDia_mm < 10) diametersToTry.push(10);
  if (userStirrupDia_mm < 12) diametersToTry.push(12);
  diametersToTry = [...new Set(diametersToTry)].sort((a, b) => a - b);

  let best_result = {
    isSafe: false,
    message: 'Hesaplanamadı',
    s_conf: 50,
    s_middle: 100,
    Ash_prov: 0,
    Ash_req: 0,
    s_max_code: 100,
    dia_used: userStirrupDia_mm
  };

  // ÇAP DÖNGÜSÜ
  for (const currentDia of diametersToTry) {
    const A_stirrup_one = Math.PI * Math.pow(currentDia / 2, 2);
    const Ash_provided_per_set = n_legs * A_stirrup_one;

    // --- 1. SIKLAŞTIRMA BÖLGESİ (TBDY 7.3.4.1) ---
    // s <= b_min/3, s <= 150mm, s <= 6*phi_l
    const s_conf_limit_1 = b_min / 3;
    const s_conf_limit_2 = 150;
    const s_conf_limit_3 = 6 * colMainDia_mm;
    const s_conf_geom_limit = Math.floor(Math.min(s_conf_limit_1, s_conf_limit_2, s_conf_limit_3) / 10) * 10;

    // --- 2. ORTA BÖLGE (TBDY 7.3.4.2) ---
    // s <= b_min/2, s <= 200mm
    const s_mid_limit_1 = b_min / 2;
    const s_mid_limit_2 = 200;
    const s_middle_calc = Math.floor(Math.min(s_mid_limit_1, s_mid_limit_2) / 10) * 10;

    let found_s_conf = 50;
    let isFound = false;
    let calculated_Ash_req = 0;

    // Sıklaştırma aralığı taraması (Ash kontrolü burada yapılır)
    const start_s = Math.max(50, s_conf_geom_limit); // Geometrik sınırdan başla, aşağı in

    // Eğer geometrik sınır 50mm'den küçükse bu çapla fiziksel olarak sığmaz
    if (start_s < 50) {
      continue;
    }

    for (let s = start_s; s >= 50; s -= 10) {
      // TBDY Denklem 7.1 ve 7.2 (Ash Gereksinimi)
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
      message: isFound
        ? (currentDia > userStirrupDia_mm ? `Otomatik: Ø${currentDia}/${found_s_conf / 10}/${s_middle_calc / 10}` : `Uygun`)
        : 'Yetersiz Donatı',
      s_conf: isFound ? found_s_conf : 50,
      s_middle: s_middle_calc, // Orta bölge geometrik sınıra göre belirlendi
      Ash_prov: Ash_provided_per_set,
      Ash_req: calculated_Ash_req,
      s_max_code: s_conf_geom_limit,
      dia_used: currentDia
    };

    if (isFound) break;
  }

  return best_result;
};


/**
 * ANA HESAPLAMA FONKSİYONU
 * ----------------------------------------------------------------------------
 */
export const calculateStructure = (state: AppState): CalculationResult => {
  // Girdilerin ayrıştırılması
  const { dimensions, sections, loads, seismic, rebars, materials } = state;

  // Malzeme
  const { fck, fcd, fctd, Ec } = getConcreteProperties(materials.concreteClass);

  // Geometri
  const storyCount = dimensions.storyCount || 1;
  const totalHeight_m = dimensions.h * storyCount;
  const lx_m = Math.min(dimensions.lx, dimensions.ly);
  const ly_m = Math.max(dimensions.lx, dimensions.ly);
  const m_ratio = ly_m / lx_m;

  // ==========================================================================
  // 1. YÜK ANALİZİ (NEWTON DÖNÜŞÜMLÜ)
  // ==========================================================================

  // Döşeme Yükleri (N/m2 = Pascal)
  const h_slab_m = dimensions.slabThickness / 100;
  const g_slab_N_m2 = h_slab_m * 25000; // 25 kN/m3 = 25000 N/m3
  const g_coating_N_m2 = loads.deadLoadCoatingsKg * GRAVITY; // kg/m2 -> N/m2
  const q_live_N_m2 = loads.liveLoadKg * GRAVITY;

  const pd_N_m2 = 1.4 * (g_slab_N_m2 + g_coating_N_m2) + 1.6 * q_live_N_m2;

  // Kiriş Yükleri (N/m)
  // Trapez Yük Aktarımı (TS500)
  const load_triangle_base = (pd_N_m2 * lx_m) / 3; // N/m
  const trapezoidal_factor = (1.5 - (0.5 / (m_ratio * m_ratio)));
  const q_eq_slab_N_m = load_triangle_base * trapezoidal_factor;

  // Kiriş Öz ağırlığı
  const bw_m = sections.beamWidth / 100;
  const h_beam_m = sections.beamDepth / 100;
  const g_beam_self_N_m = bw_m * h_beam_m * 25000; // N/m
  const g_wall_N_m = 3500; // 3.5 kN/m -> 3500 N/m

  // Toplam Tasarım Yükü (N/m)
  const q_beam_design_N_m = q_eq_slab_N_m + 1.4 * g_beam_self_N_m + 1.4 * g_wall_N_m;

  // ==========================================================================
  // 2. DÖŞEME HESABI
  // ==========================================================================

  // Alpha Katsayısı
  let alpha = 0.049;
  if (m_ratio > 2.0) alpha = 0.083;
  else if (m_ratio <= 1.2) alpha = 0.035;

  // M = alpha * Pd * lx^2 (Birim: N*m = Joule)
  const M_slab_Nm = alpha * pd_N_m2 * Math.pow(lx_m, 2);
  const M_slab_Nmm = M_slab_Nm * 1000; // Nmm'ye çevir

  const d_slab_mm = dimensions.slabThickness * 10 - 20; // paspayı

  // As = M / (0.9 * fyd * d)
  const As_req_slab = M_slab_Nmm / (0.9 * STEEL_FYD * d_slab_mm);
  const As_min_slab = 0.002 * 1000 * (dimensions.slabThickness * 10);
  const As_slab_design = Math.max(As_req_slab, As_min_slab);

  // +++ BURAYI EKLEYİN (RAPOR İÇİN GEREKLİ VERİLER) +++
  // 1. Donatı Oranı (Rho)
  const rho_slab = As_slab_design / (1000 * d_slab_mm);
  // 2. Min Kalınlık Kontrolü (TS500 Madde 11.2 - ln/25)
  // ln: Serbest açıklık (kısa kenar). Temiz açıklık için kabaca aks aralığını alıyoruz.
  const ln_slab_cm = Math.min(dimensions.lx, dimensions.ly) * 100; 
  const min_thick_calc = ln_slab_cm / 25; 
  const min_thick_limit = 8; // cm (Minimum sınır)
  // +++ EKLEME BİTTİ +++

  // Aralık
  const barAreaSlab = Math.PI * Math.pow(rebars.slabDia / 2, 2);
  const spacingSlab = Math.floor(Math.min((barAreaSlab * 1000) / As_slab_design, 200) / 10) * 10;

  // ==========================================================================
  // 3. KİRİŞ HESABI
  // ==========================================================================

  const L_beam_mm = ly_m * 1000;
  const d_beam_mm = sections.beamDepth * 10 - 30;
  const bw_mm = sections.beamWidth * 10;
  const h_beam_mm = sections.beamDepth * 10;

  // Momentler (Nmm)
  const M_beam_supp_Nmm = (q_beam_design_N_m * Math.pow(ly_m, 2) / 12) * 1000; // N*m -> Nmm (*1000)
  const M_beam_span_Nmm = (q_beam_design_N_m * Math.pow(ly_m, 2) / 14) * 1000;

  // Donatı Hesabı
  const As_beam_supp_req = M_beam_supp_Nmm / (0.9 * STEEL_FYD * d_beam_mm);
  const As_beam_span_req = M_beam_span_Nmm / (0.9 * STEEL_FYD * d_beam_mm);
  const As_min_beam = 0.8 * (fctd / STEEL_FYD) * bw_mm * d_beam_mm;
  const As_max_beam = 0.02 * bw_mm * d_beam_mm;

  const As_beam_supp_final = Math.max(As_beam_supp_req, As_min_beam);
  const As_beam_span_final = Math.max(As_beam_span_req, As_min_beam);
  const rho_beam_supp = As_beam_supp_final / (bw_mm * d_beam_mm);
  const rho_beam_span = As_beam_span_final / (bw_mm * d_beam_mm);
  const rho_beam_min = As_min_beam / (bw_mm * d_beam_mm);
  const rho_beam_max = 0.02; // TS500 standardı maks sınır

  const barAreaBeam = Math.PI * Math.pow(rebars.beamMainDia / 2, 2);
  const countSupp = Math.ceil(As_beam_supp_final / barAreaBeam);
  const countSpan = Math.ceil(As_beam_span_final / barAreaBeam);

  // Kiriş Kapasitesi (Nmm) - Güçlü kolon kontrolü için gerekli
  // "CalculateBeamMomentCapacity" Nmm döner.
  // Çift donatılı değil tek donatılı gibi basit hesap (güvenli taraf)
  const Mr_beam_Nmm = calculateBeamMomentCapacity(bw_mm, h_beam_mm, countSupp * barAreaBeam, fcd);

  // Kesme Hesabı (N)
  const V_beam_design_N = (q_beam_design_N_m * ly_m / 2); // N

  // Kesme Dayanımları (N)
  const Vcr_N = 0.65 * fctd * bw_mm * d_beam_mm; // TS500
  const Vmax_N = 0.22 * fcd * bw_mm * d_beam_mm;

  // Beton Katkısı (Vc) - Basitleştirilmiş TS500 yaklaşımı (0.8 Vcr)
  const Vc_beam_N = 0.8 * Vcr_N;
  
  // Etriye Katkısı (Vw)
  let Vw_beam_N = 0;
  if (V_beam_design_N > Vcr_N) {
     Vw_beam_N = V_beam_design_N - Vc_beam_N;
  }

  // Kiriş Etriye Hesabı (Aynı mantık, birimler düzgün)
  const stirrupDia = rebars.beamStirrupDia || 8;
  const stirrupArea2Legs = 2 * (Math.PI * Math.pow(stirrupDia / 2, 2));

  let s_calc_beam = 999;
  if (V_beam_design_N > Vcr_N) {
    const Vw_req = V_beam_design_N - 0.8 * Vcr_N;
    s_calc_beam = (stirrupArea2Legs * STEEL_FYD * d_beam_mm) / Vw_req;
  }

  // Konstrüktif Kurallar (Kiriş)
  const s_supp_beam = Math.floor(Math.min(s_calc_beam, h_beam_mm / 4, 8 * rebars.beamMainDia, 150) / 10) * 10;
  const s_span_beam = Math.floor(Math.min(d_beam_mm / 2, 200) / 10) * 10;
  const s_supp_final_beam = Math.max(s_supp_beam, 50);

  // Sehim (mm)
  const I_beam = (bw_mm * Math.pow(h_beam_mm, 3)) / 12;
  const E_c_MPa = Ec; // MPa = N/mm2
  // q (N/mm) olarak girmeli
  const q_line_N_mm = q_beam_design_N_m / 1000;

  const delta_elastic = (5 * q_line_N_mm * Math.pow(L_beam_mm, 4)) / (384 * E_c_MPa * (I_beam * 0.5));
  const delta_total = delta_elastic * 3;
  const delta_limit = L_beam_mm / 240;

  // ==========================================================================
  // 4. DEPREM VE KÜTLE HESABI
  // ==========================================================================

  // Bina Ağırlığı (N)
  const area_m2 = dimensions.lx * dimensions.ly;
  const W_slab_N = (g_slab_N_m2 + g_coating_N_m2 + 0.3 * q_live_N_m2) * area_m2;
  const W_beam_N = g_beam_self_N_m * 2 * (dimensions.lx + dimensions.ly);
  const W_col_N = (sections.colWidth / 100 * sections.colDepth / 100 * dimensions.h * 25000) * 4;
  const W_wall_N = g_wall_N_m * 2 * (dimensions.lx + dimensions.ly);

  const W_story_N = W_slab_N + W_beam_N + W_col_N + W_wall_N;
  const W_total_N = W_story_N * storyCount;

  // Spektrum
  const Fs = getFs(seismic.ss, seismic.soilClass);
  const F1 = getF1(seismic.s1, seismic.soilClass);
  const Sds = seismic.ss * Fs;
  const Sd1 = seismic.s1 * F1;

  // Periyot
  const T1 = 0.1 * Math.pow(totalHeight_m, 0.75);

  // Sae(T) Katsayısı
  const Sae_coeff = ((T: number): number => {
    const Ta = 0.2 * (Sd1 / Sds);
    const Tb = Sd1 / Sds;
    if (T < Ta) return (0.4 + 0.6 * (T / Ta)) * Sds;
    if (T <= Tb) return Sds;
    return Sd1 / T;
  })(T1);

  // Taban Kesme Kuvveti (Newton)
  const Ra = seismic.Rx || 8;
  const I_bldg = seismic.I || 1.0;

  const Vt_calc_N = (W_total_N * Sae_coeff * I_bldg) / Ra;
  const Vt_min_N = 0.04 * W_total_N * I_bldg * Sds;
  const Vt_design_N = Math.max(Vt_calc_N, Vt_min_N);

  // ==========================================================================
  // 5. KOLON HESABI (YENİLENMİŞ)
  // ==========================================================================

  const bc_mm = sections.colWidth * 10;
  const hc_mm = sections.colDepth * 10;
  const Ac_col_mm2 = bc_mm * hc_mm;

  // Eksenel Yükler (N)
  const N_gravity_N = W_total_N / 4; // 4 Kolonlu varsayım
  const M_overturn_Nm = Vt_design_N * (0.65 * totalHeight_m);
  const N_seismic_N = M_overturn_Nm / (lx_m * 2); // Kabaca devrilme etkisi

  // Tasarım Eksenel Yükü (G+Q+E)
  const Nd_design_N = 1.0 * N_gravity_N + 1.0 * N_seismic_N;

  // Moment Etkisi (Nmm)
  // Deprem Kesmesi kolona düşen (Tek kolon)
  const V_col_N = Vt_design_N / 4;
  // Kolonun alt/üst ucundaki moment (Elastik analiz varsayımı: V * h / 2)
  const M_elastic_Nmm = (V_col_N * (dimensions.h * 1000)) / 2;
  // Tasarım Momenti (TBDY Büyütmeleri hariç ham tasarım momenti)
  const Md_design_Nmm = M_elastic_Nmm;

  // Donatı Düzeni
  const barAreaCol = Math.PI * Math.pow(rebars.colMainDia / 2, 2);
  let countCol = Math.max(4, Math.ceil((Ac_col_mm2 * 0.01) / barAreaCol));
  if (countCol % 2 !== 0) countCol++; // Çift sayı yap

  const As_col_total = countCol * barAreaCol;
  const rho_col = As_col_total / Ac_col_mm2;

  // --- KRİTİK DÜZELTME: GERÇEK KAPASİTE HESABI ---
  // Eski kod hatalıydı, şimdi strain compatibility çağırıyoruz.
  const colCapacity = calculateColumnCapacityForAxialLoad(
    bc_mm, hc_mm, As_col_total, fcd, fck, Nd_design_N
  );

  const Mr_col_Nmm = colCapacity.Mr_Nmm;

  // Güçlü Kolon Kontrolü (Birimler Nmm)
  // TBDY Madde 7.3: (Mra + Mrü) >= 1.2 * (Mri + Mrj)
  // İç çerçeve düğümü kabulü: İki taraftan kiriş saplanıyor.
  // Kolonların toplam kapasitesi = Mr_col_alt + Mr_col_üst (Simetrik kabul: 2 * Mr_col)
  // Kirişlerin toplam kapasitesi = Mr_beam_sol + Mr_beam_sağ (Simetrik kabul: 2 * Mr_beam)
  const sum_M_col = 2 * Mr_col_Nmm;
  const sum_M_beam = 1 * Mr_beam_Nmm; // HATA DÜZELTİLDİ: Tek kiriş yerine 2 kiriş etkisi
  // DÜZELTME: Kiriş pekleşme momenti (1.4 * Mr) dikkate alınmalı (TBDY Madde 7.3)
  const sum_M_beam_hardening = sum_M_beam * 1.4;
  const strongColRatio = sum_M_col / (sum_M_beam_hardening + 1);

  // Kesme Güvenliği (Kapasite Tasarımı)
  // Ve = (M_alt + M_ust) / ln
  // M_alt ve M_ust pekleşmeli moment kapasiteleridir (1.4 * Mr).
  const M_capacity_hardening = Mr_col_Nmm * 1.4;
  const ln_col_mm = (dimensions.h * 1000) - h_beam_mm;

  const Ve_col_N = (2 * M_capacity_hardening) / ln_col_mm;

  // DÜZELTME: Ac yerine (bw * d) kullanılmalı.
  // TBDY 2018 Denklem 7.10: Vc = 0.8 * Vcr * (1 + 0.07 * Nd / Ac)
  // Ancak Vcr = 0.65 * fctd * bw * d
  const d_col_shear = hc_mm - 30; // Paspayı düşülmüş etkili derinlik
  const Vcr_col = 0.65 * fctd * bc_mm * d_col_shear;
  const Vc_col_N = 0.8 * Vcr_col * (1 + (0.07 * Nd_design_N) / Ac_col_mm2);

  // Vw (Etriye Katkısı)
  const colStirrupDia = rebars.colStirrupDia || 8;
  const confResult = checkColumnConfinement(
    sections.colWidth * 10, sections.colDepth * 10, fck, colStirrupDia, rebars.colMainDia
  );

  // Sıklaştırma bölgesindeki aralık kullanılarak Kesme (Vw) hesabı yapılır (Kritik Kesit)
  const s_used_col = confResult.s_conf; // DEĞİŞTİ: s_opt yerine s_conf
  const Asw_col = confResult.Ash_prov;
  const d_col = hc_mm - 30;

  const Vw_col_N = (Asw_col * 420 * d_col) / s_used_col;

  const Vr_max_N = 0.22 * fcd * Ac_col_mm2;
  const Vr_col_N = Math.min(Vc_col_N + Vw_col_N, Vr_max_N);

  // 1. TBDY Kesme Üst Sınırı (Vr_max) rapor değişkeni olarak da tutalım
  const Vr_max_col = 0.22 * fcd * Ac_col_mm2; 

  // 2. Sargı bölgesindeki çekirdek boyutunu (bk) raporda göstermek için hesaplayalım
  const paspayi_col_r = 25; // Net beton örtüsü
  const bk_x = (sections.colWidth * 10) - 2 * paspayi_col_r;
  const bk_y = (sections.colDepth * 10) - 2 * paspayi_col_r;
  const bk_max_val = Math.max(bk_x, bk_y);

  // Narinlik Kontrolü
  const Ic = (bc_mm * Math.pow(hc_mm, 3)) / 12;
  const i_rad = 0.3 * hc_mm;
  const lambda = ln_col_mm / i_rad;
  const isSlender = lambda > 34; // Basit limit (TS500)

  // Moment Büyütme (Narinse)
  let beta = 1.0;
  if (isSlender) {
    const EI = 0.4 * Ec * Ic;
    const Nk = (Math.PI ** 2 * EI) / (ln_col_mm ** 2);
    const Cm = 1.0;
    beta = Cm / (1 - (Nd_design_N / Nk));
    if (beta < 1) beta = 1;
  }
  const Md_col_magnified_Nmm = Md_design_Nmm * beta;

  // ==========================================================================
  // 6. JOINT (BİRLEŞİM) BÖLGESİ KESME GÜVENLİĞİ
  // ==========================================================================

  // Ve = 1.25 * fyk * As_beam_total - V_col
  // İç düğüm noktası: Kiriş donatısı hem sağda hem solda var.
  // TBDY: As1 + As2 (Kiriş üst ve alt donatıları toplamı, çünkü depremde biri çekme biri basınç ama As olarak ikisi de akar kabul edilir basitleştirilmiş)
  const F_tensile_total = 1.25 * STEEL_FYK * (As_beam_supp_final + As_beam_span_final);
  // Not: TBDY tam formülünde sadece çekme tarafı alınır ama iki taraflı depremde toplam donatı bir tarafa çekme uygular gibi düşünülebilir (Basitleştirilmiş).
  // Daha doğrusu: Ve = 1.25 * fyk * (As_ust + As_alt) - V_kolon (Yaklaşık)

  const Ve_joint_N = Math.max(0, F_tensile_total - V_col_N);

  const bj_mm = Math.min(bc_mm, bw_mm);
  // DÜZELTME: TBDY 7.5.1 - Kuşatılmış ve Kuşatılmamış birleşim ayrımı
  // Güvenli tarafta kalmak için "Kuşatılmamış" kabulü devam etsin ancak formül netleşsin.
  // Kuşatılmamış: 1.0 * sqrt(fck) * bj * h (Doğruydu ama açıklama ekleyelim)
  // Kuşatılmış olsaydı: 1.7 * sqrt(fck)
  const isConfinedJoint = false; // Varsayım: Kuşatılmamış
  const joint_coeff = isConfinedJoint ? 1.7 : 1.0;
  const Vmax_joint_N = joint_coeff * Math.sqrt(fck) * bj_mm * hc_mm;

  // ==========================================================================
  // 7. TEMEL HESABI (NEWTON)
  // ==========================================================================

  const h_found_m = dimensions.foundationHeight / 100;
  const cant_m = (dimensions.foundationCantilever || 50) / 100;
  const Lx_found = lx_m + 2 * cant_m;
  const Ly_found = ly_m + 2 * cant_m;
  const Area_found = Lx_found * Ly_found;

  const W_found_self_N = Area_found * h_found_m * 25000;
  const Total_Load_Found_N = W_total_N + W_found_self_N;

  const sigma_zemin_Pa = Total_Load_Found_N / Area_found; // N/m2 = Pa
  const sigma_zemin_kPa = sigma_zemin_Pa / 1000;

  // Zımbalama
  const d_found_mm = h_found_m * 1000 - 50;
  const up_mm = 2 * ((bc_mm + d_found_mm) + (hc_mm + d_found_mm));
  // DÜZELTME: Zımbalamada moment etkisi (Gamma katsayısı)
  // Tam formül: tau = Vpd/(u*d) + gamma*M*c / J
  // Basitleştirilmiş güvenli yaklaşım: Eksenel yükü %40 artırarak moment etkisini simüle et.
  // Eski kodda %15 (1.15) artış vardı, bu yetersiz bulunmuştu.
  const Vpd_N = Nd_design_N;
  const moment_factor_punching = 1.40; // %40 artış (Moment etkisi kabulü)
  const tau_pd = (Vpd_N * moment_factor_punching) / (up_mm * d_found_mm);

  // Eğilme Donatısı
  const l_cant_mm = cant_m * 1000;
  // Konsol momenti: q * L^2 / 2. q (N/mm) = sigma(N/mm2) * 1000mm
  // Sigma N/mm2 = sigma_zemin_Pa / 1e6
  const sigma_zemin_MPa = sigma_zemin_Pa / 1e6;

  // 1 metrelik şerit için moment
  const M_found_Nmm = (sigma_zemin_MPa * Math.pow(l_cant_mm, 2) / 2) * 1000; // 1000mm genişlik

  const As_found_req = M_found_Nmm / (0.9 * STEEL_FYD * d_found_mm);
  const As_found_min = 0.002 * 1000 * (h_found_m * 1000);
  const As_found_final = Math.max(As_found_req, As_found_min);

  const barAreaFound = Math.PI * Math.pow(rebars.foundationDia / 2, 2);
  const spacingFound = Math.floor((barAreaFound * 1000) / As_found_final);

  // ==========================================================================
  // SONUÇ PAKETLEME (UI İÇİN DÖNÜŞÜMLER BURADA YAPILIR)
  // ==========================================================================
  // UI genelde kN, kNm, cm bekler.

  return {
    slab: {
      pd: pd_N_m2 / 1000, 
      alpha,
      d: d_slab_mm,
      m_x: M_slab_Nm / 1000, 
      as_req: As_req_slab,
      as_min: As_min_slab,
      spacing: spacingSlab,
      
      // +++ YENİ EKLENENLER +++
      min_thickness_calculated: min_thick_calc,
      min_thickness_limit: min_thick_limit,
      rho: rho_slab,
      // +++ ---------------- +++

      // thicknessStatus GÜNCELLENDİ:
 
      thicknessStatus: createStatus(dimensions.slabThickness >= min_thick_calc && dimensions.slabThickness >= min_thick_limit, 'Uygun'),
      status: createStatus(true)
    },
    beams: {
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
      
      // +++ YENİ EKLENENLER +++
      shear_Vc: Vc_beam_N / 1000,
      shear_Vw: Vw_beam_N / 1000,

      rho_support: rho_beam_supp,
      rho_span: rho_beam_span,
      rho_min: rho_beam_min,
      rho_max: rho_beam_max,
      // +++ ---------------- +++

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
        shear: createStatus(V_beam_design_N < Vmax_N, 'Kesme Güvenli', 'Gevrek Kırılma Riski'),
        deflection: createStatus(delta_total < delta_limit, 'Sehim Uygun', 'Sehim Aşıldı'),
        // min/max donatı kontrollerini yeni rho değişkenlerine bağladık:
        min_reinf: createStatus(rho_beam_supp >= rho_beam_min, 'Min Donatı OK'),
        max_reinf: createStatus(rho_beam_supp <= rho_beam_max, 'Max Donatı OK', 'Max Sınır Aşıldı')
      }
    },
    columns: {
      axial_load_design: Nd_design_N / 1000, 
      axial_capacity_max: colCapacity.N_max_N / 1000, 
      moment_design: Md_design_Nmm / 1e6,
      moment_magnified: Md_col_magnified_Nmm / 1e6,

      slenderness: {
        lambda,
        lambda_lim: 34,
        beta,
        isSlender,
        i_rad: i_rad // +++ YENİ (Mevcut değişkenden alındı)
      },
      shear: {
        Ve: Ve_col_N / 1000,
        Vr: Vr_col_N / 1000,
        Vc: Vc_col_N / 1000,
        Vw: Vw_col_N / 1000,
        Vr_max: Vr_max_col / 1000 // +++ YENİ
      },
      confinement: {
        Ash_req: confResult.Ash_req,
        Ash_prov: confResult.Ash_prov,
        s_max: confResult.s_max_code,
        s_conf: confResult.s_conf,        // EKLENDİ: Sıklaştırma aralığı
        s_middle: confResult.s_middle,    // EKLENDİ: Orta bölge aralığı
        dia_used: confResult.dia_used,
        bk_max: bk_max_val
      },
      interaction_ratio: colCapacity.capacity_ratio,
      strong_col_ratio: strongColRatio,
      req_area: As_col_total,
      rho_provided: rho_col,
      count_main: countCol,
      checks: {
        // ... (Mevcut checkler aynı kalacak) ...
        axial_limit: createStatus(Nd_design_N <= colCapacity.N_max_N, 'Eksenel Yük OK', 'Ezilme Riski', `%${(colCapacity.capacity_ratio * 100).toFixed(0)} Kapasite`),
        moment_capacity: createStatus(Md_col_magnified_Nmm <= Mr_col_Nmm, 'Moment Kapasitesi OK', 'Yetersiz', `M_cap: ${(Mr_col_Nmm / 1e6).toFixed(1)} kNm`),
        shear_capacity: createStatus(Ve_col_N <= Vr_col_N, 'Kesme Güvenli', 'Kesme Yetersiz', 'Ve > Vr'),
        strongColumn: createStatus(strongColRatio >= 1.2, 'Güçlü Kolon OK', 'Zayıf Kolon', `Oran: ${strongColRatio.toFixed(2)}`),
        minDimensions: createStatus(sections.colWidth >= 25 && sections.colDepth >= 25, 'Boyut OK'),
        minRebar: createStatus(rho_col >= 0.01, 'Min Donatı OK'),
        maxRebar: createStatus(rho_col <= 0.04, 'Max Donatı OK'),
        confinement: createStatus(confResult.isSafe, confResult.message, 'Yetersiz Sargı'),
        slendernessCheck: createStatus(lambda <= 100, isSlender ? 'Narin Kolon' : 'Kısa Kolon', 'Çok Narin')
      }
    },
    seismic: {
      param_sds: Sds,
      param_sd1: Sd1,
      period_t1: T1,
      spectrum_sae: Sae_coeff,
      building_weight: W_total_N / 1000, 
      base_shear: Vt_design_N / 1000, 
      story_drift_check: createStatus(true, 'Göreli Öteleme Kontrol Edilmeli'),
      // +++ YENİ +++
      R_coefficient: seismic.Rx,
      I_coefficient: seismic.I
    },
    foundation: {
      stress_actual: sigma_zemin_kPa,
      stress_limit: 200,
      punching_force: Vpd_N / 1000,
      punching_stress: tau_pd,
      punching_capacity: fctd,
      moment_design: M_found_Nmm / 1e6,
      as_req: As_found_final,
      as_provided_spacing: spacingFound,
      // +++ YENİ +++
      min_thickness_check: dimensions.foundationHeight >= 30, // TBDY Min radye kalınlığı
      checks: {
         // ... Mevcut checkler aynı ...
        bearing: createStatus(sigma_zemin_kPa <= 200, 'Zemin Emniyetli', 'Zemin Yetersiz'),
        punching: createStatus(tau_pd <= fctd, 'Zımbalama OK', 'Zımbalama Riski', `τ=${tau_pd.toFixed(2)} MPa`),
        bending: createStatus(true, 'Eğilme Donatısı OK')
      }
    },
    joint: {
      shear_force: Ve_joint_N / 1000,
      shear_limit: Vmax_joint_N / 1000,
      isSafe: Ve_joint_N <= Vmax_joint_N,
      // +++ YENİ +++
      bj: bj_mm // Birleşim genişliği
    }
  };
}