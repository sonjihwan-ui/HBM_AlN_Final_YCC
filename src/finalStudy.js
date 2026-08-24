import { sanitizeConfig } from './config.js';
import { mechanicalSolve } from './mechanics.js';
import { thermalSolve } from './thermal.js';
import { stackMechanicalMasked, stackThermalMasked } from './stack.js';
import {
  layerNumbers, maskKey, singleLayerSensitivity,
  evaluateSelectivePlacement, cumulativeMechanicalHistory
} from './selective.js';
import { runDesignOptimization } from './doe.js';
import { patternName, topologyName } from './topology.js';
import { interconnectThermalComparison } from './architecture.js';

const finite = Number.isFinite;
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const pause = ()=>new Promise(r=>setTimeout(r,0));

function maskFromLayers(N,layers){
  const m=Array(N).fill(false);
  for(const l of layers) if(l>=1&&l<=N) m[l-1]=true;
  return m;
}
function addCandidate(map,N,mask,family,label){
  const key=maskKey(mask);
  if(!map.has(key)) map.set(key,{mask:[...mask],family,label,layers:layerNumbers(mask)});
}
function splitEndMask(N,k){
  const bottom=Math.floor(k/2),top=k-bottom,layers=[];
  for(let i=1;i<=bottom;i++)layers.push(i);
  for(let i=N-top+1;i<=N;i++)layers.push(i);
  return maskFromLayers(N,layers);
}
function centerMask(N,k){
  const a=Math.floor((N-k)/2)+1;
  return maskFromLayers(N,Array.from({length:k},(_,i)=>a+i));
}
function topMask(N,k){return maskFromLayers(N,Array.from({length:k},(_,i)=>N-k+1+i));}
function bottomMask(N,k){return maskFromLayers(N,Array.from({length:k},(_,i)=>1+i));}


export function fastLayerSensitivityProxy(cfg,N,{scanStackGrid=11,weightMechanical=70,weightThermal=30}={}){
  const baselineMask=Array(N).fill(false),fullMask=Array(N).fill(true);
  const baseM=stackMechanicalMasked(cfg,baselineMask);
  const cScan=sanitizeConfig({...cfg,stackGrid:scanStackGrid});
  const baseT=stackThermalMasked(cScan,baselineMask),fullT=stackThermalMasked(cScan,fullMask);
  const fullThermalBenefit=Math.max(0,baseT.tmax-fullT.tmax);
  const temps=baseT.layerMaxC||Array(N).fill(baseT.tmax);
  const rawWeights=temps.map(t=>Math.max(1e-9,t-cfg.ambientC));
  const sumW=rawWeights.reduce((a,b)=>a+b,0)||1;
  const rows=[];
  for(let i=0;i<N;i++){
    const mask=Array(N).fill(false);mask[i]=true;
    const m=stackMechanicalMasked(cfg,mask);
    rows.push({layer:i+1,mask,bowUm:m.bowUm,deltaBowUm:baseM.bowUm-m.bowUm,
      tmaxC:baseT.tmax-fullThermalBenefit*rawWeights[i]/sumW,
      deltaTmaxK:fullThermalBenefit*rawWeights[i]/sumW,thermalProxyWeight:rawWeights[i]/sumW});
  }
  const norm=(vals)=>{const lo=Math.min(...vals),hi=Math.max(...vals),sp=hi-lo;return vals.map(v=>sp<1e-14?50:100*(v-lo)/sp);};
  const ms=norm(rows.map(r=>r.deltaBowUm)),ts=norm(rows.map(r=>r.deltaTmaxK));
  const wm=Math.max(0,weightMechanical),wt=Math.max(0,weightThermal),den=wm+wt||1;
  rows.forEach((r,i)=>{r.mechanicalScore=ms[i];r.thermalScore=ts[i];r.combinedScore=(wm*ms[i]+wt*ts[i])/den;});
  rows.sort((a,b)=>b.combinedScore-a.combinedScore||a.layer-b.layer);
  return {N,scanStackGrid,baseBowUm:baseM.bowUm,baseTmaxC:baseT.tmax,fullModifiedTmaxC:fullT.tmax,fullThermalBenefitK:fullThermalBenefit,
    weights:{mechanical:wm,thermal:wt},thermalMode:'BASELINE_LAYER_TEMPERATURE_PROXY_WITH_EXACT_ENDPOINTS',rows};
}

