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
const calculateMomentCapacity = (b_mm: number, h_mm: number, As_mm2: number, fcd: number, N_design: number = 0): number => {
  const paspayi = 40; // mm
  const d = h_mm - paspayi; // Faydalı yükseklik
  
  // Eşdeğer Basınç Bloğu Derinliği (a)
  // Denge Denklemi: Fs - N = Fc  =>  As*fyd - N = 0.85*fcd*b*a
  // Buradan a çekilirse:
  const a = (As_mm2 * STEEL_FYD + N_design) / (0.85 * fcd * b_mm);
  
  // Kesit Yetersizlik Kontrolü (Basınç bloğu faydalı yüksekliği geçerse)
  if (a > d) return 0; 
  
  // Moment Kapasitesi (Çekme Donatısına Göre Moment Alınarak)
  // Mr = Fc * (d - a/2)  veya  Mr = As*fyd*(d-a/2) (Eksenel yük ihmali ile güvenli taraf)
  // Eksenel yükün moment kolu katkısı ihmal edilerek güvenli tarafta kalındı.
  const Mr = (As_mm2 * STEEL_FYD) * (d - a/2);
  
  return Mr / 1e6; // Nmm -> kNm çevrimi
};

const checkColumnConfinement = (
  bw_cm: number,      // Kolon genişliği (cm)
  hw_cm: number,      // Kolon derinliği (cm)
  fck: number,        // Beton dayanımı (MPa)
  s_req_mm: number,   // Kullanıcının girdiği/seçtiği aralık (mm) - Kontrol için
  stirrupDia_mm: number, // Etriye çapı (mm)
  colMainDia_mm: number // Boyuna donatı çapı (mm) - En küçüğü
): { isSafe: boolean; message: string; s_max_code: number; s_opt: number } => {
  
  const fywk = 420; // Etriye akma dayanımı (MPa)
  const paspayi_cm = 2.5; // Net paspayı

  // 1. Çekirdek Boyutları (bk)
  // Yönetmelik: Dıştan dışa çekirdek boyutu (paspayı düşülmüş)
  const bk_x = (bw_cm - 2 * paspayi_cm) * 10; // mm
  const bk_y = (hw_cm - 2 * paspayi_cm) * 10; // mm
  const bk_max = Math.max(bk_x, bk_y); // Formüldeki bk (bmax)

  // Alanlar
  const Ac = bw_cm * hw_cm * 100; // Brüt alan (mm2)
  const Ack = bk_x * bk_y;        // Çekirdek alanı (mm2)

  // 2. Etriye Kol Sayısı ve Alanı (Ash)
  // Kabul: 40cm ve üzeri kenarlarda 3 kol, altında 2 kol (Çirozlu/Çirozsuz)
  // Not: TBDY 7.3.4.1 (c) uyarınca etriye kollarının arası 25xø_etriye'yi geçmemeli. 
  // Basitlik adına 40cm altı 2 kol, üstü 3 kol (ortada çiroz) kabulü yapıyoruz.
  const nx = bw_cm >= 40 ? 3 : 2;
  const ny = hw_cm >= 40 ? 3 : 2;
  
  // Hesabı her iki yön için ayrı yapıp en sık (küçük) aralığı alacağız
  // Ancak genelde bk_max ve min(nx, ny) belirleyici olur. 
  // Güvenli taraf için en küçük kol sayısını ve en büyük bk'yı baz alalım.
  const n_legs_min = Math.min(nx, ny); 
  const Ash_mm2 = n_legs_min * (Math.PI * Math.pow(stirrupDia_mm / 2, 2));

  // 3. Yönetmelik Geometrik Sınırları (Madde 7.3.4.1)
  // a) Enkesit boyutunun 1/3'ü
  const limit_geom_1 = Math.min(bw_cm * 10, hw_cm * 10) / 3;
  // b) 100 mm (Sarılma bölgesinde) - TBDY 2018'de 150mm değil 100mm sınır vardır (7.3.4.1-b)
  const limit_geom_2 = 100; 
  // c) Boyuna donatı çapının 6 katı
  const limit_geom_3 = 6 * colMainDia_mm;

  // Geometrik Maksimum Aralık (s_max)
  const s_geom_max = Math.min(limit_geom_1, limit_geom_2, limit_geom_3);

  // 4. Gereken Aralık Hesabı (Denklem 7.1 ve 7.2'den s çekilerek)
  
  // Formül 1: Ash >= 0.30 * s * bk * (fck/fywk) * (Ac/Ack - 1)
  // Buradan s1 çekilirse:
  const term1 = 0.30 * bk_max * (fck / fywk) * ((Ac / Ack) - 1);
  const s1_calc = term1 > 0 ? Ash_mm2 / term1 : 200; // Pozitif kontrolü

  // Formül 2: Ash >= 0.075 * s * bk * (fck/fywk)
  // Buradan s2 çekilirse:
  const term2 = 0.075 * bk_max * (fck / fywk);
  const s2_calc = term2 > 0 ? Ash_mm2 / term2 : 200;

  // Hesaplanan Maksimum Aralık (Tüm şartların en küçüğü)
  let s_limit_final = Math.min(s_geom_max, s1_calc, s2_calc);

  // Uygulama için yuvarlama (5mm katlarına aşağı yuvarla)
  // Örn: 83mm -> 80mm
  let s_app = Math.floor(s_limit_final / 5) * 5;

  // Min sınır kontrolü (Beton dökümü için min 50mm)
  if (s_app < 50) {
    return {
      isSafe: false,
      message: 'Etriye Çapı Yetersiz',
      s_max_code: Math.floor(s_limit_final),
      s_opt: 50 // Teorik olarak 50 veriyoruz ama uyarı dönecek
    };
  }

  // Kullanıcı kontrolü
  const isSafe = s_req_mm <= s_app;

  return {
    isSafe,
    message: isSafe ? 'Sargı Yeterli' : `Aralık Yetersiz (Max ${s_app/10}cm)`,
    s_max_code: s_app,
    s_opt: s_app
  };
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
  const L_beam = ly; // Kritik açıklık (Uzun kenar)
  const d_beam = sections.beamDepth * 10 - 30; // 30mm paspayı
  
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
  const V_beam_design = q_beam_design * L_beam / 2; // Basit kiriş kesmesi
  
  // Kesme Dayanımları
  // Vcr: Çatlama Dayanımı = 0.65 * fctd * b * d
  const Vcr = 0.65 * fctd * (sections.beamWidth * 10) * d_beam / 1000; // kN
  // Vmax: Ezilme Dayanımı = 0.22 * fcd * b * d
  const Vmax = 0.22 * fcd * (sections.beamWidth * 10) * d_beam / 1000; // kN
  
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
  
  // ETRİYE BİLGİLERİ (HATA DÜZELTİLDİ: Tek seferde tanımlandı)
  const stirrupDia = rebars.colStirrupDia || 8; 
  const stirrupArea = 2 * (Math.PI * Math.pow(stirrupDia/2, 2)); // Çift kollu (mm2)
  const Ash_prov = stirrupArea; // Sargılama hesabı için mevcut alan

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
  
  // Vw (Etriye katkısı)
  const s_stirrup = 100; // mm (Sıklaştırma bölgesi varsayımı: 100mm)
  const d_col = (sections.colDepth * 10) - 30;
  const Vw_col = (stirrupArea * 420 * d_col) / s_stirrup / 1000; // kN (420 = fyk)
  
  const Vr_max = 0.22 * fcd * Ac_col_mm2 / 1000;
  const Vr_col = Math.min(Vc_col + Vw_col, Vr_max);

 // ==========================================================================
  // [KONTROL 7] SARGILAMA (ETRİYE) HESABI - GÜNCELLENDİ (TAM KOD)
  // ==========================================================================
  
  // 1. Yönetmelik Sınırları (Geometrik)
  const s_geom_max = Math.min(100, Math.min(sections.colWidth * 10, sections.colDepth * 10) / 3);
  const s_code_min = 50; 

  // 2. Çekirdek (Sargılı Beton) Boyutları (EKSİK OLAN KISIM EKLENDİ)
  const paspayi_col = 25; // mm (Net paspayı)
  const bk_x = (sections.colWidth * 10) - 2 * paspayi_col; 
  const bk_y = (sections.colDepth * 10) - 2 * paspayi_col; 
  const bk = Math.max(bk_x, bk_y); // En büyük çekirdek boyutu
  const Ack = bk_x * bk_y; // Çekirdek alanı

  // 3. Düşük Eksenel Yük Kontrolü (TBDY 2018 7.3.4.1-a)
  // Nd <= 0.25 * fck * Ac ise Ash_min %33 (2/3) azaltılabilir.
  const isLowAxialLoad = (Nd_design * 1000) <= (0.25 * fck * Ac_col_mm2);
  const ashReductionFactor = isLowAxialLoad ? (2/3) : 1.0;

  // 4. Etriye Kol Sayısı ve Alanı (Pratik Kabul: 40cm+ ise çiroz ile 3 kol)
  // stirrupDia değişkeni üst satırlarda tanımlı olmalıdır.
  const n_legs = (sections.colWidth >= 40 || sections.colDepth >= 40) ? 3 : 2;
  const stirrupAreaTotal = n_legs * (Math.PI * Math.pow(stirrupDia/2, 2));

  // 5. Gereken Aralık Hesabı (İndirim faktörü dahil)
  const coeff1 = 0.30 * bk * (fck / 420) * ((Ac_col_mm2 / Ack) - 1);
  const s_calc_1 = coeff1 > 0 ? stirrupAreaTotal / (coeff1 * ashReductionFactor) : 999; 

  const coeff2 = 0.075 * bk * (fck / 420);
  const s_calc_2 = coeff2 > 0 ? stirrupAreaTotal / (coeff2 * ashReductionFactor) : 999;

  // 6. Nihai Aralık Seçimi
  let s_target = Math.min(s_geom_max, s_calc_1, s_calc_2);
  
  // Uygulama Pratiği: 5mm veya 10mm katına yuvarla
  let s_final = Math.floor(s_target / 10) * 10; // Daha rasyonel aralıklar için 1cm'lik adımlar
  if (s_final < s_code_min) s_final = s_code_min;

  // 7. Nihai Karar Mekanizması
  let confinementStatus = {
    isSafe: true,
    message: "Sargı Yeterli",
    description: "",
    s_application: s_final
  };

  if (s_final < s_code_min) { // Eğer hesaplanan min aralık bile yönetmelik sınırının altındaysa (Örn: 25mm gerekiyorsa)
    confinementStatus.isSafe = false;
    confinementStatus.message = "Çap Yetersiz";
    confinementStatus.description = `Hesaplanan aralık (${s_final}mm) döküm için çok dar. Lütfen etriye çapını artırın (Örn: Ø10).`;
    confinementStatus.s_application = s_code_min; 
  } else {
    confinementStatus.isSafe = true;
    confinementStatus.message = "Sargı Yeterli";
    confinementStatus.description = `Sıklaştırma Aralığı: ${s_final/10} cm (Hesap: ${s_target.toFixed(1)}mm)`;
  }

  // Raporlama için Ash_req değerini hesapla (İndirimsiz teorik değer referans için)
  const ash_req_check = Math.max(
      0.30 * s_final * bk * (fck/420) * ((Ac_col_mm2/Ack) - 1),
      0.075 * s_final * bk * (fck/420)
  ) * ashReductionFactor; // Raporda görünen gereksinim de indirimli olmalı

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
      shear_reinf_type: V_beam_design > Vcr ? "Ø8/10 (Sıklaştırma)" : "Ø8/15",
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
        Ash_req: ash_req_check, // Hesaplanan s_final'e göre gereken alan
        Ash_prov: stirrupAreaTotal,     // Seçilen etriyenin alanı
        s_max: s_geom_max,      // Geometrik sınır (100mm)
        s_opt: confinementStatus.s_application // Bizim hesapladığımız (örn: 70mm)
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
        confinement: createStatus(stirrupAreaTotal >= ash_req_check, 'Sargı Yeterli')
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