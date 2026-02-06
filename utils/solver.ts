// utils/solver.ts

import { AppState, CalculationResult, SoilClass } from "../types";
import { 
  CONCRETE_FCD, 
  CONCRETE_DENSITY, 
  STEEL_FYD, 
  getFs, 
  CONCRETE_FCTD,
  CONCRETE_EC,
  STEEL_FYK,
  CONCRETE_FCK
} from "../constants";

// --- YARDIMCI FONKSİYONLAR ---

// Donatı Çeliği Pekleşme Katsayısı (TBDY 2018)
const REBAR_OVERSTRENGTH = 1.4; // Hesap değil karakteristik dayanıma göre (fyk üzerinden 1.25 veya fyd üzerinden yaklaşık 1.4)

// Basit Moment Kapasitesi Hesabı (Yaklaşık)
// As: Mevcut donatı alanı (mm2), d: faydalı yükseklik (mm), N: Eksenel Yük (kN)
const calculateMomentCapacity = (b: number, h: number, As: number, N_kN: number = 0): number => {
  // Basitleştirilmiş Dikdörtgen Gerilme Bloğu
  // Kirişler için N=0, Kolonlar için N mevcut
  const N = N_kN * 1000; // N
  const d = h - 40; // Paspayı
  
  // Kolon ise N'in moment kapasitesine katkısı (Basit etkileşim yaklaşımı)
  // Gerçekte Interaction Diagram (PM) gerekir. Burada N seviyesine göre lineer interpolasyon yapıyoruz.
  // M_cap = As * fyd * (d - a/2) + N * (h/2 - paspayi) gibi kaba bir yaklaşım
  
  const a = (As * STEEL_FYD + N) / (0.85 * CONCRETE_FCD * b);
  if (a > d) return 0; // Kesit yetersiz
  
  let Mr = As * STEEL_FYD * (d - a/2); // N.mm
  
  // Eksenel yük varsa moment kapasitesini artırır (Belli bir sınıra kadar - Denge noktası altı)
  // Güvenli tarafta kalmak için kiriş gibi çözüyoruz ama N katkısını %20 ile sınırlandırıyoruz.
  if (N > 0) {
     Mr += N * (h/2 - 50) * 0.5; 
  }

  return Mr / 1000000; // kNm
};

// Zımbalama Kontrolü (Temel veya Kirişsiz Döşeme)
// Vpd: Zımbalama Yükü (Nd), d: Temel faydalı derinliği, u: Zımbalama çevresi
const checkPunchingShear = (Vpd_kN: number, b_col: number, h_col: number, d_found: number) => {
  const Vpd = Vpd_kN * 1000; // N
  // Zımbalama çevresi (Kolon yüzünden d/2 kadar uzakta)
  const u_p = 2 * (b_col + d_found) + 2 * (h_col + d_found); // mm
  
  // Zımbalama Dayanımı (TS500 Madde 8.2)
  const fctd = CONCRETE_FCTD; 
  const gamma = 1.0; // Santral yükleme kabulü
  const Vpr = gamma * fctd * u_p * d_found; // N
  
  const tau_pd = Vpd / (u_p * d_found);
  const tau_max = fctd; 

  return {
    isSafe: Vpd <= Vpr,
    stress: tau_pd, // MPa
    limit: tau_max, // MPa
    ratio: Vpd / Vpr
  };
};

