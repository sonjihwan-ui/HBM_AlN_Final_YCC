import { MATERIALS } from "./constants.js";

function thicknessMix(parts) {
  const sum = parts.reduce((a, p) => a + p.t, 0);
  const vf = parts.map(p => ({ ...p, f: p.t / sum }));
  const E = vf.reduce((a, p) => a + p.f * p.mat.E, 0);
  const nu = vf.reduce((a, p) => a + p.f * p.mat.nu, 0);
  const alpha = vf.reduce((a, p) => a + p.f * p.mat.E * p.mat.alpha, 0) / E;
  const kxy = vf.reduce((a, p) => a + p.f * p.mat.kxy, 0);
  const kz = 1 / vf.reduce((a, p) => a + p.f / p.mat.kz, 0);
  return { E, nu, alpha, kxy, kz };
}

function inPlaneComposite(matrix, inclusion, f) {
  const fm = 1 - f;
  const E = fm * matrix.E + f * inclusion.E; // Voigt / iso-strain
  const nu = fm * matrix.nu + f * inclusion.nu;
  const alpha = (fm * matrix.E * matrix.alpha + f * inclusion.E * inclusion.alpha) / E;
  const kxy = fm * matrix.kxy + f * inclusion.kxy; // parallel in-plane
  const kz = 1 / (fm / matrix.kz + f / inclusion.kz); // harmonic through-thickness
  return { E, nu, alpha, kxy, kz };
}

export function frontSkinProps(cfg) {
  // Rao surrogate front stack: 1.2 µm RDL dielectric + 1.2 µm HB-pad dielectric + 0.2 µm SiN.
  const matrix = thicknessMix([
    { t: 2.4, mat: MATERIALS.teos },
    { t: 0.2, mat: MATERIALS.sin }
  ]);
  return inPlaneComposite(matrix, MATERIALS.cu, cfg.frontCuPct / 100);
}

export function backSkinProps(_cfg) {
  // Rao surrogate back stack: 0.5 µm SiCN + 0.2 µm SiN.
  return thicknessMix([
    { t: 0.5, mat: MATERIALS.sicn },
    { t: 0.2, mat: MATERIALS.sin }
  ]);
}

export function tsvBodyProps(cfg) {
  const pitch = cfg.tsvPitchUm;
  const d = cfg.tsvDiaUm;
  const singleFill = Math.PI * (d * d / 4) / (pitch * pitch);
  const fCu = singleFill * (cfg.tsvOccPct / 100);
  return {
    ...inPlaneComposite(MATERIALS.si, MATERIALS.cu, fCu),
    fCu,
    singleFill
  };
}

export function areaAverageBodyProps(cfg, tsvAreaFraction) {
  const tsv = tsvBodyProps(cfg);
  return inPlaneComposite(MATERIALS.si, tsv, Math.max(0, Math.min(1, tsvAreaFraction)));
}


export function tsvLinerParticipation(cfg) {
  const r=Math.max(cfg.tsvDiaUm/2,1e-6);
  const ro=r+cfg.tsvLinerTUm;
  const R=Math.max(cfg.tsvPitchUm/2,ro*1.001);
  // Common 1/(2*pi*H) factor cancels in the conductance ratio.
  const Rox=Math.log(ro/r)/Math.max(cfg.tsvLinerK,1e-9);
  const Rsi=Math.log(R/ro)/Math.max(MATERIALS.si.kxy,1e-9);
  const eta=Rsi/Math.max(Rox+Rsi,1e-30);
  return Math.max(0,Math.min(1,eta));
}


export function tsvCollarParticipation(cfg) {
  const r=Math.max(cfg.tsvDiaUm/2,1e-6);
  const ro=Math.max(cfg.tsvCollarOuterDiaUm/2,r*1.001);
  const R=Math.max(cfg.tsvPitchUm/2,ro*1.001);
  // Same cylindrical radial-conduction surrogate as the SiO2 liner model, but
  // the recessed AlN segment uses k_AlN and a larger outer radius.
  const Raln=Math.log(ro/r)/Math.max(MATERIALS.aln.kxy,1e-9);
  const Rsi=Math.log(R/ro)/Math.max(MATERIALS.si.kxy,1e-9);
  const eta=Rsi/Math.max(Raln+Rsi,1e-30);
  return Math.max(0,Math.min(1,eta));
}

export function tsvSegmentedIsolationParticipation(cfg) {
  const etaLiner=tsvLinerParticipation(cfg);
  const etaCollar=tsvCollarParticipation(cfg);
  const recessedFraction=cfg.siBodyT>0?Math.max(0,Math.min(1,cfg.alnTUm/cfg.siBodyT)):0;
  // Along the TSV height, the AlN collar segment and the remaining SiO2-lined
  // segment act as parallel opportunities for lateral heat exchange. This is a
  // reduced-order height-weighted participation model, not a resolved 3D contact solve.
  const etaUniversal=(1-recessedFraction)*etaLiner+recessedFraction*etaCollar;
  return {etaLiner,etaCollar,recessedFraction,etaUniversal};
}

export function tsvLateralThermalProps(cfg, cuParticipation=null) {
  const base=tsvBodyProps(cfg);
  const eta=cuParticipation==null?tsvLinerParticipation(cfg):Math.max(0,Math.min(1,cuParticipation));
  const p=cfg.tsvPitchUm,r=cfg.tsvDiaUm/2,ro=r+cfg.tsvLinerTUm;
  const fOx=(cfg.tsvOccPct/100)*Math.PI*Math.max(0,ro*ro-r*r)/(p*p);
  const fCu=base.fCu;
  const kxy=MATERIALS.si.kxy
    + fCu*eta*(MATERIALS.cu.kxy-MATERIALS.si.kxy)
    + fOx*(cfg.tsvLinerK-MATERIALS.si.kxy);
  return {...base,kxy:Math.max(0.1,kxy),kz:base.kz,fOx,etaCu:eta};
}