export function buildPlacementCandidateSet(N,sensitivity){
  const map=new Map();
  addCandidate(map,N,Array(N).fill(false),'baseline','All baseline');
  addCandidate(map,N,Array(N).fill(true),'all','All modified');
  const order=sensitivity.rows.map(r=>r.layer),prefix=[];
  for(let k=1;k<=N;k++){
    prefix.push(order[k-1]);
    addCandidate(map,N,maskFromLayers(N,prefix),'priority',`Priority ${k}/${N}`);
    addCandidate(map,N,topMask(N,k),'top',`Top ${k}/${N}`);
    addCandidate(map,N,bottomMask(N,k),'bottom',`Bottom ${k}/${N}`);
    addCandidate(map,N,splitEndMask(N,k),'split',`Top+bottom ${k}/${N}`);
    addCandidate(map,N,centerMask(N,k),'center',`Center ${k}/${N}`);
  }
  const alt=Array(N).fill(false);for(let i=0;i<N;i+=2)alt[i]=true;addCandidate(map,N,alt,'distributed','Alternating layers');
  const third=Array(N).fill(false);for(let i=0;i<N;i+=3)third[i]=true;addCandidate(map,N,third,'distributed','Every 3rd layer');
  return [...map.values()];
}

function costPerformancePareto(rows){
  return rows.map((r,i)=>{
    if(r.modifiedCount===0)return false;
    for(let j=0;j<rows.length;j++){
      if(i===j)continue;const q=rows[j];
      if(q.modifiedCount===0)continue;
      const noMoreCost=q.modifiedFraction<=r.modifiedFraction+1e-12;
      const noLessPerf=q.combinedScore>=r.combinedScore-1e-12;
      const strict=q.modifiedFraction<r.modifiedFraction-1e-12 || q.combinedScore>r.combinedScore+1e-12;
      if(noMoreCost&&noLessPerf&&strict)return false;
    }
    return true;
  });
}


function paretoKnee(rows){
  const pts=rows.filter(r=>r.modifiedCount>0&&r.costPerformancePareto).sort((a,b)=>a.modifiedFraction-b.modifiedFraction);
  if(!pts.length)return null;if(pts.length===1)return pts[0];
  const x0=pts[0].modifiedFraction,y0=pts[0].retainedVsBestPct/100,x1=pts.at(-1).modifiedFraction,y1=pts.at(-1).retainedVsBestPct/100;
  const dx=x1-x0,dy=y1-y0,den=Math.hypot(dx,dy)||1;let best=pts[0],bd=-1;
  for(const p of pts){
    const x=p.modifiedFraction,y=p.retainedVsBestPct/100;
    const d=Math.abs(dy*x-dx*y+x1*y0-y1*x0)/den;
    if(d>bd+1e-12 || (Math.abs(d-bd)<1e-12&&p.modifiedCount<best.modifiedCount)){bd=d;best=p;}
  }
  return best;
}

