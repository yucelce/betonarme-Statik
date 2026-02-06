export enum SoilClass {
  ZA = 'ZA',
  ZB = 'ZB',
  ZC = 'ZC',
  ZD = 'ZD',
  ZE = 'ZE',
}

export enum ConcreteClass {
  C20 = 'C20',
  C25 = 'C25',
  C30 = 'C30',
  C35 = 'C35',
  C40 = 'C40',
  C50 = 'C50',
}

export interface Dimensions {
  lx: number; 
  ly: number; 
  h: number; 
  slabThickness: number; 
  storyCount: number; 
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
  soilClass: SoilClass;
}

export interface MaterialParams {
  concreteClass: ConcreteClass;
}

// YENİ: Donatı Çapı Seçimleri
export interface RebarSettings {
  slabDia: number;      // Döşeme (8, 10, 12)
  beamMainDia: number;  // Kiriş Ana (12, 14, 16)
  beamStirrupDia: number; // Kiriş Etriye (8, 10)
  colMainDia: number;   // Kolon Boyuna (14, 16, 20)
}

export interface AppState {
  dimensions: Dimensions;
  sections: Sections;
  loads: Loads;
  seismic: SeismicParams;
  materials: MaterialParams;
  rebars: RebarSettings; // YENİ
}

export interface CheckStatus {
  isSafe: boolean;
  message: string; 
  reason?: string; 
}

export interface CalculationResult {
  slab: {
    pd: number;
    alpha: number; // YENİ: Moment Katsayısı
    d: number;     // YENİ: Faydalı yükseklik
    m_x: number;
    as_req: number;
    as_min: number; // YENİ
    spacing: number; // YENİ: Donatı aralığı (cm)
    min_thickness: number;
    thicknessStatus: CheckStatus;
    status: CheckStatus;
  };
  beams: {
    load: number;
    moment_support: number;
    moment_span: number;
    as_support: number;
    as_span: number; // YENİ: Açıklık donatısı
    count_support: number; // YENİ: Adet
    count_span: number;   // YENİ: Adet
    shear_force: number; // Vd
    shear_capacity: number; // Vc (YENİ)
    shear_reinf: string;
    deflection: number;
    deflection_limit: number;
    deflectionStatus: CheckStatus;
    shearStatus: CheckStatus;
  };
  columns: {
    axial_load: number;
    moment_x: number;
    axial_capacity: number;
    interaction_ratio: number;
    strong_col_ratio: number;
    req_area: number;
    count_main: number; // YENİ: Seçilen çapa göre adet
    status: CheckStatus;
    strongColumnStatus: CheckStatus;
  };
  seismic: {
    sds: number;
    building_weight: number; // YENİ: Bina Ağırlığı
    base_shear: number;
    period: number;
    story_drift_ratio: number;
    driftStatus: CheckStatus;
  };
  foundation?: {
    bearing_stress: number;   // Zemin Gerilmesi (kN/m2)
    bearing_capacity: number; // Zemin Emniyet (kN/m2)
    isBearingSafe: boolean;
    punching_stress: number;  // Zımbalama Gerilmesi (MPa)
    punching_limit: number;   // Zımbalama Sınırı (MPa)
    isPunchingSafe: boolean;
  };
  joint?: {
    shear_force: number;      // Birleşim Bölgesi Kesme (kN)
    shear_limit: number;      // Birleşim Kapasite (kN)
    isSafe: boolean;
  };
}