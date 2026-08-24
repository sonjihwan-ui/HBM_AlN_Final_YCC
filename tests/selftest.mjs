import assert from "node:assert/strict";
import {
  makeDefaultConfig,sanitizeConfig,frontSkinProps,buildTopology,mechanicalSolve,
  thermalSolve,stackMechanicalProjection,stackThermalProjection
} from "../src/physics.js";

const results=[];
async function check(name,fn){
  const t0=Date.now();
  try{
    await fn();
    results.push({name,ok:true,ms:Date.now()-t0});
    console.log(`PASS  ${name}`);
  }catch(e){
    results.push({name,ok:false,ms:Date.now()-t0,error:e.message});
    console.error(`FAIL  ${name}: ${e.message}`);
  }
}
const rel=(a,b)=>Math.abs(a-b)/Math.max(Math.abs(a),Math.abs(b),1e-12);

await check("32 µm total thickness bookkeeping gives 28.7 µm Si body",()=>{
  const c=makeDefaultConfig();
  assert.ok(Math.abs(c.siBodyT-28.7)<1e-9);
});

await check("Backside and AlN reference temperatures are hard-clamped at 200 °C",()=>{
  const c=sanitizeConfig({backProcessC:260,alnProcessC:350});
  assert.equal(c.backProcessC,200);
  assert.equal(c.alnProcessC,200);
});

await check("Front Cu fraction is wired into homogenized material properties",()=>{
  const a=frontSkinProps(makeDefaultConfig({frontCuPct:5}));
  const b=frontSkinProps(makeDefaultConfig({frontCuPct:40}));
  assert.ok(Math.abs(a.E-b.E)>1e8);
  assert.ok(Math.abs(a.alpha-b.alpha)>1e-7);
  assert.ok(Math.abs(a.kxy-b.kxy)>1);
});

await check("Constant-AlN-volume topology generator conserves projected target area",()=>{
  const base=makeDefaultConfig({alnVolPct:0.3,alnTUm:2,alnStride:5,alnWidthMode:"auto"});
  const vals=[];
  for(const top of ["T0","T1","T2","T3","T4"]){
    const c=makeDefaultConfig({...base,alnTopology:top});
    const t=buildTopology(c,true);
    assert.ok(Number.isFinite(t.width)&&t.width>0);
    assert.ok(Math.abs(t.areaUnion-t.targetArea)/t.targetArea<1e-8);
    vals.push(t.targetVolume);
  }
  assert.ok(Math.max(...vals)-Math.min(...vals)<1e-14);
});

await check("Primary mapped mechanics returns finite warpage and a no-AlN comparator",()=>{
  const c=makeDefaultConfig({mechGrid:31,alnVolPct:0.3});
  const m=mechanicalSolve(c);
  for(const v of [m.totalUm,m.noAln.totalUm,m.kxCenter,m.kyCenter,m.localDeviationUm]) assert.ok(Number.isFinite(v));
});

await check("Front Cu fraction changes physics-generated mapped mechanics",()=>{
  const c1=makeDefaultConfig({mechMode:"physics",mechGrid:31,frontCuPct:5,alnVolPct:0.3});
  const c2=makeDefaultConfig({...c1,frontCuPct:40});
  const a=mechanicalSolve(c1),b=mechanicalSolve(c2);
  assert.ok(Math.abs(a.noAln.totalUm-b.noAln.totalUm)>1e-4);
});

await check("TSV Y-position is mechanically active in the mapped Ritz model",()=>{
  const base=makeDefaultConfig({mechMode:"physics",mechGrid:31,alnVolPct:0.3});
  const a=mechanicalSolve(makeDefaultConfig({...base,tsvShiftY:0}));
  const b=mechanicalSolve(makeDefaultConfig({...base,tsvShiftY:1}));
  assert.ok(Math.abs(a.totalUm-b.totalUm)>1e-5 || Math.abs(a.localDeviationUm-b.localDeviationUm)>1e-5);
});

await check("TSV shape is mechanically active while total TSV area stays constant",()=>{
  const base=makeDefaultConfig({mechMode:"physics",mechGrid:31,alnVolPct:0.3});
  const a=mechanicalSolve(makeDefaultConfig({...base,tsvShape:"reference"}));
  const b=mechanicalSolve(makeDefaultConfig({...base,tsvShape:"compact"}));
  assert.ok(Math.abs(a.totalUm-b.totalUm)>1e-5 || Math.abs(a.localDeviationUm-b.localDeviationUm)>1e-5);
});

await check("Universal TSV-collar diameter is thermally active",()=>{
  const base=makeDefaultConfig({thermalGrid:31,alnVolPct:0.5,alnTopology:"T3"});
  const a=thermalSolve(makeDefaultConfig({...base,tsvCollarOuterDiaUm:5.5}),31);
  const b=thermalSolve(makeDefaultConfig({...base,tsvCollarOuterDiaUm:6.5}),31);
  assert.ok(Math.abs(a.tmax-b.tmax)>1e-8);
  assert.ok(Math.abs(a.maps.etaCollar-b.maps.etaCollar)>1e-5);
});

