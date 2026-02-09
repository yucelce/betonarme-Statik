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
  lx: number; // m
  ly: number; // m
  h: number;  // m (Kat yüksekliği)
  slabThickness: number; // cm
  storyCount: number;
  foundationHeight: number; // cm
  foundationCantilever: number; // cm (Radye ampatman)
}

export interface Sections {
  beamWidth: number; // cm
  beamDepth: number; // cm
  colWidth: number;  // cm
  colDepth: number;  // cm
}

export interface Loads {
  liveLoadKg: number;        // kg/m2
  deadLoadCoatingsKg: number; // kg/m2
}

export interface SeismicParams {
  ss: number; // Kısa periyot harita spektral ivme katsayısı
  s1: number; // 1.0 saniye periyot harita spektral ivme katsayısı
  soilClass: SoilClass;
  Rx: number; // Taşıyıcı sistem davranış katsayısı
  I: number;  // Bina Önem Katsayısı (Genelde Konut=1.0)
}

export interface MaterialParams {
  concreteClass: ConcreteClass;
}

export interface RebarSettings {
  slabDia: number;      
  beamMainDia: number;  
  beamStirrupDia: number; 
  colMainDia: number;   
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

// Hesap Sonuçları - GÜNCELLENDİ (joint eklendi)
export interface CalculationResult {
  slab: {
    pd: number; alpha: number; d: number; m_x: number;
    as_req: number; as_min: number; spacing: number;
    min_thickness: number;
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
    shear_reinf_type: string;
    deflection: number;
    deflection_limit: number;
    checks: {
      shear: CheckStatus;
      deflection: CheckStatus;
      min_reinf: CheckStatus;
      max_reinf: CheckStatus; // <--- BU SATIRI EKLEYİN
    }
  };
  columns: {
    axial_load_design: number; 
    axial_capacity_max: number; 
    moment_design: number; 
    interaction_ratio: number;
    strong_col_ratio: number;
    req_area: number;
    count_main: number;
    checks: {
      capacity: CheckStatus;
      strongColumn: CheckStatus;
      minDimensions: CheckStatus;
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
    checks: {
      bearing: CheckStatus;
      punching: CheckStatus;
      bending: CheckStatus;
    }
  };
  // EKLENEN KISIM:
  joint: {
    shear_force: number;
    shear_limit: number;
    isSafe: boolean;
  };
}