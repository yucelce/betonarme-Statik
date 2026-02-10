// types.ts

export enum SoilClass {
  ZA = 'ZA', // Sağlam Kaya
  ZB = 'ZB', // Az Ayrışmış Kaya
  ZC = 'ZC', // Çok Sıkı Kum / Çakıl
  ZD = 'ZD', // Orta Sıkı Kum
  ZE = 'ZE', // Gevşek Kum
}

export enum ConcreteClass {
  C20 = 'C20', C25 = 'C25', C30 = 'C30',
  C35 = 'C35', C40 = 'C40', C50 = 'C50',
}

export interface Dimensions {
  lx: number;
  ly: number;
  h: number;
  slabThickness: number;
  storyCount: number;
  foundationHeight: number;
  foundationCantilever: number;
}

export interface Sections {
  beamWidth: number;
  beamDepth: number;
  colWidth: number;
  colDepth: number;
}

export interface Loads {
  liveLoadKg: number;
  deadLoadCoatingsKg: number;
}

export interface SeismicParams {
  ss: number;
  s1: number;
  soilClass: SoilClass;
  Rx: number;
  I: number;
}

export interface MaterialParams {
  concreteClass: ConcreteClass;
}

export interface RebarSettings {
  slabDia: number;
  beamMainDia: number;
  beamStirrupDia: number;
  colMainDia: number;
  colStirrupDia: number; // YENİ: Kolon etriye çapı (Ash hesabı için gerekli)
  foundationDia: number;
}

export interface AppState {
  dimensions: Dimensions;
  sections: Sections;
  loads: Loads;
  seismic: SeismicParams;
  materials: MaterialParams;
  rebars: RebarSettings;
}

export interface CheckStatus {
  isSafe: boolean;
  message: string;
  reason?: string;
}

export interface CalculationResult {
  slab: {
    pd: number; alpha: number; d: number; m_x: number;
    as_req: number; as_min: number; spacing: number;
    // YENİ EKLENENLER
    min_thickness_calculated: number; // Hesaplanan min kalınlık (ln/25 vb.)
    min_thickness_limit: number;      // Yönetmelik limiti (örn: 8cm veya 10cm)
    rho: number;                      // Mevcut donatı oranı

    thicknessStatus: CheckStatus;
    status: CheckStatus;
  };
  beams: {
    load_design: number;
    moment_support: number;
    moment_span: number;
    as_support_req: number;
    as_span_req: number;
    count_support: number;
    count_span: number;
    shear_design: number;
    shear_cracking: number;
    shear_limit: number;
    shear_Vc: number; // Betonun katkısı
    shear_Vw: number; // Etriyenin katkısı
    rho_support: number;
    rho_span: number;
    rho_min: number;
    rho_max: number;
    stirrup_result: {
      dia: number;           // Seçilen çap (örn: 8)
      s_support: number;     // Mesnet aralığı (örn: 10 cm)
      s_span: number;        // Orta açıklık aralığı (örn: 20 cm)
      text_support: string;  // "Ø8/10"
      text_span: string;     // "Ø8/20"
    };

    shear_reinf_type: string; // Geriye uyumluluk için (örn: "Ø8/10 / Ø8/20")

    deflection: number;
    deflection_limit: number;
    checks: {
      shear: CheckStatus;
      deflection: CheckStatus;
      min_reinf: CheckStatus;
      max_reinf: CheckStatus;
    }
  };
  // GÜNCELLENEN KOLON YAPISI
  columns: {
    axial_load_design: number;
    axial_capacity_max: number;
    moment_design: number;
    moment_magnified: number; // Narinlik etkili moment (Md*)

    // Narinlik Verileri (Grup)
    slenderness: {
      lambda: number;
      lambda_lim: number;
      beta: number;
      isSlender: boolean;
      // YENİ: Yarıçap
      i_rad: number; 
    };

    // Kapasite Tasarımı Kesme Verileri (Grup)
    shear: {
      Ve: number;
      Vr: number;
      Vc: number;
      Vw: number;
      // YENİ: TBDY Max kesme sınırı kontrolü için
      Vr_max: number; 
    };

    // Sargı (Confinement) Verileri (Grup)
confinement: {
      Ash_req: number;
      Ash_prov: number;
      s_max: number;
      s_conf: number;   // DEĞİŞTİ: Eskiden s_opt idi, s_conf yaptık
      s_middle: number; // YENİ EKLENDİ: Orta bölge aralığı
      dia_used: number;
      bk_max: number;
    };

    interaction_ratio: number;
    strong_col_ratio: number;
    req_area: number;
    rho_provided: number; // Donatı oranı
    count_main: number;

    checks: {
      axial_limit: CheckStatus;    // Nd <= 0.40 fck Ac
      moment_capacity: CheckStatus; // Md <= Mr
      shear_capacity: CheckStatus;  // Ve <= Vr
      strongColumn: CheckStatus;
      minDimensions: CheckStatus;
      minRebar: CheckStatus;       // rho >= 0.01
      maxRebar: CheckStatus;       // rho <= 0.04
      confinement: CheckStatus;    // Ash ve s kontrolü
      slendernessCheck: CheckStatus; // <--- YENİ EKLENDİ
    }
  };
  seismic: {
    param_sds: number;
    param_sd1: number;
    period_t1: number;
    spectrum_sae: number;
    building_weight: number;
    base_shear: number;
    story_drift_check: CheckStatus;
    R_coefficient: number; // R katsayısı raporda görünsün
    I_coefficient: number; // I katsayısı raporda görünsün
  };
  foundation: {
    stress_actual: number;
    stress_limit: number;
    punching_force: number;
    punching_stress: number;
    punching_capacity: number;
    moment_design: number;
    as_req: number;
    as_provided_spacing: number;
    min_thickness_check: boolean; // Radye min 30cm kontrolü (TBDY)
    checks: {
      bearing: CheckStatus;
      punching: CheckStatus;
      bending: CheckStatus;
    }
  };
  joint: {
    shear_force: number;
    shear_limit: number;
    isSafe: boolean;
    bj: number; // Birleşim genişliği
  };
}