import { AppState, CalculationResult } from "../types";
import { getConcreteProperties } from "../constants";
import { solveSlab } from "./slabSolver";
import { solveSeismic } from "./seismicSolver";
import { solveBeams } from "./beamSolver";
import { solveColumns } from "./columnSolver";
import { solveFoundation } from "./foundationSolver";
import { generateModel } from "./modelGenerator";

export const calculateStructure = (state: AppState): CalculationResult => {
  const { materials, dimensions } = state;
  const { fck, fcd, fctd, Ec } = getConcreteProperties(materials.concreteClass);

  // 1. MODELİ OLUŞTUR (Grid sistemini düğüm ve elemanlara çevir)
  const model = generateModel(state);

  // 2. DÖŞEME HESABI (Yük Analizi)
  const { slabResult, q_beam_design_N_m, g_total_N_m2, q_live_N_m2, g_beam_self_N_m, g_wall_N_m } = solveSlab(state);

  // 3. DEPREM HESABI
  const { seismicResult, Vt_design_N, W_total_N } = solveSeismic(state, g_total_N_m2, q_live_N_m2, g_beam_self_N_m, g_wall_N_m);

  // 4. KİRİŞLERİN TARANMASI (En kritik kirişi bul ve verilerini sakla)
  let criticalBeamResult: CalculationResult['beams'] | null = null;
  let maxBeamMoment = 0;
  
  // Kolon hesabı için gerekli kritik kiriş verileri (Başlangıç değerleri)
  let criticalBeamMr_Nmm = 0;
  let criticalBeamAsSupport = 0;
  let criticalBeamAsSpan = 0;
  
  // Modeldeki tüm kirişleri tek tek hesapla
  model.beams.forEach(beam => {
     const result = solveBeams(
        state, 
        beam.length, // Grid'den gelen gerçek uzunluk
        q_beam_design_N_m, 
        Vt_design_N, 
        fcd, fctd, Ec
     );

     // Eğer bu kirişin momenti daha büyükse veya henüz bir kiriş seçilmediyse
     if (!criticalBeamResult || result.beamsResult.moment_support > maxBeamMoment) {
        maxBeamMoment = result.beamsResult.moment_support;
        criticalBeamResult = result.beamsResult;
        
        // Kolon hesabı için bu kirişin gerçek kapasite değerlerini sakla
        criticalBeamMr_Nmm = result.Mr_beam_Nmm;
        criticalBeamAsSupport = result.As_beam_supp_final;
        criticalBeamAsSpan = result.As_beam_span_final;
     }
  });

  // Eğer hiç kiriş yoksa veya hesaplanamadıysa (Hata önleyici varsayılan değerler)
  if (!criticalBeamResult) {
     const defaultRes = solveBeams(state, dimensions.lx, q_beam_design_N_m, Vt_design_N, fcd, fctd, Ec);
     criticalBeamResult = defaultRes.beamsResult;
     criticalBeamMr_Nmm = defaultRes.Mr_beam_Nmm;
     criticalBeamAsSupport = defaultRes.As_beam_supp_final;
     criticalBeamAsSpan = defaultRes.As_beam_span_final;
  }

  // 5. KOLONLARIN TARANMASI (En kritik kolonu bul)
  let criticalColumnResult: CalculationResult['columns'];
  let criticalJointResult: CalculationResult['joint'];

  const numberOfCols = Math.max(model.columns.length, 1);
  
  // En gayri müsait kolon yükü (yaklaşık simülasyon)
  const worstCaseAxialLoad_N = (W_total_N / numberOfCols) * 1.5; 
  const worstCaseShear_N = (Vt_design_N / numberOfCols) * 1.2;

  // Kolon Çözücüye, yukarıda hesapladığımız GERÇEK kiriş verilerini gönderiyoruz
  const colRes = solveColumns(
    state,
    worstCaseAxialLoad_N,
    worstCaseShear_N,
    criticalBeamMr_Nmm,        // Kritik kirişin Moment Kapasitesi
    criticalBeamAsSupport,     // Kritik kirişin Mesnet Donatısı (Final)
    criticalBeamAsSpan,        // Kritik kirişin Açıklık Donatısı (Final)
    fck, fcd, fctd, Ec
  );
  
  criticalColumnResult = colRes.columnsResult;
  criticalJointResult = colRes.jointResult;

  // 6. TEMEL HESABI
  const { foundationResult } = solveFoundation(state, W_total_N, colRes.Nd_design_N, fctd);

  return {
    slab: slabResult,
    beams: criticalBeamResult,
    columns: criticalColumnResult,
    seismic: seismicResult,
    foundation: foundationResult,
    joint: criticalJointResult
  };
};