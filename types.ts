export enum SoilClass {
  ZA = 'ZA',
  ZB = 'ZB',
  ZC = 'ZC',
  ZD = 'ZD',
  ZE = 'ZE',
}

export interface Dimensions {
  lx: number; // Slab width (meters)
  ly: number; // Slab length (meters)
  h: number;  // Story height (meters)
  slabThickness: number; // cm
}

export interface Sections {
  beamWidth: number; // cm
  beamDepth: number; // cm
  colWidth: number; // cm
  colDepth: number; // cm
}

export interface Loads {
  liveLoad: number; // q (kN/m2)
  deadLoadCoatings: number; // g_kaplama (kN/m2)
}

export interface SeismicParams {
  ss: number; // Spectral acceleration parameter at short periods
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
    pd: number; // Design Load (kN/m2)
    m_x: number; // Moment X direction
    m_y: number; // Moment Y direction
    as_x: number; // Required steel area X (cm2/m)
    as_y: number; // Required steel area Y (cm2/m)
    min_as: number;
    isSafe: boolean;
  };
  beams: {
    load: number; // Distributed load on beam (kN/m)
    moment_support: number; // Support moment
    moment_span: number; // Span moment
    as_top: number; // Support reinforcement
    as_bottom: number; // Span reinforcement
    shear_force: number; // Vd
    shear_reinf: string; // Stirrup suggestion
    isSafe: boolean;
  };
  columns: {
    axial_load: number; // Nd
    axial_capacity: number; // Nmax
    min_rho: number; // Min reinforcement ratio
    req_area: number; // Required area
    count_phi14: number; // Number of bars example
    isSafe: boolean;
  };
  seismic: {
    sds: number;
    base_shear: number; // Vt
    period: number;
  };
}