await check("Every occupied TSV receives a full-circumference collar through the AlN-depth segment",async()=>{
  const {buildUniversalCollarStats}=await import("../src/topology.js");
  const c=makeDefaultConfig({tsvOccPct:20,alnTUm:1,tsvCollarOuterDiaUm:6});
  const s=buildUniversalCollarStats(c);
  assert.equal(s.candidateSites,32500);
  assert.equal(s.occupiedSites,6500);
  assert.equal(s.recessDepthUm,1);
  assert.ok(Math.abs(s.radialMarginUm-0.75)<1e-12);
  assert.ok(s.collarAreaMm2>0);
});

await check("Universal collars consume the same constant AlN volume budget as ribs",()=>{
  const c=makeDefaultConfig({alnVolPct:0.3,alnTUm:2,alnWidthMode:"auto"});
  const t=buildTopology(c,true);
  assert.ok(t.collar.collarAreaMm2>0);
  assert.ok(Math.abs((t.collar.collarAreaMm2+t.ribArea)-t.targetArea)/t.targetArea<1e-8);
});

await check("Sensitivity process mode locks AlN depth to 1 µm regardless of attempted override",()=>{
  for(const d of [0.2,1,2,3,5]){
    const c=makeDefaultConfig({alnTUm:d});
    assert.equal(c.alnTUm,1);
  }
});

await check("Sensitivity process rule locks rib width = 2 µm and backside-adjacent placement",()=>{
  const c=makeDefaultConfig({alnTUm:3,alnWidthUm:99});
  assert.equal(c.alnWidthMode,"process");
  assert.equal(c.alnTUm,1);
  assert.equal(c.alnWidthUm,2);
  assert.ok(Math.abs(c.alnZ-1/(2*c.siBodyT))<1e-12);
});

await check("Single-die thermal solve conserves requested power",()=>{
  const c=makeDefaultConfig({thermalGrid:31,alnVolPct:0.3});
  const t=thermalSolve(c,31);
  assert.ok(Math.abs(t.energyErrorPct)<0.5,`energy error ${t.energyErrorPct}%`);
});

await check("Topology selection changes at least one mechanical or thermal result",()=>{
  const base=makeDefaultConfig({mechGrid:31,thermalGrid:31,alnVolPct:0.3});
  const a=mechanicalSolve(makeDefaultConfig({...base,alnTopology:"T0"}));
  const b=mechanicalSolve(makeDefaultConfig({...base,alnTopology:"T4"}));
  const ta=thermalSolve(makeDefaultConfig({...base,alnTopology:"T0"}),31);
  const tb=thermalSolve(makeDefaultConfig({...base,alnTopology:"T4"}),31);
  assert.ok(Math.abs(a.totalUm-b.totalUm)>1e-7 || Math.abs(ta.tmax-tb.tmax)>1e-7);
});

await check("Stack mechanical projection is finite and stack-count dependent",()=>{
  const c=makeDefaultConfig({alnVolPct:0.3,mechMode:"calibrated"});
  const a=stackMechanicalProjection(c,4),b=stackMechanicalProjection(c,16);
  assert.ok(Number.isFinite(a.bowUm)&&Number.isFinite(b.bowUm));
  assert.ok(Math.abs(a.bowUm-b.bowUm)>1e-8);
});

await check("Stack thermal projection increases thermal load with stack count",()=>{
  const c=makeDefaultConfig({stackGrid:15,alnVolPct:0.3});
  const a=stackThermalProjection(c,4),b=stackThermalProjection(c,8);
  assert.ok(Number.isFinite(a.tmax)&&Number.isFinite(b.tmax));
  assert.ok(b.totalPowerW>a.totalPowerW);
  assert.ok(b.tmax>a.tmax);
});

await check("Stack thermal solve conserves total core-die power",()=>{
  const c=makeDefaultConfig({stackGrid:15,alnVolPct:0.3});
  const s=stackThermalProjection(c,4);
  assert.ok(Math.abs(s.energyErrorPct)<1.0,`energy error ${s.energyErrorPct}%`);
});


await check("All TSV shape modes preserve 13 mm² total TSV area",async()=>{
  const {buildTsvZones}=await import("../src/geometry.js");
  const base=makeDefaultConfig();
  for(const shape of ["reference","split","compact","aspect"]){
    const c=makeDefaultConfig({...base,tsvShape:shape,tsvAspect:3.0});
    const A=buildTsvZones(c).reduce((a,r)=>a+r.w*r.h,0);
    assert.ok(Math.abs(A-13)<1e-9,`${shape}: ${A}`);
  }
});

