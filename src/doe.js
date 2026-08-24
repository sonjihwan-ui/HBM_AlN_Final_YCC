import { sanitizeConfig } from "./config.js";
import { mechanicalSolve } from "./mechanics.js";
import { thermalSolve } from "./thermal.js";
import { stackMechanicalProjection, stackThermalProjection } from "./stack.js";
import { topologyName, patternName } from "./topology.js";

const DEFAULT_PATTERNS=["V1","V2","V3"];
const DEFAULT_EXTENSIONS=["T0","T1","T2","T3","T4"];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
const finite=v=>Number.isFinite(v);
const pause=()=>new Promise(r=>setTimeout(r,0));

export function parseNumberList(text,fallback=[],opts={}){
  const src=String(text??"").split(/[,;\s]+/).map(s=>s.trim()).filter(Boolean);
  let vals=src.map(Number).filter(Number.isFinite);
  if(!vals.length) vals=[...fallback];
  if(opts.integer) vals=vals.map(v=>Math.round(v));
  if(Number.isFinite(opts.min)) vals=vals.map(v=>Math.max(opts.min,v));
  if(Number.isFinite(opts.max)) vals=vals.map(v=>Math.min(opts.max,v));
  return [...new Set(vals.map(v=>+v.toFixed(8)))];
}

export function normalizeHigher(rows,getter){
  const vals=rows.map(getter).filter(Number.isFinite);
  if(!vals.length) return rows.map(()=>0);
  const lo=Math.min(...vals), hi=Math.max(...vals), span=hi-lo;
  return rows.map(r=>{
    const v=getter(r); if(!Number.isFinite(v)) return 0;
    return span<1e-12?50:100*(v-lo)/span;
  });
}
export function normalizeLower(rows,getter){
  const h=normalizeHigher(rows,getter); return h.map(v=>100-v);
}

export function paretoFront(rows,xGetter,yGetter){
  const flags=rows.map(()=>true);
  for(let i=0;i<rows.length;i++){
    const xi=xGetter(rows[i]), yi=yGetter(rows[i]);
    if(!finite(xi)||!finite(yi)){flags[i]=false;continue;}
    for(let j=0;j<rows.length;j++){
      if(i===j)continue;
      const xj=xGetter(rows[j]), yj=yGetter(rows[j]);
      if(!finite(xj)||!finite(yj))continue;
      if(xj>=xi-1e-12 && yj>=yi-1e-12 && (xj>xi+1e-12 || yj>yi+1e-12)){
        flags[i]=false;break;
      }
    }
  }
  return flags;
}

function normalizedWeights(weights,includeRobust=true){
  const w={
    warpage:Math.max(0,+weights.warpage||0),
    local:Math.max(0,+weights.local||0),
    thermal:Math.max(0,+weights.thermal||0),
    robust:includeRobust?Math.max(0,+weights.robust||0):0
  };
  const s=w.warpage+w.local+w.thermal+w.robust || 1;
  for(const k of Object.keys(w))w[k]=w[k]/s;
  return w;
}

export function scoreRows(rows,weights,{warpageGetter,localGetter,thermalGetter,robustGetter=null}={}){
  const feasible=rows.filter(r=>r.feasible!==false);
  const sw=normalizeHigher(feasible,warpageGetter);
  const sl=normalizeLower(feasible,localGetter);
  const st=normalizeHigher(feasible,thermalGetter);
  const sr=robustGetter?feasible.map(r=>clamp(robustGetter(r),0,100)):feasible.map(()=>0);
  const nw=normalizedWeights(weights,!!robustGetter);
  feasible.forEach((r,i)=>{
    r.componentScores={warpage:sw[i],local:sl[i],thermal:st[i],robust:sr[i]};
    r.score=sw[i]*nw.warpage+sl[i]*nw.local+st[i]*nw.thermal+sr[i]*nw.robust;
  });
  rows.filter(r=>r.feasible===false).forEach(r=>{r.componentScores={warpage:0,local:0,thermal:0,robust:0};r.score=-Infinity;});
  return [...rows].sort((a,b)=>(b.score??-Infinity)-(a.score??-Infinity));
}

