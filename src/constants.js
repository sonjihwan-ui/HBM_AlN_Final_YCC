export const MATERIALS = Object.freeze({
  si:   { E: 168e9, nu: 0.28,  alpha: 2.6e-6,  kxy: 149, kz: 149, label: "Si" },
  cu:   { E: 70e9,  nu: 0.34,  alpha: 17e-6,   kxy: 401, kz: 401, label: "Cu" },
  teos: { E: 75e9,  nu: 0.17,  alpha: 0.5e-6,  kxy: 1.4, kz: 1.4, label: "TEOS" },
  sin:  { E: 250e9, nu: 0.23,  alpha: 3.0e-6,  kxy: 30,  kz: 30,  label: "SiN" },
  sicn: { E: 37e9,  nu: 0.25,  alpha: 3.0e-6,  kxy: 2.0, kz: 2.0, label: "SiCN" },
  aln:  { E: 300e9, nu: 0.245, alpha: 4.2e-6,  kxy: 200, kz: 200, label: "AlN" }
});

export const DEFAULTS = Object.freeze({
  baseSize: 11.0,
  coreSize: 10.6,
  totalDieT: 32.0,
  frontT: 2.6,
  backT: 0.7,
  frontCuPct: 25,
  frontResidualMPa: 0,
  backResidualMPa: 0,
  frontProcessC: 400,
  backProcessC: 180,
  finalC: 25,
  tsvW: 10.0,
  tsvH: 1.3,
  tsvPitchUm: 20,
  tsvDiaUm: 4.5,
  tsvOccPct: 20,
  tsvLinerTUm: 0.2,
  tsvLinerK: 1.4,
  // Universal full-circumference AlN collar around every occupied TSV in the recessed AlN-depth segment.
  // The 4.5 µm TSV diameter is treated as the effective conductive TSV envelope in this reduced-order model.
  tsvCollarOuterDiaUm: 6.0,
  tsvShape: "reference",
  tsvAspect: 7.6923076923,
  tsvSplitGap: 0.30,
  tsvShiftX: 0,
  tsvShiftY: 0,
  tsvRefC: 250,
  mechMode: "calibrated",
  w0Um: 70,
  warpSign: 1,
  alnPattern: "V1",
  alnV3Direction: "y",
  alnTopology: "T3",
  alnWidthMode: "process",
  // Final process rule: in-plane rib width = 2 × embedded AlN depth.
  alnWidthDepthRatio: 2.0,
  alnWidthUm: 2.0,
  alnStride: 5,
  alnTUm: 1.0,
  // Legacy target-volume field retained only for backward compatibility; ignored in process mode.
  alnVolPct: 0.3,
  // In final process mode, z-position is derived automatically as backside-adjacent.
  alnZ: 0.02,
  alnResidualMPa: 400,
  alnProcessC: 180,
  alnEmbeddingMode: "replacement",
  alnOffsetX: 0,
  alnOffsetY: 0,
  tsvAlnGapUm: 0,
  bankPowerW: 1.5,
  tsvPowerW: 0.5,
  includeBasePower: true,
  basePhyPowerW: 4.0,
  baseTsvPowerW: 2.0,
  ambientC: 45,
  externalRthKW: 1.25,
  thermalGrid: 61,
  mechGrid: 41,
  stackGrid: 31,
  bondTUm: 0.2,
  bondE_GPa: 70,
  bondNu: 0.23,
  bondCTE_ppm: 3.0,
  bondK: 2.0,
  // Total effective HCB inter-die thermal resistance benchmark (1.2 mm²·K/W).
  bondRarea: 1.2e-6,
  stackOrientation: "same"
});

export const STACK_COUNTS = Object.freeze([4, 8, 12, 16, 20, 24]);

// Literature-benchmark equivalent inter-die thermal resistances used only for the
// architecture comparison panel. These are area-normalized interface/standoff
// resistances, not proprietary HBM4 values and not the same-sample property as
// the +400 MPa AlN process-stress input.
export const THERMAL_ARCHITECTURE_BENCHMARKS = Object.freeze({
  microBumpUnderfillRarea: 4.2e-6, // 4.2 mm²·K/W
  hybridBondingRarea: 1.2e-6,     // 1.2 mm²·K/W
  hbmHbiReferenceReductionPct: 22.8,
  microBumpLabel: "Micro-bump + underfill",
  hybridLabel: "Hybrid bonding",
  proposedLabel: "Hybrid bonding + AlN reinforcement"
});
