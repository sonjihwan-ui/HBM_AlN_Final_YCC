import assert from "node:assert/strict";
import {
  makeDefaultConfig, stackMechanicalProjection, stackThermalProjection,
  stackMechanicalMasked, stackThermalMasked, presetMask, layerNumbers,
  evaluateSelectivePlacement, cumulativeMechanicalHistory, singleLayerSensitivity,
  presetComparison, priorityDeploymentPlan, benefitCapture
} from "../src/physics.js";

const results=[];
async function check(name,fn){
  const t0=Date.now();
  try{await fn();results.push({name,ok:true,ms:Date.now()-t0});console.log(`PASS  ${name}`);}
  catch(e){results.push({name,ok:false,ms:Date.now()-t0,error:e.message});console.error(`FAIL  ${name}: ${e.message}`);}
}

await check("V6 layer convention: bottom-25 on 16-Hi selects Layers 1-4",()=>{
  const m=presetMask(16,"bottom-25");assert.deepEqual(layerNumbers(m),[1,2,3,4]);
});
await check("Top-25 on 16-Hi selects Layers 13-16",()=>{
  assert.deepEqual(layerNumbers(presetMask(16,"top-25")),[13,14,15,16]);
});
await check("Masked all-baseline/all-modified mechanical exactly match legacy projection endpoints",()=>{
  const c=makeDefaultConfig({alnVolPct:0.3});const N=8,p=stackMechanicalProjection(c,N);
  const b=stackMechanicalMasked(c,Array(N).fill(false)),a=stackMechanicalMasked(c,Array(N).fill(true));
  assert.ok(Math.abs(b.bowUm-p.noAlnBowUm)<1e-10);assert.ok(Math.abs(a.bowUm-p.bowUm)<1e-10);
});
await check("Masked all-baseline/all-modified thermal match legacy projection endpoints",()=>{
  const c=makeDefaultConfig({stackGrid:9,alnVolPct:0.3});const N=4,p=stackThermalProjection(c,N);
  const b=stackThermalMasked(c,Array(N).fill(false)),a=stackThermalMasked(c,Array(N).fill(true));
  assert.ok(Math.abs(b.tmax-p.noAln.tmax)<1e-9);assert.ok(Math.abs(a.tmax-p.tmax)<1e-9);
});
await check("Selective placement produces finite final bow/thermal and layer temperature profile",()=>{
  const c=makeDefaultConfig({stackGrid:9});const mask=[true,true,false,false,false,false];
  const r=evaluateSelectivePlacement(c,mask,{thermal:true});
  assert.ok(Number.isFinite(r.mechanical.selective.bowUm));assert.ok(Number.isFinite(r.thermal.selective.tmax));
  assert.equal(r.thermal.selective.layerMaxC.length,mask.length);assert.equal(r.mechanical.modifiedCount,2);
});
await check("Cumulative stacking history explicitly runs Layer 1 -> N and tracks modified additions",()=>{
  const c=makeDefaultConfig();const mask=[true,false,true,false,true,false];const h=cumulativeMechanicalHistory(c,mask);
  assert.equal(h.length,6);assert.equal(h[0].stage,1);assert.equal(h[5].stage,6);
  assert.equal(h[0].addedModified,true);assert.equal(h[1].addedModified,false);assert.equal(h[5].modifiedCount,3);
});
await check("Benefit capture returns 0% at baseline and 100% at all-modified when full benefit is positive",()=>{
  const c0=benefitCapture(10,10,8),c1=benefitCapture(10,8,8);
  assert.equal(c0.valid,true);assert.ok(Math.abs(c0.capturePct)<1e-9);assert.ok(Math.abs(c1.capturePct-100)<1e-9);
});
await check("One-layer sensitivity scans every layer and assigns finite combined scores",()=>{
  const c=makeDefaultConfig({stackGrid:9});const s=singleLayerSensitivity(c,6,{scanStackGrid:9});
  assert.equal(s.rows.length,6);assert.deepEqual([...s.rows].map(r=>r.layer).sort((a,b)=>a-b),[1,2,3,4,5,6]);assert.ok(s.rows.every(r=>Number.isFinite(r.combinedScore)));
});
await check("Preset comparison includes baseline/custom/all-modified and preserves requested custom mask",()=>{
  const c=makeDefaultConfig({stackGrid:9}),mask=[true,true,false,false,false,false];
  const p=presetComparison(c,6,{scanStackGrid:9,customMask:mask,presets:["all-baseline","bottom-50","all-modified"]});
  assert.ok(p.rows.find(r=>r.preset==="custom"));assert.equal(p.rows.find(r=>r.preset==="custom").modifiedCount,2);
});
await check("Priority deployment plan evaluates all prefix counts and reaches the all-modified endpoint",()=>{
  const c=makeDefaultConfig({stackGrid:9}),s=singleLayerSensitivity(c,6,{scanStackGrid:9});
  const p=priorityDeploymentPlan(c,6,s,{scanStackGrid:9,targets:[50,75,90]});
  assert.equal(p.rows.length,6);assert.equal(p.rows.at(-1).k,6);
  if(p.rows.at(-1).bowCaptureValid)assert.ok(Math.abs(p.rows.at(-1).bowCapturePct-100)<1e-6);
  if(p.rows.at(-1).thermalCaptureValid)assert.ok(Math.abs(p.rows.at(-1).thermalCapturePct-100)<1e-6);
});
await check("Selective thermal energy balance remains within 1%",()=>{
  const c=makeDefaultConfig({stackGrid:9}),t=stackThermalMasked(c,[true,false,true,false,true,false]);
  assert.ok(Math.abs(t.energyErrorPct)<1,`energy error ${t.energyErrorPct}%`);
});
await check("V6 supports 16/20/24-Hi custom masks",()=>{
  const c=makeDefaultConfig();for(const N of [16,20,24]){const mask=Array(N).fill(false);mask[0]=true;mask[N-1]=true;const m=stackMechanicalMasked(c,mask);assert.equal(m.N,N);assert.equal(m.modifiedCount,2);assert.ok(Number.isFinite(m.bowUm));}
});
await check("V6 results are JSON serializable",()=>{
  const c=makeDefaultConfig({stackGrid:9}),r=evaluateSelectivePlacement(c,[true,false,true,false],{thermal:true});const txt=JSON.stringify(r);assert.ok(txt.length>1000);assert.equal(JSON.parse(txt).version,"6.0");
});

const failed=results.filter(r=>!r.ok);
console.log(`\nSelective-deployment self-test summary: ${results.length-failed.length}/${results.length} passed.`);
if(failed.length){console.error(JSON.stringify(failed,null,2));process.exit(1);}
