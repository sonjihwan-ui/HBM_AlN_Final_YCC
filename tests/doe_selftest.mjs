import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { makeDefaultConfig } from '../src/physics.js';
import { parseNumberList, normalizeHigher, normalizeLower, paretoFront, scoreRows, defaultDoeSettings, runV53Pipeline } from '../src/doe.js';

const results=[];
async function check(name,fn){
  const t0=Date.now();
  try{await fn();results.push({name,ok:true,ms:Date.now()-t0});console.log(`PASS  ${name}`);}
  catch(e){results.push({name,ok:false,ms:Date.now()-t0,error:e.message});console.error(`FAIL  ${name}: ${e.message}`);}
}

await check('DOE list parser handles comma/space values and clamps',()=>{
  assert.deepEqual(parseNumberList('0.25, 0.50 0.75',[1],{min:0,max:1}),[0.25,0.5,0.75]);
  assert.deepEqual(parseNumberList('15, 20, 24',[16],{integer:true,min:16,max:24}),[16,20,24]);
});

await check('Higher/lower normalization is monotonic',()=>{
  const rows=[{v:1},{v:2},{v:3}];
  assert.deepEqual(normalizeHigher(rows,r=>r.v).map(v=>Math.round(v)),[0,50,100]);
  assert.deepEqual(normalizeLower(rows,r=>r.v).map(v=>Math.round(v)),[100,50,0]);
});

await check('Pareto detector keeps only non-dominated points',()=>{
  const rows=[{x:1,y:1},{x:2,y:1},{x:1,y:2},{x:2,y:2},{x:3,y:0.5}];
  const f=paretoFront(rows,r=>r.x,r=>r.y);
  assert.deepEqual(f,[false,false,false,true,true]);
});

await check('Primary score respects warpage-heavy weights',()=>{
  const rows=[
    {id:'A',feasible:true,w:10,l:2,t:0.1},
    {id:'B',feasible:true,w:5,l:1,t:0.2}
  ];
  const ranked=scoreRows(rows,{warpage:80,local:10,thermal:10,robust:0},{warpageGetter:r=>r.w,localGetter:r=>r.l,thermalGetter:r=>r.t});
  assert.equal(ranked[0].id,'A');
});

await check('Default design-optimization settings include 16/20/24-Hi high-stack check',()=>{
  const s=defaultDoeSettings();
  assert.deepEqual(s.highStackCounts,[16,20,24]);
  assert.equal(s.weights.warpage,60);
  assert.equal(s.weights.robust,10);
});

let pipelineResult=null;
await check('Mini design-optimization pipeline completes all five stages and returns a final ranked candidate',async()=>{
  const base=makeDefaultConfig({alnWidthMode:'manual',alnWidthUm:9.5});
  const settings={
    patterns:['V1','V3'],extensions:['T0','T3'],topK1:2,topK2:2,
    depthValues:[1,3],yShiftValues:[0],residualValues:[-300,0,300],
    robustnessW0:[40,70],robustnessOcc:[10,20],robustnessLiner:[0.2],robustnessResidual:[-300,300],
    highStackCounts:[16],screenMechGrid:17,screenThermalGrid:21,screenStackGrid:11,
    runFinalVerification:false,runStackVerification:false
  };
  pipelineResult=await runV53Pipeline(base,settings,{isCancelled:()=>false});
  assert.ok(pipelineResult.final);
  assert.equal(pipelineResult.stages.stage1.all.length,4);
  assert.equal(pipelineResult.stages.stage2.all.length,2);
  assert.equal(pipelineResult.stages.stage3.scenarioCount,12);
  assert.equal(pipelineResult.stages.stage4.records.length,2);
  assert.equal(pipelineResult.stages.stage5.ranking.length,2);
});

