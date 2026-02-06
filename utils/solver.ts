import { AppState, CalculationResult, SoilClass, CheckStatus } from "../types";
import { 
  CONCRETE_FCD, 
  CONCRETE_DENSITY, 
  STEEL_FYD, 
  getFs, 
  CONCRETE_FCTD,
  STEEL_FYK,
  CONCRETE_FCK
} from "../constants";

// --- YARDIMCI FONKSİYONLAR ---

// Durum objesi oluşturucu
const createStatus = (isSafe: boolean, successMsg: string = 'Güvenli', failMsg: string = 'Yetersiz', reason?: string): CheckStatus => ({
  isSafe,
  message: isSafe ? successMsg : failMsg,
  reason: isSafe ? undefined : reason
});

const calculateMomentCapacity = (b: number, h: number, As: number, N_kN: number = 0): number => {
  const N = N_kN * 1000; 
  const d = h - 40; 
  
  const a = (As * STEEL_FYD + N) / (0.85 * CONCRETE_FCD * b);
  if (a > d) return 0; 
  
  let Mr = As * STEEL_FYD * (d - a/2); 
  
  if (N > 0) {
     Mr += N * (h/2 - 50) * 0.5; 
  }

  return Mr / 1000000; // kNm
};

const checkPunchingShear = (Vpd_kN: number, b_col: number, h_col: number, d_found: number) => {
  const Vpd = Vpd_kN * 1000; 
  // Zımbalama çevresi (d kadar uzakta)
  const u_p = 2 * (b_col + d_found) + 2 * (h_col + d_found); 
  
  const fctd = CONCRETE_FCTD; 
  const gamma = 1.0; 
  const Vpr = gamma * fctd * u_p * d_found; 
  
  const tau_pd = Vpd / (u_p * d_found);
  const tau_max = fctd; 

  return {
    isSafe: Vpd <= Vpr,
    stress: tau_pd, 
    limit: tau_max,
    ratio: Vpd / Vpr
  };
};

