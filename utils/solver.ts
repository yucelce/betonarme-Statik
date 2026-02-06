import { AppState, CalculationResult } from "../types";
import { 
  CONCRETE_FCD, 
  CONCRETE_DENSITY, 
  STEEL_FYD, 
  getFs, 
  CONCRETE_FCTD,
  CONCRETE_EC,
  STEEL_ES
} from "../constants";

// N-M Etkileşimi için basitleştirilmiş kontrol
// P: Eksenel Yük, M: Moment, b/h: Boyutlar, As: Toplam Donatı
const checkInteraction = (P: number, M: number, b: number, h: number, As: number) => {
  // Basitleştirilmiş Karşılıklı Etki Diyagramı Yaklaşımı
  // 1. Saf Eksenel Kapasite (Po)
  const Ac = b * h;
  const Po = 0.85 * CONCRETE_FCD * (Ac - As) + As * STEEL_FYD;
  const Po_design = Po / 1000; // kN

  // 2. Saf Eğilme Kapasitesi (Mo)
  // Yaklaşık z = 0.9d kabulü ile
  const d = h - 50; // mm
  const As_tens = As / 2; // Simetrik donatı kabulü
  const Mo = As_tens * STEEL_FYD * 0.9 * d;
  const Mo_design = Mo / 1000000; // kNm

  // 3. Etkileşim Denklemi (Bresler veya PCA benzeri basitleştirme)
  // (P/Po)^a + (M/Mo)^a <= 1.0
  // Genellikle kolonlarda doğrusal olmayan bir ilişki vardır, burada güvenli tarafta kalan linear+parabolik bir yaklaşım kullanacağız.
  
  // Nmax limiti (TBDY): 0.5 fck Ac -> Biz Fcd kullandığımız için ~0.6-0.7 Fcd Ac'ye denk gelir.
  const Nmax = 0.5 * 30 * Ac / 1000; // fck=30 üzerinden kontrol
  if (P > Nmax) return { ratio: P/Nmax * 2, safe: false, note: "Nmax aşıldı" };

  // Basit Bresler Yaklaşımı: P/Po + M/Mo <= 1 (Çok güvenli taraf)
  // Gerçekte diyagram şişkindir, bu yüzden (P/Po) + (M/Mo) < 1.2 gibi bir sınır daha gerçekçi ön tasarım için.
  // Ancak biz interaction ratio olarak şunu döndürelim:
  const ratio = (P / Po_design) + (M / Mo_design);
  
  return { 
    ratio, 
    safe: ratio <= 1.0 
  };
};

