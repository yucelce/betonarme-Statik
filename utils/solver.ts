
// utils/solver.ts
import { AppState, CalculationResult } from "../types";
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

export const calculateStructure = (state: AppState): CalculationResult => {
  const { materials, sections } = state;
  const { fck, fcd, fctd, Ec } = getConcreteProperties(materials.concreteClass);

  // 1. DÖŞEME HESABI (Yük analizi için gerekli)
  // q_eq_slab_N_m: Döşemeden gelen yük (Duvar ve Kiriş ağırlığı HARİÇ)
  const { slabResult, q_eq_slab_N_m, g_total_N_m2, q_live_N_m2 } = solveSlab(state);

  // Referans için varsayılan kiriş ve duvar ağırlıklarını alalım (Deprem hesabı için yaklaşık değerler)
  const g_beam_self_approx = (sections.beamWidth/100) * (sections.beamDepth/100) * 25000;
  const g_wall_approx = 3500; // 3.5 kN/m varsayılan

  // 2. YAKLAŞIK DEPREM VE KUVVET DAĞILIMI
  // Önce deprem kuvvetlerini hesapla ki FEM'e verebilelim
  const { seismicResult: tempSeismicRes, Vt_design_N, W_total_N, fi_story_N } = solveSeismic(state, g_total_N_m2, q_live_N_m2, g_beam_self_approx, g_wall_approx);

  // 3. MODEL VE FEM ANALİZİ
  const model = generateModel(state);
  // FEM Analizini çalıştır (Kat kuvvetlerini parametre olarak geç)
  const femResults = solveFEM(state, fi_story_N);
  
  // 4. SONUÇLARIN BİRLEŞTİRİLMESİ (Seismic sonucunu FEM verileriyle güncelle)
  const maxDriftRatio = Math.max(...femResults.storyAnalysis.map(s => s.driftRatio));
  const maxEtaBi = Math.max(...femResults.storyAnalysis.map(s => s.eta_bi));
  const driftCheck = femResults.storyAnalysis.every(s => s.driftCheck.isSafe);

  const finalSeismicResult: CalculationResult['seismic'] = {
      ...tempSeismicRes,
      story_drift: {
          check: createStatus(driftCheck, 'Öteleme Uygun', 'Öteleme Sınırı Aşıldı'),
          delta_max: Math.max(...femResults.storyAnalysis.map(s => s.dispMax)),
          drift_ratio: maxDriftRatio,
          limit: 0.008
      },
      irregularities: {
          A1: { 
              eta_bi_max: maxEtaBi, 
              isSafe: maxEtaBi <= 1.2, 
              message: maxEtaBi <= 1.2 ? 'Burulma Düzensizliği Yok' : 'A1 Burulma Düzensizliği Var',
              details: femResults.storyAnalysis
          },
          B1: { 
              eta_ci_min: 1.0, // Detaylı rijitlik hesabı eklenebilir
              isSafe: true, 
              message: 'Zayıf Kat Yok (Varsayılan)' 
          }
      }
  };

  // 5. KİRİŞ TASARIMI (FEM KUVVETLERİ İLE)
  let criticalBeamResult: CalculationResult['beams'] | null = null;
  const memberResults = new Map<string, DetailedBeamResult>();

  model.beams.forEach(beam => {
     // Kirişe özel yük hesabı
     // Beam ID formatı: B-X1Y1-X2Y2_S0 gibi (modelGenerator'dan gelen)
     // Orijinal UserElement'i bulmak için ID eşleştirmesi lazım.
     // Ancak modelGenerator ID'ye '_S...' ekliyor.
     const originalId = beam.id.split('_S')[0];
     // Tam eşleşme için story index'e de bakmamız lazım
     const parts = beam.id.split('_S');
     const storyIndex = parts.length > 1 ? parseInt(parts[1]) : 0;
     
     // State içindeki kullanıcı elemanını bul (Properties için)
     // Not: Auto-segmentation yapıldıysa ID değişmiş olabilir.
     // Ancak segmentasyon sırasında yeni ID'ler UserElement olarak state'e kaydediliyor.
     const userBeam = state.definedElements.find(e => e.id === originalId || e.id === beam.id.replace(`_S${storyIndex}`, ''));
     
     // Kiriş Zati Ağırlığı (Kendi boyutlarından)
     const bw_m = beam.bw / 100;
     const h_m = beam.h / 100;
     const g_beam_self_N_m = bw_m * h_m * 25000;

     // Duvar Yükü (Kullanıcı tanımlı veya varsayılan)
     const g_wall_N_m = (userBeam?.properties?.wallLoad ?? 3.5) * 1000; // kN/m -> N/m

     // Toplam Tasarım Yükü (1.4G + 1.6Q veya döşemeden gelen 1.4G+1.6Q kombinasyonu q_eq içinde)
     // q_eq_slab zaten 1.4G + 1.6Q ile hesaplandı
     const q_beam_design_N_m = q_eq_slab_N_m + 1.4 * g_beam_self_N_m + 1.4 * g_wall_N_m;

     const femForces = femResults.memberForces.get(beam.id);
     
     let V_start = 0; 
     let M_start = 0; 

     if (femForces) {
        V_start = femForces.fy * 1000; 
        M_start = femForces.mz * 1e6;  
     } else {
        V_start = (q_beam_design_N_m * beam.length) / 2;
        M_start = 0; 
     }

     const storyHeight = state.dimensions.storyHeights[storyIndex] || 3;

     const result = solveBeams(state, beam.length, q_beam_design_N_m, Vt_design_N, fcd, fctd, Ec, storyHeight);

     // En kritik kiriş sonucunu sakla
     if (!criticalBeamResult || result.beamsResult.as_support_req > criticalBeamResult.as_support_req) {
         criticalBeamResult = result.beamsResult;
     }

     // Diyagram Verisi
     const points: DiagramPoint[] = [];
     const steps = 20; 
     const dx = beam.length / steps;
     const q = q_beam_design_N_m; 

     let maxM = -Infinity, minM = Infinity, maxV = 0;

     for (let i = 0; i <= steps; i++) {
        const x = i * dx; 
        const Vx = (V_start - (q * x)) / 1000; // kN
        
        const M_start_kNm = femForces ? -femForces.mz : 0; 
        const V_start_kN = V_start / 1000;
        const q_kN_m = q / 1000;

        const Mx = M_start_kNm + V_start_kN * x - (q_kN_m * x * x) / 2;

        points.push({ 
            x: Number(x.toFixed(2)), 
            V: Number(Vx.toFixed(2)), 
            M: Number(Mx.toFixed(2)) 
        });

        if (Mx > maxM) maxM = Mx;
        if (Mx < minM) minM = Mx;
        if (Math.abs(Vx) > maxV) maxV = Math.abs(Vx);
     }

     memberResults.set(beam.id, {
         beamId: beam.id,
         diagramData: points,
         maxM,
         minM,
         maxV
     });
  });

  if (!criticalBeamResult) {
    const h_dummy = state.dimensions.storyHeights[0] || 3;
    criticalBeamResult = solveBeams(state, 5, 10000, 10000, fcd, fctd, Ec, h_dummy).beamsResult;
  }

  // 6. KOLON TASARIMI (FEM KUVVETLERİ İLE)
  let criticalColumnResult: CalculationResult['columns'] | null = null;
  let criticalJointResult: CalculationResult['joint'] | null = null;
  let maxColRatio = 0;

  model.columns.forEach(col => {
      const femForces = femResults.memberForces.get(col.id);
      
      const Nd_fem = femForces ? Math.abs(femForces.fz) * 1000 : 0; 
      const Md_fem = femForces ? Math.abs(femForces.mz) * 1e6 : 0;
      const V_fem = femForces ? Math.abs(femForces.fy) * 1000 : 0;
      
      const connectedBeams = model.beams.filter(b => b.startNodeId === col.nodeId || b.endNodeId === col.nodeId);
      const isConfined = connectedBeams.length >= 3;
      
      const parts = col.id.split('_S');
      const storyIndex = parts.length > 1 ? parseInt(parts[1]) : 0;
      const storyHeight = state.dimensions.storyHeights[storyIndex] || 3;
      
      const colRes = solveColumns(
        state,
        Nd_fem > 0 ? Nd_fem : 100000, 
        V_fem > 0 ? V_fem : 10000,
        Md_fem, 
        0, 0, 
        isConfined,
        fck, fcd, fctd, Ec,
        storyHeight
      );

      if(Md_fem > 0) {
        colRes.columnsResult.moment_design = Md_fem / 1e6;
        colRes.columnsResult.moment_magnified = Math.max(colRes.columnsResult.moment_magnified, Md_fem / 1e6);
      }

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

  return {
    slab: slabResult,
    beams: criticalBeamResult!,
    columns: criticalColumnResult!,
    seismic: finalSeismicResult,
    foundation: foundationResult,
    joint: criticalJointResult!,
    memberResults: memberResults
  };
};