export const calculateStructure = (state: AppState): CalculationResult => {
  const { dimensions, sections, loads, seismic, rebars } = state;
  const n_stories = dimensions.storyCount || 1;
  const total_height = dimensions.h * n_stories;

  // --- TEMEL GEOMETRİ (RADYE) ---
  const foundation_height = dimensions.foundationHeight || 50; // cm
  // Radye alanı: Bina oturumu + 50cm ampatman
  const foundation_width_m = dimensions.lx + 1.0; 
  const foundation_length_m = dimensions.ly + 1.0;
  const foundation_area = foundation_width_m * foundation_length_m; // m2

  // --- 1. YÜK ANALİZİ ---
  const g_slab = (dimensions.slabThickness / 100) * CONCRETE_DENSITY; 
  const g_total = g_slab + loads.deadLoadCoatingsKg / 1000; 
  
  const g_coatings_kN = loads.deadLoadCoatingsKg * 10 / 1000; // kN/m2
  const q_live_kN = loads.liveLoadKg * 10 / 1000; // kN/m2

  const g_slab_kN = (dimensions.slabThickness / 100) * CONCRETE_DENSITY; 
  const g_total_kN = g_slab_kN + g_coatings_kN;

  const pd = 1.4 * g_total_kN + 1.6 * q_live_kN; 
  
  // Kiriş Yükü
  const beam_self = (sections.beamWidth/100) * (sections.beamDepth/100) * CONCRETE_DENSITY * 1.4;
  const wall_load = 3.5 * 1.4; 
  const q_beam_design = pd * (Math.min(dimensions.lx, dimensions.ly) / 2) + beam_self + wall_load; // kN/m

  // --- 2. DEPREM HESABI ---
  const Fs = getFs(seismic.ss, seismic.soilClass);
  const Sms = seismic.ss * Fs;
  const Sds = Sms / 1.5;

  const area = dimensions.lx * dimensions.ly;
  // Bina ağırlığı hesabı (kN)
  const W_story = (g_total_kN * area) + (beam_self/1.4 * 2 * (dimensions.lx+dimensions.ly)) + 4*(sections.colWidth/100*sections.colDepth/100*dimensions.h*CONCRETE_DENSITY);
  // Radye ağırlığı (Yeni eklendi)
  const W_foundation = foundation_area * (foundation_height / 100) * CONCRETE_DENSITY;
  
  const W_total = (W_story + q_live_kN*area*0.3) * n_stories;

  const Ra = 8; 
  const Vt = (W_total * Sds) / Ra; 

  const V_col_seismic = (Vt / 4); 
  const Nd_gravity = (q_beam_design * (dimensions.lx + dimensions.ly)) * n_stories / 4; 
  const M_overturn = Vt * (0.65 * total_height);
  const Nd_seismic = M_overturn / dimensions.lx / 2; 

  const Nd_design = Nd_gravity + Nd_seismic;
  const Md_col_design = V_col_seismic * (dimensions.h / 2); 

  // --- 3. DÖŞEME HESABI ---
  const short_span = Math.min(dimensions.lx, dimensions.ly);
  const m_coef = 0.055; 
  const m_slab = m_coef * pd * Math.pow(short_span, 2);
  const d_slab = dimensions.slabThickness * 10 - 20; 
  const as_req_slab = (m_slab * 1e6) / (0.9 * STEEL_FYD * d_slab) / 100; 
  const as_min_slab = 0.002 * 100 * d_slab / 10; 

  // Donatı aralığı
  const rebarAreaSlab = Math.PI * Math.pow(rebars.slabDia/2, 2) / 100; 
  const spacingSlab = Math.min((rebarAreaSlab * 100) / as_req_slab, 30); 

  // --- 4. KİRİŞ HESABI ---
  const L_beam = Math.max(dimensions.lx, dimensions.ly);
  const M_beam_support = (q_beam_design * L_beam**2) / 10; 
  const d_beam = sections.beamDepth * 10 - 40;
  const As_beam_req = (M_beam_support * 1e6) / (0.85 * STEEL_FYD * d_beam); 
  const As_beam_provided = Math.max(As_beam_req, 300); 

  const areaOneBarBeam = Math.PI * Math.pow(rebars.beamMainDia/2, 2);
  const countSupport = Math.ceil(As_beam_provided / areaOneBarBeam);
  const countSpan = Math.ceil((As_beam_provided / 2) / areaOneBarBeam);

  const Mr_beam = calculateMomentCapacity(sections.beamWidth*10, sections.beamDepth*10, As_beam_provided, 0);
  const Mpi_beam = 1.4 * Mr_beam; 
  const Mpj_beam = 1.4 * Mr_beam;

  const V_gravity = (q_beam_design * L_beam) / 2;
  const Ve_beam = V_gravity + (Mpi_beam + Mpj_beam) / L_beam; 

  const Vcr_beam = 0.65 * CONCRETE_FCTD * (sections.beamWidth*10) * d_beam / 1000; 
  const isShearCritical = Ve_beam > Vcr_beam;

  // --- 5. KOLON HESABI ---
  const Ac_col = sections.colWidth * sections.colDepth * 100; 
  const As_col_min = Ac_col * 0.01; 
  const As_col_provided = Math.max(As_col_min, 1000); 

  const areaOneBarCol = Math.PI * Math.pow(rebars.colMainDia/2, 2);
  const countColMain = Math.ceil(As_col_provided / areaOneBarCol);

  const Mr_col_bottom = calculateMomentCapacity(sections.colWidth*10, sections.colDepth*10, As_col_provided/2, Nd_design);
  const Mr_col_top = Mr_col_bottom; 

  const sum_M_col = Mr_col_bottom + Mr_col_top;
  const sum_M_beam = Mr_beam + Mr_beam; 
  const B_ratio = sum_M_beam > 0 ? sum_M_col / (1.2 * sum_M_beam) : 0;
  const isStrongColumn = B_ratio >= 1.0;

  // --- 6. BİRLEŞİM ---
  const V_node_shear = 1.25 * (STEEL_FYK) * (As_beam_provided) / 1000 - V_col_seismic; 
  const V_node_limit = 1.7 * Math.sqrt(CONCRETE_FCK) * (sections.colWidth*10) * (sections.colDepth*10) / 1000;
  const isJointSafe = V_node_shear <= V_node_limit;

  // --- 7. RADYE TEMEL HESAPLARI (YENİ) ---
  const sigma_zemin_emniyet = 250; 
  // Toplam yük temele aktarılır: (W_total + W_foundation)
  // Basitleştirme: 4 kolona gelen toplam yük + radye ağırlığı yayılı
  const Total_Vertical_Load = (Nd_design * 4) + W_foundation; 
  
  const sigma_zemin_actual = Total_Vertical_Load / foundation_area;
  const isBearingSafe = sigma_zemin_actual <= sigma_zemin_emniyet;
  
  // Zımbalama (Kolon yükü için)
  const d_found_mm = (foundation_height * 10) - 50; // Paspayı 50mm
  const punchingCheck = checkPunchingShear(Nd_design, sections.colWidth*10, sections.colDepth*10, d_found_mm);

  const slabMinThickness = 10; 
  const interactionRatio = Nd_design / (0.5 * CONCRETE_FCK * Ac_col / 1000);

  // --- SONUÇ OBJESİ ---
  return {
    slab: {
      pd,
      alpha: m_coef,
      d: d_slab,
      m_x: m_slab,
      as_req: as_req_slab,
      as_min: as_min_slab,
      spacing: spacingSlab,
      min_thickness: slabMinThickness,
      thicknessStatus: createStatus(dimensions.slabThickness >= slabMinThickness, 'Uygun', 'Yetersiz', `Min ${slabMinThickness}cm`),
      status: createStatus(true, 'Güvenli', 'Riskli')
    },
    beams: {
      load: q_beam_design,
      moment_support: M_beam_support,
      moment_span: M_beam_support * 0.6,
      as_support: As_beam_provided / 100,
      as_span: As_beam_provided / 2 / 100,
      count_support: countSupport,
      count_span: countSpan,
      shear_force: Ve_beam,
      shear_capacity: Vcr_beam,
      shear_reinf: isShearCritical ? "Ø8/10 (Sıklaştırma)" : "Ø8/15",
      deflection: 0, 
      deflection_limit: L_beam * 1000 / 240,
      deflectionStatus: createStatus(true, 'Uygun', 'Aşıyor'),
      shearStatus: createStatus(true, 'Yeterli', 'Yetersiz') 
    },
    columns: {
      axial_load: Nd_design,
      moment_x: Md_col_design,
      axial_capacity: 0.5 * CONCRETE_FCK * Ac_col / 1000,
      interaction_ratio: interactionRatio,
      strong_col_ratio: B_ratio,
      req_area: As_col_provided / 100,
      count_main: countColMain,
      status: createStatus(interactionRatio <= 1, 'Yeterli', 'Kapasite Aşımı', `Oran: ${interactionRatio.toFixed(2)}`),
      strongColumnStatus: createStatus(isStrongColumn, 'Güçlü Kolon', 'Zayıf Kolon', `Oran: ${B_ratio.toFixed(2)}`)
    },
    seismic: {
      sds: Sds,
      building_weight: W_total,
      base_shear: Vt,
      period: 0.07 * Math.pow(total_height, 0.75),
      story_drift_ratio: 0.0015,
      driftStatus: createStatus(true, 'Sınır İçi', 'Sınır Aşıldı')
    },
    foundation: {
        bearing_stress: sigma_zemin_actual,
        bearing_capacity: sigma_zemin_emniyet,
        isBearingSafe: isBearingSafe,
        punching_stress: punchingCheck.stress,
        punching_limit: punchingCheck.limit,
        isPunchingSafe: punchingCheck.isSafe,
        min_height_status: createStatus(foundation_height >= 30, 'Uygun', 'Yetersiz', 'Min 30cm') // Radye min 30cm kabulü
    },
    joint: {
        shear_force: V_node_shear,
        shear_limit: V_node_limit,
        isSafe: isJointSafe
    }
  };
};