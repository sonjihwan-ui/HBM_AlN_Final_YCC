import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { makeDefaultConfig, interconnectThermalComparison, THERMAL_ARCHITECTURE_BENCHMARKS } from '../src/physics.js';

const results=[];
async function check(name,fn){
  const t0=Date.now();
  try{await fn();results.push({name,ok:true,ms:Date.now()-t0});console.log(`PASS  ${name}`);}
  catch(e){results.push({name,ok:false,ms:Date.now()-t0,error:e.message});console.error(`FAIL  ${name}: ${e.message}`);}
}

await check('Literature architecture benchmark constants are locked to 4.2/1.2 mm2K/W',()=>{
  assert.equal(THERMAL_ARCHITECTURE_BENCHMARKS.microBumpUnderfillRarea,4.2e-6);
  assert.equal(THERMAL_ARCHITECTURE_BENCHMARKS.hybridBondingRarea,1.2e-6);
  assert.equal(THERMAL_ARCHITECTURE_BENCHMARKS.hbmHbiReferenceReductionPct,22.8);
});

await check('Hybrid bonding benchmark is thermally better than micro-bump + underfill under identical stack boundary conditions',()=>{
  const c=makeDefaultConfig({stackGrid:9});
  const r=interconnectThermalComparison(c,4,[true,false,false,false],9);
  assert.ok(r.microBumpUnderfill.tmax>r.hybridBaseline.tmax);
  assert.ok(r.hcbDeltaK>0);
  assert.ok(r.hcbRthReductionPct>0);
  assert.equal(r.microBumpUnderfill.totalPowerW,r.hybridBaseline.totalPowerW);
});

await check('AlN increment is separated from HCB architecture benefit and energy is conserved',()=>{
  const c=makeDefaultConfig({stackGrid:9});
  const r=interconnectThermalComparison(c,4,[true,true,false,false],9);
  assert.ok(Number.isFinite(r.proposedDeltaK));
  assert.ok(Math.abs(r.maxEnergyErrorPct)<0.5);
  assert.equal(r.modifiedCount,2);
});

await check('Final UI contains the 3-way interconnect thermal architecture panel and architecture verification control',async()=>{
  const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
  for(const id of ['archHead','archBody','archCanvas','runArch24','arch24Status']) assert.ok(html.includes(`id="${id}"`));
  assert.ok(html.includes('µ-bump + underfill'));
  assert.ok(html.includes('Hybrid Bonding vs Proposed HCB + AlN'));
  assert.ok(html.includes('4.2 mm²·K/W'));
  assert.ok(html.includes('1.2 mm²·K/W'));
});

const failed=results.filter(r=>!r.ok);
console.log(`\nThermal architecture self-test summary: ${results.length-failed.length}/${results.length} passed.`);
if(failed.length){console.error(JSON.stringify(failed,null,2));process.exit(1);}
