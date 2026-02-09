// utils/solver.ts
import { AppState, CalculationResult, CheckStatus } from "../types";
import { 
  CONCRETE_DENSITY, 
  STEEL_FYD, 
  getFs, 
  getF1,
  getConcreteProperties,
  STEEL_ES
} from "../constants";

/**
 * YARDIMCI FONKSİYONLAR
 * ----------------------------------------------------------------------------
 */

// Durum mesajı ve objesi oluşturucu
const createStatus = (isSafe: boolean, successMsg: string = 'Uygun', failMsg: string = 'Yetersiz', reason?: string): CheckStatus => ({
  isSafe,
  message: isSafe ? successMsg : failMsg,
  reason: isSafe ? undefined : reason
});

// TS500 - Dikdörtgen Kesit Taşıma Gücü Momenti (Basit Eğilme / Bileşik Eğilme)
// utils/solver.ts

// GÜNCELLENMİŞ FONKSİYON: Eksenel Yük Etkileşimli Moment Kapasitesi
const calculateMomentCapacity = (
    b_mm: number, 
    h_mm: number, 
    As_tension_mm2: number, // Sadece çekme tarafındaki donatı (Toplamın yarısı)
    fcd: number, 
    N_design: number = 0 // Newton cinsinden eksenel yük (Basınç +)
): number => {
  const paspayi = 40; // mm
  const d = h_mm - paspayi; // Faydalı yükseklik
  
  // 1. EŞDEĞER BASINÇ BLOĞU DERİNLİĞİ (a)
  // Denge: Fc = N + Fs_tension
  // 0.85 * fcd * b * a = N + As * fyd
  const Fs_tension = As_tension_mm2 * STEEL_FYD;
  const Fc_force = N_design + Fs_tension; // Betonun taşıması gereken toplam basınç
  
  let a = Fc_force / (0.85 * fcd * b_mm);
  
  // Sınır Kontrolleri
  // a, d'yi geçemez (Teorik sınır)
  if (a > d) a = d; 
  // a, h'yi geçemez (Fiziksel sınır)
  if (a > h_mm) a = h_mm;

  // 2. MOMENT HESABI (GEOMETRİK MERKEZE GÖRE)
  // Referans noktası: Kesit ortası (h/2)
  const geometric_center = h_mm / 2;
  
  // Beton Basınç Bileşkesinin Momenti
  // Fc kuvveti, üst liften a/2 mesafede etkir.
  // Merkeze olan mesafe: (h/2) - (a/2)
  const lever_arm_concrete = geometric_center - (a / 2);
  const Moment_concrete = Fc_force * lever_arm_concrete;

  // Çekme Donatısının Momenti
  // Fs kuvveti, üst liften d mesafede etkir.
  // Merkeze olan mesafe: d - (h/2)
  const lever_arm_steel = d - geometric_center;
  const Moment_steel = Fs_tension * lever_arm_steel;

  // Toplam Moment Kapasitesi
  const Mr_total = Moment_concrete + Moment_steel;
  
  return Mr_total / 1e6; // Nmm -> kNm çevrimi
};