function localDeviation(m){return Math.max(0,m.localDeviationUm||0);}
function caseMetrics(c,m,t){
  return {
    pattern:c.alnPattern, extension:c.alnTopology, z:c.alnZ, depthUm:c.alnTUm, tsvShiftY:c.tsvShiftY,
    widthUm:m.topo.width*1000, actualVolPct:m.topo.actualVolPct, widthDepthRatio:c.alnTUm>0?(m.topo.width*1000/c.alnTUm):NaN,
    volumeErrorPct:m.topologyVolumeErrorPct,
    warpageUm:m.totalUm,noAlnWarpageUm:m.noAln.totalUm,warpageReductionPct:m.reductionPct,
    localDeviationUm:localDeviation(m),
    thermalTmaxC:t.tmax,noAlnTmaxC:t.noAln.tmax,thermalImproveK:t.tmaxReductionC,thermalImprovePct:t.tmaxReductionPct,
    thermalEnergyErrorPct:t.energyErrorPct, widthMode:c.alnWidthMode, geometryValid:m.geometryValid && m.topo.valid,
    mechFinite:[m.totalUm,m.kxCenter,m.kyCenter].every(finite), thermalFinite:[t.tmax,t.energyErrorPct].every(finite)
  };
}

function applyGate(metrics,gate){
  const reasons=[];
  if(!metrics.geometryValid)reasons.push("geometry invalid");
  if(metrics.widthMode!=="process" && Math.abs(metrics.volumeErrorPct)>gate.volumeErrorPct)reasons.push(`volume error>${gate.volumeErrorPct}%`);
  if(Math.abs(metrics.thermalEnergyErrorPct)>gate.energyErrorPct)reasons.push(`energy error>${gate.energyErrorPct}%`);
  if(!metrics.mechFinite)reasons.push("mechanical non-finite");
  if(!metrics.thermalFinite)reasons.push("thermal non-finite");
  return {feasible:reasons.length===0,reasons};
}

function candidateId(x){
  return `${x.pattern}-${x.extension}-d${(+x.depthUm).toFixed(1)}-y${(+x.tsvShiftY).toFixed(2)}`;
}
function topologyId(x){return `${x.pattern}-${x.extension}-d${(+x.depthUm).toFixed(1)}`;}
function designNameForProgress(pattern,extension){return `${patternName(pattern)} · ${topologyName(extension)}`;}
function doeConfig(base,overrides,settings){
  return sanitizeConfig({
    ...base,...overrides,
    alnWidthMode:"process",
    mechGrid:settings.screenMechGrid,
    thermalGrid:settings.screenThermalGrid,
    stackGrid:settings.screenStackGrid
  });
}

async function notify(hooks,payload){
  if(hooks?.isCancelled?.())throw new Error("DOE_CANCELLED");
  hooks?.onProgress?.(payload);
  if((payload.done??0)%3===0)await pause();
}

export function defaultDoeSettings(){
  return {
    patterns:[...DEFAULT_PATTERNS],extensions:[...DEFAULT_EXTENSIONS],
    topK1:5,topK2:3,
    depthValues:[1],
    yShiftValues:[-1,0,1],
    residualValues:[300,400,500],
    robustnessW0:[40,70,100],
    robustnessOcc:[10,20,30],
    robustnessLiner:[0.2,0.5,1.0],
    robustnessResidual:[300,400,500],
    highStackCounts:[16,20,24],
    screenMechGrid:21,screenThermalGrid:25,screenStackGrid:11,
    gate:{volumeErrorPct:1,energyErrorPct:1,convergenceErrorPct:3},
    weights:{warpage:60,local:15,thermal:15,robust:10},
    tieBreakPoints:1,
    runFinalVerification:true,
    runStackVerification:false
  };
}

