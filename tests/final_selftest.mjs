import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  makeDefaultConfig, singleLayerSensitivity, deploymentTradeoff,
  runIntegratedFinalStudy, patternName, topologyName, MATERIALS
} from '../src/physics.js';
import { defaultDoeSettings } from '../src/doe.js';

const results=[];
async function check(name,fn){
  const t0=Date.now();
  try{await fn();results.push({name,ok:true,ms:Date.now()-t0});console.log(`PASS  ${name}`);}
  catch(e){results.push({name,ok:false,ms:Date.now()-t0,error:e.message});console.error(`FAIL  ${name}: ${e.message}`);}
}

await check('Final default uses +400 MPa tensile AlN residual stress and no aggregate front/back residual stress',()=>{
  const c=makeDefaultConfig();
  assert.equal(c.alnResidualMPa,400);
  assert.equal(c.alnWidthMode,'process');
  assert.equal(c.alnTUm,1);
  assert.equal(c.alnWidthUm,2);
  assert.equal(MATERIALS.aln.E,300e9);
  assert.equal(MATERIALS.aln.kxy,200);
  assert.equal(MATERIALS.si.kxy,149);
  assert.ok(Math.abs(c.alnZ-c.alnTUm/(2*c.siBodyT))<1e-12);
  assert.equal(c.frontResidualMPa,0);
  assert.equal(c.backResidualMPa,0);
});

await check('Design optimization uses 300/400/500 MPa process-variation sweep',()=>{
  const s=defaultDoeSettings();
  assert.deepEqual(s.residualValues,[300,400,500]);
  assert.deepEqual(s.depthValues,[1]);
  assert.deepEqual(s.robustnessResidual,[300,400,500]);
});

await check('Human-facing topology names do not expose V/T internal codes',()=>{
  for(const v of ['V1','V2','V3']) assert.ok(!/^V\d/.test(patternName(v)));
  for(const t of ['T0','T1','T2','T3','T4']) assert.ok(!/^T\d/.test(topologyName(t)));
});

await check('Cost/performance placement tradeoff can recommend a low-count mask without requiring all-modified bow benefit',()=>{
  const c=makeDefaultConfig({stackGrid:9});
  const s=singleLayerSensitivity(c,8,{scanStackGrid:9,weightMechanical:70,weightThermal:30});
  const d=deploymentTradeoff(c,8,s,{weightMechanical:70,weightThermal:30,targets:[50,75,90]});
  assert.equal(d.N,8);
  assert.ok(d.rows.length>8);
  assert.ok(d.recommendations.length===3);
  assert.ok(d.recommendations.every(r=>r.modifiedCount>=1&&r.modifiedCount<=8));
  assert.ok(d.pareto.length>=1);
});

let integrated=null;
await check('Mini integrated final study runs die optimization then exact selective-stack verification',async()=>{
  const c=makeDefaultConfig({stackGrid:9,thermalGrid:41,mechGrid:31});
  integrated=await runIntegratedFinalStudy(c,{
    designSettings:{
      patterns:['V1','V3'],extensions:['T0','T3'],topK1:2,topK2:2,
      depthValues:[1,2,3],yShiftValues:[0],residualValues:[200,400,600],
      robustnessW0:[70],robustnessOcc:[20],robustnessLiner:[0.2],robustnessResidual:[300,400,500],
      highStackCounts:[16],screenMechGrid:17,screenThermalGrid:21,screenStackGrid:9,
      runFinalVerification:false,runStackVerification:false
    },
    stackCounts:[4],scanStackGrid:9,weightMechanical:70,weightThermal:30,targetPct:90
  });
  assert.equal(integrated.version,'final-11.0');
  assert.ok(integrated.design.final);
  assert.equal(integrated.optimizedConfig.alnResidualMPa,400);
  assert.equal(integrated.optimizedConfig.alnWidthMode,'process');
  assert.equal(integrated.optimizedConfig.alnTUm,1);
  assert.equal(integrated.optimizedConfig.alnWidthUm,2);
  assert.deepEqual(integrated.design.settings.residualValues,[300,400,500]);
  assert.equal(integrated.stacks.length,1);
  assert.ok(Number.isFinite(integrated.stacks[0].exact.mechanical.selective.bowUm));
  assert.ok(Number.isFinite(integrated.stacks[0].exact.thermal.selective.tmax));
  assert.ok(integrated.headline);
});

await check('Final UI removes visible front/back residual inputs and contains complete-study controls/results',async()=>{
  const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.ok(html.includes('id="frontResidualMPa" type="hidden"'));
  assert.ok(html.includes('id="backResidualMPa" type="hidden"'));
  assert.ok(!html.includes('Front residual [MPa]'));
  assert.ok(!html.includes('Back residual [MPa]'));
  for(const id of ['runIntegratedStudy','integratedHeadline','integratedBody','finalTargetPct','runArch24','archBody']) assert.ok(html.includes(`id="${id}"`));
});


await check('Final UI exposes universal-collar geometry and removes the obsolete non-contact-gap control',async()=>{
  const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.ok(html.includes('id="tsvCollarOuterDiaUm"'));
  assert.ok(html.includes('universal 360° AlN collar'));
  assert.ok(html.includes('id="doeDepthValues" type="hidden" value="1"'));
  assert.ok(html.includes('1.0 µm') && html.includes('2.0 µm'));
  assert.ok(html.includes('E = 300 GPa'));
  assert.ok(html.includes('AlN = 200 W/mK')); 
  assert.ok(!html.includes('Auto from target AlN volume'));
  assert.ok(!html.includes('AlN z-position in Si body'));
  assert.ok(html.includes('id="tsvAlnGapUm" type="hidden"'));
  assert.ok(!html.includes('TSV–AlN non-contact Si gap'));
});

const failed=results.filter(r=>!r.ok);
console.log(`\nFinal integrated self-test summary: ${results.length-failed.length}/${results.length} passed.`);
if(failed.length){console.error(JSON.stringify(failed,null,2));process.exit(1);}
