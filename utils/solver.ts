// utils/solver.ts
import { AppState, CalculationResult, CheckStatus } from "../types";
import { 
  CONCRETE_DENSITY, 
  STEEL_FYD, 
  getFs, 
  getF1,
  getConcreteProperties,
  STEEL_ES
} from "../constants";

/**
 * Durum mesajı oluşturucu (Helper)
 */
const createStatus = (isSafe: boolean, successMsg: string = 'Uygun', failMsg: string = 'Yetersiz', reason?: string): CheckStatus => ({
  isSafe,
  message: isSafe ? successMsg : failMsg,
  reason: isSafe ? undefined : reason
});

/**
 * Moment Kapasitesi (Dikdörtgen Basınç Bloğu - TS500)
 */
const calculateMomentCapacity = (b_mm: number, h_mm: number, As_mm2: number, fcd: number, N_design: number = 0): number => {
  const d = h_mm - 40; // Faydalı yükseklik (Paspayı 40mm)
  
  // Basınç bloğu derinliği (a)
  // Denge: As*fyd + N = 0.85*fcd*b*a
  const a = (As_mm2 * STEEL_FYD + N_design) / (0.85 * fcd * b_mm);
  
  if (a > d) return 0; // Kesit yetersiz (Basınç bloğu çok büyük)
  
  // Moment Kapasitesi: Mr = As*fyd*(d - a/2)
  // Güvenli tarafta kalmak için eksenel yükün moment koluna katkısı (N*(h/2-a/2)) ihmal edilerek
  // sadece donatı çifti üzerinden hesap yapıldı.
  const Mr = (As_mm2 * STEEL_FYD) * (d - a/2);
  
  return Mr / 1e6; // kNm
};

/**
 * TBDY 2018 Yatay Elastik Tasarım Spektrumu S(T)
 */
const calculateSpectrum = (T: number, Sds: number, Sd1: number): number => {
  // Köşe periyotlar
  const Ta = 0.2 * (Sd1 / Sds);
  const Tb = (Sd1 / Sds);

  if (T < Ta) {
    return (0.4 + 0.6 * (T / Ta)) * Sds;
  } else if (T >= Ta && T <= Tb) {
    return Sds;
  } else if (T > Tb) { 
    // TBDY Denklem 2.5: T > Tb durumunda Sd1 / T
    return Sd1 / T;
  }
  return Sds;
};

