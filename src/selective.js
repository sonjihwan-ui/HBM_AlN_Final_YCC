import { sanitizeConfig } from "./config.js";
import { stackMechanicalMasked, stackThermalMasked, normalizeModifiedMask } from "./stack.js";

export const V6_PRESETS = Object.freeze([
  "all-baseline","all-modified","bottom-25","bottom-50","top-25","top-50","center-25","center-50","alternating","every-3rd","custom"
]);

const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
const finite=v=>Number.isFinite(v);

export function layerNumbers(mask){
  return mask.map((v,i)=>v?i+1:null).filter(v=>v!==null);
}
export function maskKey(mask){ return layerNumbers(mask).join(",") || "none"; }

export function presetMask(N,preset){
  const mask=Array(N).fill(false), setRange=(a,b)=>{for(let i=Math.max(1,a);i<=Math.min(N,b);i++)mask[i-1]=true;};
  if(preset==="all-modified") return Array(N).fill(true);
  if(preset==="all-baseline") return mask;
  if(preset==="bottom-25") setRange(1,Math.ceil(N*0.25));
  else if(preset==="bottom-50") setRange(1,Math.ceil(N*0.50));
  else if(preset==="top-25") setRange(N-Math.ceil(N*0.25)+1,N);
  else if(preset==="top-50") setRange(N-Math.ceil(N*0.50)+1,N);
  else if(preset==="center-25"){
    const k=Math.ceil(N*0.25),a=Math.floor((N-k)/2)+1;setRange(a,a+k-1);
  }else if(preset==="center-50"){
    const k=Math.ceil(N*0.50),a=Math.floor((N-k)/2)+1;setRange(a,a+k-1);
  }else if(preset==="alternating") for(let i=0;i<N;i+=2)mask[i]=true;
  else if(preset==="every-3rd") for(let i=0;i<N;i+=3)mask[i]=true;
  return mask;
}

export function benefitCapture(baseline,selective,allModified,eps=1e-12){
  const fullBenefit=baseline-allModified;
  const selectiveBenefit=baseline-selective;
  if(![baseline,selective,allModified].every(finite) || fullBenefit<=eps){
    return {valid:false,fullBenefit,selectiveBenefit,capturePct:NaN,reason:fullBenefit<=eps?"NO_POSITIVE_FULL_MODIFIED_BENEFIT":"NONFINITE"};
  }
  return {valid:true,fullBenefit,selectiveBenefit,capturePct:100*selectiveBenefit/fullBenefit,reason:"OK"};
}

export function evaluateSelectiveMechanical(cfg,mask){
  const N=mask.length,baseline=stackMechanicalMasked(cfg,Array(N).fill(false)),selective=stackMechanicalMasked(cfg,mask),allModified=stackMechanicalMasked(cfg,Array(N).fill(true));
  const capture=benefitCapture(baseline.bowUm,selective.bowUm,allModified.bowUm);
  return {
    N,mask:[...mask],modifiedCount:mask.filter(Boolean).length,modifiedFraction:mask.filter(Boolean).length/N,
    baseline,selective,allModified,capture,
    selectiveImprovementPct:baseline.bowUm>1e-12?100*(baseline.bowUm-selective.bowUm)/baseline.bowUm:0,
    allModifiedImprovementPct:baseline.bowUm>1e-12?100*(baseline.bowUm-allModified.bowUm)/baseline.bowUm:0
  };
}

export function evaluateSelectiveThermal(cfg,mask,stackGridOverride=null){
  const c=stackGridOverride?sanitizeConfig({...cfg,stackGrid:stackGridOverride}):cfg;
  const N=mask.length,baseline=stackThermalMasked(c,Array(N).fill(false)),selective=stackThermalMasked(c,mask),allModified=stackThermalMasked(c,Array(N).fill(true));
  const capture=benefitCapture(baseline.tmax,selective.tmax,allModified.tmax);
  return {
    N,mask:[...mask],modifiedCount:mask.filter(Boolean).length,modifiedFraction:mask.filter(Boolean).length/N,
    baseline,selective,allModified,capture,
    selectiveImprovementK:baseline.tmax-selective.tmax,
    allModifiedImprovementK:baseline.tmax-allModified.tmax,
    stackGrid:c.stackGrid
  };
}

