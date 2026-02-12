
import { AppState, CalculationResult } from "../types";
import { STEEL_FYD } from "../constants";
import { createStatus, GRAVITY } from "./shared";

interface SlabSolverResult {
  slabResult: CalculationResult['slab'];
  q_eq_slab_N_m: number; // Kirişe aktarılan eşdeğer döşeme yükü (duvar ve zati hariç)
  pd_N_m2: number; // Tasarım yükü (Global/Kritik)
  g_total_N_m2: number; // Ölü yük toplamı
  q_live_N_m2: number; // Hareketli yük toplamı
}

export const solveSlab = (state: AppState): SlabSolverResult => {
  const { dimensions, loads, rebars, sections, definedElements } = state;

  const lx_m = Math.min(dimensions.lx, dimensions.ly);
  const ly_m = Math.max(dimensions.lx, dimensions.ly);
  const m_ratio = ly_m / lx_m;

  // Kritik Döşemeyi Bul (En büyük kalınlık veya yük)
  // Varsayılan global değerler
  let criticalThickness = sections.slabThickness;
  let criticalLiveLoad = loads.liveLoadKg;
  
  // Eğer tanımlı döşemeler varsa, en gayri müsait olanı referans alalım (Rapor için)
  const slabs = definedElements.filter(e => e.type === 'slab');
  if (slabs.length > 0) {
      slabs.forEach(s => {
          if (s.properties?.thickness && s.properties.thickness > criticalThickness) {
              criticalThickness = s.properties.thickness;
          }
          if (s.properties?.liveLoad && s.properties.liveLoad > criticalLiveLoad) {
              criticalLiveLoad = s.properties.liveLoad;
          }
      });
  }

  // 1. YÜK ANALİZİ
  const h_slab_m = criticalThickness / 100;
  const g_slab_N_m2 = h_slab_m * 25000;
  const g_coating_N_m2 = loads.deadLoadCoatingsKg * GRAVITY;
  const q_live_N_m2 = criticalLiveLoad * GRAVITY;
  
  const g_total_N_m2 = g_slab_N_m2 + g_coating_N_m2;
  const pd_N_m2 = 1.4 * g_total_N_m2 + 1.6 * q_live_N_m2;

  // Kiriş Yükleri (N/m) - Döşemeden gelen üçgen/trapez yükün eşdeğeri
  const load_triangle_base = (pd_N_m2 * lx_m) / 3;
  const trapezoidal_factor = (1.5 - (0.5 / (m_ratio * m_ratio)));
  const q_eq_slab_N_m = load_triangle_base * trapezoidal_factor;

  // NOT: Kiriş zati ağırlığı ve duvar yükü artık burada eklenmiyor.
  // Bu değerler solver.ts içinde her kiriş için özel olarak hesaplanacak.

  // 2. DÖŞEME HESABI (Betonarme)
  let alpha = 0.049;
  if (m_ratio > 2.0) alpha = 0.083;
  else if (m_ratio <= 1.2) alpha = 0.035;

  const M_slab_Nm = alpha * pd_N_m2 * Math.pow(lx_m, 2);
  const M_slab_Nmm = M_slab_Nm * 1000;

  const d_slab_mm = criticalThickness * 10 - 20;

  const As_req_slab = M_slab_Nmm / (0.9 * STEEL_FYD * d_slab_mm);
  const As_min_slab = 0.002 * 1000 * (criticalThickness * 10);
  const As_slab_design = Math.max(As_req_slab, As_min_slab);

  const rho_slab = As_slab_design / (1000 * d_slab_mm);
  const ln_slab_cm = Math.min(dimensions.lx, dimensions.ly) * 100;
  const min_thick_calc = ln_slab_cm / 30;
  const min_thick_limit = 8;

  const barAreaSlab = Math.PI * Math.pow(rebars.slabDia / 2, 2);
  const spacingSlab = Math.floor(Math.min((barAreaSlab * 1000) / As_slab_design, 200) / 10) * 10;

  const slabResult = {
    pd: pd_N_m2 / 1000,
    alpha,
    d: d_slab_mm,
    m_x: M_slab_Nm / 1000,
    as_req: As_req_slab,
    as_min: As_min_slab,
    spacing: spacingSlab,
    min_thickness_calculated: min_thick_calc,
    min_thickness_limit: min_thick_limit,
    rho: rho_slab,
    thicknessStatus: createStatus(
      criticalThickness >= min_thick_calc && criticalThickness >= min_thick_limit,
      'Uygun',
      'Kalınlık Yetersiz',
      `Gereken: ${Math.max(min_thick_calc, min_thick_limit).toFixed(1)} cm`
    ),
    status: createStatus(true)
  };

  return { slabResult, q_eq_slab_N_m, pd_N_m2, g_total_N_m2, q_live_N_m2 };
};
