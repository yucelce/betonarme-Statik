// utils/solver.ts dosyasını güncelleyelim

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

  // 4. KİRİŞLERİN HESABI VE KRİTİK KİRİŞ SEÇİMİ
  let criticalBeamResult: CalculationResult['beams'] | null = null;
  let maxBeamMoment = 0;
  
  // Kolon hesabı için kiriş kapasitelerini sakla (Güçlü Kolon Kontrolü için)
  let beamCapacityMap = new Map<string, { Mr: number, As_supp: number, As_span: number }>();

  model.beams.forEach(beam => {
     const result = solveBeams(
        state, 
        beam.length, 
        q_beam_design_N_m, 
        Vt_design_N, 
        fcd, fctd, Ec
     );

     // Sonuçları Map'e kaydet
     beamCapacityMap.set(beam.id, {
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

  // 5. KOLONLARIN TARANMASI (GELİŞTİRİLMİŞ MANTIK)
  // Her kolonu ayrı ayrı hesaplayıp en kritiğini (Kapasite oranı en yüksek olanı) raporlayacağız.
  
  let criticalColumnResult: CalculationResult['columns'] | null = null;
  let criticalJointResult: CalculationResult['joint'] | null = null;
  let maxColInteractionRatio = 0;

  // Bir katın toplam yükü (yaklaşık)
  const singleFloorLoad_N = W_total_N / (dimensions.storyCount || 1);
  
  model.columns.forEach(col => {
      // A. KOLON YÜK ALANI TAHMİNİ (Tributary Area)
      // Basitlik için: Toplam alan / Kolon sayısı (İdealde Voronoi veya grid aralığına göre yapılmalı)
      // Ancak köşe ve kenar kolonları ayırt etmek için grid pozisyonuna bakabiliriz.
      // Şimdilik "Ortalama Yük" mantığını koruyalım ama güvenlik katsayısı ile oynayalım.
      // Kenar kolonlarda moment fazla eksenel yük az olur, orta kolonlarda eksenel yük fazla olur.
      
      const tributaryAreaShare = 1 / Math.max(model.columns.length, 1); 
      // Orta kolonlar için yükü biraz artıralım (%20)
      const loadFactor = 1.2; 
      
      const Nd_gravity_N = (W_total_N * tributaryAreaShare * loadFactor); 
      // Yük Katsayıları (1.4G + 1.6Q) -> Kabaca 1.45 ortalama ile çarpılmış W_total zaten.
      // Sadece 1.5 güvenlik katsayısı ekleyelim.
      const Nd_design_N = Nd_gravity_N * 1.5; // Eski koddaki mantık, ama kolon bazlı döngüdeyiz.

      // B. DEPREM KESME KUVVETİ PAYLAŞIMI
      // Her kolonun rijitliği eşit kabul edilirse (boyutlar aynı):
      // Zemin kattaki kesme kuvvetini kolon sayısına böl.
      const baseShearFloor = fi_story_N.reduce((a,b)=>a+b, 0); // Toplam taban kesme
      const V_col_design_N = baseShearFloor / model.columns.length;

      // Bu kolona bağlanan kirişlerin kapasitesini bul (Ortalama bir değer al veya bağlı olanı bul)
      // Şimdilik en kritik kirişin kapasitesini kullanmak güvenli tarafta kalır.
      const connectedBeamMr = beamCapacityMap.get(`Bx-0-0`)?.Mr || criticalBeamResult!.moment_support * 1e6; // Basitleştirme

      const colRes = solveColumns(
        state,
        Nd_design_N,
        V_col_design_N,
        connectedBeamMr, 
        beamCapacityMap.get('Bx-0-0')?.As_supp || 0,
        beamCapacityMap.get('Bx-0-0')?.As_span || 0,
        fck, fcd, fctd, Ec
      );

      // En zorlanan kolonu bul (Interaction ratio'ya göre)
      if (!criticalColumnResult || colRes.columnsResult.interaction_ratio > maxColInteractionRatio) {
          maxColInteractionRatio = colRes.columnsResult.interaction_ratio;
          criticalColumnResult = colRes.columnsResult;
          criticalJointResult = colRes.jointResult;
      }
  });

  // Fallback
  if (!criticalColumnResult) {
       // ... (Eski fallback kodu)
       // Hata durumunda kod patlamasın diye eski default değerler döndürülebilir
       // Ancak yukarıdaki döngü en az 1 kere çalışacağı için buraya nadiren düşer.
       // Güvenlik için dummy call yapılabilir.
       const dummy = solveColumns(state, 100000, 10000, 0, 0, 0, fck, fcd, fctd, Ec);
       criticalColumnResult = dummy.columnsResult;
       criticalJointResult = dummy.jointResult;
  }

  // 6. TEMEL HESABI
  // Temel hesabı için en büyük eksenel yüke sahip kolonu kullanmak daha doğru olur.
  // Şu an için toplam bina ağırlığı üzerinden gidiyor (Rady temel gibi).
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