export function evaluateSelectivePlacement(cfg,mask,{thermal=true,stackGridOverride=null}={}){
  const mech=evaluateSelectiveMechanical(cfg,mask);
  const therm=thermal?evaluateSelectiveThermal(cfg,mask,stackGridOverride):null;
  return {version:"6.0",N:mask.length,mask:[...mask],layers:layerNumbers(mask),mechanical:mech,thermal:therm};
}

export function cumulativeMechanicalHistory(cfg,mask){
  const rows=[];let prev=null;
  for(let n=1;n<=mask.length;n++){
    const partial=mask.slice(0,n),m=evaluateSelectiveMechanical(cfg,partial);
    rows.push({
      stage:n,addedLayer:n,addedModified:!!mask[n-1],modifiedCount:m.modifiedCount,modifiedFraction:m.modifiedFraction,
      baselineBowUm:m.baseline.bowUm,selectiveBowUm:m.selective.bowUm,allModifiedBowUm:m.allModified.bowUm,
      selectiveKx:m.selective.kx,selectiveKy:m.selective.ky,
      deltaBowFromPreviousUm:prev===null?NaN:m.selective.bowUm-prev,
      bowCapturePct:m.capture.capturePct,bowCaptureValid:m.capture.valid,
      xSectionCenterRelation:m.selective.xSectionCenterRelation,ySectionCenterRelation:m.selective.ySectionCenterRelation
    });
    prev=m.selective.bowUm;
  }
  return rows;
}

function normalizeHigher(rows,getter){
  const vals=rows.map(getter).filter(finite);if(!vals.length)return rows.map(()=>0);
  const lo=Math.min(...vals),hi=Math.max(...vals),span=hi-lo;
  return rows.map(r=>span<1e-14?50:100*(getter(r)-lo)/span);
}

export function singleLayerSensitivity(cfg,N,{includeThermal=true,scanStackGrid=11,weightMechanical=70,weightThermal=30}={}){
  const baselineMask=Array(N).fill(false);
  const baseM=stackMechanicalMasked(cfg,baselineMask);
  const cScan=sanitizeConfig({...cfg,stackGrid:scanStackGrid});
  const baseT=includeThermal?stackThermalMasked(cScan,baselineMask):null;
  const rows=[];
  for(let i=0;i<N;i++){
    const mask=Array(N).fill(false);mask[i]=true;
    const m=stackMechanicalMasked(cfg,mask),t=includeThermal?stackThermalMasked(cScan,mask):null;
    rows.push({layer:i+1,mask,bowUm:m.bowUm,deltaBowUm:baseM.bowUm-m.bowUm,tmaxC:t?.tmax??NaN,deltaTmaxK:t?baseT.tmax-t.tmax:NaN});
  }
  const ms=normalizeHigher(rows,r=>r.deltaBowUm),ts=includeThermal?normalizeHigher(rows,r=>r.deltaTmaxK):rows.map(()=>0);
  const wm=Math.max(0,weightMechanical),wt=includeThermal?Math.max(0,weightThermal):0,den=Math.max(wm+wt,1e-12);
  rows.forEach((r,i)=>{r.mechanicalScore=ms[i];r.thermalScore=ts[i];r.combinedScore=(wm*ms[i]+wt*ts[i])/den;});
  rows.sort((a,b)=>b.combinedScore-a.combinedScore || a.layer-b.layer);
  return {N,scanStackGrid,baseBowUm:baseM.bowUm,baseTmaxC:baseT?.tmax??NaN,weights:{mechanical:wm,thermal:wt},rows};
}

