// types.ts

export enum SoilClass {
  ZA = 'ZA', ZB = 'ZB', ZC = 'ZC', ZD = 'ZD', ZE = 'ZE',
}

export enum ConcreteClass {
  C20 = 'C20', C25 = 'C25', C30 = 'C30', C35 = 'C35', C40 = 'C40', C50 = 'C50',
}

// YENİ: Aks Tanımı
export interface AxisData {
  id: string;
  spacing: number; // Önceki aksa olan mesafe (veya açıklık)
}

// YENİ: Yapısal Eleman Tanımları
export interface NodeEntity { id: string; x: number; y: number; axisX: string; axisY: string; }
export interface ColumnEntity { id: string; nodeId: string; b: number; h: number; }
export interface BeamEntity { 
  id: string; 
  startNodeId: string; endNodeId: string; 
  length: number; 
  axisId: string; // Hangi aksta olduğu
  direction: 'X' | 'Y'; 
  bw: number; h: number;
}
export interface SlabEntity {
  id: string;
  nodes: string[]; // 4 köşe düğümü
  lx: number; ly: number;
  thickness: number;
}

export interface StructuralModel {
  nodes: NodeEntity[];
  columns: ColumnEntity[];
  beams: BeamEntity[];
  slabs: SlabEntity[];
}

export interface Dimensions {
  storyCount: number;
  h: number; // Kat yüksekliği
  // Lx ve Ly artık Grid'den hesaplanacak
  foundationHeight: number;
  foundationCantilever: number;
}

export interface GridSettings {
  xAxis: AxisData[]; // X yönündeki açıklıklar (Örn: 4m, 5m, 3m)
  yAxis: AxisData[]; // Y yönündeki açıklıklar
}

export interface Sections {
  defaultBeamWidth: number;
  defaultBeamDepth: number;
  defaultColWidth: number;
  defaultColDepth: number;
  defaultSlabThickness: number;
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

export interface AppState {
  grid: GridSettings; // YENİ
  dimensions: Dimensions;
  sections: Sections;
  loads: Loads;
  seismic: SeismicParams;
  materials: MaterialParams;
  rebars: RebarSettings;
}

// Hesap Sonuç Tipleri (Özet)
export interface CheckStatus { isSafe: boolean; message: string; reason?: string; }

export interface AnalysisSummary {
  totalWeight_kN: number;
  baseShear_kN: number;
  totalSlabArea_m2: number;
  maxSlabMoment_kNm: number;
  maxBeamMoment_kNm: number;
  maxColAxial_kN: number;
  status: CheckStatus;
}