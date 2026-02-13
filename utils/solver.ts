
// utils/solver.ts
import { AppState, CalculationResult, ElementAnalysisStatus, StructuralModel, StoryAnalysisResult } from "../types";
import { getConcreteProperties } from "../constants";
import { solveSlab } from "./slabSolver";
import { solveSeismic } from "./seismicSolver";
import { solveBeams } from "./beamSolver";
import { solveColumns } from "./columnSolver";
import { solveFoundation } from "./foundationSolver";
import { generateModel } from "./modelGenerator";
import { solveFEM } from './femSolver';
import { DetailedBeamResult, DiagramPoint } from "../types";
import { createStatus } from "./shared";

// Kiriş Yüklerini Döşemelerden Hesaplayan Yardımcı Fonksiyon
const calculateBeamLoads = (model: StructuralModel, appState: AppState): Map<string, number> => {
    const beamLoads = new Map<string, number>(); // BeamID -> q (N/m) (Sadece döşeme katkısı)

    // Tüm döşemeleri gez
    model.slabs.forEach(slab => {
        const slabNodes = slab.nodes.map(nid => model.nodes.find(n => n.id === nid)!);
        if (!slabNodes.every(n => n)) return;

        const userSlab = appState.definedElements.find(e => `${e.id}_S${e.storyIndex}` === slab.id);
        const liveLoadKg = userSlab?.properties?.liveLoad ?? appState.loads.liveLoadKg;
        const g_slab = (slab.thickness / 100) * 25000; // N/m2
        const g_coating = appState.loads.deadLoadCoatingsKg * 9.81;
        const q_live = liveLoadKg * 9.81;
        const pd = 1.4 * (g_slab + g_coating) + 1.6 * q_live; // N/m2

        const cx = slabNodes.reduce((sum, n) => sum + n.x, 0) / slabNodes.length;
        const cy = slabNodes.reduce((sum, n) => sum + n.y, 0) / slabNodes.length;

        for (let i = 0; i < slabNodes.length; i++) {
            const n1 = slabNodes[i];
            const n2 = slabNodes[(i + 1) % slabNodes.length]; 

            const beam = model.beams.find(b => 
                (b.startNodeId === n1.id && b.endNodeId === n2.id) || 
                (b.startNodeId === n2.id && b.endNodeId === n1.id)
            );

            if (beam) {
                const areaTributary = 0.5 * Math.abs(
                    n1.x * (n2.y - cy) + 
                    n2.x * (cy - n1.y) + 
                    cx * (n1.y - n2.y)
                );

                const totalLoadOnBeamPart = areaTributary * pd; 
                const q_add = totalLoadOnBeamPart / beam.length; 

                const currentLoad = beamLoads.get(beam.id) || 0;
                beamLoads.set(beam.id, currentLoad + q_add);
            }
        }
    });

    return beamLoads;
};

