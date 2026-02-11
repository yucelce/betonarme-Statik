// utils/solver.ts
import { AppState, CalculationResult } from "../types";
import { getConcreteProperties } from "../constants";
import { solveSlab } from "./slabSolver";
import { solveSeismic } from "./seismicSolver";
import { solveBeams } from "./beamSolver";
import { solveColumns } from "./columnSolver";
import { solveFoundation } from "./foundationSolver";
import { generateModel } from "./modelGenerator";
import { solveFEM } from './femSolver'; // FEM tekrar aktif

export const calculateStructure = (state: AppState): CalculationResult => {
  const { materials } = state;
  const { fck, fcd, fctd, Ec } = getConcreteProperties(materials.concreteClass);

  // 1. DÖŞEME HESABI (Yük analizi için gerekli)
  const { slabResult, q_beam_design_N_m, g_total_N_m2, q_live_N_m2, g_beam_self_N_m, g_wall_N_m } = solveSlab(state);

  // 2. MODEL VE FEM ANALİZİ
  const model = generateModel(state);
  // FEM Analizini çalıştır
  const femResults = solveFEM(state);
  
  // 3. YAKLAŞIK DEPREM (Sadece spektrum ve rapor değerleri için, kuvvetleri kullanmayacağız)
  const { seismicResult, Vt_design_N, W_total_N } = solveSeismic(state, g_total_N_m2, q_live_N_m2, g_beam_self_N_m, g_wall_N_m);

  // 4. KİRİŞ TASARIMI (FEM KUVVETLERİ İLE)
  let criticalBeamResult: CalculationResult['beams'] | null = null;
  const beamDataMap = new Map<string, { Mr: number, As_supp: number, As_span: number }>();

  model.beams.forEach(beam => {
     // FEM'den gelen kuvvetleri al
     const femForces = femResults.memberForces.get(beam.id);
     
     // Eğer FEM kuvveti varsa (kN -> Nmm dönüşümü ile) onu kullan, yoksa yaklaşık hesabı kullan
     // Not: FEM'den gelen Mz güçlü eksen momentidir (kNm -> Nmm için * 1e6)
     const femMoment = femForces ? Math.abs(femForces.mz) * 1e6 : 0;
     const femShear = femForces ? Math.abs(femForces.fy) * 1000 : 0;

     // Yaklaşık çözüm fonksiyonunu çağırıyoruz ama sonuçlarını FEM ile ezeceğiz
     const result = solveBeams(state, beam.length, q_beam_design_N_m, Vt_design_N, fcd, fctd, Ec);

     // FEM SONUÇLARINI ENTEGRE ET:
     if (femMoment > 0) {
        // Hesaplanan donatıları FEM momentine göre güncelle (Basit oranlama)
        const ratio = femMoment / (result.beamsResult.moment_support * 1e6 || 1);
        result.beamsResult.moment_support = femMoment / 1e6;
        result.beamsResult.moment_span = femMoment / 2 / 1e6; // Açıklık momenti kabulü
        result.beamsResult.shear_design = femShear / 1000;
        
        // Donatıyı yeni momente göre güncelle
        result.As_beam_supp_final *= ratio;
        result.As_beam_span_final *= ratio;
     }

     beamDataMap.set(beam.id, {
        Mr: result.Mr_beam_Nmm,
        As_supp: result.As_beam_supp_final,
        As_span: result.As_beam_span_final
     });

     if (!criticalBeamResult || result.beamsResult.moment_support > criticalBeamResult.moment_support) {
        criticalBeamResult = result.beamsResult;
     }
  });

  // Kiriş yoksa fallback
  if (!criticalBeamResult) criticalBeamResult = solveBeams(state, 5, 10000, 10000, fcd, fctd, Ec).beamsResult;

  // 5. KOLON TASARIMI (FEM KUVVETLERİ İLE)
  let criticalColumnResult: CalculationResult['columns'] | null = null;
  let criticalJointResult: CalculationResult['joint'] | null = null;
  let maxColRatio = 0;

  model.columns.forEach(col => {
      // FEM'den gelen kuvvetler
      const femForces = femResults.memberForces.get(col.id);
      
      // FEM'den Eksenel Yük (fz) ve Moment (mz) al
      // Normal kuvvet basınca çalışır, FEM'de çekme pozitif olabilir, mutlak değer veya işaret kontrolü
      const Nd_fem = femForces ? Math.abs(femForces.fz) * 1000 : 0; 
      const Md_fem = femForces ? Math.abs(femForces.mz) * 1e6 : 0;
      const V_fem = femForces ? Math.abs(femForces.fy) * 1000 : 0;

      // Yaklaşık yük dağılımı yerine FEM yükünü kullanacağız
      // Ancak fonksiyon argümanı olarak geçmemiz gerekiyor
      
      const connectedBeams = model.beams.filter(b => b.startNodeId === col.nodeId || b.endNodeId === col.nodeId);
      const isConfined = connectedBeams.length >= 3;
      
      // Mevcut solver fonksiyonunu çağırıyoruz
      const colRes = solveColumns(
        state,
        Nd_fem > 0 ? Nd_fem : 100000, // FEM yükü yoksa varsayılan
        V_fem > 0 ? V_fem : 10000,
        Md_fem, // Kiriş momenti yerine direkt kolon momenti olarak etki ettiriyoruz
        0, 0, // Kiriş donatıları detay hesabı
        isConfined,
        fck, fcd, fctd, Ec
      );

      // Moment değerlerini FEM ile güncelle
      if(Md_fem > 0) {
        colRes.columnsResult.moment_design = Md_fem / 1e6;
        // Magnified moment hesabını FEM momenti üzerinden tekrar oranla
        colRes.columnsResult.moment_magnified = Math.max(colRes.columnsResult.moment_magnified, Md_fem / 1e6);
      }

      if (!criticalColumnResult || colRes.columnsResult.interaction_ratio > maxColRatio) {
          maxColRatio = colRes.columnsResult.interaction_ratio;
          criticalColumnResult = colRes.columnsResult;
          criticalJointResult = colRes.jointResult;
      }
  });

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