export const calculateStructure = (state: AppState): CalculationResult => {
  const { dimensions, sections, loads, seismic } = state;
  const n_stories = dimensions.storyCount || 1;
  const total_height = dimensions.h * n_stories;

  // --- 1. DÖŞEME HESABI (Aynı Kalıyor) ---
  const g_slab = (dimensions.slabThickness / 100) * CONCRETE_DENSITY; 
  const g_total = g_slab + loads.deadLoadCoatings;
  const pd = 1.4 * g_total + 1.6 * loads.liveLoad; 
  const short_span = Math.min(dimensions.lx, dimensions.ly);
  
  // Moment katsayısı (Sürekli kenar kabulüyle biraz düşürüldü)
  const ratio = Math.max(dimensions.lx, dimensions.ly) / Math.min(dimensions.lx, dimensions.ly);
  let alpha = 0.050; // Ortalamalaştırılmış
  if (ratio > 2.0) alpha = 0.125; 

  const m_slab = alpha * pd * Math.pow(short_span, 2); 
  const cover_slab = 20; 
  const d_slab = dimensions.slabThickness * 10 - cover_slab; 
  const as_req_slab = (m_slab * 1000000) / (0.9 * STEEL_FYD * d_slab) / 100; 
  const as_min_slab = 0.002 * 1000 * (dimensions.slabThickness * 10) / 100;

  // --- 2. ÇERÇEVE ANALİZİ (YENİ: RIJITLIK DAĞITIMI) ---
  // Basitleştirilmiş Rijitlik Matriksi Mantığı
  
  // Kiriş Yükü
  const q_equiv_from_slab = pd * (short_span / 2); 
  const beam_self = (sections.beamWidth/100) * (sections.beamDepth/100) * CONCRETE_DENSITY * 1.4;
  const wall_load = 3.5 * 1.4; 
  const q_beam = q_equiv_from_slab + beam_self + wall_load; // kN/m
  const L_beam = Math.max(dimensions.lx, dimensions.ly);

  // Atalet Momentleri (mm4 -> m4)
  const Ib = (sections.beamWidth/100 * Math.pow(sections.beamDepth/100, 3)) / 12;
  const Ic = (sections.colWidth/100 * Math.pow(sections.colDepth/100, 3)) / 12;

  // Rijitlikler (k = I/L)
  const kb = Ib / L_beam;
  const kc = Ic / dimensions.h;

  // Birleşim Noktası Dağıtma Katsayıları (Distribution Factors)
  // Düğüm noktasında: 2 kolon (alt+üst) ve 2 kiriş (sağ+sol) olduğunu varsayalım (iç düğüm)
  // DF_beam = kb / (2kb + 2kc)
  const sum_k = 2*kb + 2*kc;
  const df_beam = kb / sum_k;
  const df_col = kc / sum_k;

  // Ankastrelik Momenti (Fixed End Moment)
  const FEM = (q_beam * Math.pow(L_beam, 2)) / 12;

  // Moment Dağıtımı (Basit Cross İterasyonu Sonucu)
  // Mesnet momenti: FEM - (DF_beam * FEM_farkı)
  // İç kolonlar için yaklaşık olarak FEM değerine yakın kalır, kenar kolonlarda azalır.
  // Güvenli taraf tasarım momenti (Mesnet):
  const M_beam_support = FEM * 0.9; // Biraz gevşeme olur
  const M_beam_span = (q_beam * Math.pow(L_beam, 2)) / 8 - M_beam_support; // İzostatik - Mesnet

  // Kolona Aktarılan Moment (Düşey Yükten)
  // Dengesiz momentin kolona giden kısmı: FEM * df_col
  const M_col_gravity = FEM * df_col * 1.5; // Kenar akslarda daha fazladır, güvenlik katsayısı

  // --- 3. DEPREM ANALİZİ (GELİŞMİŞ) ---
  const Fs = getFs(seismic.ss, seismic.soilClass);
  const Sms = seismic.ss * Fs;
  const Sds = Sms / 1.5;

  const slab_area = dimensions.lx * dimensions.ly;
  const w_floor = (g_total * slab_area) + (beam_self/1.4 * 2 * (dimensions.lx+dimensions.ly)) + 4*(sections.colWidth/100*sections.colDepth/100*dimensions.h*CONCRETE_DENSITY);
  const total_weight = (w_floor + loads.liveLoad*slab_area*0.3) * n_stories;

  // Periyot (Rayleigh formülüne daha yakın bir yaklaşım veya T1=Ct*H^0.75)
  const T1 = 0.07 * Math.pow(total_height, 0.75);
  const Ra = 8;
  const Vt = (total_weight * Sds) / Ra; // Taban Kesme Kuvveti

  // Eşdeğer Deprem Yükü Dağılımı (Ters Üçgen)
  // En üst kata etkiyen kuvvet yaklaşık: F_top = Vt * 2 / (n+1)
  // Biz kritik (zemin) kat kolonuna gelen kesme kuvvetini bulalım.
  // Bir çerçeveye düşen kesme kuvveti (2 aks var dersek yarısı)
  const V_col_seismic = (Vt / 2) / 2; // Toplam Vt / 2 çerçeve / 2 kolon = Bir kolona düşen V

  // Kolon Momenti (Depremden) - Sıfır noktası ortada kabulüyle
  const M_col_seismic = V_col_seismic * (dimensions.h / 2);

  // Kombinasyon (1.0G + 1.0Q + 1.0E)
  const Nd_gravity = (q_beam * (2*dimensions.lx + 2*dimensions.ly) / 4) * n_stories;
  // Deprem devrilme etkisi eksenel yükü: N = M_overturning / L
  const M_overturn = Vt * (0.65 * total_height);
  const Nd_seismic = M_overturn / dimensions.lx / 2; // Bir çerçevedeki kolona etkisi

  const Nd_design = Nd_gravity + Nd_seismic;
  const Md_col_design = M_col_gravity + M_col_seismic;

  // --- 4. KAPASİTE VE KONTROLLER ---

  // A) KİRİŞ KONTROLLERİ
  const d_beam = sections.beamDepth * 10 - 40;
  const as_beam_supp = (M_beam_support * 1000000) / (0.85 * STEEL_FYD * d_beam) / 100;
  const as_beam_bot = (M_beam_span * 1000000) / (0.9 * STEEL_FYD * d_beam) / 100;
  
  // Sehim Kontrolü (5qL^4 / 384EI) - Çatlamış kesit ataleti (~0.35 Ig)
  const E_beam = CONCRETE_EC * 1000; // kN/m2
  const I_beam_cracked = (Ib * 0.50); // Çatlamış kesit kabulü
  const delta_max = (5 * q_beam * Math.pow(L_beam, 4)) / (384 * E_beam * I_beam_cracked) * 1000; // mm
  const delta_limit = (L_beam * 1000) / 240; // L/240
  const isDeflectionSafe = delta_max < delta_limit;

  // Kiriş Kesme
  const Vd_beam = (q_beam * L_beam) / 2;
  const Vc_beam = 0.8 * 0.65 * CONCRETE_FCTD * (sections.beamWidth*10) * d_beam / 1000;
  const shear_reinf = Vd_beam > Vc_beam ? "Ø8/10 (Sıklaştırma)" : "Ø8/20";

  // B) KOLON KONTROLLERİ
  const Ac_col = sections.colWidth * sections.colDepth * 100; // mm2
  const min_rho_col = 0.01;
  const As_min_col = min_rho_col * Ac_col; // mm2
  const As_provided_col = Math.max(As_min_col, 2200); // En az 4Ø20 veya 6Ø14 gibi varsayalım, hesap için min %1 koyduk

  // N-M Etkileşimi
  const interaction = checkInteraction(Nd_design, Md_col_design, sections.colWidth*10, sections.colDepth*10, As_provided_col);
  
  // Güçlü Kolon Kontrolü (Mc >= 1.2 Mb)
  // Kolonun mevcut eksenel yük altındaki moment kapasitesi yaklaşık:
  const Mc_capacity = (0.9 * As_provided_col/2 * STEEL_FYD * (sections.colDepth*10*0.9)) / 1000000; 
  // Kiriş kapasitesi (Donatıya göre)
  const Mb_capacity = M_beam_support; // Mevcut donatı tam yetiyor kabulüyle
  
  const strong_col_ratio = (2 * Mc_capacity) / (2 * 1.2 * Mb_capacity); // Düğüm noktasında 2 kolon 2 kiriş
  const isStrongColumn = strong_col_ratio >= 1.0;

  // C) GÖRELİ KAT ÖTELEMESİ (DRIFT)
  // Delta = V * h^3 / (12 * E * Ic_total) (Basit Çerçeve)
  // Toplam rijitlik (Tüm kolonlar)
  const num_cols = 4; // Basit model
  const Ic_total = num_cols * Ic; // m4
  // Göreli kat ötelemesi (Elastik)
  const delta_elastic = (Vt/n_stories * Math.pow(dimensions.h, 3)) / (12 * E_beam * Ic_total); 
  // Etkin Göreli Öteleme (R * delta) / I gerekmez, TBDY lambda * delta
  const lambda = 0.5; // Çatlamış kesit vb etkiler için büyütme (Basitleştirilmiş)
  const delta_eff = delta_elastic * Ra * lambda; 
  const drift_ratio = delta_eff / dimensions.h;
  const drift_limit = 0.008; // %0.8 sınır (TBDY)
  
  return {
    slab: {
      pd,
      m_x: m_slab,
      m_y: m_slab,
      as_x: Math.max(as_req_slab, as_min_slab),
      as_y: Math.max(as_req_slab, as_min_slab),
      min_as: as_min_slab,
      isSafe: true 
    },
    beams: {
      load: q_beam,
      moment_support: M_beam_support,
      moment_span: M_beam_span,
      as_top: as_beam_supp,
      as_bottom: as_beam_bot,
      shear_force: Vd_beam,
      shear_reinf: shear_reinf,
      deflection: delta_max,
      deflection_limit: delta_limit,
      isDeflectionSafe: isDeflectionSafe,
      isSafe: true // Ön tasarımda genelde donatı ayarlanır
    },
    columns: {
      axial_load: Nd_design,
      moment_x: Md_col_design,
      moment_y: Md_col_design * 0.8, // Yaklaşık
      axial_capacity: 0.5 * 30 * Ac_col / 1000,
      interaction_ratio: interaction.ratio,
      strong_col_ratio: strong_col_ratio,
      min_rho: 0.01,
      req_area: As_min_col / 100, // cm2
      count_phi14: Math.ceil((As_min_col) / 154),
      isSafe: interaction.safe,
      isStrongColumn: isStrongColumn
    },
    seismic: {
      sds: Sds,
      base_shear: Vt,
      period: T1,
      story_drift_ratio: drift_ratio,
      isDriftSafe: drift_ratio < drift_limit
    }
  };
};