export function presetComparison(cfg,N,{includeThermal=true,scanStackGrid=11,presets=["all-baseline","bottom-25","bottom-50","top-25","center-25","alternating","every-3rd","all-modified"],customMask=null,sensitivity=null,weightMechanical=70,weightThermal=30}={}){
  const list=[...presets]; if(customMask)list.splice(Math.max(0,list.length-1),0,"custom");
  const baseMask=Array(N).fill(false),fullMask=Array(N).fill(true);
  const baseM=stackMechanicalMasked(cfg,baseMask),fullM=stackMechanicalMasked(cfg,fullMask);
  const sens=sensitivity||singleLayerSensitivity(cfg,N,{includeThermal,scanStackGrid,weightMechanical,weightThermal});
  const sensByLayer=new Map(sens.rows.map(r=>[r.layer,r]));
  const baseTmax=sens.baseTmaxC;
  const fullThermalBenefit=includeThermal?sens.rows.reduce((a,r)=>a+(r.deltaTmaxK||0),0):NaN;
  const rows=[];
  for(const preset of list){
    const mask=preset==="custom"?normalizeModifiedMask(customMask,N):presetMask(N,preset);
    const m=stackMechanicalMasked(cfg,mask),mc=benefitCapture(baseM.bowUm,m.bowUm,fullM.bowUm);
    const estThermalBenefit=includeThermal?layerNumbers(mask).reduce((a,layer)=>a+(sensByLayer.get(layer)?.deltaTmaxK||0),0):NaN;
    const tcValid=includeThermal&&Number.isFinite(fullThermalBenefit)&&fullThermalBenefit>1e-12;
    const tcPct=tcValid?100*estThermalBenefit/fullThermalBenefit:NaN;
    rows.push({
      preset,layers:layerNumbers(mask),modifiedCount:mask.filter(Boolean).length,modifiedFraction:mask.filter(Boolean).length/N,
      bowUm:m.bowUm,bowImprovementPct:baseM.bowUm>1e-12?100*(baseM.bowUm-m.bowUm)/baseM.bowUm:0,
      bowCapturePct:mc.capturePct,bowCaptureValid:mc.valid,
      tmaxC:includeThermal?baseTmax-estThermalBenefit:NaN,thermalImprovementK:estThermalBenefit,
      thermalCapturePct:preset==="all-modified"&&tcValid?100:tcPct,thermalCaptureValid:tcValid,thermalEstimated:true
    });
  }
  return {N,scanStackGrid,rows,thermalMode:"ONE_LAYER_ADDITIVE_ESTIMATE_VERIFY_PRESET_WITH_SELECTED_PLACEMENT"};
}

