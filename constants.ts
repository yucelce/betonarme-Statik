// constants.ts
import { SoilClass, ConcreteClass } from "./types";

export const getConcreteProperties = (type: ConcreteClass) => {
  // fck: Karakteristik Basınç, fcd: Tasarım Basınç, fctd: Tasarım Çekme, Ec: Elastisite
  switch (type) {
    case ConcreteClass.C20: return { fck: 20, fcd: 13.33, fctd: 1.05, Ec: 28000 };
    case ConcreteClass.C25: return { fck: 25, fcd: 16.67, fctd: 1.20, Ec: 30000 };
    case ConcreteClass.C30: return { fck: 30, fcd: 20.00, fctd: 1.30, Ec: 32000 };
    case ConcreteClass.C35: return { fck: 35, fcd: 23.33, fctd: 1.45, Ec: 33000 };
    case ConcreteClass.C40: return { fck: 40, fcd: 26.67, fctd: 1.60, Ec: 34000 };
    case ConcreteClass.C50: return { fck: 50, fcd: 33.33, fctd: 1.90, Ec: 37000 };
    default: return { fck: 30, fcd: 20.0, fctd: 1.3, Ec: 32000 };
  }
};

export const STEEL_FYK = 420; // MPa (B420C)
export const STEEL_FYD = 365.22; // MPa (420/1.15)
export const STEEL_ES = 200000; // MPa
export const CONCRETE_DENSITY = 25; // kN/m3

// Lineer İnterpolasyon
const interpolate = (val: number, x1: number, y1: number, x2: number, y2: number) => {
  if (val <= x1) return y1;
  if (val >= x2) return y2;
  return y1 + (val - x1) * (y2 - y1) / (x2 - x1);
};

// TBDY 2018 Tablo 2.1 - Kısa Periyot Bölge Katsayısı (Fs)
export const getFs = (ss: number, soil: SoilClass): number => {
  if (soil === SoilClass.ZA) return 0.8;
  if (soil === SoilClass.ZB) return 0.9;
  
  if (soil === SoilClass.ZC) {
    // Ss <= 0.50 -> 1.3, Ss >= 1.50 -> 1.2 (Tablo 2.1)
    return interpolate(ss, 0.5, 1.3, 1.5, 1.2);
  }
  if (soil === SoilClass.ZD) {
    // Ss <= 0.25 -> 1.6, Ss >= 1.25 -> 1.0
    return interpolate(ss, 0.25, 1.6, 1.25, 1.0);
  }
  if (soil === SoilClass.ZE) {
    // Ss <= 0.25 -> 2.4, Ss >= 1.25 -> 0.9
    return interpolate(ss, 0.25, 2.4, 1.25, 0.9);
  }
  return 1.0; 
};

// TBDY 2018 Tablo 2.2 - 1.0 Saniye Periyot Bölge Katsayısı (F1)
export const getF1 = (s1: number, soil: SoilClass): number => {
  if (soil === SoilClass.ZA) return 0.8;
  if (soil === SoilClass.ZB) return 0.8;
  if (soil === SoilClass.ZC) return 1.5;
  
  if (soil === SoilClass.ZD) {
     // S1 <= 0.10 -> 2.4, S1 >= 0.60 -> 1.5 (Tablo 2.2)
    return interpolate(s1, 0.1, 2.4, 0.6, 1.5);
  }
  if (soil === SoilClass.ZE) {
     // S1 <= 0.10 -> 4.2, S1 >= 0.60 -> 2.4
    return interpolate(s1, 0.1, 4.2, 0.6, 2.4);
  }
  return 1.5;
};