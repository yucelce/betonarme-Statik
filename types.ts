
export type ViewMode = 'plan' | 'elevation' | '3d';
export type EditorTool = 'select' | 'column' | 'beam' | 'slab' | 'shear_wall' | 'delete';

export enum SoilClass {
  ZA = 'ZA', ZB = 'ZB', ZC = 'ZC', ZD = 'ZD', ZE = 'ZE',
}

export enum ConcreteClass {
  C20 = 'C20', C25 = 'C25', C30 = 'C30', C35 = 'C35', C40 = 'C40', C50 = 'C50',
}

export interface AxisData {
  id: string;
  spacing: number;
}

export interface Dimensions {
  storyCount: number;
  basementCount: number; // Bodrum kat sayısı
  storyHeights: number[]; // Her katın yüksekliği (m)
  foundationHeight: number;
  foundationCantilever: number;
  lx: number;
  ly: number;
}

export interface GridSettings {
  xAxis: AxisData[];
  yAxis: AxisData[];
}

export interface Sections {
  beamWidth: number;
  beamDepth: number;
  colWidth: number;
  colDepth: number;
  slabThickness: number;
  wallThickness: number; // Varsayılan Perde Kalınlığı
  wallLength: number;    // Varsayılan Perde Uzunluğu
}

export interface Loads {
  liveLoadKg: number;
  deadLoadCoatingsKg: number;
}

export interface SeismicParams {
  ss: number; s1: number; soilClass: SoilClass; Rx: number; I: number;
}

export interface MaterialParams { concreteClass: ConcreteClass; }

export interface RebarSettings {
  slabDia: number; beamMainDia: number; beamStirrupDia: number;
  colMainDia: number; colStirrupDia: number; foundationDia: number;
}

// --- KULLANICI TANIMLI CAD ELEMANLARI ---
export interface UserElement {
  id: string;
  type: 'column' | 'beam' | 'slab' | 'shear_wall';
  storyIndex: number; // Hangi kata ait olduğu
  // Grid İndeksleri (Koordinat değil, 0,1,2 gibi sıra noları)
  x1: number; 
  y1: number;
  x2?: number; // Kiriş/Döşeme için bitiş
  y2?: number; // Kiriş/Döşeme için bitiş
  properties?: {
    width?: number; // cm (Perde için uzun kenar olabilir)
    depth?: number; // cm (Perde için kalınlık olabilir)
    thickness?: number; // Döşeme kalınlığı (cm)
    wallLoad?: number; // Kiriş üzerindeki duvar yükü (kN/m)
    liveLoad?: number; // Döşeme hareketli yükü (kg/m2)
    // Perde Özellikleri
    direction?: 'x' | 'y'; // Perde yerleşim yönü
    alignment?: 'start' | 'center' | 'end'; // Düğüm noktasına göre konumu
    // Döşeme Özellikleri
    segment?: 'tl' | 'br' | 'tr' | 'bl'; // Üçgen döşeme için parça tanımı (Top-Left, Bottom-Right vb.)
  }
}

// --- MODEL TİPLERİ (Solver'ın anladığı dil) ---

export interface NodeEntity {
  id: string;
  x: number;
  y: number;
  axisX: string;
  axisY: string;
}

export interface ColumnEntity {
  id: string;
  nodeId: string;
  b: number;
  h: number;
  isBasement: boolean; // Bodrum kat elemanı mı?
  type: 'column' | 'shear_wall';
}

export interface BeamEntity {
  id: string;
  startNodeId: string;
  endNodeId: string;
  length: number;
  axisId: string;
  direction: 'X' | 'Y' | 'D'; // D: Diagonal
  bw: number;
  h: number;
  isBasement: boolean; // Bodrum kat elemanı mı?
}

export interface SlabEntity {
  id: string;
  nodes: string[]; // 3 veya 4 düğüm noktası
  lx: number; // Eşdeğer uzunluklar (Üçgen için yaklaşık)
  ly: number;
  thickness: number;
  area: number; // m2
}

export interface StructuralModel {
  nodes: NodeEntity[];
  columns: ColumnEntity[];
  beams: BeamEntity[];
  slabs: SlabEntity[];
}

// --- SONUÇ TİPLERİ ---

export interface CheckStatus {
  isSafe: boolean;
  message: string;
  reason?: string;
  recommendation?: string; // Çözüm önerisi
}

