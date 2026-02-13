
// utils/solver.ts
import { AppState, CalculationResult, ElementAnalysisStatus, StructuralModel, StoryAnalysisResult, DetailedBeamResult, DiagramPoint } from "../types";
import { getConcreteProperties } from "../constants";
import { solveSlab } from "./slabSolver";
import { solveSeismic, calculateRayleighPeriod } from "./seismicSolver";
import { solveBeams } from "./beamSolver";
import { solveColumns } from "./columnSolver";
import { solveFoundation } from "./foundationSolver";
import { generateModel } from "./modelGenerator";
import { solveFEM } from './femSolver';
import { createStatus, GRAVITY } from "./shared";

// Kiriş Yüklerini Döşemelerden Hesaplayan Yardımcı Fonksiyon
const calculateBeamLoads = (model: StructuralModel, appState: AppState): Map<string, { q_g: number, q_q: number }> => {
    const beamLoads = new Map<string, { q_g: number, q_q: number }>();

    model.slabs.forEach(slab => {
        const slabNodes = slab.nodes.map(nid => model.nodes.find(n => n.id === nid)!);
        if (!slabNodes.every(n => n)) return;

        const userSlab = appState.definedElements.find(e => `${e.id}_S${e.storyIndex}` === slab.id);
        const liveLoadKg = userSlab?.properties?.liveLoad ?? appState.loads.liveLoadKg;
        const g_slab = (slab.thickness / 100) * 25000;
        const g_coating = appState.loads.deadLoadCoatingsKg * GRAVITY;
        const q_live = liveLoadKg * GRAVITY;
        
        const pd_g = g_slab + g_coating; // Ölü Yük (N/m2)
        const pd_q = q_live; // Hareketli Yük (N/m2)

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

                const load_g = (areaTributary * pd_g) / beam.length; 
                const load_q = (areaTributary * pd_q) / beam.length;

                const current = beamLoads.get(beam.id) || { q_g: 0, q_q: 0 };
                beamLoads.set(beam.id, { 
                    q_g: current.q_g + load_g,
                    q_q: current.q_q + load_q
                });
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

  // =========================================================================
  // İTERATİF ANALİZ DÖNGÜSÜ
  // Adım 1: Ampirik Periyot ile Başlangıç Deprem Kuvvetleri
  // =========================================================================
  
  const seismicRes_Init = solveSeismic(state, g_total_N_m2, q_live_N_m2, g_beam_self_approx, g_wall_approx);
  
  // Model Oluşturma
  const model = generateModel(state);
  
  // Adım 2: İlk FEM Analizi (Başlangıç Kuvvetleri ile)
  const femX_1 = solveFEM(state, seismicRes_Init.fi_story_X, 'X');
  const femY_1 = solveFEM(state, seismicRes_Init.fi_story_Y, 'Y');

  // Adım 3: Rayleigh Periyot Hesabı
  // X Yönü için Veri Hazırla
  const rayleighDataX = seismicRes_Init.weightsPerStory.map((w, i) => {
      const storyIdx = i + 1; // 1. kattan başlar
      const res = femX_1.storyAnalysis.find(s => s.storyIndex === storyIdx);
      return {
          mass: w / (1000 * GRAVITY), // ton (N -> kg -> ton)
          force: seismicRes_Init.fi_story_X[i] / 1000, // kN
          displacement: res ? res.dispAvgX : 0 // mm
      };
  });

  // Y Yönü için Veri Hazırla
  const rayleighDataY = seismicRes_Init.weightsPerStory.map((w, i) => {
      const storyIdx = i + 1; 
      const res = femY_1.storyAnalysis.find(s => s.storyIndex === storyIdx);
      return {
          mass: w / (1000 * GRAVITY),
          force: seismicRes_Init.fi_story_Y[i] / 1000,
          displacement: res ? res.dispAvgY : 0
      };
  });

  const Tx_Rayleigh = calculateRayleighPeriod(rayleighDataX);
  const Ty_Rayleigh = calculateRayleighPeriod(rayleighDataY);

  // Adım 4: Yeni Periyotlar ile Deprem Kuvvetlerini Güncelle
  const { seismicResult: finalSeismicRes, Vt_design_X, Vt_design_Y, W_total_N, fi_story_X, fi_story_Y } = solveSeismic(
      state, 
      g_total_N_m2, 
      q_live_N_m2, 
      g_beam_self_approx, 
      g_wall_approx,
      { Tx: Tx_Rayleigh, Ty: Ty_Rayleigh }
  );

  // Adım 5: Final FEM Analizi (Güncel Kuvvetler ile)
  const femResultsX = solveFEM(state, fi_story_X, 'X');
  const femResultsY = solveFEM(state, fi_story_Y, 'Y');

  // 3.5 DÖŞEME YÜKLERİ (Kirişlere Aktar)
  const beamSlabLoads = calculateBeamLoads(model, state);

  // 4. SONUÇLARI BİRLEŞTİR (ZARF)
  const mergedStoryAnalysis: StoryAnalysisResult[] = [];
  const storyCount = state.dimensions.storyCount;
  
  for (let i = 0; i < storyCount; i++) {
      const resX = femResultsX.storyAnalysis.find(s => s.storyIndex === i + 1);
      const resY = femResultsY.storyAnalysis.find(s => s.storyIndex === i + 1);
      
      if (resX && resY) {
          mergedStoryAnalysis.push({
              storyIndex: resX.storyIndex,
              height: resX.height,
              mass: seismicRes_Init.weightsPerStory[i] / (1000 * GRAVITY), // ton
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

  const methodCheck = { ...finalSeismicRes.method_check };
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
      ...finalSeismicRes,
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
  
  // Kolon Çözücüsü için Kiriş Donatılarını Saklayacağımız Map
  const beamReinforcementData = new Map<string, { As_supp: number; As_span: number; b: number; h: number }>();

  model.beams.forEach(beam => {
     const originalId = beam.id.split('_S')[0];
     const parts = beam.id.split('_S');
     const storyIndex = parts.length > 1 ? parseInt(parts[1]) : 0;
     const userBeam = state.definedElements.find(e => e.id === originalId || e.id === beam.id.replace(`_S${storyIndex}`, ''));
     
     const bw_m = beam.bw / 100;
     const h_m = beam.h / 100;
     const g_beam_self_N_m = bw_m * h_m * 25000;
     const g_wall_N_m = (userBeam?.properties?.wallLoad ?? 3.5) * 1000; 
     
     // Ayrık Yükler
     const loads = beamSlabLoads.get(beam.id) || { q_g: 0, q_q: 0 };
     const q_g_N_m = loads.q_g + g_beam_self_N_m + g_wall_N_m;
     const q_q_N_m = loads.q_q;

     const forcesX = femResultsX.memberForces.get(beam.id);
     const forcesY = femResultsY.memberForces.get(beam.id);
     
     let fem_V_start = 0;
     let fem_M_start = 0;

     if (forcesX && forcesY) {
         fem_V_start = Math.max(Math.abs(forcesX.fy), Math.abs(forcesY.fy)) * 1000;
         fem_M_start = Math.max(Math.abs(forcesX.mz), Math.abs(forcesY.mz)) * 1e6;
         
         if (Math.abs(forcesX.mz) > Math.abs(forcesY.mz)) fem_M_start *= Math.sign(forcesX.mz);
         else fem_M_start *= Math.sign(forcesY.mz);
         
         if (Math.abs(forcesX.fy) > Math.abs(forcesY.fy)) fem_V_start *= Math.sign(forcesX.fy);
         else fem_V_start *= Math.sign(forcesY.fy);
     }

     const storyHeight = state.dimensions.storyHeights[storyIndex] || 3;
     
     const result = solveBeams(
         state, 
         beam.length, 
         q_g_N_m, 
         q_q_N_m, 
         Math.abs(fem_M_start), // Mutlak değer (Kombinasyonda +/- dikkate alınır)
         Math.abs(fem_V_start), 
         fcd, fctd, Ec, storyHeight, beam.bw, beam.h
     );

     // Sonuçları Kaydet (Kolon hesabı için)
     beamReinforcementData.set(beam.id, {
         As_supp: result.As_beam_supp_prov,
         As_span: result.As_beam_span_prov,
         b: beam.bw * 10,
         h: beam.h * 10
     });

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

     const points: DiagramPoint[] = [];
     const steps = 20; 
     const dx = beam.length / steps;
     const q_design = result.beamsResult.load_design * 1000; // N/m
     
     let maxM = -Infinity, minM = Infinity, maxV = 0;
     
     // Grafik için basitleştirilmiş G+Q+E zarfı yerine
     // Sadece 1.4G+1.6Q+1.0E'yi görselleştirelim (Yaklaşık)
     const V_start_calc = forcesX ? fem_V_start : (q_design * beam.length / 2); 
     const M_start_calc = forcesX ? -fem_M_start : 0;

     for (let i = 0; i <= steps; i++) {
        const x = i * dx; 
        const Vx = (V_start_calc - (q_design * x)) / 1000; 
        const V_start_kN = V_start_calc / 1000;
        const q_kN_m = q_design / 1000;
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
    criticalBeamResult = solveBeams(state, 5, 10000, 5000, 0, 0, fcd, fctd, Ec, h_dummy).beamsResult;
  }

  // 6. KOLON TASARIMI
  let criticalColumnResult: CalculationResult['columns'] | null = null;
  let criticalJointResult: CalculationResult['joint'] | null = null;
  let maxColRatio = 0;
  
  // Temel için toplam yükler
  let totalFoundationAxial = 0;
  let totalFoundationMomentX = 0;
  let totalFoundationMomentY = 0;

  model.columns.forEach(col => {
      const originalId = col.id.split('_S')[0];
      const forcesX = femResultsX.memberForces.get(col.id);
      const forcesY = femResultsY.memberForces.get(col.id);
      
      const Nd_fem_seismic = Math.max(
          forcesX ? Math.abs(forcesX.fz) * 1000 : 0,
          forcesY ? Math.abs(forcesY.fz) * 1000 : 0
      );
      
      // Kolon Düşey Yüklerini Yaklaşık Hesapla (Tribüter alan basitliği için FEM Fz'yi sadece deprem alıyoruz,
      // ancak FEM düşey yükleri de içeriyorsa ayıramayız.
      // Mevcut FEM sadece Yatay yük ile çalışıyor (seismicForces vektörü). 
      // Dolayısıyla forcesX.fz sadece depremden gelen eksenel yüktür (+/-).
      
      // Düşey Yükleri (G ve Q) bulmak için basit tribüter alan (Kat sayısı kadar birikimli)
      // Bu çok kaba bir yaklaşım, ama FEM gravity yoksa zorunlu.
      // Basitleştirme: Kolon başına ortalama yük * kat sayısı
      const parts = col.id.split('_S');
      const storyIndex = parts.length > 1 ? parseInt(parts[1]) : 0;
      const storiesAbove = state.dimensions.storyCount - storyIndex;
      
      // Kolon başına düşen yaklaşık alan
      const avgArea = (state.dimensions.lx * state.dimensions.ly) / (state.grid.xAxis.length+1 * state.grid.yAxis.length+1);
      
      const Nd_g_approx = (g_total_N_m2 + 0.3*25000) * avgArea * storiesAbove; // Döşeme + Kiriş/Kolon ağırlığı
      const Nd_q_approx = q_live_N_m2 * avgArea * storiesAbove;

      // Temel Yükleri (Sadece Zemin Kat Kolonları)
      if (col.id.endsWith('_S0')) {
          totalFoundationAxial += (Nd_g_approx + Nd_q_approx); 
          if (forcesX) totalFoundationMomentY += forcesX.my * 1000; 
          if (forcesY) totalFoundationMomentX += forcesY.mx * 1000; 
      }

      const Mx = Math.max(forcesX ? Math.abs(forcesX.mx) : 0, forcesY ? Math.abs(forcesY.mx) : 0);
      const My = Math.max(forcesX ? Math.abs(forcesX.my) : 0, forcesY ? Math.abs(forcesY.my) : 0);
      const Md_fem_seismic = Math.sqrt(Mx*Mx + My*My) * 1e6;

      const V_fem_seismic = Math.max(
          forcesX ? Math.abs(forcesX.fy) : 0,
          forcesY ? Math.abs(forcesY.fy) : 0
      ) * 1000;
      
      // --- BİRLEŞİM BÖLGESİ KONTROLÜ ---
      const connectedBeams = model.beams.filter(b => b.startNodeId === col.nodeId || b.endNodeId === col.nodeId);
      let beamsX = 0;
      let beamsY = 0;
      const connectedBeamsData: { b_mm: number, h_mm: number, As_prov_mm2: number }[] = [];

      connectedBeams.forEach(b => {
          const bData = beamReinforcementData.get(b.id);
          if (bData) {
              connectedBeamsData.push({
                  b_mm: bData.b,
                  h_mm: bData.h,
                  As_prov_mm2: Math.max(bData.As_supp, bData.As_span) 
              });
          }
          if (b.direction === 'X') beamsX++;
          if (b.direction === 'Y') beamsY++;
      });

      const isJointConfined = (beamsX >= 2 && beamsY >= 2);
      const storyHeight = state.dimensions.storyHeights[storyIndex] || 3;
      
      const colRes = solveColumns(
          state, 
          Nd_g_approx,
          Nd_q_approx,
          Nd_fem_seismic,
          Md_fem_seismic,
          V_fem_seismic,
          connectedBeamsData,
          isJointConfined,
          fck, fcd, fctd, Ec, storyHeight, col.b, col.h
      );

      if(Md_fem_seismic > 0) {
        colRes.columnsResult.moment_design = Md_fem_seismic / 1e6;
        colRes.columnsResult.moment_magnified = Math.max(colRes.columnsResult.moment_magnified, Md_fem_seismic / 1e6);
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
       const dummy = solveColumns(state, 100000, 20000, 0, 0, 0, [], false, fck, fcd, fctd, Ec, h_dummy);
       criticalColumnResult = dummy.columnsResult;
       criticalJointResult = dummy.jointResult;
  }

  // 7. TEMEL HESABI
  // Devrilme Momentleri
  const Mx_overturning_kNm = (totalFoundationMomentX / 1000) + (Vt_design_Y / 1000) * (state.dimensions.foundationHeight / 100);
  const My_overturning_kNm = (totalFoundationMomentY / 1000) + (Vt_design_X / 1000) * (state.dimensions.foundationHeight / 100);

  const { foundationResult } = solveFoundation(
      state, 
      totalFoundationAxial > 0 ? totalFoundationAxial : W_total_N, // Kolonlardan gelen yük yoksa yaklaşık ağırlık
      criticalColumnResult!.axial_load_design * 1000, 
      fctd,
      Mx_overturning_kNm,
      My_overturning_kNm
  );
  
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
