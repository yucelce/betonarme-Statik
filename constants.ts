import { SoilClass, ConcreteClass } from "./types";

// Malzeme Özellikleri Fonksiyonu
export const getConcreteProperties = (type: ConcreteClass) => {
  // fck: Karakteristik, fcd: Tasarım (fck/1.5), fctd: Tasarım Çekme, Ec: Elastisite
  switch (type) {
    case ConcreteClass.C20: return { fck: 20, fcd: 13.3, fctd: 1.0, Ec: 28000 };
    case ConcreteClass.C25: return { fck: 25, fcd: 16.7, fctd: 1.2, Ec: 30000 };
    case ConcreteClass.C30: return { fck: 30, fcd: 20.0, fctd: 1.3, Ec: 32000 };
    case ConcreteClass.C35: return { fck: 35, fcd: 23.3, fctd: 1.5, Ec: 34000 };
    case ConcreteClass.C40: return { fck: 40, fcd: 26.7, fctd: 1.6, Ec: 36000 };
    case ConcreteClass.C50: return { fck: 50, fcd: 33.3, fctd: 1.9, Ec: 37000 };
    default: return { fck: 30, fcd: 20.0, fctd: 1.3, Ec: 32000 };
  }
};

export const STEEL_FYK = 420; // MPa
export const STEEL_FYD = 365.2; // MPa (Design yield ~420/1.15)
export const STEEL_ES = 200000; // MPa (Çelik Elastisite)
export const CONCRETE_DENSITY = 25; // kN/m3

// TBDY 2018 Zemin Katsayıları
export const getFs = (ss: number, soil: SoilClass): number => {
  if (soil === SoilClass.ZA) return 0.8;
  if (soil === SoilClass.ZB) return 0.9;
  
  if (soil === SoilClass.ZC) {
    if (ss <= 0.25) return 1.3;
    if (ss >= 1.25) return 1.2; 
    return 1.25; 
  }
  if (soil === SoilClass.ZD) {
    if (ss <= 0.25) return 1.6;
    if (ss >= 1.25) return 1.0;
    return 1.2; 
  }
  if (soil === SoilClass.ZE) {
    if (ss <= 0.25) return 2.4;
    if (ss >= 1.25) return 0.9;
    return 1.3; 
  }
  return 1.0;
};