export interface StoryAnalysisResult {
  storyIndex: number;
  height: number;
  forceApplied: number; // kN
  dispAvg: number; // mm
  dispMax: number; // mm
  drift: number; // Göreli öteleme (mm)
  driftRatio: number; // drift / h
  eta_bi: number; // Burulma Düzensizliği Katsayısı
  torsionCheck: CheckStatus;
  driftCheck: CheckStatus;
  isBasement: boolean;
}

export interface IrregularityResult {
    A1: { eta_bi_max: number; isSafe: boolean; message: string; details: StoryAnalysisResult[] };
    B1: { eta_ci_min: number; isSafe: boolean; message: string };
}

export interface DiagramPoint {
  x: number;       // Mesafe (m)
  V: number;       // Kesme Kuvveti (kN)
  M: number;       // Moment (kNm)
}

export interface DetailedBeamResult {
  beamId: string;
  diagramData: DiagramPoint[]; // Grafik verisi
  maxM: number;
  minM: number;
  maxV: number;
}

export interface AppState {
  grid: GridSettings;
  dimensions: Dimensions;
  sections: Sections;
  loads: Loads;
  seismic: SeismicParams;
  materials: MaterialParams;
  rebars: RebarSettings;
  definedElements: UserElement[]; // CAD Verisi
}

// Tekil eleman durumu (Görselleştirme için)
export interface ElementAnalysisStatus {
  id: string;
  type: 'column' | 'beam' | 'slab' | 'shear_wall' | 'foundation';
  isSafe: boolean;
  ratio: number; // Kullanım oranı (Demand/Capacity)
  messages: string[]; // Hata mesajları
  recommendations: string[]; // Çözüm önerileri
}

export interface CalculationResult {
  slab: {
    pd: number; alpha: number; d: number; m_x: number;
    as_req: number; as_min: number; spacing: number;
    min_thickness_calculated: number; min_thickness_limit: number; rho: number;
    thicknessStatus: CheckStatus; status: CheckStatus;
  };
  beams: {
    load_design: number; moment_support: number; moment_span: number;
    as_support_req: number; as_span_req: number;
    count_support: number; count_span: number;
    shear_design: number; shear_cracking: number; shear_limit: number;
    shear_Vc: number; shear_Vw: number;
    rho_support: number; rho_span: number; rho_min: number; rho_max: number;
    stirrup_result: { dia: number; s_support: number; s_span: number; text_support: string; text_span: string };
    shear_reinf_type: string;
    deflection: number; deflection_limit: number;
    checks: { shear: CheckStatus; deflection: CheckStatus; min_reinf: CheckStatus; max_reinf: CheckStatus };
  };
  columns: {
    axial_load_design: number; axial_capacity_max: number;
    moment_design: number; moment_magnified: number;
    slenderness: { lambda: number; lambda_lim: number; beta: number; isSlender: boolean; i_rad: number };
    shear: { Ve: number; Vr: number; Vc: number; Vw: number; Vr_max: number };
    confinement: { Ash_req: number; Ash_prov: number; s_max: number; s_conf: number; s_middle: number; dia_used: number; bk_max: number };
    interaction_ratio: number; strong_col_ratio: number;
    req_area: number; rho_provided: number; count_main: number;
    checks: {
      axial_limit: CheckStatus; moment_capacity: CheckStatus; shear_capacity: CheckStatus;
      strongColumn: CheckStatus; minDimensions: CheckStatus; minRebar: CheckStatus;
      maxRebar: CheckStatus; confinement: CheckStatus; slendernessCheck: CheckStatus;
    };
  };
  seismic: {
    param_sds: number; param_sd1: number; period_t1: number; spectrum_sae: number;
    building_weight: number; base_shear: number; 
    method_check: { isApplicable: boolean; reason: string; checks: { height: CheckStatus; torsion: CheckStatus } };
    story_drift: {
        check: CheckStatus;
        delta_max: number;
        drift_ratio: number;
        limit: number;
    };
    R_coefficient: number; I_coefficient: number;
    irregularities: IrregularityResult;
  };
  foundation: {
    stress_actual: number; stress_limit: number;
    punching_force: number; punching_stress: number; punching_capacity: number;
    moment_design: number; as_req: number; as_provided_spacing: number;
    min_thickness_check: boolean;
    checks: { bearing: CheckStatus; punching: CheckStatus; bending: CheckStatus };
  };
  joint: {
    shear_force: number; shear_limit: number; isSafe: boolean; bj: number;
  };
  memberResults: Map<string, DetailedBeamResult>; 
  elementResults: Map<string, ElementAnalysisStatus>; // Tüm elemanların tek tek durumları
}