await check('DOE ranking forcibly uses the process width = 2 × depth rule even if the base UI is manual-width mode',()=>{
  assert.ok(pipelineResult);
  for(const r of pipelineResult.stages.stage1.all){
    assert.equal(r.depthUm,1);
    assert.equal(r.widthUm,2);
    assert.ok(r.actualVolPct>0);
  }
});

await check('Residual stress is a sensitivity dimension, not embedded in Stage-2 design identity',()=>{
  assert.ok(pipelineResult);
  for(const r of pipelineResult.stages.stage2.all){
    assert.ok(!r.id.includes('sigma'));
    assert.equal(r.residualCases.length,3);
  }
});

await check('Robustness summary reports Top-1/Top-2/benefit frequencies in 0–100%',()=>{
  assert.ok(pipelineResult);
  for(const r of pipelineResult.stages.stage3.summary){
    for(const v of [r.top1Pct,r.top2Pct,r.benefitPct,r.validPct])assert.ok(v>=0&&v<=100);
  }
});

await check('Final candidate explicitly labels whether the primary warpage criterion is beneficial',()=>{
  assert.ok(['SCREENING_CANDIDATE','BEST_OF_TESTED_BUT_NO_POSITIVE_PRIMARY_BENEFIT'].includes(pipelineResult.final.recommendationStatus));
  assert.equal(typeof pipelineResult.final.primaryBenefitPass,'boolean');
  assert.ok(pipelineResult.final.why.length>=5);
});

await check('DOE result is JSON serializable for export/review',()=>{
  const txt=JSON.stringify(pipelineResult);
  assert.ok(txt.length>1000);
  const back=JSON.parse(txt);
  assert.equal(back.version,'final-11.0');
});

await check('All app DOM references exist in index.html, including single-quoted $ calls',async()=>{
  const app=await fs.readFile(new URL('../src/app.js',import.meta.url),'utf8');
  const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
  const ids=[...app.matchAll(/\$\((?:"([^"]+)"|'([^']+)')\)/g)].map(m=>m[1]||m[2]);
  const missing=[...new Set(ids)].filter(id=>!new RegExp(`id=["']${id}["']`).test(html));
  assert.deepEqual(missing,[]);
});


await check('Physics-generated mode disables redundant W0 robustness dimension',async()=>{
  const base=makeDefaultConfig({mechMode:'physics'});
  const settings={
    patterns:['V1','V3'],extensions:['T0','T3'],topK1:2,topK2:2,
    depthValues:[1],yShiftValues:[0],residualValues:[0],
    robustnessW0:[40,70,100],robustnessOcc:[10,20],robustnessLiner:[0.2],robustnessResidual:[-300,300],
    highStackCounts:[16],screenMechGrid:17,screenThermalGrid:21,screenStackGrid:11,runFinalVerification:false
  };
  const r=await runV53Pipeline(base,settings,{isCancelled:()=>false});
  assert.equal(r.settings.effectiveRobustnessW0.length,1);
  assert.equal(r.stages.stage3.scenarioCount,6);
});


await check('Pipeline cancellation hook stops DOE cleanly',async()=>{
  let calls=0,threw=false;
  try{
    await runV53Pipeline(makeDefaultConfig(),{patterns:['V1'],extensions:['T0'],topK1:1,topK2:1,depthValues:[1],yShiftValues:[0],residualValues:[0],robustnessW0:[70],robustnessOcc:[20],robustnessLiner:[0.2],robustnessResidual:[0],highStackCounts:[16],screenMechGrid:17,screenThermalGrid:21,screenStackGrid:11,runFinalVerification:false},{onProgress:()=>{calls++;},isCancelled:()=>calls>=1});
  }catch(e){threw=e.message==='DOE_CANCELLED';}
  assert.equal(threw,true);
});

const failed=results.filter(r=>!r.ok);
console.log(`\nDie-design optimization self-test summary: ${results.length-failed.length}/${results.length} passed.`);
if(failed.length){console.error(JSON.stringify(failed,null,2));process.exit(1);}