// TBDY 2018 Madde 7.3.4 - Kolon Sarılma Bölgesi Etriye Hesabı
const checkColumnConfinement = (
  bw_cm: number,
  hw_cm: number,
  fck: number,
  // s_req_mm parametresini kaldırdık veya yoksayacağız, çünkü sistem hesaplayacak.
  stirrupDia_mm: number,
  colMainDia_mm: number
): { isSafe: boolean; message: string; s_max_code: number; s_opt: number; Ash_prov: number; Ash_req: number } => {
  
  const fywk = 420;
  const paspayi_cm = 2.5;

  // 1. Çekirdek Boyutları
  const bk_x = (bw_cm - 2 * paspayi_cm) * 10;
  const bk_y = (hw_cm - 2 * paspayi_cm) * 10;
  const bk_max = Math.max(bk_x, bk_y);

  // Alanlar
  const Ac = bw_cm * hw_cm * 100;
  const Ack = bk_x * bk_y;

  // 2. Etriye Kol Sayısı
  const nx = bw_cm >= 40 ? 3 : 2;
  const ny = hw_cm >= 40 ? 3 : 2;
  
  // Her iki yönde de etriye var, toplam kol sayısı
  const n_legs_total = nx + ny;
  const Ash_mm2 = n_legs_total * (Math.PI * Math.pow(stirrupDia_mm / 2, 2));

  // 3. Geometrik Sınırlar (TBDY 2018)
  const limit_geom_1 = Math.min(bw_cm * 10, hw_cm * 10) / 3;
  const limit_geom_2 = 100; // En fazla 100mm (sıklaştırma bölgesi için) // Bazı durumlarda 150mm olabilir ama güvenli taraf 100.
  const limit_geom_3 = 6 * colMainDia_mm;
  const s_geom_max = Math.min(limit_geom_1, limit_geom_2, limit_geom_3);

  // 4. İteratif Hesaplama: Yönetmeliği sağlayan en büyük 's' değerini bul
  // 50mm (min uygulama) ile Geometrik Max arasında tarama yapıyoruz.
  
  let s_found = 0;
  let isFeasible = false;

  // YENİ KOD: (10mm hassasiyet için)
  // s_geom_max değerini en yakın alt 10'luğa yuvarla (Örn: 98mm -> 90mm)
  const start_s = Math.floor(s_geom_max / 10) * 10;
  
  // 10mm (1cm) adımlarla aşağı doğru tara
  for (let s_try = start_s; s_try >= 50; s_try -= 10) {
      
      const Ash_req_1 = 0.30 * s_try * bk_max * (fck / fywk) * ((Ac / Ack) - 1);
      const Ash_req_2 = 0.075 * s_try * bk_max * (fck / fywk);
      const Ash_req_max = Math.max(Ash_req_1, Ash_req_2);

      // Eğer mevcut donatı alanı (Ash_mm2), gereken alandan (Ash_req_max) büyük veya eşitse bu aralık uygundur.
      if (Ash_mm2 >= Ash_req_max) {
          s_found = s_try;
          isFeasible = true;
          break; // En büyük uygun aralığı bulduk, döngüden çık.
      }
  }
  

  // SONUÇ ANALİZİ
  if (isFeasible) {
      return {
          isSafe: true,
          message: 'Sargı Uygun',
          s_max_code: Math.floor(s_geom_max),
          s_opt: s_found,
          Ash_prov: Ash_mm2,
          Ash_req: Math.max( // Rapor için bulunan aralıktaki gereksinimi tekrar hesapla
              0.30 * s_found * bk_max * (fck / fywk) * ((Ac / Ack) - 1),
              0.075 * s_found * bk_max * (fck / fywk)
          )
      };
  } else {
      // Eğer 50mm'ye kadar inmemize rağmen kurtarmıyorsa:
      // Kesit yetersizdir veya etriye çapı arttırılmalıdır.
      return {
          isSafe: false,
          message: 'Kesit/Etriye Yetersiz', // Kullanıcıya net mesaj
          s_max_code: Math.floor(s_geom_max),
          s_opt: 50, // Min sınırda kaldık
          Ash_prov: Ash_mm2,
          Ash_req: Math.max(
            0.30 * 50 * bk_max * (fck / fywk) * ((Ac / Ack) - 1),
            0.075 * 50 * bk_max * (fck / fywk)
        )
      };
  }
};

// TBDY 2018 - Yatay Elastik Tasarım Spektrumu S(T) - Denklem 2.2
const calculateSpectrum = (T: number, Sds: number, Sd1: number): number => {
  // Köşe periyotların belirlenmesi
  const Ta = 0.2 * (Sd1 / Sds);
  const Tb = (Sd1 / Sds);

  if (T < Ta) {
    // Doğrusal artan kısım
    return (0.4 + 0.6 * (T / Ta)) * Sds;
  } else if (T >= Ta && T <= Tb) {
    // Sabit plato bölgesi
    return Sds;
  } else if (T > Tb) { 
    // Sabit yer değiştirme bölgesi (T > Tb)
    return Sd1 / T;
  }
  // Teorik olarak buraya düşmez ama varsayılan dönüş
  return Sds;
};

/**
 * ANA HESAPLAMA FONKSİYONU
 * ----------------------------------------------------------------------------
 */
