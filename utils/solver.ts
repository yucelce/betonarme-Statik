// utils/solver.ts
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

  // 1. MODEL OLUŞTURMA
  const model = generateModel(state);

  // 2. DÖŞEME HESABI
  const { slabResult, q_beam_design_N_m, g_total_N_m2, q_live_N_m2, g_beam_self_N_m, g_wall_N_m } = solveSlab(state);

  // 3. DEPREM HESABI
  const { seismicResult, Vt_design_N, W_total_N, fi_story_N } = solveSeismic(state, g_total_N_m2, q_live_N_m2, g_beam_self_N_m, g_wall_N_m);

  // 4. KİRİŞLERİN HESABI VE VERİ TABANI OLUŞTURMA
  // Tüm kirişlerin sonuçlarını saklayacağız, böylece kolonlar "bana kim bağlı?" diye sorabilecek.
  let criticalBeamResult: CalculationResult['beams'] | null = null;
  let maxBeamMoment = 0;
  
  // BeamID -> { Mr, As_supp, As_span }
  const beamDataMap = new Map<string, { Mr: number, As_supp: number, As_span: number }>();

  model.beams.forEach(beam => {
     const result = solveBeams(
        state, 
        beam.length, 
        q_beam_design_N_m, 
        Vt_design_N, 
        fcd, fctd, Ec
     );

     // Sonuçları Map'e kaydet
     beamDataMap.set(beam.id, {
        Mr: result.Mr_beam_Nmm,
        As_supp: result.As_beam_supp_final,
        As_span: result.As_beam_span_final
     });

     if (!criticalBeamResult || result.beamsResult.moment_support > maxBeamMoment) {
        maxBeamMoment = result.beamsResult.moment_support;
        criticalBeamResult = result.beamsResult;
     }
  });

  // Fallback (Eğer kiriş yoksa)
  if (!criticalBeamResult) {
     const defaultRes = solveBeams(state, 5, q_beam_design_N_m, Vt_design_N, fcd, fctd, Ec);
     criticalBeamResult = defaultRes.beamsResult;
  }

  // 5. KOLONLARIN TARANMASI (AKILLI BAĞLANTI)
  
  let criticalColumnResult: CalculationResult['columns'] | null = null;
  let criticalJointResult: CalculationResult['joint'] | null = null;
  let maxColInteractionRatio = 0;

  model.columns.forEach(col => {
      // A. KOLONA BAĞLANAN KİRİŞLERİ BUL (Node ID eşleştirmesi)
      const connectedBeams = model.beams.filter(b => b.startNodeId === col.nodeId || b.endNodeId === col.nodeId);
      
      // B. BAĞLI KİRİŞLERİN KAPASİTELERİ TOPLAMI (Güçlü Kolon Hesabı İçin)
      let sum_Mr_beams_Nmm = 0;
      let max_As_supp = 0;
      let max_As_span = 0;
      
      connectedBeams.forEach(b => {
          const data = beamDataMap.get(b.id);
          if (data) {
              sum_Mr_beams_Nmm += data.Mr;
              max_As_supp = Math.max(max_As_supp, data.As_supp);
              max_As_span = Math.max(max_As_span, data.As_span);
          }
      });

      // C. DÜĞÜM NOKTASI TÜRÜ (Kuşatılmış mı?)
      // Eğer 3 veya daha fazla kiriş saplanıyorsa Kuşatılmış kabul et (Basit yaklaşım)
      const isJointConfined = connectedBeams.length >= 3;

      // D. KOLON YÜKLERİ
      const tributaryAreaShare = 1 / Math.max(model.columns.length, 1);
      const Nd_gravity_N = (W_total_N * tributaryAreaShare * 1.2); 
      const Nd_design_N = Nd_gravity_N * 1.5; 

      // Deprem kesme kuvveti paylaşımı
      const V_col_design_N = Vt_design_N / Math.max(model.columns.length, 1);

      // E. KOLON HESABI
      const colRes = solveColumns(
        state,
        Nd_design_N,
        V_col_design_N,
        sum_Mr_beams_Nmm, // Gerçek kiriş moment toplamı
        max_As_supp,
        max_As_span,
        isJointConfined, // Otomatik belirlenen kuşatılmışlık
        fck, fcd, fctd, Ec
      );

      // En zorlanan kolonu bul
      if (!criticalColumnResult || colRes.columnsResult.interaction_ratio > maxColInteractionRatio) {
          maxColInteractionRatio = colRes.columnsResult.interaction_ratio;
          criticalColumnResult = colRes.columnsResult;
          criticalJointResult = colRes.jointResult;
      }
  });

  // Fallback
  if (!criticalColumnResult) {
       const dummy = solveColumns(state, 100000, 10000, 0, 0, 0, false, fck, fcd, fctd, Ec);
       criticalColumnResult = dummy.columnsResult;
       criticalJointResult = dummy.jointResult;
  }

  // 6. TEMEL HESABI
  const { foundationResult } = solveFoundation(state, W_total_N, criticalColumnResult!.axial_load_design * 1000, fctd);

  return {
    slab: slabResult,
    beams: criticalBeamResult!,
    columns: criticalColumnResult!,
    seismic: seismicResult,
    foundation: foundationResult,
    joint: criticalJointResult!
  };
};