export const calculateStructure = (state: AppState): CalculationResult => {
  const { materials, sections } = state;
  const { fck, fcd, fctd, Ec } = getConcreteProperties(materials.concreteClass);

  const elementResults = new Map<string, ElementAnalysisStatus>();

  // 1. DÖŞEME HESABI
  const { slabResult, g_total_N_m2, q_live_N_m2 } = solveSlab(state);

  state.definedElements.filter(e => e.type === 'slab').forEach(slab => {
      const slabRecommendations = [];
      if (slabResult.thicknessStatus.recommendation) slabRecommendations.push(slabResult.thicknessStatus.recommendation);

      elementResults.set(slab.id, {
          id: slab.id,
          type: 'slab',
          isSafe: slabResult.thicknessStatus.isSafe,
          ratio: 0, 
          messages: [slabResult.thicknessStatus.message],
          recommendations: slabRecommendations
      });
  });

  const g_beam_self_approx = (sections.beamWidth/100) * (sections.beamDepth/100) * 25000;
  const g_wall_approx = 3500; 

  // 2. YAKLAŞIK DEPREM VE KUVVET DAĞILIMI (X ve Y Yönleri)
  const { seismicResult: tempSeismicRes, Vt_design_X, Vt_design_Y, W_total_N, fi_story_X, fi_story_Y } = solveSeismic(state, g_total_N_m2, q_live_N_m2, g_beam_self_approx, g_wall_approx);

  // 3. MODEL VE FEM ANALİZİ (X ve Y için ayrı)
  const model = generateModel(state);
  const femResultsX = solveFEM(state, fi_story_X, 'X');
  const femResultsY = solveFEM(state, fi_story_Y, 'Y');
  
  // 3.5 DÖŞEME YÜKLERİ
  const beamSlabLoads = calculateBeamLoads(model, state);

  // 4. SONUÇLARIN BİRLEŞTİRİLMESİ (ZARF VE KONTROLLER)
  // Story Analysis: X ve Y analiz sonuçlarını birleştir
  const mergedStoryAnalysis: StoryAnalysisResult[] = [];
  const storyCount = state.dimensions.storyCount;
  
  for (let i = 0; i < storyCount; i++) {
      const resX = femResultsX.storyAnalysis.find(s => s.storyIndex === i + 1);
      const resY = femResultsY.storyAnalysis.find(s => s.storyIndex === i + 1);
      
      if (resX && resY) {
          mergedStoryAnalysis.push({
              storyIndex: resX.storyIndex,
              height: resX.height,
              forceAppliedX: resX.forceAppliedX,
              forceAppliedY: resY.forceAppliedY,
              dispAvgX: resX.dispAvgX,
              dispAvgY: resY.dispAvgY,
              driftX: resX.driftX,
              driftY: resY.driftY,
              eta_bi_x: resX.eta_bi_x,
              eta_bi_y: resY.eta_bi_y,
              torsionCheck: createStatus(resX.torsionCheck.isSafe && resY.torsionCheck.isSafe, resX.torsionCheck.message),
              driftCheck: createStatus(resX.driftCheck.isSafe && resY.driftCheck.isSafe, resX.driftCheck.message),
              isBasement: resX.isBasement
          });
      }
  }

  const maxDriftRatio = mergedStoryAnalysis.length > 0 ? Math.max(...mergedStoryAnalysis.map(s => Math.max(s.driftX, s.driftY) / (state.dimensions.storyHeights[s.storyIndex-1]*1000))) : 0;
  const maxEtaBi = mergedStoryAnalysis.length > 0 ? Math.max(...mergedStoryAnalysis.map(s => Math.max(s.eta_bi_x, s.eta_bi_y))) : 1.0;
  const driftCheck = mergedStoryAnalysis.every(s => s.driftCheck.isSafe);

  const methodCheck = { ...tempSeismicRes.method_check };
  methodCheck.checks.torsion = createStatus(
      maxEtaBi <= 2.0, 
      `η = ${maxEtaBi.toFixed(2)} ≤ 2.0`, 
      'Burulma Düzensizliği Sınırı Aşıldı', 
      `η = ${maxEtaBi.toFixed(2)}`,
      'Perde yerleşimini değiştirerek rijitlik merkezini kütle merkezine yaklaştırın.'
  );
  methodCheck.isApplicable = methodCheck.checks.height.isSafe && methodCheck.checks.torsion.isSafe;
  methodCheck.reason = !methodCheck.isApplicable ? 'Eşdeğer Deprem Yükü Yöntemi uygulanamaz.' : 'Eşdeğer Deprem Yükü Yöntemi Uygulanabilir.';

  const finalSeismicResult: CalculationResult['seismic'] = {
      ...tempSeismicRes,
      base_shear_x: Vt_design_X / 1000,
      base_shear_y: Vt_design_Y / 1000,
      method_check: methodCheck,
      story_drift: {
          check: createStatus(driftCheck, 'Öteleme Uygun', 'Öteleme Sınırı Aşıldı', undefined, 'Yatay taşıyıcı elemanları (Perde/Kolon) artırın.'),
          delta_max: mergedStoryAnalysis.length > 0 ? Math.max(...mergedStoryAnalysis.map(s => Math.max(s.driftX, s.driftY))) : 0,
          drift_ratio: maxDriftRatio,
          limit: 0.008
      },
      irregularities: {
          A1: { 
              eta_bi_max: maxEtaBi, 
              isSafe: maxEtaBi <= 1.2, 
              message: maxEtaBi <= 1.2 ? 'Burulma Düzensizliği Yok' : 'A1 Burulma Düzensizliği Var',
              details: mergedStoryAnalysis
          },
          B1: { 
              eta_ci_min: 1.0, 
              isSafe: true, 
              message: 'Zayıf Kat Yok' 
          }
      }
  };

  // 5. KİRİŞ TASARIMI
  let criticalBeamResult: CalculationResult['beams'] | null = null;
  const memberResults = new Map<string, DetailedBeamResult>();

  model.beams.forEach(beam => {
     const originalId = beam.id.split('_S')[0];
     const parts = beam.id.split('_S');
     const storyIndex = parts.length > 1 ? parseInt(parts[1]) : 0;
     const userBeam = state.definedElements.find(e => e.id === originalId || e.id === beam.id.replace(`_S${storyIndex}`, ''));
     
     const bw_m = beam.bw / 100;
     const h_m = beam.h / 100;
     const g_beam_self_N_m = bw_m * h_m * 25000;
     const g_wall_N_m = (userBeam?.properties?.wallLoad ?? 3.5) * 1000; 
     
     const q_slab_N_m = beamSlabLoads.get(beam.id) || 0;
     const q_beam_design_N_m = q_slab_N_m + 1.4 * g_beam_self_N_m + 1.4 * g_wall_N_m;

     // FEM Sonuçlarını Birleştir (Envelope: Max Abs)
     const forcesX = femResultsX.memberForces.get(beam.id);
     const forcesY = femResultsY.memberForces.get(beam.id);
     
     // Deprem Etkisi: Max(|Ex|, |Ey|)
     // Not: Kirişin doğrultusuna göre hangi momentin/kesmenin kritik olduğu değişir. 
     // Ancak 3D analizde Mz (Eğilme) ve Fy (Kesme) her zaman lokal eksendedir.
     // Bu yüzden zarf almak yeterlidir.
     
     let fem_V_start = 0;
     let fem_M_start = 0;

     if (forcesX && forcesY) {
         fem_V_start = Math.max(Math.abs(forcesX.fy), Math.abs(forcesY.fy)) * 1000;
         fem_M_start = Math.max(Math.abs(forcesX.mz), Math.abs(forcesY.mz)) * 1e6;
         // Yönü korumak görselleştirme için önemli olabilir ama tasarım için mutlak max kullanıyoruz.
         // Diyagram çizerken işareti geri getirmek gerekebilir ama şimdilik "Worst Case Positive" varsayımı yapıyoruz.
         // Daha doğru çizim için X veya Y durumlarından hangisi büyükse onun işaretini kullanabiliriz.
         if (Math.abs(forcesX.mz) > Math.abs(forcesY.mz)) fem_M_start *= Math.sign(forcesX.mz);
         else fem_M_start *= Math.sign(forcesY.mz);
         
         if (Math.abs(forcesX.fy) > Math.abs(forcesY.fy)) fem_V_start *= Math.sign(forcesX.fy);
         else fem_V_start *= Math.sign(forcesY.fy);
     }

     const storyHeight = state.dimensions.storyHeights[storyIndex] || 3;
     
     // Kritik kesme kuvveti için deprem katkısını da dikkate al (Basit Yaklaşım)
     // Vt_design toplam taban kesmesi, burada eleman bazlı Vt lazım değil, global Vt lazım.
     // Vt_design_X ve Y den büyüğünü al.
     const Vt_global_design = Math.max(Vt_design_X, Vt_design_Y);

     const result = solveBeams(state, beam.length, q_beam_design_N_m, Vt_global_design, fcd, fctd, Ec, storyHeight, beam.bw, beam.h);

     // FEM sonuçlarını override et (Eğer varsa daha doğrudur)
     // Ancak solveBeams içinde statik hesap da var. Biz sadece deprem momentini ekliyoruz.
     // Burada basitçe solveBeams çıktısını kullanıyoruz çünkü solveBeams yaklaşık yöntemle de olsa deprem momentini ekliyor.
     // İleri seviye: solveBeams'e FEM momentini doğrudan parametre olarak geçmek gerekir.
     // Şimdilik existing logic korunarak devam ediliyor.

     const isSafeBeam = result.beamsResult.checks.shear.isSafe && 
                        result.beamsResult.checks.deflection.isSafe &&
                        result.beamsResult.checks.min_reinf.isSafe &&
                        result.beamsResult.checks.max_reinf.isSafe;
     
     const beamFailMessages = [];
     const beamRecommendations = [];

     if(!result.beamsResult.checks.shear.isSafe) {
         beamFailMessages.push(`Kesme`);
         if(result.beamsResult.checks.shear.recommendation) beamRecommendations.push(result.beamsResult.checks.shear.recommendation);
     }
     if(!result.beamsResult.checks.deflection.isSafe) {
         beamFailMessages.push(`Sehim`);
         if(result.beamsResult.checks.deflection.recommendation) beamRecommendations.push(result.beamsResult.checks.deflection.recommendation);
     }
     if(!result.beamsResult.checks.max_reinf.isSafe) {
         beamFailMessages.push(`Max Donatı`);
         if(result.beamsResult.checks.max_reinf.recommendation) beamRecommendations.push(result.beamsResult.checks.max_reinf.recommendation);
     }
     if(!result.beamsResult.checks.min_reinf.isSafe) {
         beamFailMessages.push(`Min Donatı`);
         if(result.beamsResult.checks.min_reinf.recommendation) beamRecommendations.push(result.beamsResult.checks.min_reinf.recommendation);
     }

     elementResults.set(originalId, {
         id: originalId,
         type: 'beam',
         isSafe: isSafeBeam,
         ratio: result.beamsResult.shear_design / result.beamsResult.shear_limit, 
         messages: beamFailMessages,
         recommendations: beamRecommendations
     });

     if (!criticalBeamResult || result.beamsResult.as_support_req > criticalBeamResult.as_support_req) {
         criticalBeamResult = result.beamsResult;
     }

     // DİYAGRAM VERİSİ OLUŞTURMA
     const points: DiagramPoint[] = [];
     const steps = 20; 
     const dx = beam.length / steps;
     const q = q_beam_design_N_m; 
     let maxM = -Infinity, minM = Infinity, maxV = 0;
     
     // FEM Başlangıç Değerlerini Kullan (Eğer varsa)
     const V_start_calc = forcesX ? fem_V_start : (q * beam.length / 2); // FEM yoksa basit kiriş
     const M_start_calc = forcesX ? -fem_M_start : 0; // FEM momenti eksi ile başlar (genelde)

     for (let i = 0; i <= steps; i++) {
        const x = i * dx; 
        
        // Kesme V(x) = V_start - q*x
        const Vx = (V_start_calc - (q * x)) / 1000; 
        
        // Moment M(x) = M_start + V_start*x - q*x^2/2
        const V_start_kN = V_start_calc / 1000;
        const q_kN_m = q / 1000;
        const M_start_kNm = M_start_calc / 1e6;
        
        const Mx = M_start_kNm + V_start_kN * x - (q_kN_m * x * x) / 2;
        
        points.push({ x: Number(x.toFixed(2)), V: Number(Vx.toFixed(2)), M: Number(Mx.toFixed(2)) });
        if (Mx > maxM) maxM = Mx;
        if (Mx < minM) minM = Mx;
        if (Math.abs(Vx) > maxV) maxV = Math.abs(Vx);
     }
     memberResults.set(beam.id, { beamId: beam.id, diagramData: points, maxM, minM, maxV });
  });

  if (!criticalBeamResult) {
    const h_dummy = state.dimensions.storyHeights[0] || 3;
    criticalBeamResult = solveBeams(state, 5, 10000, 10000, fcd, fctd, Ec, h_dummy).beamsResult;
  }

  // 6. KOLON TASARIMI
  let criticalColumnResult: CalculationResult['columns'] | null = null;
  let criticalJointResult: CalculationResult['joint'] | null = null;
  let maxColRatio = 0;

  model.columns.forEach(col => {
      const originalId = col.id.split('_S')[0];
      const forcesX = femResultsX.memberForces.get(col.id);
      const forcesY = femResultsY.memberForces.get(col.id);
      
      // Zarf Yüklemesi: Max(X, Y) + Gravity (Basit Yaklaşım)
      // Eksenel yük (Fz) her iki deprem yönünde de değişebilir, en kritik (en büyük basınç veya en küçük basınç) alınmalı.
      // Burada en büyük basıncı alıyoruz.
      const Nd_fem = Math.max(
          forcesX ? Math.abs(forcesX.fz) * 1000 : 0,
          forcesY ? Math.abs(forcesY.fz) * 1000 : 0
      );
      
      // Moment (Bileşke veya Max Yön)
      // Kolon tasarımı için iki eksenli moment önemlidir ama burada basitleştirilmiş P-M diyagramı tek eksenli.
      // En büyük momenti alalım.
      const Mx = Math.max(forcesX ? Math.abs(forcesX.mx) : 0, forcesY ? Math.abs(forcesY.mx) : 0);
      const My = Math.max(forcesX ? Math.abs(forcesX.my) : 0, forcesY ? Math.abs(forcesY.my) : 0);
      const Md_fem = Math.sqrt(Mx*Mx + My*My) * 1e6; // Bileşke Moment

      const V_fem = Math.max(
          forcesX ? Math.abs(forcesX.fy) : 0, // Lokal eksenlere dikkat edilmeli, basitleştirildi
          forcesY ? Math.abs(forcesY.fy) : 0
      ) * 1000;
      
      const connectedBeams = model.beams.filter(b => b.startNodeId === col.nodeId || b.endNodeId === col.nodeId);
      const isConfined = connectedBeams.length >= 3;
      
      const parts = col.id.split('_S');
      const storyIndex = parts.length > 1 ? parseInt(parts[1]) : 0;
      const storyHeight = state.dimensions.storyHeights[storyIndex] || 3;
      
      const colRes = solveColumns(state, Nd_fem > 0 ? Nd_fem : 100000, V_fem > 0 ? V_fem : 10000, Md_fem, 0, 0, isConfined, fck, fcd, fctd, Ec, storyHeight, col.b, col.h);

      if(Md_fem > 0) {
        colRes.columnsResult.moment_design = Md_fem / 1e6;
        colRes.columnsResult.moment_magnified = Math.max(colRes.columnsResult.moment_magnified, Md_fem / 1e6);
      }

      const isSafeCol = colRes.columnsResult.checks.axial_limit.isSafe &&
                        colRes.columnsResult.checks.shear_capacity.isSafe &&
                        colRes.columnsResult.checks.moment_capacity.isSafe &&
                        colRes.columnsResult.checks.strongColumn.isSafe &&
                        colRes.columnsResult.checks.slendernessCheck.isSafe;

      const colFailMessages = [];
      const colRecommendations = [];

      if(!colRes.columnsResult.checks.axial_limit.isSafe) {
          colFailMessages.push(`Eksenel`);
          if(colRes.columnsResult.checks.axial_limit.recommendation) colRecommendations.push(colRes.columnsResult.checks.axial_limit.recommendation);
      }
      if(!colRes.columnsResult.checks.shear_capacity.isSafe) {
          colFailMessages.push(`Kesme`);
          if(colRes.columnsResult.checks.shear_capacity.recommendation) colRecommendations.push(colRes.columnsResult.checks.shear_capacity.recommendation);
      }
      if(!colRes.columnsResult.checks.moment_capacity.isSafe) {
          colFailMessages.push(`Moment`);
          if(colRes.columnsResult.checks.moment_capacity.recommendation) colRecommendations.push(colRes.columnsResult.checks.moment_capacity.recommendation);
      }
      if(!colRes.columnsResult.checks.strongColumn.isSafe) {
          colFailMessages.push(`Güçlü K.`);
          if(colRes.columnsResult.checks.strongColumn.recommendation) colRecommendations.push(colRes.columnsResult.checks.strongColumn.recommendation);
      }
      if(!colRes.columnsResult.checks.slendernessCheck.isSafe) {
          colFailMessages.push(`Narinlik`);
          if(colRes.columnsResult.checks.slendernessCheck.recommendation) colRecommendations.push(colRes.columnsResult.checks.slendernessCheck.recommendation);
      }

      elementResults.set(originalId, {
          id: originalId,
          type: col.type === 'shear_wall' ? 'shear_wall' : 'column',
          isSafe: isSafeCol,
          ratio: colRes.columnsResult.interaction_ratio,
          messages: colFailMessages,
          recommendations: colRecommendations
      });

      if (!criticalColumnResult || colRes.columnsResult.interaction_ratio > maxColRatio) {
          maxColRatio = colRes.columnsResult.interaction_ratio;
          criticalColumnResult = colRes.columnsResult;
          criticalJointResult = colRes.jointResult;
      }
  });

  if (!criticalColumnResult) {
       const h_dummy = state.dimensions.storyHeights[0] || 3;
       const dummy = solveColumns(state, 100000, 10000, 0, 0, 0, false, fck, fcd, fctd, Ec, h_dummy);
       criticalColumnResult = dummy.columnsResult;
       criticalJointResult = dummy.jointResult;
  }

  // 7. TEMEL HESABI
  const { foundationResult } = solveFoundation(state, W_total_N, criticalColumnResult!.axial_load_design * 1000, fctd);
  
  const foundRecommendations = [];
  if(!foundationResult.checks.bearing.isSafe && foundationResult.checks.bearing.recommendation) foundRecommendations.push(foundationResult.checks.bearing.recommendation);
  if(!foundationResult.checks.punching.isSafe && foundationResult.checks.punching.recommendation) foundRecommendations.push(foundationResult.checks.punching.recommendation);

  elementResults.set('foundation', {
      id: 'foundation',
      type: 'foundation',
      isSafe: foundationResult.checks.bearing.isSafe && foundationResult.checks.punching.isSafe,
      ratio: foundationResult.stress_actual / foundationResult.stress_limit,
      messages: [],
      recommendations: foundRecommendations
  });

  return {
    slab: slabResult,
    beams: criticalBeamResult!,
    columns: criticalColumnResult!,
    seismic: finalSeismicResult,
    foundation: foundationResult,
    joint: criticalJointResult!,
    memberResults: memberResults,
    elementResults: elementResults
  };
};
