export enum SoilClass {
  ZA = 'ZA',
  ZB = 'ZB',
  ZC = 'ZC',
  ZD = 'ZD',
  ZE = 'ZE',
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
  liveLoad: number; 
  deadLoadCoatings: number; 
}

export interface SeismicParams {
  ss: number; 
  soilClass: SoilClass;
}

export interface AppState {
  dimensions: Dimensions;
  sections: Sections;
  loads: Loads;
  seismic: SeismicParams;
}

export interface CalculationResult {
  slab: {
    pd: number;
    m_x: number;
    m_y: number;
    as_x: number;
    as_y: number;
    min_as: number;
    isSafe: boolean;
  };
  beams: {
    load: number;
    moment_support: number;
    moment_span: number;
    as_top: number;
    as_bottom: number;
    shear_force: number;
    shear_reinf: string;
    deflection: number; // YENİ: Sehim (mm)
    deflection_limit: number; // YENİ: Sınır (mm)
    isDeflectionSafe: boolean; // YENİ
    isSafe: boolean;
  };
  columns: {
    axial_load: number;
    moment_x: number; // YENİ: Hesap Momenti
    moment_y: number; // YENİ
    axial_capacity: number;
    interaction_ratio: number; // YENİ: N-M Kapasite oranı (<1 güvenli)
    strong_col_ratio: number; // YENİ: (Mc/Mb) > 1.2 olmalı
    min_rho: number;
    req_area: number;
    count_phi14: number;
    isSafe: boolean;
    isStrongColumn: boolean; // YENİ
  };
  seismic: {
    sds: number;
    base_shear: number;
    period: number;
    story_drift_ratio: number; // YENİ: Göreli kat ötelemesi
    isDriftSafe: boolean; // YENİ
  };
}