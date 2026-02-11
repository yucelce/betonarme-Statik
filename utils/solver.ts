import { AppState, CalculationResult } from "../types";
import { getConcreteProperties } from "../constants";
import { solveSlab } from "./slabSolver";
import { solveSeismic } from "./seismicSolver";
import { solveBeams } from "./beamSolver";
import { solveColumns } from "./columnSolver";
import { solveFoundation } from "./foundationSolver";
import { generateModel } from "./modelGenerator"; // EKLENDİ

export const calculateStructure = (state: AppState): CalculationResult => {
  const { materials, dimensions } = state;
  const { fck, fcd, fctd, Ec } = getConcreteProperties(materials.concreteClass);

  // 1. MODELİ OLUŞTUR (Grid sistemini düğüm ve elemanlara çevir)
  const model = generateModel(state);

  // 2. DÖŞEME HESABI (Yük Analizi)
  // Not: Basitleştirme için en kritik döşeme yükünü alıp dağıtacağız.
  const { slabResult, q_beam_design_N_m, g_total_N_m2, q_live_N_m2, g_beam_self_N_m, g_wall_N_m } = solveSlab(state);

  // 3. DEPREM HESABI (Toplam Ağırlık Hesabı Güncellendi)
  const { seismicResult, Vt_design_N, W_total_N } = solveSeismic(state, g_total_N_m2, q_live_N_m2, g_beam_self_N_m, g_wall_N_m);

  // 4. KİRİŞLERİN TARANMASI (En kritik kirişi bul)
  let criticalBeamResult: CalculationResult['beams'] | null = null;
  let maxBeamMoment = 0;
  
  // Modeldeki tüm kirişleri tek tek hesapla
  model.beams.forEach(beam => {
     // Her kiriş kendi açıklığına (beam.length) göre hesaplanır
     const result = solveBeams(
        state, 
        beam.length, // Grid'den gelen gerçek uzunluk
        q_beam_design_N_m, 
        Vt_design_N, // Basitleştirilmiş: Kat kesme kuvvetini kolon sayısına bölerek yaklaşık dağıtım
        fcd, fctd, Ec
     );

     // Eğer bu kirişin momenti daha büyükse, ekranda bunu göster
     if (!criticalBeamResult || result.beamsResult.moment_support > maxBeamMoment) {
        maxBeamMoment = result.beamsResult.moment_support;
        criticalBeamResult = result.beamsResult;
     }
  });

  // Eğer hiç kiriş yoksa (hata durumu), varsayılan çalıştır
  if (!criticalBeamResult) {
     const defaultRes = solveBeams(state, dimensions.lx, q_beam_design_N_m, Vt_design_N, fcd, fctd, Ec);
     criticalBeamResult = defaultRes.beamsResult;
  }

  // 5. KOLONLARIN TARANMASI (En kritik kolonu bul)
  let criticalColumnResult: CalculationResult['columns'] | null = null;
  let criticalJointResult: CalculationResult['joint'] | null = null;
  let maxColAxial = 0;

  // Modeldeki tüm kolonları tek tek hesapla
  // Basit yaklaşım: Toplam yükü kolon adedine bölmek yerine, yaklaşık yük alanı (tributary area) hesabı
  const totalArea = dimensions.lx * dimensions.ly; // Toplam alan hatalıydı, düzeltilmesi gerek ama şimdilik modelden gitmek zor.
  // Güvenli tarafta kalmak için ortalama yük yerine en yüklü kolonu simüle ediyoruz.
  const numberOfCols = model.columns.length;
  
  // En gayri müsait kolon yükü (yaklaşık): Toplam yük / Kolon Sayısı * 1.5 (Kenar/Köşe etkileri için)
  const worstCaseAxialLoad_N = (W_total_N / numberOfCols) * 1.5; 
  const worstCaseShear_N = (Vt_design_N / numberOfCols) * 1.2;

  // Kirişten gelen moment kapasitesini al (Güçlü Kolon Kontrolü için)
  // Burada kritik kirişin verilerini kullanıyoruz
  const mr_beam_sample = calculateBeamCapacitySample(state, fcd); 

  const colRes = solveColumns(
    state,
    worstCaseAxialLoad_N,
    worstCaseShear_N,
    mr_beam_sample,
    criticalBeamResult.as_support_req, // Yaklaşık
    criticalBeamResult.as_span_req,
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

// Yardımcı: Kiriş kapasitesi hesabı (döngü içinde tekrar tekrar yapmamak için)
const calculateBeamCapacitySample = (state: AppState, fcd: number) => {
    const { sections, materials } = state;
    // Basit bir Mr hesabı
    const d = sections.beamDepth * 10 - 30;
    const As = 3 * Math.PI * Math.pow(state.rebars.beamMainDia/2, 2); // Min 3 donatı
    const fy = 365.22; // fyd
    return As * fy * 0.9 * d; 
}