export async function runV53Pipeline(baseCfg,userSettings={},hooks={}){
  const d=defaultDoeSettings();
  const settings={...d,...userSettings,gate:{...d.gate,...userSettings.gate},weights:{...d.weights,...userSettings.weights}};
  // Final locked process basis: thickness/depth and rib width are not optimization knobs.
  // Residual stress remains a sensitivity-only axis around the +400 MPa nominal value.
  settings.depthValues=[1];
  settings.residualValues=[300,400,500];
  settings.robustnessResidual=[300,400,500];
  const base=sanitizeConfig({...baseCfg,alnWidthMode:"process"});
  const effectiveW0 = base.mechMode==="calibrated" ? settings.robustnessW0 : [base.w0Um];
  const out={version:"final-11.0",startedAt:new Date().toISOString(),settings:{...settings,effectiveRobustnessW0:effectiveW0,nominalAlnResidualMPa:base.alnResidualMPa},stages:{},final:null};

  // Stage 1: layout screening at the locked, literature-supported process cross-section.
  // Every candidate uses depth = 1 µm and width = 2 µm; only layout/coverage is compared.
  const s1=[]; let done=0,total=settings.patterns.length*settings.extensions.length*settings.depthValues.length;
  for(const pattern of settings.patterns){
    for(const extension of settings.extensions){
      for(const depthUm of settings.depthValues){
        await notify(hooks,{stage:1,name:"Reinforcement layout screening",done,total,message:`${designNameForProgress(pattern,extension)} · fixed depth=1 µm · fixed width=2 µm`});
        const c=doeConfig(base,{alnPattern:pattern,alnTopology:extension,alnTUm:depthUm,alnResidualMPa:base.alnResidualMPa,tsvShiftY:0},settings);
        const m=mechanicalSolve(c),t=thermalSolve(c,settings.screenThermalGrid);
        const row={id:topologyId({pattern,extension,depthUm}),pattern,extension,depthUm,...caseMetrics(c,m,t)};
        Object.assign(row,applyGate(row,settings.gate)); s1.push(row); done++;
      }
    }
  }
  await notify(hooks,{stage:1,name:"Topology screening",done:total,total,message:"Scoring Stage 1"});
  const rank1=scoreRows(s1,settings.weights,{warpageGetter:r=>r.warpageReductionPct,localGetter:r=>r.localDeviationUm,thermalGetter:r=>r.thermalImproveK});
  const top5=rank1.filter(r=>r.feasible).slice(0,settings.topK1);
  out.stages.stage1={all:rank1,top:top5};

  // Stage 2: refine geometry; residual stress is uncertainty, not optimized design variable.
  const geom=[]; total=top5.length*settings.yShiftValues.length;done=0;
  for(const parent of top5){
      for(const yShift of settings.yShiftValues){
        await notify(hooks,{stage:2,name:"Position + process-variation refinement",done,total,message:`${designNameForProgress(parent.pattern,parent.extension)}, depth=${parent.depthUm} µm, TSV Y=${yShift}`});
        const baseDesign={alnPattern:parent.pattern,alnTopology:parent.extension,alnTUm:parent.depthUm,tsvShiftY:yShift};
        const thermalCfg=doeConfig(base,{...baseDesign,alnResidualMPa:base.alnResidualMPa},settings);
        const t=thermalSolve(thermalCfg,settings.screenThermalGrid);
        const mechRows=[];
        for(const stress of settings.residualValues){
          const c=doeConfig(base,{...baseDesign,alnResidualMPa:stress},settings);
          const m=mechanicalSolve(c);
          mechRows.push({stress,m,c});
        }
        const m0=mechRows.find(x=>Math.abs(x.stress-base.alnResidualMPa)<1e-9)?.m || mechRows[Math.floor(mechRows.length/2)].m;
        const reductions=mechRows.map(x=>x.m.reductionPct),warps=mechRows.map(x=>x.m.totalUm),locals=mechRows.map(x=>localDeviation(x.m));
        const raw=caseMetrics(thermalCfg,m0,t);
        const row={
          id:candidateId({pattern:parent.pattern,extension:parent.extension,depthUm:parent.depthUm,tsvShiftY:yShift}),
          parentId:parent.id,pattern:parent.pattern,extension:parent.extension,depthUm:parent.depthUm,z:raw.z,tsvShiftY:yShift,
          widthUm:raw.widthUm,actualVolPct:raw.actualVolPct,widthDepthRatio:raw.widthDepthRatio,volumeErrorPct:raw.volumeErrorPct,
          meanWarpageUm:mean(warps),meanWarpageReductionPct:mean(reductions),worstWarpageReductionPct:Math.min(...reductions),
          warpageCriterion:0.7*mean(reductions)+0.3*Math.min(...reductions),
          stressSpreadUm:Math.max(...warps)-Math.min(...warps),
          meanLocalDeviationUm:mean(locals),
          thermalTmaxC:t.tmax,thermalImproveK:t.tmaxReductionC,thermalImprovePct:t.tmaxReductionPct,
          thermalEnergyErrorPct:t.energyErrorPct,geometryValid:raw.geometryValid,
          mechFinite:mechRows.every(x=>[x.m.totalUm,x.m.kxCenter,x.m.kyCenter].every(finite)),thermalFinite:raw.thermalFinite,
          residualCases:mechRows.map(x=>({stress:x.stress,warpageUm:x.m.totalUm,reductionPct:x.m.reductionPct,localDeviationUm:localDeviation(x.m)}))
        };
        row.warpageReductionPerAlnVol = row.actualVolPct>1e-12 ? row.meanWarpageReductionPct/row.actualVolPct : NaN;
        Object.assign(row,applyGate({...row,warpageUm:row.meanWarpageUm,warpageReductionPct:row.meanWarpageReductionPct,localDeviationUm:row.meanLocalDeviationUm},settings.gate));
        geom.push(row);done++;
      }
  }
  await notify(hooks,{stage:2,name:"Geometry refinement",done:total,total,message:"Scoring Stage 2"});
  const rank2=scoreRows(geom,settings.weights,{warpageGetter:r=>r.warpageCriterion,localGetter:r=>r.meanLocalDeviationUm,thermalGetter:r=>r.thermalImproveK});
  const top3=rank2.filter(r=>r.feasible).slice(0,settings.topK2);
  out.stages.stage2={all:rank2,top:top3,note:`AlN process residual stress is nominally ${base.alnResidualMPa} MPa tensile; ${settings.residualValues.join('/')} MPa is used only as process-variation sensitivity.`};

  // Stage 3 robustness: cache separable mechanics / thermal dimensions.
  const scenarioMap=new Map();
  const robustByCandidate=new Map();
  total=top3.length*(effectiveW0.length*settings.robustnessOcc.length*settings.robustnessResidual.length + settings.robustnessOcc.length*settings.robustnessLiner.length);done=0;
  for(const cand of top3){
    const mechCache=new Map(),thermCache=new Map();
    for(const w0 of effectiveW0){
      for(const occ of settings.robustnessOcc){
        for(const stress of settings.robustnessResidual){
          await notify(hooks,{stage:3,name:"Robustness",done,total,message:`${designNameForProgress(cand.pattern,cand.extension)} · W0=${w0}, occupancy=${occ}%, AlN stress=${stress} MPa`});
          const c=doeConfig(base,{alnPattern:cand.pattern,alnTopology:cand.extension,alnTUm:cand.depthUm,tsvShiftY:cand.tsvShiftY,w0Um:w0,tsvOccPct:occ,alnResidualMPa:stress},settings);
          const m=mechanicalSolve(c);mechCache.set(`${w0}|${occ}|${stress}`,m);done++;
        }
      }
    }
    for(const occ of settings.robustnessOcc){
      for(const liner of settings.robustnessLiner){
        await notify(hooks,{stage:3,name:"Robustness",done,total,message:`${designNameForProgress(cand.pattern,cand.extension)} · thermal occupancy=${occ}%, liner=${liner} µm`});
        const c=doeConfig(base,{alnPattern:cand.pattern,alnTopology:cand.extension,alnTUm:cand.depthUm,tsvShiftY:cand.tsvShiftY,tsvOccPct:occ,tsvLinerTUm:liner,alnResidualMPa:base.alnResidualMPa},settings);
        const t=thermalSolve(c,settings.screenThermalGrid);thermCache.set(`${occ}|${liner}`,t);done++;
      }
    }
    for(const w0 of effectiveW0)for(const occ of settings.robustnessOcc)for(const liner of settings.robustnessLiner)for(const stress of settings.robustnessResidual){
      const m=mechCache.get(`${w0}|${occ}|${stress}`),t=thermCache.get(`${occ}|${liner}`);
      const scenarioKey=`${w0}|${occ}|${liner}|${stress}`;
      if(!scenarioMap.has(scenarioKey))scenarioMap.set(scenarioKey,[]);
      scenarioMap.get(scenarioKey).push({candidateId:cand.id,pattern:cand.pattern,extension:cand.extension,z:cand.z,tsvShiftY:cand.tsvShiftY,w0,occ,liner,stress,
        warpageReductionPct:m.reductionPct,warpageUm:m.totalUm,localDeviationUm:localDeviation(m),thermalImproveK:t.tmaxReductionC,thermalImprovePct:t.tmaxReductionPct,
        feasible:m.geometryValid&&m.topo.valid&&finite(m.totalUm)&&finite(t.tmax)&&Math.abs(t.energyErrorPct)<=settings.gate.energyErrorPct});
    }
  }
  const counts=new Map(top3.map(c=>[c.id,{top1:0,top2:0,benefit:0,valid:0,total:0}]));
  for(const [key,rows] of scenarioMap){
    const ranked=scoreRows(rows,settings.weights,{warpageGetter:r=>r.warpageReductionPct,localGetter:r=>r.localDeviationUm,thermalGetter:r=>r.thermalImproveK});
    ranked.forEach((r,i)=>{r.rank=i+1;const c=counts.get(r.candidateId);c.total++;if(r.feasible){c.valid++;if(i===0)c.top1++;if(i<2)c.top2++;if(r.warpageReductionPct>=0)c.benefit++;}});
  }
  const robust=[];
  for(const cand of top3){
    const c=counts.get(cand.id),n=Math.max(1,c.total);
    const summary={candidateId:cand.id,top1Pct:100*c.top1/n,top2Pct:100*c.top2/n,benefitPct:100*c.benefit/n,validPct:100*c.valid/n,total:c.total};
    robust.push(summary);robustByCandidate.set(cand.id,summary);
  }
  out.stages.stage3={summary:robust,scenarioCount:scenarioMap.size,records:[...scenarioMap.entries()].flatMap(([scenario,rows])=>rows.map(r=>({scenario,...r})))};

  // Stage 4: 16/20/24 high-stack check at nominal uncertainty values.
  const stackByCandidate=new Map(),stackRows=[]; total=top3.length*settings.highStackCounts.length;done=0;
  for(const cand of top3){
    const rs=[];
    for(const N of settings.highStackCounts){
      await notify(hooks,{stage:4,name:"High-stack check",done,total,message:`${designNameForProgress(cand.pattern,cand.extension)} · ${N}-Hi`});
      const c=doeConfig(base,{alnPattern:cand.pattern,alnTopology:cand.extension,alnTUm:cand.depthUm,tsvShiftY:cand.tsvShiftY,alnResidualMPa:base.alnResidualMPa},settings);
      const m=stackMechanicalProjection(c,N),t=stackThermalProjection(c,N);
      const row={candidateId:cand.id,N,bowUm:m.bowUm,noAlnBowUm:m.noAlnBowUm,bowReductionPct:m.reductionPct,tmaxC:t.tmax,noAlnTmaxC:t.noAln.tmax,
        thermalImproveK:t.tmaxReductionC,thermalImprovePct:t.tmaxReductionPct,energyErrorPct:t.energyErrorPct,hottestLayer:t.hottestLayer,
        feasible:[m.bowUm,t.tmax].every(finite)&&Math.abs(t.energyErrorPct)<=settings.gate.energyErrorPct};
      rs.push(row);stackRows.push(row);done++;
    }
    const summary={candidateId:cand.id,avgBowReductionPct:mean(rs.map(r=>r.bowReductionPct)),avgThermalImproveK:mean(rs.map(r=>r.thermalImproveK)),
      avgThermalImprovePct:mean(rs.map(r=>r.thermalImprovePct)),allPositiveThermal:rs.every(r=>r.thermalImproveK>=-1e-9),allPositiveBow:rs.every(r=>r.bowReductionPct>=-1e-9),
      feasible:rs.every(r=>r.feasible),cases:rs};
    stackByCandidate.set(cand.id,summary);
  }
  out.stages.stage4={summary:[...stackByCandidate.values()],records:stackRows};

  // Stage 5: primary ranking, Pareto, stack tie-breaker.
  await notify(hooks,{stage:5,name:"Final ranking",done:0,total:1,message:"Computing scores / Pareto"});
  const finals=top3.map(c=>({...c,robust:robustByCandidate.get(c.id),stack:stackByCandidate.get(c.id)}));
  scoreRows(finals,settings.weights,{warpageGetter:r=>r.warpageCriterion,localGetter:r=>r.meanLocalDeviationUm,thermalGetter:r=>r.thermalImproveK,robustGetter:r=>r.robust.top2Pct});
  const stackFeasible=finals.filter(r=>r.stack.feasible!==false);
  const stMap=new Map(),sbMap=new Map();
  const st=normalizeHigher(stackFeasible,r=>r.stack.avgThermalImproveK),sb=normalizeHigher(stackFeasible,r=>r.stack.avgBowReductionPct);
  stackFeasible.forEach((r,i)=>{stMap.set(r.id,st[i]);sbMap.set(r.id,sb[i]);});
  finals.forEach(r=>{r.primaryScore=r.score;r.stackScore=r.stack.feasible===false?0:0.5*(stMap.get(r.id)??0)+0.5*(sbMap.get(r.id)??0);});
  finals.sort((a,b)=>{
    const dscore=b.primaryScore-a.primaryScore;
    if(Math.abs(dscore)<=settings.tieBreakPoints)return b.stackScore-a.stackScore;
    return dscore;
  });
  finals.forEach((r,i)=>{r.finalRank=i+1;});

  const feasibleStage2=rank2.filter(r=>r.feasible);
  const pflags=paretoFront(feasibleStage2,r=>r.warpageCriterion,r=>r.thermalImproveK);
  feasibleStage2.forEach((r,i)=>r.pareto=pflags[i]);
  finals.forEach(r=>{r.pareto=!!feasibleStage2.find(x=>x.id===r.id)?.pareto;});

  const winner=finals[0]||null;
  if(winner){
    const wrank=[...finals].sort((a,b)=>b.warpageCriterion-a.warpageCriterion).findIndex(x=>x.id===winner.id)+1;
    const trank=[...finals].sort((a,b)=>b.thermalImproveK-a.thermalImproveK).findIndex(x=>x.id===winner.id)+1;
    const rrank=[...finals].sort((a,b)=>b.robust.top2Pct-a.robust.top2Pct).findIndex(x=>x.id===winner.id)+1;
    winner.primaryBenefitPass=winner.warpageCriterion>0;
    winner.recommendationStatus=winner.primaryBenefitPass?"SCREENING_CANDIDATE":"BEST_OF_TESTED_BUT_NO_POSITIVE_PRIMARY_BENEFIT";
    winner.why=[
      ...(winner.primaryBenefitPass?[]:[`CAUTION: best of the tested design space, but the warpage criterion is still ${winner.warpageCriterion.toFixed(2)}%; do not claim warpage improvement under the current assumptions.`]),
      `Primary screening score Rank ${winner.finalRank}/${finals.length}`,
      `Warpage criterion Rank ${wrank}/${finals.length}: ${winner.warpageCriterion.toFixed(2)}%`,
      `Single-die thermal Rank ${trank}/${finals.length}: ${winner.thermalImproveK>=0?"+":""}${winner.thermalImproveK.toFixed(4)} K`,
      `Robustness Rank ${rrank}/${finals.length}: Top-2 in ${winner.robust.top2Pct.toFixed(1)}% of uncertainty scenarios`,
      `${winner.pareto?"Pareto-optimal":"Non-Pareto"} in Stage-2 warpage/thermal design space`,
      `${settings.highStackCounts.join("/")}-Hi average stack thermal improvement: ${winner.stack.avgThermalImproveK.toFixed(4)} K`
    ];
  }

  // Optional final convergence: top1 free-die only by default; stack verification optional.
  let verification=null;
  if(winner && settings.runFinalVerification){
    const c0=sanitizeConfig({...base,alnPattern:winner.pattern,alnTopology:winner.extension,alnTUm:winner.depthUm,tsvShiftY:winner.tsvShiftY,alnResidualMPa:base.alnResidualMPa,alnWidthMode:"process"});
    await notify(hooks,{stage:5,name:"Final verification",done:0,total:1,message:"Mechanical / thermal convergence"});
    const mg=[31,41,61].map(n=>mechanicalSolve(sanitizeConfig({...c0,mechGrid:n})));
    const tg=[41,61,81].map(n=>thermalSolve(sanitizeConfig({...c0,thermalGrid:n}),n));
    const mechErr=Math.abs(mg[1].totalUm-mg[2].totalUm)/Math.max(Math.abs(mg[2].totalUm),1e-9)*100;
    const thermalErr=Math.abs(tg[1].tmax-tg[2].tmax)/Math.max(Math.abs(tg[2].tmax),1e-9)*100;
    verification={mechErrorPct:mechErr,thermalErrorPct:thermalErr,mechPass:mechErr<=settings.gate.convergenceErrorPct,thermalPass:thermalErr<=settings.gate.convergenceErrorPct,
      mechValues:mg.map((m,i)=>({grid:[31,41,61][i],warpageUm:m.totalUm})),thermalValues:tg.map((t,i)=>({grid:[41,61,81][i],tmaxC:t.tmax,energyErrorPct:t.energyErrorPct}))};
    if(settings.runStackVerification){
      const sg=[];
      for(const n of [11,15,21])sg.push({grid:n,result:stackThermalProjection(sanitizeConfig({...c0,stackGrid:n}),24)});
      const stackErr=Math.abs(sg[1].result.tmax-sg[2].result.tmax)/Math.max(Math.abs(sg[2].result.tmax),1e-9)*100;
      verification.stackErrorPct=stackErr;verification.stackPass=stackErr<=settings.gate.convergenceErrorPct;
      verification.stackValues=sg.map(x=>({grid:x.grid,tmaxC:x.result.tmax,energyErrorPct:x.result.energyErrorPct}));
    }
  }

  out.stages.stage5={ranking:finals,pareto:feasibleStage2.map(r=>({id:r.id,pattern:r.pattern,extension:r.extension,depthUm:r.depthUm,z:r.z,tsvShiftY:r.tsvShiftY,warpageCriterion:r.warpageCriterion,thermalImproveK:r.thermalImproveK,pareto:r.pareto})),verification};
  out.final=winner;
  out.finishedAt=new Date().toISOString();
  await notify(hooks,{stage:5,name:"Final ranking",done:1,total:1,message:"Completed"});
  return out;
}

export function summarizePipeline(result){
  if(!result?.final)return null;
  const f=result.final;
  return {
    rank:f.finalRank,id:f.id,pattern:f.pattern,patternName:patternName(f.pattern),extension:f.extension,extensionName:topologyName(f.extension),depthUm:f.depthUm,z:f.z,tsvShiftY:f.tsvShiftY,
    primaryScore:f.primaryScore,stackScore:f.stackScore,warpageCriterion:f.warpageCriterion,meanWarpageReductionPct:f.meanWarpageReductionPct,
    meanLocalDeviationUm:f.meanLocalDeviationUm,thermalImproveK:f.thermalImproveK,robustTop2Pct:f.robust?.top2Pct??0,pareto:f.pareto,why:f.why||[]
  };
}

export const runDesignOptimization = runV53Pipeline;
