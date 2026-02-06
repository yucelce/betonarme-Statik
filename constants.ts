import { SoilClass } from "./types";

// Materials: C30/37 and B420C
export const CONCRETE_FCK = 30; // MPa
export const CONCRETE_FCD = 20; // MPa (Design strength ~30/1.5)
export const CONCRETE_FCTD = 1.3; // MPa (Design tensile)
export const CONCRETE_EC = 32000; // MPa (C30 için yaklaşık Elastisite Modülü)

export const STEEL_FYK = 420; // MPa
export const STEEL_FYD = 365.2; // MPa (Design yield ~420/1.15)
export const STEEL_ES = 200000; // MPa (Çelik Elastisite)

export const CONCRETE_DENSITY = 25; // kN/m3

// TBDY 2018 Table 16.1 Local Soil Coefficients Fs (Simplified)
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