await check("Replacement and additive AlN embedding modes are not aliases",()=>{
  const base=makeDefaultConfig({mechGrid:31,alnVolPct:0.5});
  const a=mechanicalSolve(makeDefaultConfig({...base,alnEmbeddingMode:"replacement"}));
  const b=mechanicalSolve(makeDefaultConfig({...base,alnEmbeddingMode:"additive"}));
  assert.ok(Math.abs(a.totalUm-b.totalUm)>1e-6);
});

await check("AlN residual-stress sign is mechanically active",()=>{
  const base=makeDefaultConfig({mechGrid:31,alnVolPct:0.5,alnResidualMPa:0});
  const p=mechanicalSolve(makeDefaultConfig({...base,alnResidualMPa:400}));
  const n=mechanicalSolve(makeDefaultConfig({...base,alnResidualMPa:-400}));
  assert.ok(Math.abs(p.totalUm-n.totalUm)>1e-5 || Math.sign(p.kxCenter)!==Math.sign(n.kxCenter));
});

await check("AlN z-position is mechanically active",()=>{
  const base=makeDefaultConfig({mechGrid:31,alnVolPct:0.5,alnResidualMPa:300,alnWidthMode:"manual",alnWidthUm:2});
  const a=mechanicalSolve(makeDefaultConfig({...base,alnZ:0.25}));
  const b=mechanicalSolve(makeDefaultConfig({...base,alnZ:0.75}));
  assert.ok(Math.abs(a.totalUm-b.totalUm)>1e-5);
});

await check("1-die calibrated stack baseline reproduces W0",()=>{
  const c=makeDefaultConfig({w0Um:70,alnVolPct:0.3,mechMode:"calibrated"});
  const s=stackMechanicalProjection(c,1);
  assert.ok(Math.abs(s.noAlnBowUm-70)<1e-6,`${s.noAlnBowUm}`);
});

await check("UI references only DOM ids that exist in index.html",async()=>{
  const fs=await import("node:fs/promises");
  const app=await fs.readFile(new URL("../src/app.js",import.meta.url),"utf8");
  const html=await fs.readFile(new URL("../index.html",import.meta.url),"utf8");
  const ids=[...app.matchAll(/\$\("([^"]+)"\)/g)].map(m=>m[1]);
  const missing=[...new Set(ids)].filter(id=>!new RegExp(`id=["']${id}["']`).test(html));
  assert.deepEqual(missing,[]);
});


await check("Default 12-Hi / 30 W stack thermal case is calibrated near the ~99 °C HCB-benchmark reference scale",()=>{
  const c=makeDefaultConfig({stackGrid:31});
  const s=stackThermalProjection(c,12);
  assert.equal(s.totalPowerW,30);
  assert.ok(Math.abs(s.tmax-99)<3,`Tmax ${s.tmax} °C`);
});


await check("V1/V2/V3 pattern families are distinct and use the same target AlN volume accounting",()=>{
  const base=makeDefaultConfig({alnVolPct:0.3,alnTopology:"T0",mechGrid:31,alnWidthMode:"auto",alnTUm:2});
  const segs=[],vols=[],warps=[];
  for(const pat of ["V1","V2","V3"]){
    const c=makeDefaultConfig({...base,alnPattern:pat});
    const t=buildTopology(c,true);
    const m=mechanicalSolve(c);
    assert.ok(t.valid,`${pat} invalid at default DOE level`);
    segs.push(t.segments.length);vols.push(t.targetVolume);warps.push(m.totalUm);
  }
  assert.equal(new Set(segs).size,3);
  assert.ok(Math.max(...vols)-Math.min(...vols)<1e-14);
  assert.ok(Math.max(...warps)-Math.min(...warps)>1e-5);
});


await check("TSV SiO2 liner thickness changes baseline Cu lateral participation",async()=>{
  const {tsvLinerParticipation}=await import("../src/homogenization.js");
  const a=tsvLinerParticipation(makeDefaultConfig({tsvLinerTUm:0.2}));
  const b=tsvLinerParticipation(makeDefaultConfig({tsvLinerTUm:1.0}));
  assert.ok(a>b,`eta(0.2)=${a}, eta(1.0)=${b}`);
});

await check("V2 Bank-extension modes include a distinct full-pattern continuation case",()=>{
  const base=makeDefaultConfig({alnPattern:"V2",alnVolPct:0.3,alnWidthMode:"auto"});
  const t3=buildTopology(makeDefaultConfig({...base,alnTopology:"T3"}),true);
  const t4=buildTopology(makeDefaultConfig({...base,alnTopology:"T4"}),true);
  assert.notEqual(t3.segments.length,t4.segments.length);
  assert.ok(Math.abs(t3.targetVolume-t4.targetVolume)<1e-14);
});

const failed=results.filter(r=>!r.ok);
console.log(`\nSelf-test summary: ${results.length-failed.length}/${results.length} passed.`);
if(failed.length){
  console.error(JSON.stringify(failed,null,2));
  process.exit(1);
}
