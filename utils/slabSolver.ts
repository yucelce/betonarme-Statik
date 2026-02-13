
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
  const { grid, sections, loads, rebars, definedElements } = state;

  // 1. GRID KOORDİNATLARINI HESAPLA (Metre cinsinden kümülatif toplam)
  const xSpacings = [0, ...grid.xAxis.map(a => a.spacing)];
  const ySpacings = [0, ...grid.yAxis.map(a => a.spacing)];
  const xCoords = xSpacings.map((_, i) => xSpacings.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const yCoords = ySpacings.map((_, i) => ySpacings.slice(0, i + 1).reduce((a, b) => a + b, 0));

  // 2. DÖŞEMELERİ FİLTRELE VE ANALİZ ET
  const slabs = definedElements.filter(e => e.type === 'slab');
  
  // Varsayılan Değerler (Hiç döşeme çizilmemişse hata vermemesi için)
  let criticalThicknessReq = 8; // Min 8 cm
  let criticalSlabId = "Genel";
  let maxPd_N_m2 = 0;
  let maxLx_net_m = 0; // Kritik kısa açıklık
  let maxLy_net_m = 0;
  let criticalRatioM = 1.0;
  let calculationReason = "Varsayılan minimum kalınlık.";

  // Global Yükler
  const g_coating_N_m2 = loads.deadLoadCoatingsKg * GRAVITY;
  
  // Eğer hiç döşeme yoksa, hayali bir 3x3m döşeme varmış gibi davran
  if (slabs.length === 0) {
      maxLx_net_m = 3.0;
      maxLy_net_m = 3.0;
      const userThick = sections.slabThickness / 100; // m
      const g_slab = userThick * 25000;
      const q_live = loads.liveLoadKg * GRAVITY;
      maxPd_N_m2 = 1.4 * (g_slab + g_coating_N_m2) + 1.6 * q_live;
      criticalThicknessReq = (3.0 * 100) / 30; // 10 cm
  } else {
      // Tüm döşemeleri gez ve en kritik olanı bul (TS500)
      slabs.forEach(slab => {
          // Koordinatları al
          const x1 = Math.min(slab.x1, slab.x2 ?? slab.x1);
          const x2 = Math.max(slab.x1, slab.x2 ?? slab.x1);
          const y1 = Math.min(slab.y1, slab.y2 ?? slab.y1);
          const y2 = Math.max(slab.y1, slab.y2 ?? slab.y1);

          // Grid sınırları kontrolü
          if (x2 >= xCoords.length || y2 >= yCoords.length) return;

          const Lx_center_m = Math.abs(xCoords[x2] - xCoords[x1]);
          const Ly_center_m = Math.abs(yCoords[y2] - yCoords[y1]);

          // Net Açıklık Hesabı (ln = L - bw)
          const beamWidth_m = sections.beamWidth / 100;
          const Lx_net = Math.max(0.1, Lx_center_m - beamWidth_m);
          const Ly_net = Math.max(0.1, Ly_center_m - beamWidth_m);

          // Kısa ve Uzun Kenar Belirleme
          const ln_short = Math.min(Lx_net, Ly_net);
          const ln_long = Math.max(Lx_net, Ly_net);
          
          // Kenar Oranı (m = Uzun / Kısa)
          const m = ln_long / ln_short;

          // TS500 Kalınlık Hesabı
          let h_req_cm = 8; // Mutlak minimum (TS500 Madde 11.4.2)
          let currentReason = "";

          if (m > 2.0) {
              // Hurdi (Tek Doğrultulu) Döşeme: h >= ln / 25
              h_req_cm = Math.max(h_req_cm, (ln_short * 100) / 25);
              currentReason = `Hurdi (m=${m.toFixed(1)} > 2.0), ln=${ln_short.toFixed(2)}m`;
          } else {
              // Dal (İki Doğrultulu) Döşeme: h >= ln / 30 (Basitleştirilmiş TS500 yaklaşımı)
              // TS500 formülü: h >= (ln / 30) * (1 - alpha/2) (Sürekli kenar oranına göre azalır)
              // Güvenli tarafta kalmak için ln/30 kullanıyoruz.
              h_req_cm = Math.max(h_req_cm, (ln_short * 100) / 30);
              currentReason = `Dal (m=${m.toFixed(1)} <= 2.0), ln=${ln_short.toFixed(2)}m`;
          }

          // Yük Hesabı
          const t_cm = slab.properties?.thickness || sections.slabThickness;
          const q_live_val = slab.properties?.liveLoad || loads.liveLoadKg;
          
          const g_slab = (t_cm / 100) * 25000;
          const q_live_N = q_live_val * GRAVITY;
          const pd_current = 1.4 * (g_slab + g_coating_N_m2) + 1.6 * q_live_N;

          // Eğer bu döşeme daha fazla kalınlık gerektiriyorsa veya yükü daha fazlaysa kritik yap
          // Öncelik: Kalınlık gereksinimi
          if (h_req_cm > criticalThicknessReq) {
              criticalThicknessReq = h_req_cm;
              criticalSlabId = slab.id;
              maxLx_net_m = ln_short;
              maxLy_net_m = ln_long;
              criticalRatioM = m;
              maxPd_N_m2 = pd_current;
              calculationReason = currentReason;
          } else if (Math.abs(h_req_cm - criticalThicknessReq) < 0.1 && pd_current > maxPd_N_m2) {
              // Kalınlık aynıysa yükü fazla olanı al
              maxPd_N_m2 = pd_current;
              criticalSlabId = slab.id;
          }
          
          // İlk atama (Eğer hiç atanmadıysa)
          if (maxPd_N_m2 === 0) maxPd_N_m2 = pd_current;
      });
  }

  // Kullanıcının seçtiği/genel kalınlık
  const userThickness = sections.slabThickness;
  
  // Ölü Yük (User Thickness üzerinden)
  const g_total_N_m2 = (userThickness / 100 * 25000) + g_coating_N_m2;
  // Hareketli Yük (Ortalama/Kritik)
  const q_live_N_m2 = (maxPd_N_m2 - 1.4 * g_total_N_m2) / 1.6;

  // --- KİRİŞLERE YÜK AKTARIMI İÇİN EŞDEĞER YÜK ---
  // Kritik olmayan ortalama bir döşeme yükü de kullanılabilir ama güvenli taraf için kritiği kullanıyoruz.
  // Üçgen yük taban değeri: (Pd * lx) / 3
  const load_triangle_base = (maxPd_N_m2 * maxLx_net_m) / 3;
  // Trapez faktörü (m oranına göre)
  const m_clamped = Math.max(1.0, criticalRatioM);
  const trapezoidal_factor = (1.5 - (0.5 / (m_clamped * m_clamped)));
  const q_eq_slab_N_m = load_triangle_base * trapezoidal_factor;

  // --- DÖŞEME DONATI HESABI (Kritik Döşeme İçin) ---
  // Moment katsayısı (alpha)
  let alpha = 0.049;
  if (criticalRatioM > 2.0) alpha = 0.083; // Tek doğrultulu
  else if (criticalRatioM <= 1.2) alpha = 0.035; // Kareye yakın

  const M_slab_Nm = alpha * maxPd_N_m2 * Math.pow(maxLx_net_m, 2);
  const M_slab_Nmm = M_slab_Nm * 1000;

  const d_slab_mm = userThickness * 10 - 20; // 20mm paspayı

  const As_req_slab = M_slab_Nmm / (0.9 * STEEL_FYD * d_slab_mm);
  const As_min_slab = 0.002 * 1000 * (userThickness * 10); // S220 için 0.002, B420C için genelde aynı veya 0.0025 olabilir
  const As_slab_design = Math.max(As_req_slab, As_min_slab);

  const rho_slab = As_slab_design / (1000 * d_slab_mm);
  
  const barAreaSlab = Math.PI * Math.pow(rebars.slabDia / 2, 2);
  // Donatı aralığı min(Hesap, 20cm, 1.5h)
  const spacingCalculated = Math.floor((barAreaSlab * 1000) / As_slab_design / 10) * 10;
  const spacingSlab = Math.min(spacingCalculated, 200, 1.5 * userThickness * 10);

  const slabResult = {
    pd: maxPd_N_m2 / 1000,
    alpha,
    d: d_slab_mm,
    m_x: M_slab_Nm / 1000,
    as_req: As_req_slab,
    as_min: As_min_slab,
    spacing: spacingSlab,
    min_thickness_calculated: criticalThicknessReq,
    min_thickness_limit: 8,
    rho: rho_slab,
    thicknessStatus: createStatus(
      userThickness >= criticalThicknessReq,
      'Uygun',
      'Kalınlık Yetersiz',
      `${criticalSlabId} için min ${criticalThicknessReq.toFixed(1)} cm`,
      `Seçilen ${userThickness}cm kalınlık, ${criticalSlabId} nolu döşemenin açıklığı (${maxLx_net_m.toFixed(2)}m) için yetersiz. (${calculationReason})`
    ),
    status: createStatus(true)
  };

  return { slabResult, q_eq_slab_N_m, pd_N_m2: maxPd_N_m2, g_total_N_m2, q_live_N_m2 };
};
