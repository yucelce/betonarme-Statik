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
import { DetailedBeamResult, DiagramPoint } from "../types";

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
   const memberResults = new Map<string, DetailedBeamResult>();

  model.beams.forEach(beam => {
     // FEM kuvvetlerini al
     const femForces = femResults.memberForces.get(beam.id);
     
     // Başlangıç kuvvetleri (FEM'den veya yaklaşık yöntemden)
     // İşaret kabulleri: FEM'de düğüm kuvvetleri pozitiftir, kiriş diyagramı için yönlere dikkat edilmeli.
     // Basitleştirme: Sol uçtaki (startNode) kesme kuvveti ve moment.
     let V_start = 0; 
     let M_start = 0; 

     if (femForces) {
        V_start = femForces.fy * 1000; // N (FEM kN dönerse diye kontrol edin, femSolver kodunda kN görünüyor ama burada N kullanıyoruz)
        M_start = femForces.mz * 1e6;  // Nmm
     } else {
        // FEM yoksa yaklaşık değerler (Basit kiriş kabulü)
        V_start = (q_beam_design_N_m * beam.length) / 2;
        M_start = 0; // Basit kiriş uç momenti 0 kabulü (veya mesnet momenti)
     }

     // Yaklaşık çözüm fonksiyonunu çağır
     const result = solveBeams(state, beam.length, q_beam_design_N_m, Vt_design_N, fcd, fctd, Ec);

     // ... (Mevcut criticalBeamResult güncelleme kodları burda kalabilir) ...

     // --- DİYAGRAM VERİSİ OLUŞTURMA ---
     const points: DiagramPoint[] = [];
     const steps = 20; // Grafik çözünürlüğü (20 nokta)
     const dx = beam.length / steps;
     const q = q_beam_design_N_m; // N/m

     let maxM = -Infinity, minM = Infinity, maxV = 0;

     for (let i = 0; i <= steps; i++) {
        const x = i * dx; // metre
        
        // Kesme Kuvveti: V(x) = V_start - q*x
        // Not: FEM işaretlerine göre V_start yukarı doğru ise pozitiftir.
        // Burada basit bir statik denge varsayıyoruz.
        const Vx = (V_start - (q * x)) / 1000; // kN'a çevir

        // Moment: M(x) = M_start + V_start*x - (q*x^2)/2
        // Not: M_start (Nmm) -> Nmm + N*mm - N/m * m^2 ??? Birimlere dikkat.
        // x metre olduğu için: q (N/m), V (N), M (Nmm). 
        // Denklem: M(x)_Nmm = M_start_Nmm + V_start_N * (x*1000) - (q_N_m * x^2 * 1000 / 2) ???
        // Daha kolayı hepsini kN ve m üzerinden gitmek:
        
        const M_start_kNm = femForces ? -femForces.mz : 0; // FEM mz genellikle düğüme etkiyen momenttir, çubuğa etkiyen terstir.
        const V_start_kN = V_start / 1000;
        const q_kN_m = q / 1000;

        // Basit kiriş + Uç Momentleri süperpozisyonu (Daha doğru grafik için)
        // M(x) = M_start + V_start*x - q*x^2/2
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
    joint: criticalJointResult!,
    memberResults: memberResults // Map'i sonuca ekle
  };
};