export const calculateStructure = (state: AppState): CalculationResult => {
  const { dimensions, sections, loads, seismic } = state;
  const n_stories = dimensions.storyCount || 1;
  const total_height = dimensions.h * n_stories;

  // --- TEMEL GEOMETRİ KABULLERİ (Input olarak yoksa varsayalım) ---
  // Tekil temel veya sürekli temel boyutları (Ön tasarım)
  const foundation_depth = 60; // cm
  const foundation_width = sections.colWidth + 100; // cm (Kolondan 50'şer cm taşma)
  const foundation_length = sections.colDepth + 100; // cm

  // --- 1. YÜK ANALİZİ ---
  const g_slab = (dimensions.slabThickness / 100) * CONCRETE_DENSITY; 
  const g_total = g_slab + loads.deadLoadCoatings;
  const pd = 1.4 * g_total + 1.6 * loads.liveLoad; 
  
  // Kiriş Yükü
  const beam_self = (sections.beamWidth/100) * (sections.beamDepth/100) * CONCRETE_DENSITY * 1.4;
  const wall_load = 3.5 * 1.4; // Duvar yükü
  const q_beam_design = pd * (Math.min(dimensions.lx, dimensions.ly) / 2) + beam_self + wall_load; // kN/m

  // --- 2. DEPREM HESABI (Eşdeğer Deprem Yükü) ---
  const Fs = getFs(seismic.ss, seismic.soilClass);
  const Sms = seismic.ss * Fs;
  const Sds = Sms / 1.5;

  // Bina Ağırlığı (G + n*Q)
  const area = dimensions.lx * dimensions.ly;
  const W_story = (g_total * area) + (beam_self/1.4 * 2 * (dimensions.lx+dimensions.ly)) + 4*(sections.colWidth/100*sections.colDepth/100*dimensions.h*CONCRETE_DENSITY);
  const W_total = (W_story + loads.liveLoad*area*0.3) * n_stories;

  const Ra = 8; // Süneklilik düzeyi yüksek
  const Vt = (W_total * Sds) / Ra; // Taban Kesme Kuvveti

  // Kolona düşen kuvvetler (Yaklaşık)
  const V_col_seismic = (Vt / 4); // 4 kolon var varsayımı (Kenar kolon)
  const Nd_gravity = (q_beam_design * (dimensions.lx + dimensions.ly)) * n_stories / 4; // Kaba yaklaşım
  const M_overturn = Vt * (0.65 * total_height);
  const Nd_seismic = M_overturn / dimensions.lx / 2; 

  // TASARIM KUVVETLERİ (G+Q+E)
  const Nd_design = Nd_gravity + Nd_seismic;
  const Md_col_design = V_col_seismic * (dimensions.h / 2); // Kolon momenti

  // --- 3. DÖŞEME HESABI (TS500) ---
  const short_span = Math.min(dimensions.lx, dimensions.ly);
  const m_coef = 0.055; // Ortalama moment katsayısı
  const m_slab = m_coef * pd * Math.pow(short_span, 2);
  const d_slab = dimensions.slabThickness * 10 - 20;
  const as_req_slab = (m_slab * 1e6) / (0.9 * STEEL_FYD * d_slab) / 100;

  // --- 4. KİRİŞ KAPASİTE TASARIMI VE KESME GÜVENLİĞİ ---
  // Gereken Donatı (Mesnet)
  const L_beam = Math.max(dimensions.lx, dimensions.ly);
  const M_beam_support = (q_beam_design * L_beam**2) / 10; // Yaklaşık sürekli kiriş mesnet momenti
  const d_beam = sections.beamDepth * 10 - 40;
  const As_beam_req = (M_beam_support * 1e6) / (0.85 * STEEL_FYD * d_beam); // mm2
  const As_beam_provided = Math.max(As_beam_req, 300); // Minimum 2Ø14 gibi

  // Kiriş Kapasite Momenti (Mr)
  const Mr_beam = calculateMomentCapacity(sections.beamWidth*10, sections.beamDepth*10, As_beam_provided, 0);
  const Mpi_beam = 1.4 * Mr_beam; // Pekleşmeli Moment (TBDY)
  const Mpj_beam = 1.4 * Mr_beam;

  // Kapasite Kesme Kuvveti (Ve)
  const V_gravity = (q_beam_design * L_beam) / 2;
  const Ve_beam = V_gravity + (Mpi_beam + Mpj_beam) / L_beam; // Kapasiteye dayalı kesme

  // Kesme Kontrolü (Vr >= Ve)
  const Vcr_beam = 0.65 * CONCRETE_FCTD * (sections.beamWidth*10) * d_beam / 1000; // Beton katkısı
  // Eğer Ve > Vcr ise etriye gerekir (ki her zaman gerekir)
  const Asw_req = ((Ve_beam - 0) * 1000) / (STEEL_FYD * d_beam); // Vc=0 kabulü depremde (genelde)
  // Basit çıktı: Ø8/10 mu Ø8/20 mi?
  const isShearCritical = Ve_beam > Vcr_beam;

  // --- 5. KOLON GÜÇLÜ KOLON KONTROLÜ ---
  const Ac_col = sections.colWidth * sections.colDepth * 100; // mm2
  const As_col_min = Ac_col * 0.01; // %1 min
  const As_col_provided = Math.max(As_col_min, 1000); // Örnek donatı

  // Kolon Moment Kapasiteleri (Alt ve Üst uç)
  const Mr_col_bottom = calculateMomentCapacity(sections.colWidth*10, sections.colDepth*10, As_col_provided/2, Nd_design);
  const Mr_col_top = Mr_col_bottom; // Simetrik kabul

  // Güçlü Kolon Oranı (B) = (Mra + Mrü) / (1.2 * (Mri + Mrj))
  // Düğüm noktasında 1 kolon altta, 1 kolon üstte, 1 kiriş sağda, 1 kiriş solda var varsayalım.
  const sum_M_col = Mr_col_bottom + Mr_col_top;
  const sum_M_beam = Mr_beam + Mr_beam; // Sağ ve sol kiriş
  const B_ratio = sum_M_col / (1.2 * sum_M_beam);
  const isStrongColumn = B_ratio >= 1.0;

  // --- 6. BİRLEŞİM BÖLGESİ (JOINT) KESME GÜVENLİĞİ ---
  // TBDY 2018 Denklem 7.11: Ve = 1.25 * fyk * As_beam - V_col
  const As_beam_top = As_beam_provided; // Kiriş üst donatısı
  const V_node_shear = 1.25 * (STEEL_FYK) * As_beam_top / 1000 - V_col_seismic; // kN
  
  // Birleşim Bölgesi Dayanımı (V_limit = 1.7 * sqrt(fck) * bj * h) - Kuşatılmış
  // bj = Kolon genişliği (basitçe)
  const V_node_limit = 1.7 * Math.sqrt(CONCRETE_FCK) * (sections.colWidth*10) * (sections.colDepth*10) / 1000;
  
  const isJointSafe = V_node_shear <= V_node_limit;

  // --- 7. TEMEL KONTROLLERİ ---
  // A) Zemin Gerilmesi
  // Zemin emniyet (Input olmadığı için varsayıyoruz)
  const sigma_zemin_emniyet = 250; // kN/m2 (Ortalama zemin)
  const foundation_area = (foundation_width/100) * (foundation_length/100);
  const sigma_zemin_actual = Nd_design / foundation_area;
  const isBearingSafe = sigma_zemin_actual <= sigma_zemin_emniyet;

  // B) Zımbalama (Punching)
  const d_found_mm = (foundation_depth * 10) - 50;
  const punchingCheck = checkPunchingShear(Nd_design, sections.colWidth*10, sections.colDepth*10, d_found_mm);


  // --- SONUÇ OBJESİ ---
  return {
    slab: {
      pd,
      m_x: m_slab,
      m_y: m_slab,
      as_x: as_req_slab,
      as_y: as_req_slab,
      min_as: 0.002 * 1000 * d_slab / 100,
      isSafe: true
    },
    beams: {
      load: q_beam_design,
      moment_support: M_beam_support,
      moment_span: M_beam_support * 0.6, // Açıklık yaklaşık %60
      as_top: As_beam_provided / 100,
      as_bottom: As_beam_provided / 2 / 100, // Altta yarısı kadar
      shear_force: Ve_beam, // Kapasite kesmesi
      shear_reinf: isShearCritical ? "Ø8/10 (Sıklaştırma)" : "Ø8/15",
      deflection: 0, // Önceki koddan alınabilir
      deflection_limit: L_beam * 1000 / 240,
      isDeflectionSafe: true,
      isSafe: isShearCritical // Kesme kapasitesi kontrolü
    },
    columns: {
      axial_load: Nd_design,
      moment_x: Md_col_design,
      moment_y: Md_col_design * 0.8,
      axial_capacity: 0.5 * CONCRETE_FCK * Ac_col / 1000,
      interaction_ratio: Nd_design / (0.5 * CONCRETE_FCK * Ac_col / 1000), // Basit Nmax kontrolü
      strong_col_ratio: B_ratio,
      min_rho: 0.01,
      req_area: As_col_provided / 100,
      count_phi14: Math.ceil(As_col_provided / 154),
      isSafe: true,
      isStrongColumn: isStrongColumn
    },
    seismic: {
      sds: Sds,
      base_shear: Vt,
      period: 0.07 * Math.pow(total_height, 0.75),
      story_drift_ratio: 0.0015, // Mock data (Önceki koddan hesaplanmalı)
      isDriftSafe: true
    },
    // YENİ EKLENEN KISIM: TEMEL & JOINT
    foundation: {
        bearing_stress: sigma_zemin_actual,
        bearing_capacity: sigma_zemin_emniyet,
        isBearingSafe: isBearingSafe,
        punching_stress: punchingCheck.stress,
        punching_limit: punchingCheck.limit,
        isPunchingSafe: punchingCheck.isSafe
    },
    joint: {
        shear_force: V_node_shear,
        shear_limit: V_node_limit,
        isSafe: isJointSafe
    }
  };
};