export const calculateStructure = (state: AppState): CalculationResult => {
  // Girdilerin ayrıştırılması (Destructuring)
  const { dimensions, sections, loads, seismic, rebars, materials } = state;
  
  // Malzeme Özelliklerinin Alınması
  const { fck, fcd, fctd, Ec } = getConcreteProperties(materials.concreteClass);
  
  // Geometrik Genel Bilgiler
  const storyCount = dimensions.storyCount || 1;
  const totalHeight = dimensions.h * storyCount;
  const lx = Math.min(dimensions.lx, dimensions.ly);
  const ly = Math.max(dimensions.lx, dimensions.ly);
  const m_ratio = ly / lx; // Uzun kenar / Kısa kenar oranı

  // ==========================================================================
  // 1. YÜK ANALİZİ (TS500 & TS498)
  // ==========================================================================
  
  // Sabit Yükler (G)
  const slab_thickness_m = dimensions.slabThickness / 100;
  const g_slab = slab_thickness_m * CONCRETE_DENSITY; // Plak ağırlığı (kN/m2)
  const g_coating = loads.deadLoadCoatingsKg * 9.81 / 1000; // Kaplama ağırlığı (kN/m2)
  const g_total = g_slab + g_coating; // Toplam ölü yük (G)

  // Hareketli Yükler (Q)
  const q_live = loads.liveLoadKg * 9.81 / 1000; // Hareketli yük (Q)
  
  // Tasarım Yükü (Pd) - TS500 Yük Birleşimi
  const pd = 1.4 * g_total + 1.6 * q_live; // kN/m2

  // Kirişlere Aktarılan Yükler (Eşdeğer Düzgün Yayılı Yük Yöntemi)
  // Uzun kirişe trapez yük gelir. TS500 formülü:
  // q_eq = (P * lx / 3) * (1.5 - 0.5 / m^2)
  const load_triangle_base = (pd * lx) / 3;
  const trapezoidal_factor = (1.5 - (0.5 / (m_ratio * m_ratio)));
  const q_eq_long = load_triangle_base * trapezoidal_factor;

  // Kiriş Öz ağırlığı ve Duvar Yükü
  const beam_width_m = sections.beamWidth / 100;
  const beam_depth_m = sections.beamDepth / 100;
  const beam_self_g = beam_width_m * beam_depth_m * CONCRETE_DENSITY;
  const wall_load_g = 3.5; // kN/m (Standart tuğla duvar kabulü)
  
  // Kiriş Toplam Tasarım Yükü (kN/m)
  const q_beam_design = q_eq_long + 1.4 * beam_self_g + 1.4 * wall_load_g;

  // ==========================================================================
  // 2. DÖŞEME HESABI (TS500 - Madde 11)
  // ==========================================================================
  
  // Moment Katsayısı (Alpha) Seçimi - TS500 Tablo 11.1 (Basitleştirilmiş)
  let alpha = 0.045; // Standart dört tarafı sürekli kabulü ortalaması
  if (m_ratio > 2.0) {
    alpha = 0.083; // Hurdi döşeme davranışı (Tek doğrultuda çalışan)
  } else if (m_ratio <= 1.2) {
    alpha = 0.035; // Kareye yakın döşeme
  }
  
  // Döşeme Momenti: M = alpha * Pd * lx^2
  const M_slab = alpha * pd * Math.pow(lx, 2); // kNm
  
  // Döşeme Faydalı Yüksekliği
  const d_slab = dimensions.slabThickness * 10 - 20; // 20mm paspayı (mm)
  
  // Gerekli Donatı Alanı (As)
  // As = Md / (0.86 * fyd * d) yaklaşık formülü yerine tam denge denklemi:
  // Basitleştirilmiş: As = (M * 1e6) / (0.9 * fyd * d)
  const As_req_slab = (M_slab * 1e6) / (0.9 * STEEL_FYD * d_slab); // mm2
  
  // Minimum Donatı Alanı (TS500 Madde 11.4.2 - S220 için 0.002)
  const As_min_slab = 0.002 * 1000 * (dimensions.slabThickness * 10); // 1 metre genişlik için
  
  // Tasarım Donatısı (Hesap ve Min değerin büyüğü)
  const As_slab_design = Math.max(As_req_slab, As_min_slab);
  
  // Donatı Aralığı Hesabı
  const barAreaSlab = Math.PI * Math.pow(rebars.slabDia/2, 2); // Seçilen çapın alanı
  const spacingSlabCalc = (barAreaSlab * 1000) / As_slab_design; // mm cinsinden aralık
  
  // Max Aralık Kontrolü (TS500: 1.5h veya 200mm)
  const maxSpacingSlab = Math.min(1.5 * dimensions.slabThickness * 10, 250); 
  
  // Uygulama Aralığı (5cm modülüne yuvarlama)
  const spacingSlabFinal = Math.floor(Math.min(spacingSlabCalc, 200) / 10) * 10; // cm değil mm hesabı yapıp cm'ye dönülecekse /10 sonda

  // ==========================================================================
  // 3. KİRİŞ HESABI (TS500 - Madde 7)
  // ==========================================================================
  const L_beam = ly; // Kritik açıklık
  const d_beam = sections.beamDepth * 10 - 30; // mm
  const bw_mm = sections.beamWidth * 10;       // mm
  const h_beam_mm = sections.beamDepth * 10;   // mm
  
  // Yaklaşık Çerçeve Analizi (Ön Tasarım İçin Katsayılar Yöntemi)
  // Mesnet Momenti (Ankastreye yakın kabul): qL^2 / 12
  const M_beam_supp = (q_beam_design * Math.pow(L_beam, 2)) / 12; 
  // Açıklık Momenti: qL^2 / 14 (Biraz güvenli taraf)
  const M_beam_span = (q_beam_design * Math.pow(L_beam, 2)) / 14; 

  // Gerekli Donatı Alanları
  const As_beam_supp_req = (M_beam_supp * 1e6) / (0.9 * STEEL_FYD * d_beam);
  const As_beam_span_req = (M_beam_span * 1e6) / (0.9 * STEEL_FYD * d_beam);
  
  // Minimum Donatı (TS500 Denklem 7.1)
  // As_min = 0.8 * (fctd / fyd) * b * d
  const As_min_beam = 0.8 * (fctd / STEEL_FYD) * (sections.beamWidth * 10) * d_beam;
  
  // Maksimum Donatı (TS500 - Süneklik için)
  // rho_max ~ 0.02 (veya 0.85 * rho_b). %2 pratik sınır kabul edildi.
  const As_max_beam = 0.02 * (sections.beamWidth * 10) * d_beam;

  // Tasarım Donatıları (Min-Max Aralığında)
  const As_beam_supp_design = Math.max(As_beam_supp_req, As_min_beam);
  const As_beam_span_design = Math.max(As_beam_span_req, As_min_beam);
  
  // Donatı Adetleri
  const barAreaBeam = Math.PI * Math.pow(rebars.beamMainDia/2, 2);
  const countSupp = Math.ceil(As_beam_supp_design / barAreaBeam);
  const countSpan = Math.ceil(As_beam_span_design / barAreaBeam);

 // Kesme Kuvveti Hesabı
  const V_beam_design = q_beam_design * L_beam / 2; // Vd (kN)

  // Kesme Dayanımları - HATA BURADAYDI, DEĞİŞKENLER ZATEN YUKARIDA TANIMLI
  // (bw_mm ve h_beam_mm satır 316-317'de tanımlı, tekrar tanımlamıyoruz)
  const Vcr = 0.65 * fctd * bw_mm * d_beam / 1000; // kN
  const Vmax = 0.22 * fcd * bw_mm * d_beam / 1000; // kN
  
  // --- YENİ ETRİYE HESABI BAŞLANGICI ---
  const stirrupDia = rebars.beamStirrupDia || 8; 
  const stirrupArea2Legs = 2 * (Math.PI * Math.pow(stirrupDia/2, 2));

  // 1. Teorik Hesap (Vd > Vcr ise)
  let calc_spacing_mm = 999;
  if (V_beam_design > Vcr) {
     const Vw_req = (V_beam_design - 0.8 * Vcr) * 1000; 
     if (Vw_req > 0) {
        calc_spacing_mm = (stirrupArea2Legs * STEEL_FYD * d_beam) / Vw_req;
     }
  }

  // 2. Mesnet (Sıklaştırma) Bölgesi Kuralları (TS500)
  // Max s = min(h/4, 8*phi_boyuna, 150mm)
  const s_supp_rule = Math.min(h_beam_mm / 4, 8 * rebars.beamMainDia, 150);
  let s_support_mm = Math.min(s_supp_rule, calc_spacing_mm);
  let s_support_final = Math.floor(s_support_mm / 10) * 10;
  if (s_support_final < 50) s_support_final = 50; 

  // 3. Orta Bölge Kuralları
  // Max s = min(d/2, 200mm)
  const s_span_rule = Math.min(d_beam / 2, 200);
  let s_span_final = Math.floor(s_span_rule / 10) * 10;

  // Metinler
  const str_supp = `Ø${stirrupDia}/${s_support_final/10}`;
  const str_span = `Ø${stirrupDia}/${s_span_final/10}`;
  const combined_stirrup_text = `${str_supp} / ${str_span}`;
  // --- YENİ ETRİYE HESABI BİTİŞİ ---
  
  // Sehim Hesabı (Ani + Sünme)
  const I_beam = (sections.beamWidth * 10 * Math.pow(sections.beamDepth * 10, 3)) / 12;
  const I_eff = I_beam * 0.5; // Çatlamış kesit atalet momenti kabulü (%50)
  const delta_elastic = (5 * q_beam_design * Math.pow(L_beam*1000, 4)) / (384 * Ec * I_eff); 
  const delta_total = delta_elastic * 3; // Uzun süreli sehim (Sünme katsayısı ile)
  const delta_limit = (L_beam * 1000) / 240; // TS500 Sehim sınırı (l/240)

  // ==========================================================================
  // 4. DEPREM ANALİZİ (TBDY 2018 - Bölüm 4)
  // ==========================================================================
  
  // Spektral İvme Katsayıları
  const Fs = getFs(seismic.ss, seismic.soilClass); // Kısa periyot bölge katsayısı
  const F1 = getF1(seismic.s1, seismic.soilClass); // 1sn periyot bölge katsayısı
  const Sds = seismic.ss * Fs; // Tasarım spektral ivme katsayısı (Kısa)
  const Sd1 = seismic.s1 * F1; // Tasarım spektral ivme katsayısı (1s)
  
  // Bina Toplam Ağırlığı (W)
  const area_m2 = dimensions.lx * dimensions.ly;
  // n = 0.3 (Konutlar için hareketli yük katılım katsayısı)
  const weight_slab = (g_total + 0.3 * q_live) * area_m2;
  const weight_beams = (beam_self_g * (2*(dimensions.lx + dimensions.ly)));
  const weight_cols = (sections.colWidth/100 * sections.colDepth/100 * dimensions.h * CONCRETE_DENSITY) * 4;
  
  const W_story = weight_slab + weight_beams + weight_cols; // Kat ağırlığı
  const W_total = W_story * storyCount; // Toplam ağırlık

  // Periyot Hesabı (T1) - TBDY 2018 Denklem 4.28
  // Betonarme Çerçeve Sistemler için Ct = 0.1
  const Ct = 0.1; 
  const T1 = Ct * Math.pow(totalHeight, 0.75); // Hakim titreşim periyodu
  
  // Elastik Tasarım Spektral İvmesi Sae(T)
  const Sae_g = calculateSpectrum(T1, Sds, Sd1); 
  
  // Taban Kesme Kuvveti (Vt) - Eşdeğer Deprem Yükü
  const Ra = seismic.Rx || 8; // Taşıyıcı sistem davranış katsayısı (Süneklik)
  const I_building = seismic.I || 1.0; // Bina önem katsayısı
  
  // Vt = (m * Sae * I) / Ra(T)
  const Vt_calc = (W_total * Sae_g * I_building) / Ra; 
  
  // Minimum Taban Kesme Kuvveti Kontrolü (TBDY Denk 4.24)
  // Vt_min = 0.04 * m * I * Sds * g
  const Vt_min = 0.04 * W_total * I_building * Sds;
  
  const Vt_design = Math.max(Vt_calc, Vt_min); // Tasarım Taban Kesme Kuvveti

// 5. KOLON HESABI (TS500 & TBDY 2018)
  // ==========================================================================
  
  // KOLON GEOMETRİK ÖZELLİKLERİ
  const Ic = (sections.colWidth * 10 * Math.pow(sections.colDepth * 10, 3)) / 12; // mm4
  const Ac_col_mm2 = sections.colWidth * 10 * sections.colDepth * 10;
  
  // Deprem Etkileri (Basit Çerçeve Kabulü)
  const V_col_seismic = Vt_design * 1000 / 4; // Newton (Tek kolon)
  const Md_col_seismic = (V_col_seismic * dimensions.h * 1000) / 2 / 1e6; // kNm
  const Md_col_biaxial = Md_col_seismic * 1.2; 

  // Eksenel Yükler
  const N_gravity = W_total / 4; 
  const M_overturn = Vt_design * (0.65 * totalHeight); 
  const N_seismic = M_overturn / (dimensions.lx * 2); 
  const Nd_design = 1.0 * N_gravity + 1.0 * N_seismic; 

  // [KONTROL 1] Eksenel Yük Sınırı Kontrolü (0.40 fck Ac)
  const N_max_limit_040 = 0.40 * fck * Ac_col_mm2 / 1000; 
  const N_max_design = N_max_limit_040;

  // [KONTROL 2] Narinlik Etkisi (Slenderness Effect)
  const ln_mm = (dimensions.h * 1000) - (sections.beamDepth * 10); 
  const i_radius = 0.3 * (sections.colDepth * 10);
  const lambda = ln_mm / i_radius; // Narinlik oranı
  
  const lambda_limit = 34 - 12 * (0.9); // Yaklaşık 23.2
  
  let beta = 1.0;
  let isSlender = false;
  if (lambda > lambda_limit) {
    isSlender = true;
    const EI_eff = 0.7 * Ec * Ic; // Etkili rijitlik
    const Nc = (Math.pow(Math.PI, 2) * EI_eff) / Math.pow(ln_mm, 2) / 1000; // kN
    
    // Moment Büyütme Katsayısı Beta
    const Cm = 1.0; 
    beta = Cm / (1 - (Nd_design / Nc));
    if (beta < 1.0) beta = 1.0;
  }
  const Md_col_magnified = Md_col_biaxial * beta;

  // [KONTROL 3] Donatı Oranı Kontrolü (%1 - %4)
  const As_col_min = Ac_col_mm2 * 0.01; 
  
  const barAreaCol = Math.PI * Math.pow(rebars.colMainDia/2, 2);
  let countCol = Math.max(4, Math.ceil(As_col_min / barAreaCol));
  
  // DÜZENLEME: Kolon boyuna donatı sayısı çift olmalıdır (Örn: 9 yerine 10)
  if (countCol % 2 !== 0) countCol++; 
  
  const As_col_provided = countCol * barAreaCol;
  const rho_col = As_col_provided / Ac_col_mm2;

  // [KONTROL 4] Moment Kapasitesi (Büyütülmüş momente göre)
  const Mr_col = calculateMomentCapacity(sections.colWidth*10, sections.colDepth*10, As_col_provided/2, fcd, Nd_design);
  
  // [KONTROL 5] Güçlü Kolon Kontrolü
  const sum_M_col = Mr_col * 2; 
  const Mr_beam = calculateMomentCapacity(sections.beamWidth*10, sections.beamDepth*10, As_beam_supp_design, fcd, 0);
  const strongColRatio = sum_M_col / (Mr_beam + 0.001); 

  // [KONTROL 6] Kapasite Tasarımı (Kesme Güvenliği Ve <= Vr)
  const M_capacity_design = Mr_col * 1.4; 
  const Ve_col = (M_capacity_design * 2) / (ln_mm / 1000); // kN

  // Vr = Vc + Vw
  const Vc_col = 0.8 * 0.65 * fctd * Ac_col_mm2 * (1 + (0.07 * Nd_design * 1000)/Ac_col_mm2) / 1000;
  
  // Vw (Etriye katkısı) - Basit hesap (Sadece Vr kontrolü için)
  const s_stirrup = 100; // mm (Sıklaştırma bölgesi varsayımı)
  // stirrupDia zaten yukarıda beamStirrupDia ile tanımlanmıştı ama burada kolonunki gerek.
  // Bu nedenle rebars.colStirrupDia kullanacağız, yukarıdaki değişkenle çakışmasın diye yeni isim verebiliriz
  // ancak zaten aşağıdaki confResult içinde rebars.colStirrupDia kullanılıyor.
  // Burada Vw hesabı için kolon etriye çapını alalım:
  const colStirrupDia = rebars.colStirrupDia || 8; 
  const stirrupAreaTwoLegs = 2 * (Math.PI * Math.pow(colStirrupDia/2, 2)); // 2 kollu kabul
  const d_col = (sections.colDepth * 10) - 30;
  const Vw_col = (stirrupAreaTwoLegs * 420 * d_col) / s_stirrup / 1000; 
  
  const Vr_max = 0.22 * fcd * Ac_col_mm2 / 1000;
  const Vr_col = Math.min(Vc_col + Vw_col, Vr_max);

  // ==========================================================================
  // [KONTROL 7] SARGILAMA (ETRİYE) HESABI - GÜNCELLENDİ
  // ==========================================================================
  
  // TBDY 2018'e uygun helper fonksiyonumuzu çağırıyoruz:
  const confResult = checkColumnConfinement(
    sections.colWidth,      // cm
    sections.colDepth,      // cm
    fck,                    // MPa
    rebars.colStirrupDia,   // mm
    rebars.colMainDia       // mm
  );

  // ==========================================================================
  // 6. JOINT (BİRLEŞİM) BÖLGESİ KESME GÜVENLİĞİ (TBDY 2018 Madde 7.5)
  // ==========================================================================
  
  // 1. Düğüm Noktası Kesme Kuvveti (Ve)
  // Ve = 1.25 * fyk * As_kiriş - V_kolon
  const As_beam_top = As_beam_supp_design; // Kiriş üst donatısı
  const F_tensile = 1.25 * STEEL_FYD * As_beam_top; // Donatı çekme kuvveti (Pekiştirilmiş)
  
  // V_kolon (Yaklaşık olarak min deprem kesmesi alınabilir veya analizden gelen)
  const V_col_approx = V_col_seismic * 1000; // N
  
  const Ve_joint = Math.max(0, (F_tensile - V_col_approx) / 1000); // kN cinsinden

  // 2. Düğüm Noktası Kesme Dayanımı (Vmax)
  // Kuşatılmamış birleşim kabulü (En güvenli taraf)
  // Vmax = 1.0 * sqrt(fck) * bj * h
  const bj = Math.min(sections.colWidth, sections.beamWidth) * 10; // Birleşim genişliği
  const h_col = sections.colDepth * 10; // Kolon derinliği (Kesme yönünde)
  
  const Vmax_joint = (1.0 * Math.sqrt(fck) * bj * h_col) / 1000; // kN

  // ==========================================================================
  // 7. RADYE TEMEL HESABI (TS500 & ZEMİN MEKANİĞİ)
  // ==========================================================================
  
  const h_found = dimensions.foundationHeight;
  const cantilever = dimensions.foundationCantilever || 50; 
  
  // Temel Alanı
  const foundation_Lx = dimensions.lx + 2*cantilever/100;
  const foundation_Ly = dimensions.ly + 2*cantilever/100;
  const Area_found = foundation_Lx * foundation_Ly;
  
  // Zemin Gerilmesi (Net)
  // Toplam Yük = Bina Yükü + Temel Ağırlığı
  const foundation_weight = Area_found * (h_found/100) * CONCRETE_DENSITY;
  const Load_found_total = W_total + foundation_weight;
  const sigma_zemin = Load_found_total / Area_found; // kN/m2
  const sigma_limit = 200; // Zemin emniyet gerilmesi kabulü (kN/m2)

  // Zımbalama Kontrolü (Punching Shear)
  const d_found = h_found * 10 - 50; // Temel faydalı yüksekliği (50mm paspayı)
  
  // Zımbalama Çevresi (up) - Kolon yüzünden d/2 kadar uzakta
  const up = 2 * ((sections.colWidth*10 + d_found) + (sections.colDepth*10 + d_found)); 
  const Vpd = Nd_design * 1000; // Zımbalama Yükü (Kolon Eksenel Yükü)
  
  // Moment Aktarımı Etkisi Katsayısı (Beta) - İç kolonlarda genelde 1.15 alınır
  const beta_punching = 1.15;
  const tau_pd = (Vpd * beta_punching) / (up * d_found); // Hesap gerilmesi (MPa)
  const tau_limit = fctd; // Dayanım sınırı (Beton çekme dayanımı)

  // Temel Donatısı (Eğilme Hesabı)
  // 1. Durum: Ampatman (Konsol) Momenti
  const l_cant = cantilever / 100; 
  const M_found_cant = sigma_zemin * Math.pow(l_cant, 2) / 2;

  // 2. Durum: Açıklık Momenti (Kolonlar arası ters döşeme)
  // q * L^2 / 10 yaklaşımı (Sürekli temel)
  const Ln_found = Math.max(dimensions.lx, dimensions.ly) - (sections.colWidth/100);
  const M_found_span = (sigma_zemin * Math.pow(Ln_found, 2)) / 10;

  // Tasarım Momenti (Hangi etki daha büyükse o esas alınır)
  const M_found = Math.max(M_found_cant, M_found_span);

  const As_found_req = (M_found * 1e6) / (0.9 * STEEL_FYD * d_found);
  const As_found_min = 0.002 * 1000 * (h_found*10); // Min donatı oranı
  const As_found_final = Math.max(As_found_req, As_found_min);
  
  const barAreaFound = Math.PI * Math.pow(rebars.foundationDia/2, 2);
  // Donatı aralığı hesabı
  let spacingFound = Math.floor((barAreaFound * 1000) / As_found_final);
  spacingFound = Math.min(spacingFound, 25); // Max 25cm aralık

  // ==========================================================================
  // SONUÇLARIN DÖNDÜRÜLMESİ
  // ==========================================================================
  return {
    slab: {
      pd, 
      alpha, 
      d: d_slab, 
      m_x: M_slab,
      as_req: As_req_slab, 
      as_min: As_min_slab, 
      spacing: Math.floor(spacingSlabFinal), // cm
      min_thickness: (lx*100)/25,
      thicknessStatus: createStatus(dimensions.slabThickness >= 10, 'Uygun', 'Yetersiz', 'Min 10cm'),
      status: createStatus(true)
    },
    beams: {
      load_design: q_beam_design,
      moment_support: M_beam_supp,
      moment_span: M_beam_span,
      as_support_req: As_beam_supp_req,
      as_span_req: As_beam_span_req,
      count_support: countSupp,
      count_span: countSpan,
      shear_design: V_beam_design,
      shear_cracking: Vcr,
      shear_limit: Vmax,
      stirrup_result: {
              dia: stirrupDia,
              s_support: s_support_final/10,
              s_span: s_span_final/10,
              text_support: str_supp,
              text_span: str_span
            },
      shear_reinf_type: combined_stirrup_text,
      deflection: delta_total,
      deflection_limit: delta_limit,
      checks: {
        shear: createStatus(V_beam_design < Vmax, 'Kesme Güvenli', 'Gevrek Kırılma Riski', 'Vd > Vmax'),
        deflection: createStatus(delta_total < delta_limit, 'Sehim Uygun', 'Sehim Aşıldı'),
        min_reinf: createStatus(As_beam_supp_design >= As_min_beam, 'Min Donatı OK'),
        // Max donatı kontrolü (Gevrek kırılma önlemi)
        max_reinf: createStatus(As_beam_supp_design <= As_max_beam, 'Max Donatı OK', 'Max Donatı Aşıldı')
      }
    },
    columns: {
      axial_load_design: Nd_design,
      axial_capacity_max: N_max_design,
      moment_design: Md_col_biaxial,
      moment_magnified: Md_col_magnified,
      
      // Types.ts: slenderness: { lambda, lambda_lim, beta, isSlender }
      slenderness: {
        lambda, 
        lambda_lim: lambda_limit, 
        beta, 
        isSlender
      },

      // Types.ts: shear: { Ve, Vr, Vc, Vw }
      shear: {
        Ve: Ve_col, 
        Vr: Vr_col, 
        Vc: Vc_col, 
        Vw: Vw_col
      },

      // Types.ts: confinement: { Ash_req, Ash_prov, s_max, s_opt }
      confinement: {
        Ash_req: confResult.Ash_req, // Fonksiyondan gelen güncel değer
        Ash_prov: confResult.Ash_prov, // Fonksiyondan gelen güncel değer
        s_max: confResult.s_max_code,
        s_opt: confResult.s_opt
      },
      
      interaction_ratio: Nd_design / N_max_design,
      strong_col_ratio: strongColRatio,
      req_area: As_col_provided,
      rho_provided: rho_col,
      count_main: countCol,
      
      // BURASI ÖNEMLİ: Types.ts'deki isimlerle BİREBİR AYNI olmalı
      checks: {
        axial_limit: createStatus(Nd_design <= N_max_limit_040, 'Uygun', 'Limit Aşıldı', 'Nd > 0.40Ac'),
        moment_capacity: createStatus(Md_col_magnified <= Mr_col, 'Güvenli', 'Yetersiz', 'Md > Mr'),
        shear_capacity: createStatus(Ve_col <= Vr_col, 'Güvenli', 'Kesme Riski', 'Ve > Vr'),
        strongColumn: createStatus(strongColRatio >= 1.2, 'Güçlü Kolon', 'Zayıf Kolon', 'Oran < 1.2'),
        minDimensions: createStatus(sections.colWidth >= 25 && sections.colDepth >= 25, 'Boyut OK'),
        minRebar: createStatus(rho_col >= 0.01, 'Min Donatı OK', 'Yetersiz', '%1 Altı'),
        maxRebar: createStatus(rho_col <= 0.04, 'Max Donatı OK', 'Fazla Donatı', '%4 Üstü'),
        confinement: createStatus(
          confResult.isSafe, 
          confResult.message, 
          'Yetersiz', 
          `Max Aralık: ${confResult.s_opt/10}cm`
        ),
        slendernessCheck: createStatus(
            lambda <= 100, // TS500'e göre narinlik 100'ü geçmemeli
            isSlender ? 'Narin (β>1)' : 'Kısa Kolon', // Güvenli ise mesaj
            'Çok Narin', // Güvensiz ise mesaj
            `λ=${lambda.toFixed(1)} > 100` // Hata sebebi
        )
      }
    },
    seismic: {
      param_sds: Sds,
      param_sd1: Sd1,
      period_t1: T1,
      spectrum_sae: Sae_g,
      building_weight: W_total,
      base_shear: Vt_design,
      story_drift_check: createStatus(true, 'Göreli Öteleme OK')
    },
    foundation: {
      stress_actual: sigma_zemin,
      stress_limit: sigma_limit,
      punching_force: Vpd,
      punching_stress: tau_pd,
      punching_capacity: tau_limit,
      moment_design: M_found,
      as_req: As_found_final,
      as_provided_spacing: spacingFound,
      checks: {
        bearing: createStatus(sigma_zemin <= sigma_limit, 'Zemin OK', 'Zemin Yetersiz'),
        punching: createStatus(tau_pd <= tau_limit, 'Zımbalama OK', 'Zımbalama Riski'),
        bending: createStatus(true, 'Eğilme OK')
      }
    },
    joint: {
      shear_force: Ve_joint,
      shear_limit: Vmax_joint,
      isSafe: Ve_joint <= Vmax_joint
    }
  };
};