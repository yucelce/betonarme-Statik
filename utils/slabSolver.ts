
import { AppState, CalculationResult, DetailedSlabResult } from "../types";
import { STEEL_FYD } from "../constants";
import { createStatus, GRAVITY, resolveElementProperties } from "./shared";

interface SlabSolverResult {
  slabResult: CalculationResult['slab']; // Özet (Kritik)
  detailedSlabs: Map<string, DetailedSlabResult>; // Detaylı Map
  q_eq_slab_N_m: number; // Kirişe aktarılan eşdeğer döşeme yükü (duvar ve zati hariç)
  pd_N_m2: number; // Tasarım yükü (Global/Kritik)
  g_total_N_m2: number; // Ölü yük toplamı
  q_live_N_m2: number; // Hareketli yük toplamı
}

export const solveSlab = (state: AppState): SlabSolverResult => {
  const { grid, sections, loads, rebars, definedElements } = state;

  const detailedSlabs = new Map<string, DetailedSlabResult>();

  // 1. GRID KOORDİNATLARINI HESAPLA (Metre cinsinden kümülatif toplam)
  const xSpacings = [0, ...grid.xAxis.map(a => a.spacing)];
  const ySpacings = [0, ...grid.yAxis.map(a => a.spacing)];
  const xCoords = xSpacings.map((_, i) => xSpacings.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const yCoords = ySpacings.map((_, i) => ySpacings.slice(0, i + 1).reduce((a, b) => a + b, 0));

  // 2. DÖŞEMELERİ FİLTRELE VE ANALİZ ET
  const slabs = definedElements.filter(e => e.type === 'slab');
  
  // Global Yükler (Varsayılan olarak ortalama bir değer)
  const g_coating_N_m2 = loads.deadLoadCoatingsKg * GRAVITY;
  
  // Kritik değerleri takip et (Özet için)
  let criticalSlabData: DetailedSlabResult | null = null;
  let maxPd_global = 0;
  let maxThicknessReq_global = 8;

  // Döşeme yoksa varsayılan değerleri ata (Çökmemesi için)
  if (slabs.length === 0) {
      maxPd_global = 1.4 * ((sections.slabThickness/100)*25000 + g_coating_N_m2) + 1.6 * (loads.liveLoadKg * GRAVITY);
  }

  slabs.forEach(slab => {
      // Koordinatları al (Grid İndeksleri)
      const x1 = Math.min(slab.x1, slab.x2 ?? slab.x1);
      const x2 = Math.max(slab.x1, slab.x2 ?? slab.x1);
      const y1 = Math.min(slab.y1, slab.y2 ?? slab.y1);
      const y2 = Math.max(slab.y1, slab.y2 ?? slab.y1);

      if (x2 >= xCoords.length || y2 >= yCoords.length) return;

      // --- TOPOLOJİK MESNET KONTROLÜ (YENİ) ---
      // Döşemenin kenarlarında kiriş veya perde var mı?
      const storyElements = definedElements.filter(e => e.storyIndex === slab.storyIndex && e.id !== slab.id);
      
      const checkSupport = (p1: {x:number, y:number}, p2: {x:number, y:number}): boolean => {
          const isHoriz = p1.y === p2.y; // Yatay Kenar Kontrolü
          
          return storyElements.some(el => {
              // 1. Kiriş Kontrolü
              if (el.type === 'beam' && el.x2 !== undefined && el.y2 !== undefined) {
                  const bx1 = Math.min(el.x1, el.x2);
                  const bx2 = Math.max(el.x1, el.x2);
                  const by1 = Math.min(el.y1, el.y2);
                  const by2 = Math.max(el.y1, el.y2);

                  if (isHoriz) {
                      // Kiriş de yatay olmalı, aynı Y ekseninde olmalı ve X aralığı örtüşmeli
                      const beamIsHoriz = by1 === by2;
                      if (!beamIsHoriz || by1 !== p1.y) return false;
                      // Kesişim Kontrolü (Grid aralıkları tam sayı olduğu için basit aralık kontrolü)
                      return Math.max(p1.x, bx1) < Math.min(p2.x, bx2);
                  } else {
                      // Dikey kenar kontrolü
                      const beamIsVert = bx1 === bx2;
                      if (!beamIsVert || bx1 !== p1.x) return false;
                      return Math.max(p1.y, by1) < Math.min(p2.y, by2);
                  }
              }
              // 2. Perde Kontrolü (Paralel Olmalı)
              if (el.type === 'shear_wall') {
                  const props = resolveElementProperties(state, el);
                  const dir = props.direction || 'x';
                  
                  if (isHoriz) {
                      // Yatay kenar için X yönündeki perde destek olabilir
                      if (dir !== 'x' || el.y1 !== p1.y) return false;
                      return el.x1 >= p1.x && el.x1 <= p2.x; // Perde kenar üzerinde mi?
                  } else {
                      // Dikey kenar için Y yönündeki perde destek olabilir
                      if (dir !== 'y' || el.x1 !== p1.x) return false;
                      return el.y1 >= p1.y && el.y1 <= p2.y;
                  }
              }
              return false;
          });
      };

      let supportedEdgeCount = 0;
      if (checkSupport({x:x1, y:y1}, {x:x2, y:y1})) supportedEdgeCount++; // Üst Kenar
      if (checkSupport({x:x1, y:y2}, {x:x2, y:y2})) supportedEdgeCount++; // Alt Kenar
      if (checkSupport({x:x1, y:y1}, {x:x1, y:y2})) supportedEdgeCount++; // Sol Kenar
      if (checkSupport({x:x2, y:y1}, {x:x2, y:y2})) supportedEdgeCount++; // Sağ Kenar

      const isSupportSafe = supportedEdgeCount >= 2;
      const supportMessage = isSupportSafe ? '' : `Yetersiz Mesnet (${supportedEdgeCount}/4)`;
      
      // --- MATEMATİKSEL HESAPLAMALAR ---

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
      let minHReason = "";

      if (m > 2.0) {
          // Hurdi (Tek Doğrultulu) Döşeme: h >= ln / 25
          const h_calc = (ln_short * 100) / 25;
          h_req_cm = Math.max(8, h_calc);
          minHReason = `Hurdi (m=${m.toFixed(1)} > 2.0), ln=${ln_short.toFixed(2)}m/25`;
      } else {
          // Dal (İki Doğrultulu) Döşeme: h >= ln / 30 (Basitleştirilmiş)
          const h_calc = (ln_short * 100) / 30;
          h_req_cm = Math.max(8, h_calc);
          minHReason = `Dal (m=${m.toFixed(1)} <= 2.0), ln=${ln_short.toFixed(2)}m/30`;
      }

      // Yük Hesabı
      const props = resolveElementProperties(state, slab);
      const t_cm = props.thickness!;
      const q_live_val = props.liveLoad!;
      
      const g_slab = (t_cm / 100) * 25000;
      const q_live_N = q_live_val * GRAVITY;
      const pd_current = 1.4 * (g_slab + g_coating_N_m2) + 1.6 * q_live_N;

      if (pd_current > maxPd_global) maxPd_global = pd_current;
      if (h_req_cm > maxThicknessReq_global) maxThicknessReq_global = h_req_cm;

      // Moment ve Donatı Hesabı
      let alpha = 0.049;
      if (m > 2.0) alpha = 0.083; // Tek doğrultulu
      else if (m <= 1.2) alpha = 0.035; // Kareye yakın

      const M_slab_Nm = alpha * pd_current * Math.pow(ln_short, 2);
      const M_slab_Nmm = M_slab_Nm * 1000;
      const d_slab_mm = t_cm * 10 - 20; // 20mm paspayı

      const As_req_slab = M_slab_Nmm / (0.9 * STEEL_FYD * d_slab_mm);
      const As_min_slab = 0.002 * 1000 * (t_cm * 10); 
      
      const reinforcementType = t_cm >= 15 ? 'Çift Kat' : 'Tek Kat';

      const result: DetailedSlabResult = {
          id: slab.id,
          thickness: t_cm,
          minThickness: h_req_cm,
          axis_long: ln_long,
          axis_short: ln_short,
          ratio_m: m,
          load_design_pd: pd_current / 1000, // kN/m2
          moment_design: M_slab_Nm / 1000, // kNm
          as_req: As_req_slab,
          as_min: As_min_slab,
          reinforcement_type: reinforcementType,
          checks: {
              thickness: createStatus(
                  (t_cm >= h_req_cm) && isSupportSafe, // Hem kalınlık hem mesnet yeterli olmalı
                  `Uygun (${minHReason})`,
                  !isSupportSafe ? 'Yetersiz Mesnetlenme' : `Yetersiz (Min ${h_req_cm.toFixed(1)}cm)`,
                  !isSupportSafe 
                    ? 'Döşeme kenarlarında kiriş/perde eksik.' 
                    : `Gereken: ${h_req_cm.toFixed(1)}cm, Mevcut: ${t_cm}cm`
              ),
              doubleLayer: createStatus(
                  (t_cm < 15) || (t_cm >= 15), // Bilgi amaçlı, her zaman true ama mesaj önemli
                  t_cm >= 15 ? 'Çift Kat Donatı Gerekir (h≥15cm)' : 'Tek Kat Donatı Yeterli',
                  '',
                  t_cm >= 15 ? 'Kalın döşemelerde büzülme ve sıcaklık için çift kat hasır önerilir.' : undefined
              )
          }
      };

      detailedSlabs.set(slab.id, result);

      // Kritik döşemeyi güncelle (Kalınlık ihtiyacına göre)
      if (!criticalSlabData || h_req_cm > criticalSlabData.minThickness) {
          criticalSlabData = result;
      }
  });

  // Kullanıcının genel seçtiği kalınlık üzerinden genel yükler (Kiriş yük dağıtımı için)
  const userThickness = sections.slabThickness;
  const g_total_N_m2 = (userThickness / 100 * 25000) + g_coating_N_m2;
  const q_live_N_m2 = (maxPd_global - 1.4 * g_total_N_m2) / 1.6;

  // Trapez yük faktörü (Ortalama bir m değeri kabul edelim veya güvenli taraf 1.0 alalım)
  const q_eq_slab_N_m = (maxPd_global * 3.0) / 3; // Basit yaklaşım, detaylı yük dağıtımı solver.ts'de yapılıyor zaten.

  // Eğer hiç döşeme yoksa dummy bir result oluştur
  if (!criticalSlabData) {
      criticalSlabData = {
          id: 'Dummy', thickness: 15, minThickness: 8, axis_long: 3, axis_short: 3, ratio_m: 1, 
          load_design_pd: 10, moment_design: 5, as_req: 200, as_min: 200, reinforcement_type: 'Tek Kat',
          checks: { thickness: createStatus(true), doubleLayer: createStatus(true) }
      };
  }

  // Özet Result (Eski yapı ile uyumluluk için)
  const barAreaSlab = Math.PI * Math.pow(rebars.slabDia / 2, 2);
  const spacingCalculated = Math.floor((barAreaSlab * 1000) / Math.max(criticalSlabData.as_req, criticalSlabData.as_min) / 10) * 10;
  const spacingSlab = Math.min(spacingCalculated, 200, 1.5 * criticalSlabData.thickness * 10);

  const slabResult = {
    pd: maxPd_global / 1000,
    alpha: 0.049, // Yaklaşık
    d: criticalSlabData.thickness * 10 - 20,
    m_x: criticalSlabData.moment_design,
    as_req: criticalSlabData.as_req,
    as_min: criticalSlabData.as_min,
    spacing: spacingSlab,
    min_thickness_calculated: criticalSlabData.minThickness,
    min_thickness_limit: 8,
    rho: 0.002,
    thicknessStatus: criticalSlabData.checks.thickness,
    status: createStatus(true)
  };

  return { slabResult, detailedSlabs, q_eq_slab_N_m, pd_N_m2: maxPd_global, g_total_N_m2, q_live_N_m2 };
};
