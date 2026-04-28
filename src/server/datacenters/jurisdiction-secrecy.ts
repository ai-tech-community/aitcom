/**
 * Jurisdiction secrecy scores (0–100, higher = more opaque).
 *
 * Approximate, based on the Tax Justice Network Financial Secrecy Index 2022
 * with ad-hoc adjustments for jurisdictions used by AI datacenter operators.
 *
 * Used as a heuristic input to the per-facility "ownership opacity" score —
 * descriptive signal, not a judgment. Community can dispute via findings.
 */

export const JURISDICTION_SECRECY: Record<string, number> = {
  // High-secrecy
  KY: 95, // Cayman Islands
  VG: 92, // British Virgin Islands
  BM: 90, // Bermuda
  PA: 88, // Panama
  BS: 85, // Bahamas
  LI: 85, // Liechtenstein
  JE: 80, // Jersey
  GG: 80, // Guernsey
  IM: 80, // Isle of Man
  LU: 75, // Luxembourg
  AE: 73, // UAE
  SC: 73, // Seychelles
  MU: 72, // Mauritius
  CH: 70, // Switzerland
  SG: 67, // Singapore
  HK: 66, // Hong Kong
  // Moderate
  NL: 60,
  CY: 60,
  MT: 58,
  IE: 50,
  // US (Delaware-heavy holdings get +20 if known; default US=40)
  US: 40,
  GB: 45,
  CA: 35,
  AU: 30,
  // Standard EU/UK
  DE: 35,
  FR: 32,
  IT: 32,
  ES: 30,
  PL: 28,
  // Transparent
  SE: 18,
  NO: 18,
  DK: 18,
  FI: 18,
  IS: 25,
  // APAC default
  JP: 35,
  KR: 35,
  CN: 60,
  IN: 38,
  TW: 35,
  // Saudi/MENA defaults
  SA: 65,
  IL: 35,
  // LATAM defaults
  BR: 38,
  MX: 40,
  // Africa defaults
  ZA: 40,
  NG: 55,
  KE: 50,
};

export function secrecyScore(jurisdiction: string | null | undefined): number {
  if (!jurisdiction) return 50; // unknown = mid-band, not pass-through
  const code = jurisdiction.toUpperCase().trim();
  if (code in JURISDICTION_SECRECY) return JURISDICTION_SECRECY[code]!;
  // 2-letter ISO miss → guess via prefix split (e.g. "US-DE")
  const prefix = code.split("-")[0];
  if (prefix && prefix in JURISDICTION_SECRECY) {
    return JURISDICTION_SECRECY[prefix]!;
  }
  return 50;
}

/**
 * Aggregate opacity score for a facility's operator ownership chain.
 *  - Depth ≥ 3 layers: +20 (signals shell stacking)
 *  - Each jurisdiction secrecy contributes weighted by depth
 *  - Final score 0–100 (capped)
 */
export function opacityScore(
  chain: Array<{ jurisdiction: string | null | undefined }>,
): number {
  if (chain.length === 0) return 0;
  const layers = chain.length;
  const sum = chain.reduce((acc, e) => acc + secrecyScore(e.jurisdiction), 0);
  const avg = sum / layers;
  const depthBonus = layers >= 5 ? 30 : layers >= 4 ? 20 : layers >= 3 ? 10 : 0;
  return Math.min(100, Math.round(avg * 0.7 + depthBonus));
}
