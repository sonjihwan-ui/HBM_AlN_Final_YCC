import { DEFAULTS } from "./constants.js";

export function makeDefaultConfig(overrides = {}) {
  return sanitizeConfig({ ...DEFAULTS, ...overrides });
}

export function sanitizeConfig(raw) {
  const c = { ...DEFAULTS, ...raw };
  const warnings = [];

  const clamp = (v, lo, hi, name) => {
    const x = Number(v);
    const y = Math.min(hi, Math.max(lo, Number.isFinite(x) ? x : lo));
    if (y !== x) warnings.push(`${name} clamped to ${y}`);
    return y;
  };

  c.coreSize = clamp(c.coreSize, 1, 30, "coreSize");
  c.totalDieT = clamp(c.totalDieT, 5, 200, "totalDieT");
  c.frontT = clamp(c.frontT, 0, c.totalDieT - 0.1, "frontT");
  c.backT = clamp(c.backT, 0, c.totalDieT - c.frontT - 0.1, "backT");
  c.siBodyT = c.totalDieT - c.frontT - c.backT;
  if (c.siBodyT <= 0) warnings.push("Si body thickness is non-positive.");

  c.frontCuPct = clamp(c.frontCuPct, 0, 60, "frontCuPct");
  c.frontProcessC = clamp(c.frontProcessC, 25, 500, "frontProcessC");
  // User-requested hard upper bound for backside process temperature.
  c.backProcessC = clamp(c.backProcessC, 25, 200, "backProcessC");
  c.finalC = clamp(c.finalC, -50, 200, "finalC");
  c.tsvRefC = clamp(c.tsvRefC, 25, 400, "tsvRefC");

  c.tsvPitchUm = clamp(c.tsvPitchUm, 1, 200, "tsvPitchUm");
  c.tsvDiaUm = clamp(c.tsvDiaUm, 0.1, c.tsvPitchUm * 0.95, "tsvDiaUm");
  c.tsvOccPct = clamp(c.tsvOccPct, 0, 100, "tsvOccPct");
  c.tsvLinerTUm = clamp(c.tsvLinerTUm, 0.01, Math.max(0.01,(c.tsvPitchUm-c.tsvDiaUm)/2*0.9), "tsvLinerTUm");
  c.tsvLinerK = clamp(c.tsvLinerK, 0.1, 20, "tsvLinerK");
  const collarMin = c.tsvDiaUm + 2*c.tsvLinerTUm;
  c.tsvCollarOuterDiaUm = clamp(c.tsvCollarOuterDiaUm, collarMin, Math.max(collarMin, c.tsvPitchUm*0.90), "tsvCollarOuterDiaUm");
  c.tsvShiftX = Number(c.tsvShiftX || 0);
  c.tsvShiftY = Number(c.tsvShiftY || 0);
  c.tsvAspect = clamp(c.tsvAspect, 0.2, 20, "tsvAspect");
  c.tsvSplitGap = clamp(c.tsvSplitGap, 0, c.coreSize, "tsvSplitGap");

  c.w0Um = clamp(c.w0Um, 0, 300, "w0Um");
  c.warpSign = Number(c.warpSign) >= 0 ? 1 : -1;
  c.mechGrid = Math.round(clamp(c.mechGrid, 15, 81, "mechGrid"));

  c.alnPattern = ["V1","V2","V3"].includes(c.alnPattern)?c.alnPattern:"V1";
  c.alnV3Direction = c.alnV3Direction==="x"?"x":"y";
  c.alnWidthMode = ["process","manual","auto"].includes(c.alnWidthMode) ? c.alnWidthMode : "process";
  c.alnStride = Math.max(1, Math.round(clamp(c.alnStride, 1, 30, "alnStride")));
  // FINAL LOCKED PROCESS GEOMETRY.
  // Main proposal: 1 µm embedded AlN depth and 2 µm in-plane rib width.
  // +400 MPa is retained as the nominal PVD process-stress input; the model does not claim
  // that this stress was directly measured on the final 1 µm patterned rib.
  c.alnVolPct = clamp(c.alnVolPct, 0, 5, "alnVolPct");
  c.alnWidthDepthRatio = 2.0;
  if(c.alnWidthMode === "process") {
    c.alnTUm = 1.0;
    c.alnWidthUm = 2.0;
    // Reinforcement is backside-adjacent in the Si body; alnZ stores the centroid fraction.
    c.alnZ = c.siBodyT > 0 ? Math.max(1e-4, Math.min(0.9999, c.alnTUm/(2*c.siBodyT))) : 0.5;
  } else {
    c.alnTUm = clamp(c.alnTUm, 0.1, Math.min(3.0, Math.max(0.1, c.siBodyT * 0.5)), "alnTUm");
    c.alnWidthUm = clamp(c.alnWidthUm, 0.05, Math.max(0.05, (c.tsvPitchUm*c.alnStride)/2), "alnWidthUm");
    c.alnZ = clamp(c.alnZ, 0.001, 0.999, "alnZ");
  }
  c.alnResidualMPa = clamp(c.alnResidualMPa, -1000, 1000, "alnResidualMPa");
  c.alnProcessC = clamp(c.alnProcessC, 25, 200, "alnProcessC");
  c.alnEmbeddingMode = c.alnEmbeddingMode === "additive" ? "additive" : "replacement";
  c.alnOffsetX = clamp(c.alnOffsetX, -2, 2, "alnOffsetX");
  c.alnOffsetY = clamp(c.alnOffsetY, -2, 2, "alnOffsetY");
  c.tsvAlnGapUm = clamp(c.tsvAlnGapUm, 0, 100, "tsvAlnGapUm");

  c.bankPowerW = clamp(c.bankPowerW, 0, 10, "bankPowerW");
  c.tsvPowerW = clamp(c.tsvPowerW, 0, 10, "tsvPowerW");
  c.includeBasePower = c.includeBasePower !== false;
  c.basePhyPowerW = clamp(c.basePhyPowerW, 0, 20, "basePhyPowerW");
  c.baseTsvPowerW = clamp(c.baseTsvPowerW, 0, 20, "baseTsvPowerW");
  c.ambientC = clamp(c.ambientC, -50, 150, "ambientC");
  c.externalRthKW = clamp(c.externalRthKW, 0.01, 20, "externalRthKW");
  c.thermalGrid = Math.round(clamp(c.thermalGrid, 21, 101, "thermalGrid"));
  c.stackGrid = Math.round(clamp(c.stackGrid, 11, 41, "stackGrid"));

  c.bondTUm = clamp(c.bondTUm, 0, 5, "bondTUm");
  c.bondE_GPa = clamp(c.bondE_GPa, 0.1, 300, "bondE_GPa");
  c.bondNu = clamp(c.bondNu, 0.01, 0.49, "bondNu");
  c.bondCTE_ppm = clamp(c.bondCTE_ppm, 0, 100, "bondCTE_ppm");
  c.bondK = clamp(c.bondK, 0.05, 500, "bondK");
  c.bondRarea = clamp(c.bondRarea, 0, 1e-4, "bondRarea");

  return Object.assign(c, { validationWarnings: warnings });
}
