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
  foundationHeight: number; // YENİ: Radye Temel Yüksekliği
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

export interface RebarSettings {
  slabDia: number;      
  beamMainDia: number;  
  beamStirrupDia: number; 
  colMainDia: number;   
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
    pd: number;
    alpha: number;
    d: number;
    m_x: number;
    as_req: number;
    as_min: number;
    spacing: number;
    min_thickness: number;
    thicknessStatus: CheckStatus;
    status: CheckStatus;
  };
  beams: {
    load: number;
    moment_support: number;
    moment_span: number;
    as_support: number;
    as_span: number;
    count_support: number;
    count_span: number;
    shear_force: number;
    shear_capacity: number;
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
    count_main: number;
    status: CheckStatus;
    strongColumnStatus: CheckStatus;
  };
  seismic: {
    sds: number;
    building_weight: number;
    base_shear: number;
    period: number;
    story_drift_ratio: number;
    driftStatus: CheckStatus;
  };
  foundation: {
    bearing_stress: number;   
    bearing_capacity: number; 
    isBearingSafe: boolean;
    punching_stress: number;  
    punching_limit: number;   
    isPunchingSafe: boolean;
    min_height_status?: CheckStatus; // YENİ: Min yükseklik kontrolü
  };
  joint: {
    shear_force: number;     
    shear_limit: number;      
    isSafe: boolean;
  };
}