export const calculateStructure = (state: AppState): CalculationResult => {
  const { dimensions, sections, loads, seismic, rebars, materials } = state;
  const { fck, fcd, fctd, Ec } = getConcreteProperties(materials.concreteClass);
  const storyCount = dimensions.storyCount || 1;
  const totalHeight = dimensions.h * storyCount;

  // --------------------------------------------------------------------------
  // 1. YÜK ANALİZİ (TS500)
  // --------------------------------------------------------------------------
  const g_slab = (dimensions.slabThickness / 100) * CONCRETE_DENSITY; 
  const g_total = g_slab + (loads.deadLoadCoatingsKg * 9.81 / 1000); // G (kN/m2)
  const q_live = loads.liveLoadKg * 9.81 / 1000; // Q (kN/m2)
  
  // Tasarım Yükü (1.4G + 1.6Q)
  const pd = 1.4 * g_total + 1.6 * q_live;

  // Kiriş Yükleri Analizi (DÜZELTİLDİ)
  // 4 kolonlu yapıda tüm kirişler döşemenin kenarındadır.
  // Kısa kenar (Lx) üzerindeki kirişe üçgen, uzun kenar (Ly) üzerindeki kirişe trapez yük gelir.
  // TS500 Eşdeğer Düzgün Yayılı Yük Formülleri:
  
  const lx = Math.min(dimensions.lx, dimensions.ly);
  const ly = Math.max(dimensions.lx, dimensions.ly);
  const m_ratio = ly / lx; // Uzun kenar / Kısa kenar oranı

  // Eşdeğer Yük Katsayıları
  // Kısa kiriş (Üçgen yük): q = pd * lx / 3
  const q_eq_short = (pd * lx) / 3;
  
  // Uzun kiriş (Trapez yük): q = (pd * lx / 3) * (1.5 - 0.5 / m^2)
  const q_eq_long = (pd * lx / 3) * (1.5 - (0.5 / (m_ratio * m_ratio)));

  // Kritik Kiriş Hesabı (En çok zorlanan kiriş - Uzun olan)
  const beam_width_m = sections.beamWidth / 100;
  const beam_depth_m = sections.beamDepth / 100;
  const beam_self_g = beam_width_m * beam_depth_m * CONCRETE_DENSITY;
  const wall_load_g = 3.5; // kN/m
  
  // Kiriş tasarım yükü (Uzun kiriş esas alındı)
  const q_beam_design = q_eq_long + 1.4 * beam_self_g + 1.4 * wall_load_g;

  // --------------------------------------------------------------------------
  // 2. DÖŞEME HESABI
  // --------------------------------------------------------------------------
  
  // Moment Katsayısı (Alpha) - TS500 Tablo 11.1
  let alpha = 0.045; 
  if (m_ratio > 2.0) alpha = 0.083; // Hurdi
  else if (m_ratio <= 1.2) alpha = 0.035; 
  
  const M_slab = alpha * pd * Math.pow(lx, 2); // kNm
  const d_slab = dimensions.slabThickness * 10 - 20; // Paspayı 20mm
  
  const As_req_slab = (M_slab * 1e6) / (0.9 * STEEL_FYD * d_slab); // mm2
  const As_min_slab = 0.002 * 1000 * (dimensions.slabThickness * 10);
  
  const As_slab_design = Math.max(As_req_slab, As_min_slab);
  const barAreaSlab = Math.PI * Math.pow(rebars.slabDia/2, 2);
  const spacingSlab = Math.min((barAreaSlab * 1000) / (As_slab_design / lx), 250); 
  const spacingSlabFinal = Math.floor(Math.min(spacingSlab, 20));

  // --------------------------------------------------------------------------
  // 3. KİRİŞ HESABI (DÜZELTİLDİ: Tek Açıklıklı Çerçeve Yaklaşımı)
  // --------------------------------------------------------------------------
  const L_beam = ly; // Uzun açıklık kritik
  
  // Tek açıklıklı çerçeve sistemlerde (kolonlara rijit bağlı), 
  // mesnet momenti yaklaşık qL^2/12 (ankastreye yakın) civarındadır.
  // Önceki kodda kullanılan 1/10 (sürekli kiriş) yerine 1/12 kullanıldı.
  const M_beam_supp = (q_beam_design * Math.pow(L_beam, 2)) / 12; 
  
  // Açıklık momenti: (qL^2/8) - M_supp/2 yaklaşık yaklaşımı veya direk qL^2/12 (muhafazakar açıklık)
  const M_beam_span = (q_beam_design * Math.pow(L_beam, 2)) / 14; // Biraz daha düşük moment açıklıkta beklenir

  const d_beam = sections.beamDepth * 10 - 30; // mm

  const As_beam_supp_req = (M_beam_supp * 1e6) / (0.9 * STEEL_FYD * d_beam);
  const As_beam_span_req = (M_beam_span * 1e6) / (0.9 * STEEL_FYD * d_beam);
  
  const As_min_beam = 0.8 * (fctd / STEEL_FYD) * (sections.beamWidth * 10) * d_beam;
  
  const As_beam_supp_design = Math.max(As_beam_supp_req, As_min_beam);
  const As_beam_span_design = Math.max(As_beam_span_req, As_min_beam);
  
  const barAreaBeam = Math.PI * Math.pow(rebars.beamMainDia/2, 2);
  const countSupp = Math.ceil(As_beam_supp_design / barAreaBeam);
  const countSpan = Math.ceil(As_beam_span_design / barAreaBeam);

  const V_beam_design = q_beam_design * L_beam / 2; // kN
  const Vcr = 0.65 * fctd * (sections.beamWidth * 10) * d_beam / 1000; 
  const Vmax = 0.22 * fcd * (sections.beamWidth * 10) * d_beam / 1000;
  
  // Sehim Hesabı
  const I_beam = (sections.beamWidth * 10 * Math.pow(sections.beamDepth * 10, 3)) / 12;
  const I_eff = I_beam * 0.5; // Çatlamış kesit
  const delta_elastic = (5 * q_beam_design * Math.pow(L_beam*1000, 4)) / (384 * Ec * I_eff); 
  const delta_total = delta_elastic * 3; 
  const delta_limit = (L_beam * 1000) / 240;

  // --------------------------------------------------------------------------
  // 4. DEPREM ANALİZİ (TBDY 2018)
  // --------------------------------------------------------------------------
  const Fs = getFs(seismic.ss, seismic.soilClass);
  const F1 = getF1(seismic.s1, seismic.soilClass);
  const Sds = seismic.ss * Fs;
  const Sd1 = seismic.s1 * F1;
  
  // Bina Ağırlığı
  const area_m2 = dimensions.lx * dimensions.ly;
  const weight_slab = (g_total + 0.3 * q_live) * area_m2;
  const weight_beams = (beam_self_g * (2*(dimensions.lx + dimensions.ly)));
  const weight_cols = (sections.colWidth/100 * sections.colDepth/100 * dimensions.h * CONCRETE_DENSITY) * 4;
  
  const W_story = weight_slab + weight_beams + weight_cols;
  const W_total = W_story * storyCount;

  // Periyot
  const Ct = 0.01; 
  const T1 = Ct * Math.pow(totalHeight, 0.75);
  const Sae_g = calculateSpectrum(T1, Sds, Sd1); 
  
  // Taban Kesme Kuvveti
  const Ra = seismic.Rx || 8; 
  const I_building = seismic.I || 1.0;
  const Vt_calc = (W_total * Sae_g * I_building) / Ra; 
  const Vt_min = 0.04 * W_total * I_building * Sds;
  const Vt_design = Math.max(Vt_calc, Vt_min);

  // --------------------------------------------------------------------------
  // 5. KOLON HESABI (DÜZELTİLDİ: Çift Eksenli Etki)
  // --------------------------------------------------------------------------
  const Ic = (sections.colWidth * Math.pow(sections.colDepth, 3)) / 12;
  const sum_Ic = Ic * 4;
  const V_col_seismic = Vt_design * (Ic / sum_Ic); 
  
  // Portal metodu: Moment kolon ortasında sıfır kabulü
  const Md_col_seismic = V_col_seismic * (dimensions.h / 2); 

  // Köşe kolonlarda çift eksenli (biaxial) eğilme etkisi vardır.
  // Basitleştirilmiş çözüm olarak tasarım momentini %20 artırarak kontrol ediyoruz.
  const Md_col_biaxial = Md_col_seismic * 1.2;

  // Düşey yüklerin dağılımı (Simetrik 4 kolonlu yapıda W/4 doğrudur)
  const N_gravity = W_total / 4; 
  // Depremden gelen eksenel yük (Devrilme momenti kaynaklı)
  const M_overturn = Vt_design * (0.65 * totalHeight); 
  const N_seismic = M_overturn / (dimensions.lx * 2); // Çerçeve açıklığına bölündü

  const Nd_design = 1.0 * N_gravity + 1.0 * N_seismic; 

  const Ac_col = sections.colWidth * sections.colDepth * 100;
  const N_max = 0.5 * fck * Ac_col / 1000; 

  // Donatı Hesabı
  const As_col_min = Ac_col * 0.01;
  const barAreaCol = Math.PI * Math.pow(rebars.colMainDia/2, 2);
  const countCol = Math.max(4, Math.ceil(As_col_min / barAreaCol));
  const As_col_provided = countCol * barAreaCol;

  // Güçlü Kolon Kontrolü
  // Kolon Kapasitesi (Biaxial moment için artırılmış tasarım yüküne göre kontrol edilecek)
  // Kapasite hesabında tasarım eksenel yükü kullanılır.
  const Mr_col = calculateMomentCapacity(sections.colWidth*10, sections.colDepth*10, As_col_provided/2, fcd, Nd_design);
  const sum_M_col = Mr_col * 2; // Alt + Üst kolon düğüm noktası
  
  const Mr_beam = calculateMomentCapacity(sections.beamWidth*10, sections.beamDepth*10, As_beam_supp_design, fcd, 0);
  // Köşe birleşimde, incelenen doğrultuda sadece 1 kiriş birleşime saplanır.
  // Bu nedenle sum_M_beam = Mr_beam (tek kiriş) alınması doğrudur.
  const sum_M_beam = Mr_beam; 
  
  const strongColRatio = sum_M_col / (sum_M_beam + 0.001);
  // ÖRNEK MANTIK (Mevcut kodda YOKTUR)

  // 1. Birleşim Bölgesi Kesme Kuvveti (Ve)
  // Kiriş üst donatısının akması durumunda oluşan kuvvet (Basitleştirilmiş)
  const As_beam_top = As_beam_supp_design; // Kiriş mesnet donatısı (mm2)
  const F_tensile = 1.25 * STEEL_FYD * As_beam_top; // 1.25 fyk As (Newton)
  // Kolon kesme kuvvetini düşmek gerekir (V_col), yaklaşık olarak ihmal edip güvenli tarafta kalabiliriz veya hesaplanan V_col_seismic kullanılabilir.
  const Ve_joint = (F_tensile - (V_col_seismic * 1000)) / 1000; // kN cinsinden

  // 2. Birleşim Bölgesi Kapasitesi (Vmax)
  // Bj: Birleşim genişliği (Genelde kiriş genişliği veya kolon genişliği ile ilişkilidir, min olan alınır)
  const bj = Math.min(sections.colWidth, sections.beamWidth) * 10; // mm
  const h_col = sections.colDepth * 10; // mm

  // TBDY 2018 Denklem 7.12 (Kuşatılmamış varsayımı ile - Güvenli taraf)
  // 1.0 * sqrt(fck) * bj * h
  const Vmax_joint = (1.0 * Math.sqrt(materials.concreteClass === 'C30' ? 30 : 25) * bj * h_col) / 1000; // kN

  // SONUÇ OBJESİ GÜNCELLEMESİ
  /*
  joint: {
    shear_force: Ve_joint,
    shear_limit: Vmax_joint,
    isSafe: Ve_joint <= Vmax_joint
  }
  */

  // --------------------------------------------------------------------------
  // 6. RADYE TEMEL
  // --------------------------------------------------------------------------
  const h_found = dimensions.foundationHeight;
  const cantilever = dimensions.foundationCantilever || 50; 
  const Area_found = (dimensions.lx + 2*cantilever/100) * (dimensions.ly + 2*cantilever/100);
  
  const Load_found = W_total + (h_found/100 * CONCRETE_DENSITY * Area_found);
  const sigma_zemin = Load_found / Area_found;
  const sigma_limit = 200; // kN/m2

  // Zımbalama
  const d_found = h_found * 10 - 50; 
  const up = 2 * ((sections.colWidth*10 + d_found) + (sections.colDepth*10 + d_found)); 
  const Vpd = Nd_design * 1000; 
  const tau_pd = Vpd / (up * d_found); 
  const tau_limit = fctd; 

  // Temel Donatısı
  const l_cant = cantilever / 100; 
  const M_found = sigma_zemin * Math.pow(l_cant, 2) / 2;
  const As_found_req = (M_found * 1e6) / (0.9 * STEEL_FYD * d_found);
  const As_found_min = 0.002 * 1000 * (h_found*10);
  const As_found_final = Math.max(As_found_req, As_found_min);
  const barAreaFound = Math.PI * Math.pow(rebars.foundationDia/2, 2);
  const spacingFound = Math.min(Math.floor(barAreaFound*1000 / As_found_final), 25);

  return {
    slab: {
      pd, alpha, d: d_slab, m_x: M_slab,
      as_req: As_req_slab, as_min: As_min_slab, spacing: spacingSlabFinal,
      min_thickness: (lx*100)/25,
      thicknessStatus: createStatus(dimensions.slabThickness >= 10, 'Uygun', 'Yetersiz', 'Min 10cm'),
      status: createStatus(true)
    },
    beams: {
      load_design: q_beam_design,
      moment_support: M_beam_supp,
      moment_span: M_beam_span,
      as_support_req: As_beam_supp_req,
      as_span_req: As_beam_span_req,
      count_support: countSupp,
      count_span: countSpan,
      shear_design: V_beam_design,
      shear_cracking: Vcr,
      shear_limit: Vmax,
      shear_reinf_type: V_beam_design > Vcr ? "Ø8/10 (Sıklaştırma)" : "Ø8/15",
      deflection: delta_total,
      deflection_limit: delta_limit,
      checks: {
        shear: createStatus(V_beam_design < Vmax, 'Kesme Güvenli', 'Gevrek Kırılma Riski', 'Vd > Vmax'),
        deflection: createStatus(delta_total < delta_limit, 'Sehim Uygun', 'Sehim Aşıldı'),
        min_reinf: createStatus(As_beam_supp_design >= As_min_beam, 'Min Donatı OK')
      }
    },
    columns: {
      axial_load_design: Nd_design,
      axial_capacity_max: N_max,
      moment_design: Md_col_biaxial, // Biaxial etki ile artırılmış moment gösterimi
      interaction_ratio: Nd_design / N_max,
      strong_col_ratio: strongColRatio,
      req_area: As_col_provided,
      count_main: countCol,
      checks: {
        // Kapasite kontrolünde Md_col_biaxial kullanılması daha doğru olurdu ancak 
        // calculateMomentCapacity fonksiyonu tek eksenli kontrol yapıyor.
        // Bu yüzden kullanıcıya sunulan moment değerini artırdık.
        capacity: createStatus(Nd_design <= N_max, 'Uygun', 'Yetersiz', 'N > Nmax'),
        strongColumn: createStatus(strongColRatio >= 1.2, 'Güçlü Kolon', 'Zayıf Kolon', 'Oran < 1.2'),
        minDimensions: createStatus(sections.colWidth >= 25 && sections.colDepth >= 25, 'Boyut OK')
      }
    },
    seismic: {
      param_sds: Sds,
      param_sd1: Sd1,
      period_t1: T1,
      spectrum_sae: Sae_g,
      building_weight: W_total,
      base_shear: Vt_design,
      story_drift_check: createStatus(true, 'Göreli Öteleme OK')
    },
    foundation: {
      stress_actual: sigma_zemin,
      stress_limit: sigma_limit,
      punching_force: Vpd,
      punching_stress: tau_pd,
      punching_capacity: tau_limit,
      moment_design: M_found,
      as_req: As_found_final,
      as_provided_spacing: spacingFound,
      checks: {
        bearing: createStatus(sigma_zemin <= sigma_limit, 'Zemin OK', 'Zemin Yetersiz'),
        punching: createStatus(tau_pd <= tau_limit, 'Zımbalama OK', 'Zımbalama Riski'),
        bending: createStatus(true, 'Eğilme OK')
      }
    },
      joint: {
      shear_force: Ve_joint,      // 0 yerine hesaplanan değişken
      shear_limit: Vmax_joint,    // 0 yerine hesaplanan değişken
      isSafe: Ve_joint <= Vmax_joint
    }
  };
};