export function deploymentTradeoff(cfg,N,sensitivity,{weightMechanical=70,weightThermal=30,targets=[50,75,90]}={}){
  const candidates=buildPlacementCandidateSet(N,sensitivity);
  const baseM=stackMechanicalMasked(cfg,Array(N).fill(false));
  const sensByLayer=new Map(sensitivity.rows.map(r=>[r.layer,r]));
  const fullThermalBenefit=sensitivity.rows.reduce((a,r)=>a+Math.max(0,r.deltaTmaxK||0),0);
  const rows=candidates.map(c=>{
    const m=stackMechanicalMasked(cfg,c.mask);
    const modifiedCount=c.mask.filter(Boolean).length,modifiedFraction=modifiedCount/N;
    const mechImprovePct=baseM.bowUm>1e-12?100*(baseM.bowUm-m.bowUm)/baseM.bowUm:0;
    const thermalImproveEstK=c.layers.reduce((a,l)=>a+Math.max(0,sensByLayer.get(l)?.deltaTmaxK||0),0);
    return {...c,modifiedCount,modifiedFraction,bowUm:m.bowUm,mechanicalImprovementPct:mechImprovePct,thermalImprovementEstK:thermalImproveEstK};
  });
  const bestMech=Math.max(0,...rows.map(r=>r.mechanicalImprovementPct));
  const wm=Math.max(0,weightMechanical),wt=Math.max(0,weightThermal),den=wm+wt||1;
  for(const r of rows){
    r.mechanicalScore=bestMech>1e-12?clamp(100*Math.max(0,r.mechanicalImprovementPct)/bestMech,0,100):0;
    r.thermalScore=fullThermalBenefit>1e-12?clamp(100*Math.max(0,r.thermalImprovementEstK)/fullThermalBenefit,0,100):0;
    r.combinedScore=(wm*r.mechanicalScore+wt*r.thermalScore)/den;
  }
  const bestCombined=Math.max(0,...rows.map(r=>r.combinedScore));
  for(const r of rows){
    r.retainedVsBestPct=bestCombined>1e-12?100*r.combinedScore/bestCombined:0;
    r.costProxyPct=100*r.modifiedFraction;
    r.performancePerModifiedFraction=r.modifiedFraction>0?r.retainedVsBestPct/(100*r.modifiedFraction):NaN;
  }
  const flags=costPerformancePareto(rows);rows.forEach((r,i)=>r.costPerformancePareto=flags[i]);
  const recommendations=targets.map(target=>{
    const eligible=rows.filter(r=>r.modifiedCount>0&&r.retainedVsBestPct>=target-1e-9)
      .sort((a,b)=>a.modifiedCount-b.modifiedCount||b.combinedScore-a.combinedScore||b.mechanicalImprovementPct-a.mechanicalImprovementPct);
    const r=eligible[0]||[...rows].filter(r=>r.modifiedCount>0).sort((a,b)=>b.combinedScore-a.combinedScore)[0];
    return r?{targetPct:target,reached:r.retainedVsBestPct>=target-1e-9,modifiedCount:r.modifiedCount,modifiedFraction:r.modifiedFraction,layers:r.layers,
      family:r.family,label:r.label,retainedVsBestPct:r.retainedVsBestPct,combinedScore:r.combinedScore,mechanicalImprovementPct:r.mechanicalImprovementPct,
      thermalImprovementEstK:r.thermalImprovementEstK,costPerformancePareto:r.costPerformancePareto}:null;
  }).filter(Boolean);
  const best=[...rows].filter(r=>r.modifiedCount>0).sort((a,b)=>b.combinedScore-a.combinedScore||a.modifiedCount-b.modifiedCount)[0]||null;
  const pareto=rows.filter(r=>r.costPerformancePareto).sort((a,b)=>a.modifiedFraction-b.modifiedFraction);
  const knee=paretoKnee(rows);
  return {N,weights:{mechanical:wm,thermal:wt},bestMechanicalImprovementPct:bestMech,fullThermalBenefitEstK:fullThermalBenefit,bestCombinedScore:bestCombined,rows,pareto,recommendations,best,knee};
}

export function applyDesignWinner(baseCfg,winner){
  return sanitizeConfig({...baseCfg,
    alnPattern:winner.pattern,alnTopology:winner.extension,alnZ:winner.z,tsvShiftY:winner.tsvShiftY,
    alnTUm:winner.depthUm,alnWidthMode:'process',alnResidualMPa:baseCfg.alnResidualMPa
  });
}

