import { AppState, CalculationResult, SoilClass } from "../types";
import { 
  CONCRETE_FCD, 
  CONCRETE_DENSITY, 
  STEEL_FYD, 
  getFs, 
  CONCRETE_FCTD 
} from "../constants";

export const calculateStructure = (state: AppState): CalculationResult => {
  const { dimensions, sections, loads, seismic } = state;

  // --- 1. SLAB CALCULATIONS (TS500) ---
  // Dead Load g
  const g_slab = (dimensions.slabThickness / 100) * CONCRETE_DENSITY; // kN/m2
  const g_total = g_slab + loads.deadLoadCoatings;
  
  // Design Load Pd = 1.4g + 1.6q
  const pd = 1.4 * g_total + 1.6 * loads.liveLoad; // kN/m2

  // Moment Coefficients (Simplified Marcus/TS500 for single panel)
  // Assuming 4 edges continuous (conservative for moment, optimistic for span) 
  // actually for a single isolated frame, edges are discontinuous.
  // Coefficient for discontinuous edges ~ 0.08 to 0.11 range.
  // Let's use alpha = 0.083 (approx wl^2/12) for a single isolated slab.
  
  const ratio = Math.max(dimensions.lx, dimensions.ly) / Math.min(dimensions.lx, dimensions.ly);
  let alpha = 0.060; // rough default for two way
  if (ratio > 2.0) alpha = 0.125; // one way behavior

  const short_span = Math.min(dimensions.lx, dimensions.ly);
  
  const m_slab = alpha * pd * Math.pow(short_span, 2); // kNm/m width

  // Slab Reinforcement
  // As = M / (0.86 * fyd * d)
  const cover_slab = 20; // mm
  const d_slab = dimensions.slabThickness * 10 - cover_slab; // mm
  
  const as_req_slab = (m_slab * 1000000) / (0.9 * STEEL_FYD * d_slab); // mm2/m
  const as_req_cm2 = as_req_slab / 100; // cm2/m
  
  // Minimum Reinforcement (0.002)
  const as_min = 0.002 * 1000 * (dimensions.slabThickness * 10) / 100; // cm2/m

  // --- 2. BEAM CALCULATIONS ---
  // Load Transfer (Trapezoidal/Triangular approx as uniform equivalent)
  // Equivalent height of load ~ lx/3 or lx/4. Let's use lx/4 for 4 beams sharing.
  // W_equiv = (Pd * lx / 3) * 2 (for two triangles) ... simplified to:
  // Linear load on beam roughly: q_beam = Pd * (lx/2) * (2/3) (triangular distrib factor)
  const q_equiv_from_slab = pd * (short_span / 2); // kN/m (rough approx)
  
  const beam_self_weight = (sections.beamWidth/100) * (sections.beamDepth/100) * CONCRETE_DENSITY * 1.4;
  const wall_load = 3.0 * 1.4; // Assumed 3kN/m wall load factored
  
  const q_beam_total = q_equiv_from_slab + beam_self_weight + wall_load; // kN/m

  // Moment (Fixed-Fixed approx for frame: ql^2/12 support, ql^2/24 span)
  const beam_span = Math.max(dimensions.lx, dimensions.ly);
  const m_beam_support = (q_beam_total * Math.pow(beam_span, 2)) / 12;
  const m_beam_span = (q_beam_total * Math.pow(beam_span, 2)) / 24;

  // Beam Design (K)
  const d_beam = sections.beamDepth * 10 - 30; // mm effective depth
  const bw = sections.beamWidth * 10; // mm

  const as_beam_supp = (m_beam_support * 1000000) / (0.85 * STEEL_FYD * d_beam) / 100; // cm2
  const as_beam_bot = (m_beam_span * 1000000) / (0.9 * STEEL_FYD * d_beam) / 100; // cm2

  // Shear Vd
  const vd_beam = (q_beam_total * beam_span) / 2;
  // Vcr check (Vc = 0.65 * fctd * bw * d)
  const vc_beam = 0.8 * 0.65 * CONCRETE_FCTD * bw * d_beam / 1000; // kN
  
  let shear_reinf_text = "Minimum Etriye";
  if (vd_beam > vc_beam) {
      shear_reinf_text = "Hesap Etriyesi Gerekiyor (ø8/10)";
  } else {
      shear_reinf_text = "Min Etriye (ø8/20)";
  }

  // --- 3. SEISMIC (TBDY 2018 Simplified) ---
  const Fs = getFs(seismic.ss, seismic.soilClass);
  const Sms = seismic.ss * Fs;
  const Sds = Sms / 1.5;

  // Building Mass
  const slab_area = dimensions.lx * dimensions.ly;
  const total_dead = (g_total * slab_area) + (beam_self_weight/1.4 * 2 * (dimensions.lx + dimensions.ly)) + 4 * ((sections.colWidth/100 * sections.colDepth/100 * dimensions.h * CONCRETE_DENSITY));
  const total_live_mass = loads.liveLoad * slab_area * 0.3; // n=0.3 for residential
  const building_mass_ton = (total_dead + total_live_mass) / 9.81;
  const building_weight_kN = total_dead + total_live_mass;

  // Base Shear Vt = m * Sds * g / R (Using R=8, I=1)
  const Ra = 8;
  // Simplified Period T1 approx = 0.07 * H^(3/4)
  const T1 = 0.07 * Math.pow(dimensions.h, 0.75);
  // Spectrum Coeff (Assuming Plateau for simplified check)
  const base_shear = (building_weight_kN * Sds) / Ra; 

  // --- 4. COLUMN CALCULATIONS ---
  // Axial Load (Nd)
  // Nd ~ Total Load / 4
  const nd_col = (q_beam_total * (2*dimensions.lx + 2*dimensions.ly) / 4) + (base_shear * dimensions.h / (2 * dimensions.lx)); // Very rough overturning addition
  
  // Axial Capacity check Nmax = 0.5 * fck * Ac
  const ac = (sections.colWidth * 10) * (sections.colDepth * 10); // mm2
  const n_max = 0.4 * CONCRETE_FCD * ac / 1000; // kN (kept conservative 0.4 instead of 0.5)

  const min_rho_col = 0.01; // 1%
  const as_min_col = min_rho_col * ac / 100; // cm2
  
  const col_safe = nd_col < n_max;

  return {
    slab: {
      pd,
      m_x: m_slab,
      m_y: m_slab,
      as_x: Math.max(as_req_cm2, as_min),
      as_y: Math.max(as_req_cm2, as_min),
      min_as: as_min,
      isSafe: true // Simplified
    },
    beams: {
      load: q_beam_total,
      moment_support: m_beam_support,
      moment_span: m_beam_span,
      as_top: Math.max(as_beam_supp, 2.5), // Min 2phi12 approx
      as_bottom: Math.max(as_beam_bot, 2.5),
      shear_force: vd_beam,
      shear_reinf: shear_reinf_text,
      isSafe: m_beam_support < (0.3 * CONCRETE_FCD * bw * Math.pow(d_beam,2))/1000000 // Ductility limit check approx
    },
    columns: {
      axial_load: nd_col,
      axial_capacity: n_max,
      min_rho: 0.01,
      req_area: as_min_col,
      count_phi14: Math.ceil((as_min_col * 100) / 154), // Area of phi14 is 154mm2
      isSafe: col_safe
    },
    seismic: {
      sds: Sds,
      base_shear: base_shear,
      period: T1
    }
  };
};