export function priorityDeploymentPlan(cfg,N,sensitivity,{targets=[50,75,90],includeThermal=true,scanStackGrid=11,weightMechanical=70,weightThermal=30,verifyTargets=false}={}){
  const order=sensitivity.rows.map(r=>r.layer);
  const sensByLayer=new Map(sensitivity.rows.map(r=>[r.layer,r]));
  const baselineMask=Array(N).fill(false),fullMask=Array(N).fill(true);
  const baseM=stackMechanicalMasked(cfg,baselineMask),fullM=stackMechanicalMasked(cfg,fullMask);
  const cScan=sanitizeConfig({...cfg,stackGrid:scanStackGrid});
  // Thermal prefix screening is intentionally fast: exact one-layer thermal
  // sensitivities are accumulated as an additive estimate. By default the
  // all-modified thermal benchmark is also the sum of one-layer benefits,
  // making the heuristic endpoint exactly 100% without additional N-layer
  // thermal solves. Users verify any recommended mask with Run selected placement.
  const baseTmax=sensitivity.baseTmaxC;
  const fullThermalBenefit=includeThermal?sensitivity.rows.reduce((a,r)=>a+(r.deltaTmaxK||0),0):NaN;
  const fullT=verifyTargets&&includeThermal?stackThermalMasked(cScan,fullMask):null;
  const rows=[],mask=Array(N).fill(false);
  let estThermalBenefit=0;
  for(let k=1;k<=N;k++){
    const layer=order[k-1];mask[layer-1]=true;
    const m=stackMechanicalMasked(cfg,mask),mc=benefitCapture(baseM.bowUm,m.bowUm,fullM.bowUm);
    if(includeThermal) estThermalBenefit+=sensByLayer.get(layer)?.deltaTmaxK||0;
    let tcValid=includeThermal&&Number.isFinite(fullThermalBenefit)&&fullThermalBenefit>1e-12;
    let tcPct=tcValid?100*estThermalBenefit/fullThermalBenefit:NaN;
    if(k===N&&tcValid)tcPct=100; // heuristic additive endpoint
    const parts=[];let wsum=0;
    if(mc.valid){parts.push(weightMechanical*mc.capturePct);wsum+=weightMechanical;}
    if(tcValid){parts.push(weightThermal*tcPct);wsum+=weightThermal;}
    rows.push({k,layers:layerNumbers(mask),modifiedFraction:k/N,bowUm:m.bowUm,bowCapturePct:mc.capturePct,bowCaptureValid:mc.valid,
      tmaxC:NaN,thermalCapturePct:tcPct,thermalCaptureValid:tcValid,thermalCaptureEstimated:true,
      combinedCapturePct:wsum>0?parts.reduce((a,b)=>a+b,0)/wsum:NaN});
  }
  const exactCache=new Map();
  const exactVerify=(row)=>{
    if(!includeThermal||!row)return null;
    const key=row.k;if(exactCache.has(key))return exactCache.get(key);
    const mask=Array(N).fill(false);for(const layer of row.layers)mask[layer-1]=true;
    const t=stackThermalMasked(cScan,mask),tc=benefitCapture(baseTmax,t.tmax,fullT.tmax);
    const parts=[];let wsum=0;
    if(row.bowCaptureValid){parts.push(weightMechanical*row.bowCapturePct);wsum+=weightMechanical;}
    if(tc.valid){parts.push(weightThermal*tc.capturePct);wsum+=weightThermal;}
    const out={tmaxC:t.tmax,thermalCapturePct:tc.capturePct,thermalCaptureValid:tc.valid,combinedCapturePct:wsum>0?parts.reduce((a,b)=>a+b,0)/wsum:NaN};
    exactCache.set(key,out);return out;
  };
  const recommendations=targets.map(target=>{
    const row=rows.find(r=>finite(r.combinedCapturePct)&&r.combinedCapturePct>=target);
    if(!row)return {targetPct:target,found:false,requiredModified:null,layers:[],modifiedFraction:NaN,combinedCapturePct:NaN,verified:false};
    const exact=verifyTargets?exactVerify(row):null;
    return {targetPct:target,found:true,requiredModified:row.k,layers:row.layers,modifiedFraction:row.modifiedFraction,
      combinedCapturePct:row.combinedCapturePct,estimatedCombinedCapturePct:row.combinedCapturePct,
      verified:!!exact,verifiedCombinedCapturePct:exact?.combinedCapturePct??NaN,verifiedThermalCapturePct:exact?.thermalCapturePct??NaN,
      verificationMeetsTarget:exact?exact.combinedCapturePct>=target:null};
  });
  return {N,order,scanStackGrid,weights:{mechanical:weightMechanical,thermal:weightThermal},rows,recommendations,
    thermalPlanMode:verifyTargets?"ONE_LAYER_ADDITIVE_ESTIMATE_WITH_TARGET_VERIFICATION":"ONE_LAYER_ADDITIVE_ESTIMATE_VERIFY_BY_SELECTED_PLACEMENT",
    fullThermalBenefitK:fullThermalBenefit,verifiedTargetCases:[...exactCache.entries()].map(([k,v])=>({k,...v}))};
}

export function selectiveSummary(result){
  if(!result)return null;
  const m=result.mechanical,t=result.thermal;
  return {
    N:result.N,modifiedCount:m.modifiedCount,modifiedFraction:m.modifiedFraction,layers:result.layers,
    baselineBowUm:m.baseline.bowUm,selectiveBowUm:m.selective.bowUm,allModifiedBowUm:m.allModified.bowUm,
    bowCapturePct:m.capture.capturePct,bowCaptureValid:m.capture.valid,
    baselineTmaxC:t?.baseline.tmax??NaN,selectiveTmaxC:t?.selective.tmax??NaN,allModifiedTmaxC:t?.allModified.tmax??NaN,
    thermalCapturePct:t?.capture.capturePct??NaN,thermalCaptureValid:t?.capture.valid??false,
    replacementEfficiencyBow:m.capture.valid&&m.modifiedFraction>0?m.capture.capturePct/(100*m.modifiedFraction):NaN,
    replacementEfficiencyThermal:t?.capture.valid&&m.modifiedFraction>0?t.capture.capturePct/(100*m.modifiedFraction):NaN
  };
}