export async function runIntegratedFinalStudy(baseCfg,{designSettings={},stackCounts=[16,20,24],scanStackGrid=9,verificationStackGrid=15,weightMechanical=70,weightThermal=30,targetPct=90,recommendationPolicy='target'}={},hooks={}){
  const base=sanitizeConfig(baseCfg);
  const out={version:'final-11.0',startedAt:new Date().toISOString(),baseConfig:base,design:null,optimizedConfig:null,singleDie:null,collarSensitivity:[],stacks:[],headline:null};
  hooks.onProgress?.({phase:'design',pct:2,message:'Optimizing reinforced core-die geometry…'});
  const design=await runDesignOptimization(base,designSettings,{isCancelled:hooks.isCancelled,onProgress:p=>hooks.onProgress?.({phase:'design',pct:Math.min(45,5+8*p.stage),message:p.message||p.name})});
  if(!design.final)throw new Error('No feasible reinforced-die candidate was found.');
  const optimized=applyDesignWinner(base,design.final);out.design=design;out.optimizedConfig=optimized;
  hooks.onProgress?.({phase:'single',pct:48,message:'Verifying baseline vs optimized free-die response…'});await pause();
  const mech=mechanicalSolve(optimized),therm=thermalSolve(optimized,optimized.thermalGrid);
  out.singleDie={mechanical:mech,thermal:therm,baselineWarpageUm:mech.noAln.totalUm,modifiedWarpageUm:mech.totalUm,warpageReductionPct:mech.reductionPct,
    baselineTmaxC:therm.noAln.tmax,modifiedTmaxC:therm.tmax,thermalImprovementK:therm.tmaxReductionC};
  // Small one-dimensional collar-OD check around the 6.0 µm nominal geometry margin.
  // This does NOT optimize collar diameter; it verifies that the final ranking is not a single-point artifact.
  for(const od of [5.5,6.0,6.5]){
    const cc=sanitizeConfig({...optimized,tsvCollarOuterDiaUm:od});
    const mm=mechanicalSolve(cc),tt=thermalSolve(cc,Math.min(41,cc.thermalGrid));
    out.collarSensitivity.push({outerDiaUm:cc.tsvCollarOuterDiaUm,ribWidthUm:mm.topo.width*1000,warpageUm:mm.totalUm,warpageReductionPct:mm.reductionPct,tmaxC:tt.tmax,thermalImprovementK:tt.tmaxReductionC,collarAreaMm2:mm.topo.collar?.collarAreaMm2||0});
  }

  let idx=0;
  for(const N of stackCounts){
    if(hooks.isCancelled?.())throw new Error('FINAL_STUDY_CANCELLED');
    const basePct=52+idx*(44/stackCounts.length);
    hooks.onProgress?.({phase:'deployment',pct:basePct,message:`${N}-Hi: scanning layer importance…`});await pause();
    const sensitivity=fastLayerSensitivityProxy(optimized,N,{scanStackGrid,weightMechanical,weightThermal});
    const tradeoff=deploymentTradeoff(optimized,N,sensitivity,{weightMechanical,weightThermal,targets:[50,75,targetPct]});
    const targetRec=tradeoff.recommendations.find(r=>r.targetPct===targetPct)||tradeoff.recommendations.at(-1);
    const knee=tradeoff.knee;
    const rec=(recommendationPolicy==='target'||!knee)?targetRec:{targetPct:'Pareto knee',reached:true,modifiedCount:knee.modifiedCount,modifiedFraction:knee.modifiedFraction,layers:knee.layers,family:knee.family,label:knee.label,retainedVsBestPct:knee.retainedVsBestPct,combinedScore:knee.combinedScore,mechanicalImprovementPct:knee.mechanicalImprovementPct,thermalImprovementEstK:knee.thermalImprovementEstK,costPerformancePareto:true};
    const mask=maskFromLayers(N,rec.layers);
    hooks.onProgress?.({phase:'deployment',pct:basePct+8,message:`${N}-Hi: exact verification of ${rec.modifiedCount}/${N} selected layers…`});await pause();
    const verifyGrid=Math.min(verificationStackGrid,optimized.stackGrid);
    const exact=evaluateSelectivePlacement(optimized,mask,{thermal:true,stackGridOverride:verifyGrid});
    const architectureThermal=interconnectThermalComparison(optimized,N,mask,verifyGrid);
    const history=cumulativeMechanicalHistory(optimized,mask);
    out.stacks.push({N,sensitivity,tradeoff,recommendation:rec,targetRecommendation:targetRec,exact,architectureThermal,history,verificationStackGrid:verifyGrid});
    idx++;
  }
  const preferred=out.stacks.find(s=>s.N===24)||out.stacks.at(-1);
  if(preferred){
    const e=preferred.exact,r=preferred.recommendation;
    out.headline={
      stackCount:preferred.N,pattern:design.final.pattern,patternName:patternName(design.final.pattern),topology:design.final.extension,topologyName:topologyName(design.final.extension),
      depthUm:design.final.depthUm,z:optimized.alnZ,tsvShiftY:design.final.tsvShiftY,alnResidualMPa:optimized.alnResidualMPa,actualAlnVolPct:design.final.actualVolPct,widthUm:design.final.widthUm,widthDepthRatio:design.final.widthDepthRatio,collarOuterDiaUm:optimized.tsvCollarOuterDiaUm,collarRecessDepthUm:optimized.alnTUm,
      modifiedCount:r.modifiedCount,modifiedFraction:r.modifiedFraction,layers:r.layers,retainedVsBestPct:r.retainedVsBestPct,
      baselineBowUm:e.mechanical.baseline.bowUm,selectiveBowUm:e.mechanical.selective.bowUm,allModifiedBowUm:e.mechanical.allModified.bowUm,
      selectiveBowImprovementPct:e.mechanical.selectiveImprovementPct,
      baselineTmaxC:e.thermal.baseline.tmax,selectiveTmaxC:e.thermal.selective.tmax,allModifiedTmaxC:e.thermal.allModified.tmax,
      selectiveThermalImprovementK:e.thermal.selectiveImprovementK
    };
  }
  out.finishedAt=new Date().toISOString();hooks.onProgress?.({phase:'done',pct:100,message:'Complete study finished.'});return out;
}
