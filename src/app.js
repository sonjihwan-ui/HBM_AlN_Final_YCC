import {
  sanitizeConfig, frontSkinProps, backSkinProps,
  buildTsvZones, baseProxyZones, patternName, topologyName, designName,
  mechanicalSolve, thermalSolve, stackMechanicalProjection,
  stackThermalProjection, presetMask, layerNumbers, evaluateSelectivePlacement,
  cumulativeMechanicalHistory, singleLayerSensitivity, presetComparison,
  priorityDeploymentPlan, selectiveSummary, runIntegratedFinalStudy, interconnectThermalComparison
} from "./physics.js";
import { runV53Pipeline, parseNumberList } from "./doe.js";

const $ = id => document.getElementById(id);
const STACK_SWEEP_COUNTS = [4,8,12,16,20,24];
const numericIds = [
  "totalDieT","coreSize","frontT","backT","tsvW","tsvH","tsvAspect","tsvSplitGap","tsvShiftX","tsvShiftY",
  "tsvPitchUm","tsvDiaUm","tsvOccPct","tsvLinerTUm","tsvLinerK","tsvCollarOuterDiaUm","frontCuPct","frontResidualMPa","backResidualMPa","frontProcessC",
  "backProcessC","tsvRefC","finalC","w0Um","mechGrid","alnStride","alnTUm","alnVolPct","alnWidthUm","alnZ","alnResidualMPa",
  "alnProcessC","alnOffsetX","alnOffsetY","tsvAlnGapUm","bankPowerW","tsvPowerW","ambientC","externalRthKW",
  "thermalGrid","basePhyPowerW","baseTsvPowerW","bondTUm","stackGrid","bondE_GPa","bondCTE_ppm","bondK","bondRarea"
];
const enumIds = ["tsvShape","mechMode","warpSign","alnPattern","alnV3Direction","alnTopology","alnWidthMode","alnEmbeddingMode","stackOrientation"];
let lastTable = { headers:[], rows:[], title:"" };
let lastStackSweep = null;
let lastV53Result = null;
let v53Cancelled = false;
let activeSweepTab = "stage1";
let lastV6Selected = null;
let lastV6History = null;
let lastV6Sensitivity = null;
let lastV6Presets = null;
let lastV6Plan = null;
let lastArchitecture24 = null;
let lastIntegratedStudy = null;
function v6ConfigSignature(c=readConfig()){
  const copy={...c};delete copy.validationWarnings;
  return JSON.stringify(copy);
}
function invalidateV6ForConfigChange(){
  lastV6Selected=null;lastV6History=null;lastV6Sensitivity=null;lastV6Presets=null;lastV6Plan=null;
  const badge=$("v6StatusBadge");if(badge){badge.className="neutralBadge warn";badge.textContent="Main parameters changed";}
}

function readConfig(){
  const raw = {};
  for (const id of numericIds) raw[id] = +$(id).value;
  for (const id of enumIds) raw[id] = $(id).value;
  raw.warpSign = +raw.warpSign;
  raw.includeBasePower = $("includeBasePower").checked;
  return sanitizeConfig(raw);
}
function normalizeCriticalInputs(c){
  $("backProcessC").value = c.backProcessC;
  $("alnProcessC").value = c.alnProcessC;
  $("alnTUm").value = c.alnTUm;
  $("alnWidthUm").value = c.alnWidthUm;
  $("alnZ").value = c.alnZ;
  $("tsvCollarOuterDiaUm").value = c.tsvCollarOuterDiaUm;
}
function fmt(v,d=2){ return Number.isFinite(v) ? v.toFixed(d) : "—"; }
function pct(v,d=1){ return `${fmt(v,d)} %`; }
function svgEl(name,attrs={}){ const e=document.createElementNS("http://www.w3.org/2000/svg",name); for(const[k,v] of Object.entries(attrs)) e.setAttribute(k,v); return e; }
function updateRangeLabels(){
  document.querySelectorAll("[data-for]").forEach(el=>{
    const id=el.dataset.for, v=+$(id).value;
    const suffix = id.includes("Pct") ? " %" : ["w0Um","tsvAlnGapUm","alnWidthUm"].includes(id) ? " µm" : id==="alnResidualMPa" ? " MPa" : "";
    el.textContent = (id==="alnZ"||id==="alnVolPct" ? v.toFixed(2) : v.toFixed(0)) + suffix;
  });
}

function drawBase(){
  const svg=$("baseMap"); svg.innerHTML="";
  const proxy=baseProxyZones(), pad=25, S=390, scale=S/11, cx=220, cy=220;
  svg.appendChild(svgEl("rect",{x:pad,y:pad,width:S,height:S,fill:"#eef1f4",stroke:"#333"}));
  const draw=(r,fill,label)=>{
    const x=cx+(r.cx-r.w/2)*scale, y=cy-(r.cy+r.h/2)*scale;
    svg.appendChild(svgEl("rect",{x,y,width:r.w*scale,height:r.h*scale,fill,stroke:"#333","stroke-width":"1"}));
    const t=svgEl("text",{x:cx+r.cx*scale,y:cy-r.cy*scale+5,"text-anchor":"middle","font-size":"17","font-weight":"800",fill:"#fff"}); t.textContent=label; svg.appendChild(t);
  };
  draw(proxy.phy,"#df9858","PHY"); draw(proxy.tsv,"#e77d2f","TSV"); draw(proxy.da,"#c9a94d","DA");
  svg.appendChild(svgEl("line",{x1:pad,y1:cy,x2:pad+S,y2:cy,stroke:"#7e8994","stroke-dasharray":"4 4"}));
}

function drawCore(c,m){
  const svg=$("coreMap"); svg.innerHTML="";
  const pad=25,S=390,L=c.coreSize,scale=S/L,cx=220,cy=220;
  svg.appendChild(svgEl("rect",{x:pad,y:pad,width:S,height:S,fill:"#e9edf2",stroke:"#333"}));
  for(const r of m.zones){
    const x=cx+(r.cx-r.w/2)*scale, y=cy-(r.cy+r.h/2)*scale;
    svg.appendChild(svgEl("rect",{x,y,width:r.w*scale,height:r.h*scale,fill:"#e77d2f",opacity:".82",stroke:"#7c3f16"}));
  }
  // Universal collar population is far below drawing resolution at 20 µm pitch,
  // so show a representative sampling only. Calculation uses the full occupancy-based population.
  if(m.topo.collar?.occupiedSites>0){
    for(const r of m.zones){
      const nx=10,ny=Math.max(2,Math.round(10*r.h/Math.max(r.w,0.1)));
      for(let jy=0;jy<ny;jy++)for(let ix=0;ix<nx;ix++){
        if(((ix+2*jy)%5)!==0)continue;
        const xmm=r.cx-r.w/2+(ix+0.5)*r.w/nx,ymm=r.cy-r.h/2+(jy+0.5)*r.h/ny;
        svg.appendChild(svgEl("circle",{cx:cx+xmm*scale,cy:cy-ymm*scale,r:2.2,fill:"none",stroke:"#7ce3e0","stroke-width":"1.4",opacity:".95"}));
      }
    }
  }
  const visW=Math.max(.7,m.topo.width*scale);
  for(const s of m.topo.segments){
    svg.appendChild(svgEl("line",{
      x1:cx+s.x1*scale,y1:cy-s.y1*scale,x2:cx+s.x2*scale,y2:cy-s.y2*scale,
      stroke:"#3f6fd8","stroke-width":visW,"stroke-linecap":"round",opacity:".82"
    }));
  }
  svg.appendChild(svgEl("line",{x1:pad,y1:cy,x2:pad+S,y2:cy,stroke:"#929ba5","stroke-dasharray":"3 4"}));
  svg.appendChild(svgEl("line",{x1:cx,y1:pad,x2:cx,y2:pad+S,stroke:"#929ba5","stroke-dasharray":"3 4"}));
}

function drawWarp(m){
  const cv=$("warpCanvas"), ctx=cv.getContext("2d"), W=cv.width, H=cv.height;
  ctx.clearRect(0,0,W,H); ctx.fillStyle="#fff"; ctx.fillRect(0,0,W,H);
  const n=m.nodeN, mid=Math.floor(n/2);
  const xs=[], ys=[];
  for(let i=0;i<n;i++){ xs.push(m.W[mid*n+i]*1e6); ys.push(m.W[i*n+mid]*1e6); }
  const all=[...xs,...ys], lo=Math.min(...all), hi=Math.max(...all), span=Math.max(hi-lo,1e-9), pad=34;
  ctx.strokeStyle="#d9dfe7"; ctx.beginPath(); ctx.moveTo(pad,H-pad); ctx.lineTo(W-pad,H-pad); ctx.stroke();
  const plot=(arr,stroke)=>{ ctx.strokeStyle=stroke; ctx.lineWidth=2; ctx.beginPath(); arr.forEach((v,i)=>{ const x=pad+(W-2*pad)*i/(n-1), y=H-pad-(H-2*pad)*(v-lo)/span; if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke(); };
  plot(xs,"#3f6fd8"); plot(ys,"#e77d2f");
  ctx.fillStyle="#222"; ctx.font="12px system-ui"; ctx.fillText("X centerline",pad,17); ctx.fillStyle="#3f6fd8"; ctx.fillRect(pad+76,9,18,3);
  ctx.fillStyle="#222"; ctx.fillText("Y centerline",pad+120,17); ctx.fillStyle="#e77d2f"; ctx.fillRect(pad+196,9,18,3);
  ctx.fillStyle="#667085"; ctx.fillText(`${lo.toFixed(1)} µm`,4,H-pad); ctx.fillText(`${hi.toFixed(1)} µm`,4,pad);
}

function analyzeSections(m){
  const n=m.nodeN, mid=Math.floor(n/2);
  const xs=[], ys=[];
  for(let i=0;i<n;i++){ xs.push(m.W[mid*n+i]*1e6); ys.push(m.W[i*n+mid]*1e6); }
  const xCenter=xs[mid], yCenter=ys[mid], xEdge=(xs[0]+xs[n-1])/2, yEdge=(ys[0]+ys[n-1])/2;
  const xDelta=xCenter-xEdge, yDelta=yCenter-yEdge;
  const lab=v=>Math.abs(v)<1e-6?"flat / near-zero":(v>0?"center higher than edges":"center lower than edges");
  return {xs,ys,xCenter,yCenter,xEdge,yEdge,xDelta,yDelta,xLabel:lab(xDelta),yLabel:lab(yDelta)};
}

function drawSection(m){
  const info=analyzeSections(m);
  const cv=$("sectionCanvas"), ctx=cv.getContext("2d"), W=cv.width, H=cv.height;
  ctx.clearRect(0,0,W,H); ctx.fillStyle="#fff"; ctx.fillRect(0,0,W,H);
  const panels=[{title:"X-direction section", arr:info.xs, x:18},{title:"Y-direction section", arr:info.ys, x:W/2+10}];
  for(const p of panels){
    const x0=p.x, y0=28, w=W/2-28, h=H-50, pad=18;
    const arr=p.arr, lo=Math.min(...arr), hi=Math.max(...arr), span=Math.max(hi-lo,1e-9);
    ctx.fillStyle="#f7f9fb"; ctx.strokeStyle="#e6ebf1"; ctx.lineWidth=1; ctx.fillRect(x0,y0,w,h); ctx.strokeRect(x0,y0,w,h);
    ctx.fillStyle="#111"; ctx.font="12px system-ui"; ctx.fillText(p.title,x0+8,y0+14);
    ctx.strokeStyle="#c8d1db"; ctx.beginPath(); ctx.moveTo(x0+pad,y0+h/2); ctx.lineTo(x0+w-pad,y0+h/2); ctx.stroke();
    ctx.strokeStyle=p.title.startsWith('X')?"#3f6fd8":"#e77d2f"; ctx.lineWidth=2.2; ctx.beginPath();
    arr.forEach((v,i)=>{ const x=x0+pad+(w-2*pad)*i/(arr.length-1), y=y0+h-pad-(h-2*pad)*(v-lo)/span; if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y); });
    ctx.stroke();
    const center=arr[Math.floor(arr.length/2)], edge=(arr[0]+arr[arr.length-1])/2;
    ctx.fillStyle="#344054"; ctx.font="11px system-ui"; ctx.fillText(`center ${center.toFixed(2)} µm / edge ${edge.toFixed(2)} µm`,x0+8,y0+h-8);
    const cx=x0+pad+(w-2*pad)*0.5, cy=y0+h-pad-(h-2*pad)*(center-lo)/span;
    ctx.fillStyle="#111"; ctx.beginPath(); ctx.arc(cx,cy,3,0,Math.PI*2); ctx.fill();
    ctx.fillText("center",cx+6,cy-6);
  }
  // orientation guide
  ctx.fillStyle="#54606f"; ctx.font="11px system-ui";
  ctx.fillText("Guide: blue/orange curves are section side-views of the warped die. If center is above edges, the section bows upward in this plotted sign convention.",18,H-8);
  return info;
}

function drawThermal(sol){
  const cv=$("thermalCanvas"), ctx=cv.getContext("2d"), W=cv.width, H=cv.height, n=sol.maps.n;
  const img=ctx.createImageData(n,n), lo=sol.tmin, hi=sol.tmax, span=Math.max(hi-lo,1e-9);
  const color=u=>{
    u=Math.max(0,Math.min(1,u)); let r,g,b;
    if(u<.33){const q=u/.33; r=25; g=75+150*q; b=230;}
    else if(u<.66){const q=(u-.33)/.33; r=25+215*q; g=225; b=230-175*q;}
    else{const q=(u-.66)/.34; r=240; g=225-175*q; b=55-30*q;}
    return [r|0,g|0,b|0,255];
  };
  for(let y=0;y<n;y++) for(let x=0;x<n;x++){
    const [r,g,b,a]=color((sol.T[y*n+x]-lo)/span), id=((n-1-y)*n+x)*4;
    img.data[id]=r; img.data[id+1]=g; img.data[id+2]=b; img.data[id+3]=a;
  }
  const off=document.createElement("canvas"); off.width=n; off.height=n; off.getContext("2d").putImageData(img,0,0);
  ctx.clearRect(0,0,W,H); ctx.imageSmoothingEnabled=false; ctx.drawImage(off,0,0,W,H);
  ctx.fillStyle="rgba(255,255,255,.9)"; ctx.fillRect(8,8,190,50); ctx.fillStyle="#111"; ctx.font="12px system-ui";
  ctx.fillText(`Tmin ${lo.toFixed(2)} °C`,16,27); ctx.fillText(`Tmax ${hi.toFixed(2)} °C`,16,47);
}

function drawStackSchematic(c,N){
  const cv=$("stackSchematicCanvas"), ctx=cv.getContext("2d"), W=cv.width, H=cv.height;
  ctx.clearRect(0,0,W,H); ctx.fillStyle="#fff"; ctx.fillRect(0,0,W,H);
  const dieT=c.totalDieT, bondT=c.bondTUm, totalCore=N*dieT, totalWithBond=totalCore+Math.max(0,N-1)*bondT;
  const scale=(H-50)/Math.max(totalWithBond,1e-9), x=90, w=220;
  ctx.fillStyle="#111"; ctx.font="13px system-ui"; ctx.fillText(`${N}-Hi current stack schematic (core-die + bond spacing)`,18,18);
  let y=H-20;
  const show=Math.min(N,24);
  for(let i=0;i<show;i++){
    const hDie=Math.max(2,dieT*scale);
    y-=hDie;
    ctx.fillStyle="#d9e3f8"; ctx.fillRect(x,y,w,hDie); ctx.strokeStyle="#6b7c93"; ctx.strokeRect(x,y,w,hDie);
    if(i<3 || i>=show-3 || show<=8){ ctx.fillStyle="#243042"; ctx.font="10px system-ui"; ctx.fillText(`Core ${show-i}`,x+w+10,y+hDie*0.65); }
    // AlN line hint inside die
    const alny=y+(1-c.alnZ)*hDie;
    ctx.strokeStyle="#3f6fd8"; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(x+8,alny); ctx.lineTo(x+w-8,alny); ctx.stroke();
    if(i<show-1){
      const hBond=Math.max(1,bondT*scale);
      y-=hBond; ctx.fillStyle="#ffe2b4"; ctx.fillRect(x,y,w,hBond);
    }
  }
  ctx.fillStyle="#526170"; ctx.font="11px system-ui";
  ctx.fillText(`Core-only height = ${fmt(totalCore,1)} µm`,18,H-28);
  ctx.fillText(`Total height with bonds = ${fmt(totalWithBond,1)} µm`,18,H-12);
  // right axis
  ctx.strokeStyle="#a7b3c2"; ctx.beginPath(); ctx.moveTo(50,H-20); ctx.lineTo(50,H-20-totalWithBond*scale); ctx.stroke();
  ctx.fillStyle="#526170"; ctx.fillText("height",30,30);
}

function drawStackSweep(sweep){
  const cv=$("stackSweepCanvas"), ctx=cv.getContext("2d"), W=cv.width, H=cv.height;
  ctx.clearRect(0,0,W,H); ctx.fillStyle="#fff"; ctx.fillRect(0,0,W,H);
  const padL=42, padR=26, padT=22, padB=28, plotW=W-padL-padR, plotH=H-padT-padB;
  if(!sweep || !sweep.rows?.length){
    ctx.fillStyle="#667085"; ctx.font="13px system-ui"; ctx.fillText("Run stack sweep to draw 4/8/12/16/20/24-Hi trend.",18,28); return;
  }
  const xs=sweep.rows.map(r=>r.N), bow=sweep.rows.map(r=>r.bow), tmax=sweep.rows.map(r=>r.tmax), heights=sweep.rows.map(r=>r.totalHeight);
  const leftMin=Math.min(...bow), leftMax=Math.max(...bow), leftSpan=Math.max(leftMax-leftMin,1e-9);
  const rightMin=Math.min(...tmax), rightMax=Math.max(...tmax), rightSpan=Math.max(rightMax-rightMin,1e-9);
  ctx.strokeStyle="#d9dfe7"; ctx.strokeRect(padL,padT,plotW,plotH);
  const xOf=i=>padL+plotW*(xs[i]-xs[0])/(xs[xs.length-1]-xs[0]);
  const yL=v=>padT+plotH-(v-leftMin)/leftSpan*plotH;
  const yR=v=>padT+plotH-(v-rightMin)/rightSpan*plotH;
  // stack height bars
  const hMin=Math.min(...heights), hMax=Math.max(...heights), hSpan=Math.max(hMax-hMin,1e-9);
  heights.forEach((h,i)=>{
    const x=xOf(i)-11, hh=18+42*(h-hMin)/hSpan;
    ctx.fillStyle="rgba(201,169,77,.25)"; ctx.fillRect(x,padT+plotH-hh,22,hh);
  });
  const plot=(arr,color,yf)=>{ ctx.strokeStyle=color; ctx.lineWidth=2.2; ctx.beginPath(); arr.forEach((v,i)=>{ const x=xOf(i), y=yf(v); if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke(); ctx.fillStyle=color; arr.forEach((v,i)=>{ const x=xOf(i), y=yf(v); ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill(); }); };
  plot(bow,"#3f6fd8",yL); plot(tmax,"#e77d2f",yR);
  ctx.fillStyle="#526170"; ctx.font="11px system-ui";
  xs.forEach((n,i)=>ctx.fillText(String(n),xOf(i)-6,H-8));
  ctx.fillText("stack count",W/2-24,H-8);
  ctx.fillStyle="#3f6fd8"; ctx.fillText(`Bow: ${leftMin.toFixed(1)}–${leftMax.toFixed(1)} µm`,12,14);
  ctx.fillStyle="#e77d2f"; ctx.fillText(`Tmax: ${rightMin.toFixed(1)}–${rightMax.toFixed(1)} °C`,W-170,14);
  ctx.fillStyle="#8f6a00"; ctx.fillText("pale bars = total height",W/2-62,14);
}

function setTable(title,headers,rows){
  lastTable={title,headers,rows}; $("tableTitle").textContent=title;
  $("tableHead").innerHTML=`<tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr>`;
  $("tableBody").innerHTML=rows.map(r=>`<tr>${r.map(v=>`<td>${v}</td>`).join("")}</tr>`).join("");
}

function updateMechanical(){
  updateRangeLabels();
  const c=readConfig(); normalizeCriticalInputs(c);
  $("alnWidthUm").disabled = true;
  if($("processWidthOut")) $("processWidthOut").textContent=`${fmt(c.alnWidthUm,1)} µm · width = 2 × ${fmt(c.alnTUm,1)} µm depth`;
  if($("processPlacementOut")) $("processPlacementOut").textContent=`Backside-adjacent · centroid z/t=${fmt(c.alnZ,3)} (automatic)`;
  const f=frontSkinProps(c), b=backSkinProps(c);
  $("siBodyOut").textContent=`${fmt(c.siBodyT,2)} µm`;
  $("mSi").textContent=`${fmt(c.siBodyT,2)} µm`;
  $("skinPropsOut").innerHTML=`Front auto-homogenized: E=${fmt(f.E/1e9,1)} GPa, CTE=${fmt(f.alpha*1e6,2)} ppm/K, kxy=${fmt(f.kxy,1)} W/mK<br>Back auto-homogenized: E=${fmt(b.E/1e9,1)} GPa, CTE=${fmt(b.alpha*1e6,2)} ppm/K, kxy=${fmt(b.kxy,1)} W/mK`;

  let m;
  try{ m=mechanicalSolve(c); }
  catch(err){ $("validBadge").className="bad"; $("validBadge").textContent=`Mechanical error: ${err.message}`; return; }

  $("calBox").style.display = c.mechMode === "calibrated" ? "block" : "none";
  $("tsvLatticeOut").textContent = `Ideal pitch lattice ${m.tsv.nx}×${m.tsv.ny} = ${m.tsv.sites.toLocaleString()} sites; estimated active TSV ≈ ${m.tsv.count.toLocaleString()} @ ${c.tsvOccPct}% occupancy.`;
  $("mTsv").textContent = m.tsv.count.toLocaleString();
  $("mWidth").textContent = `Process ${fmt(m.topo.width*1000,2)} µm`;
  $("mCollar").textContent = `${fmt(m.topo.collar?.outerDiaUm,1)} µm OD · ≈${Math.round(m.topo.collar?.occupiedSites||0).toLocaleString()}`;
  $("collarRecessOut").textContent = `${fmt(m.topo.collar?.recessDepthUm,1)} µm · linked to AlN depth`;
  $("collarDetailOut").textContent = `All occupied TSVs: 360° collar · radial AlN margin ≈ ${fmt(m.topo.collar?.radialMarginUm,2)} µm · collar AlN area ${fmt(m.topo.collar?.collarAreaMm2,4)} mm² (${fmt((m.topo.collar?.collarAreaMm2||0)/Math.max(m.topo.areaUnion,1e-12)*100,2)}% of actual AlN plan area).`;
  $("mVolActual").textContent = `${fmt(m.topo.actualVolPct,3)} %`;
  $("mVolErr").textContent = `${fmt((m.topo.width*1000)/Math.max(c.alnTUm,1e-12),2)}×`;

  $("rW0").textContent=`${fmt(m.noAln.totalUm,2)} µm`;
  $("rW").textContent=`${fmt(m.totalUm,2)} µm`;
  $("rRed").textContent=pct(m.reductionPct,1);
  $("rWx").textContent=`${fmt(m.wxUm,2)} µm`;
  $("rWy").textContent=`${fmt(m.wyUm,2)} µm`;
  $("rK").textContent=`${fmt(m.kxCenter,4)} / ${fmt(m.kyCenter,4)} 1/m`;
  $("rTwist").textContent=`${fmt(m.kxyCenter,4)} 1/m`;
  $("rLocal").textContent=`${fmt(m.localDeviationUm,3)} µm (Ritz mapped)`;

  const sec=drawSection(m);
  $("rXSign").textContent = `${sec.xLabel} (${sec.xDelta>=0?'+':''}${fmt(sec.xDelta,2)} µm)`;
  $("rYSign").textContent = `${sec.yLabel} (${sec.yDelta>=0?'+':''}${fmt(sec.yDelta,2)} µm)`;
  $("rGuide").textContent = c.warpSign>0 ? "User sign + means concave-up calibrated baseline" : "User sign − means convex calibrated baseline";

  const warnings=[...c.validationWarnings];
  if(!m.topo.valid) warnings.push(`AlN geometry infeasible: width ${fmt(m.topo.width*1000,2)} µm > allowed ${fmt(m.topo.maxWidth*1000,2)} µm`);
  if(!m.geometryValid) warnings.push("TSV zone or AlN geometry exceeds valid core-die bounds.");
  $("validBadge").className = warnings.length ? "bad" : "good";
  $("validBadge").textContent = warnings.length ? warnings.join(" · ") : "Geometry / solver ready";
  $("caseSummary").textContent = `${patternName(c.alnPattern)} / ${topologyName(c.alnTopology)} · ${c.mechMode==="calibrated"?"calibrated W₀":"physics-generated"} · TSV ${c.tsvShape}, shift (${c.tsvShiftX}, ${c.tsvShiftY}) mm · universal ${fmt(c.tsvCollarOuterDiaUm,1)} µm TSV collars · AlN ${c.alnEmbeddingMode} · ${c.alnWidthMode==="process"?`process width ${fmt(c.alnWidthUm,1)} µm = 2× depth ${fmt(c.alnTUm,1)} µm`:c.alnWidthMode==="manual"?"manual width override":"legacy constant-volume auto width"}${m.topo.wideBand?" · wide-band rib regime (width > TSV pitch)":""}`;

  const curN = +$("stackCount").value;
  const curCoreH = curN*c.totalDieT, curTotalH = curCoreH + Math.max(0,curN-1)*c.bondTUm;
  $("sCoreHeight").textContent = `${fmt(curCoreH,1)} µm`;
  $("sTotalHeight").textContent = `${fmt(curTotalH,1)} µm`;

  drawBase(); drawCore(c,m); drawWarp(m); drawStackSchematic(c,curN);
  if(lastStackSweep) drawStackSweep(lastStackSweep);
  window.__lastMechanical = m; window.__lastConfig = c;
}

let timer=null;
function scheduleUpdate(){ clearTimeout(timer); timer=setTimeout(updateMechanical,100); }

async function runThermal(){
  const c=readConfig(); $("runThermal").textContent="Solving…"; await new Promise(r=>setTimeout(r,15));
  try{
    const t=thermalSolve(c);
    $("rT0").textContent=`${fmt(t.noAln.tmax,2)} °C`;
    $("rT").textContent=`${fmt(t.tmax,2)} °C`;
    $("rTRed").textContent=`${fmt(t.tmaxReductionC,3)} K (${fmt(t.tmaxReductionPct,2)}%)`;
    $("rHot").textContent=`(${fmt(t.hotx,2)}, ${fmt(t.hoty,2)}) mm`;
    $("rContact").textContent=pct(t.maps.fContact*100,1);
    $("rLiner").textContent=pct(t.maps.etaLiner*100,1);
    $("rCollarEta").textContent=pct(t.maps.etaCollar*100,1);
    $("rGap").textContent=pct(t.maps.recessFraction*100,1);
    $("rEnergy").textContent=pct(t.energyErrorPct,3);
    drawThermal(t); window.__lastThermal=t;
  }catch(e){ alert(`Thermal solver error: ${e.message}`); }
  $("runThermal").textContent="Run single-die thermal";
}

async function runCurrentStack(){
  const c=readConfig(), N=+$("stackCount").value; $("runStack").textContent="Solving stack…"; await new Promise(r=>setTimeout(r,15));
  try{
    const m=stackMechanicalProjection(c,N), t=stackThermalProjection(c,N);
    const coreH=N*c.totalDieT, totalH=coreH+Math.max(0,N-1)*c.bondTUm;
    $("sBow0").textContent=`${fmt(m.noAlnBowUm,2)} µm`;
    $("sBow").textContent=`${fmt(m.bowUm,2)} µm`;
    $("sBowRed").textContent=pct(m.reductionPct,1);
    $("sTmax0").textContent=`${fmt(t.noAln.tmax,2)} °C`;
    $("sTmax").textContent=`${fmt(t.tmax,2)} °C`;
    $("sTRed").textContent=`${fmt(t.tmaxReductionC,3)} K (${fmt(t.tmaxReductionPct,2)}%)`;
    $("sHotLayer").textContent=`${t.hottestLayer} / ${N}`;
    $("sPower").textContent=`${fmt(t.totalPowerW,1)} W`;
    $("sCoreHeight").textContent=`${fmt(coreH,1)} µm`;
    $("sTotalHeight").textContent=`${fmt(totalH,1)} µm`;
    drawStackSchematic(c,N);
    window.__lastStack={m,t};
  }catch(e){ alert(`Stack projection error: ${e.message}`); }
  $("runStack").textContent="Run current stack projection";
}

async function runStackSweepUI(){
  const c=readConfig(), rows=[], raw=[]; $("runStackSweep").textContent="Sweeping stack…";
  for(const N of STACK_SWEEP_COUNTS){
    await new Promise(r=>setTimeout(r,10));
    const m=stackMechanicalProjection(c,N), t=stackThermalProjection(c,N);
    const coreH=N*c.totalDieT, totalH=coreH+Math.max(0,N-1)*c.bondTUm;
    rows.push([`${N}-Hi`,fmt(totalH,1),fmt(m.noAlnBowUm,2),fmt(m.bowUm,2),fmt(m.reductionPct,1),fmt(t.noAln.tmax,2),fmt(t.tmax,2),fmt(t.tmaxReductionC,3),t.hottestLayer,fmt(t.energyErrorPct,3)]);
    raw.push({N,totalHeight:totalH,bow:m.bowUm,tmax:t.tmax,bow0:m.noAlnBowUm,tmax0:t.noAln.tmax});
  }
  setTable("4 / 8 / 12 / 16 / 20 / 24-Hi stack projection",
    ["Stack","Total height [µm]","No-AlN bow [µm]","AlN bow [µm]","Bow red. [%]","No-AlN Tmax [°C]","AlN Tmax [°C]","ΔT improve [K]","Hottest layer","Energy err [%]"],rows);
  lastStackSweep={rows:raw};
  drawStackSweep(lastStackSweep);
  $("runStackSweep").textContent="Sweep 4 / 8 / 12 / 16 / 20 / 24-Hi";
}

async function runPatternDOE(){
  const base=readConfig(), rows=[]; $("runPatternDOE").textContent="Running V1/V2/V3…";
  for(const pat of ["V1","V2","V3"]){
    await new Promise(r=>setTimeout(r,8));
    const c=sanitizeConfig({...base, alnPattern:pat, alnTopology:"T0", thermalGrid:41});
    const m=mechanicalSolve(c), t=thermalSolve(c,41);
    rows.push([patternName(pat),fmt(m.topo.width*1000,2), m.topo.valid?"PASS":"INVALID", fmt(m.topologyVolumeErrorPct,4), fmt(m.totalUm,2), fmt(m.reductionPct,2), fmt(t.tmax,3), fmt(t.tmaxReductionC,4)]);
  }
  setTable("Reinforcement-pattern comparison · current process depth/width",
    ["Pattern","Width [µm]","Validity","Legacy vol err","Warpage [µm]","Warpage red. [%]","Tmax [°C]","Thermal improve [K]"],rows);
  $("runPatternDOE").textContent="Pattern DOE V1 / V2 / V3";
}

async function runTopoDOE(){
  const base=readConfig(), rows=[]; $("runTopoDOE").textContent="Running extension DOE…";
  for(const top of ["T0","T1","T2","T3","T4"]){
    await new Promise(r=>setTimeout(r,8));
    const c=sanitizeConfig({...base, alnTopology:top, thermalGrid:41});
    const m=mechanicalSolve(c), t=thermalSolve(c,41);
    rows.push([topologyName(top),fmt(m.topo.width*1000,2),m.topo.valid?"PASS":"INVALID",fmt(m.totalUm,2),fmt(m.reductionPct,1),fmt(t.tmax,2),fmt(t.tmaxReductionC,3)]);
  }
  setTable("Process-constrained coverage-layout comparison",
    ["Coverage layout","Width [µm]","Geometry","Warpage [µm]","Warpage red. [%]","Tmax [°C]","Thermal improve [K]"],rows);
  $("runTopoDOE").textContent="Bank-extension DOE T0–T4";
}

async function runPosDOE(){
  const base=readConfig(), rows=[]; $("runPosDOE").textContent="Running position DOE…";
  for(const y of [-1,0,1]){
    await new Promise(r=>setTimeout(r,8));
    const c=sanitizeConfig({...base, tsvShiftY:y, thermalGrid:41});
    const m=mechanicalSolve(c), t=thermalSolve(c,41);
    rows.push([`${y>0?"+":""}${y}`, y>0?"toward PHY":y<0?"toward DA/ICE-side proxy":"center", fmt(m.totalUm,2), fmt(m.localDeviationUm,3), fmt(t.tmax,2), fmt(t.tmaxReductionC,3), m.geometryValid?"PASS":"INVALID"]);
  }
  setTable("TSV Y-position dependency · area held constant",
    ["Y shift [mm]","Direction","Warpage [µm]","Local deviation [µm]","Tmax [°C]","AlN thermal improve [K]","Geometry"],rows);
  $("runPosDOE").textContent="TSV Y-position DOE −1 / 0 / +1 mm";
}

async function runShapeDOE(){
  const base=readConfig(), rows=[]; $("runShapeDOE").textContent="Running shape DOE…";
  for(const shape of ["reference","split","compact","aspect"]){
    await new Promise(r=>setTimeout(r,8));
    const c=sanitizeConfig({...base, tsvShape:shape, tsvAspect:shape==="aspect"?3.0:base.tsvAspect, tsvShiftX:0, tsvShiftY:0, thermalGrid:41});
    const m=mechanicalSolve(c), t=thermalSolve(c,41);
    rows.push([shape, fmt(m.totalUm,2), fmt(m.localDeviationUm,3), fmt(t.tmax,2), fmt(t.tmaxReductionC,3), m.geometryValid?"PASS":"INVALID"]);
  }
  setTable("TSV shape dependency · total TSV area held at 13 mm²",
    ["Shape","Warpage [µm]","Local deviation [µm]","Tmax [°C]","AlN thermal improve [K]","Geometry"],rows);
  $("runShapeDOE").textContent="TSV shape DOE";
}

async function runLinerDOE(){
  const base=readConfig(), rows=[]; $("runLinerDOE").textContent="Running liner DOE…";
  for(const tox of [0.2,0.5,1.0]){
    await new Promise(r=>setTimeout(r,8));
    const c=sanitizeConfig({...base, tsvLinerTUm:tox, thermalGrid:41});
    const t=thermalSolve(c,41);
    rows.push([fmt(tox,1), fmt(t.maps.etaLiner*100,2), fmt(t.maps.etaCu*100,2), fmt(t.noAln.tmax,4), fmt(t.tmax,4), fmt(t.tmaxReductionC,5)]);
  }
  setTable("TSV SiO₂-liner sensitivity",
    ["Liner [µm]","Baseline Cu participation [%]","With-AlN Cu participation [%]","No-AlN Tmax [°C]","AlN Tmax [°C]","Improve [K]"],rows);
  $("runLinerDOE").textContent="TSV liner DOE 0.2 / 0.5 / 1.0 µm";
}

async function runMechConv(){
  const c=readConfig(), rows=[]; $("runMechConv").textContent="Checking mechanics…";
  const sols=[];
  for(const n of [31,41,61]){ await new Promise(r=>setTimeout(r,8)); sols.push(mechanicalSolve(sanitizeConfig({...c, mechGrid:n}))); }
  const ref=sols[2].totalUm;
  sols.forEach((m,idx)=>rows.push([`${[31,41,61][idx]}×${[31,41,61][idx]}`, fmt(m.totalUm,4), fmt(m.wxUm,4), fmt(m.wyUm,4), fmt(Math.abs(m.totalUm-ref)/Math.max(Math.abs(ref),1e-9)*100,4), fmt(m.localDeviationUm,5)]));
  setTable("Mapped mechanical grid convergence",
    ["Grid","Warpage [µm]","Wx [µm]","Wy [µm]","Error vs 61 [%]","Local dev. [µm]"],rows);
  $("runMechConv").textContent="Mechanical convergence 31/41/61";
}

async function runConv(){
  const c=readConfig(), rows=[]; $("runConv").textContent="Checking convergence…";
  const sols=[];
  for(const n of [41,61,81]){ await new Promise(r=>setTimeout(r,8)); sols.push(thermalSolve(sanitizeConfig({...c, thermalGrid:n}),n)); }
  const ref=sols[2].tmax;
  sols.forEach(s=>rows.push([`${s.maps.n}×${s.maps.n}`, fmt(s.tmax,4), fmt(s.mean,4), fmt(Math.abs(s.tmax-ref)/Math.max(Math.abs(ref),1e-9)*100,4), s.iterations, fmt(s.energyErrorPct,4)]));
  setTable("Single-die thermal grid convergence",
    ["Grid","Tmax [°C]","Tmean [°C]","Error vs 81 [%]","Iterations","Energy err [%]"],rows);
  $("runConv").textContent="Single-die thermal convergence 41/61/81";
}

async function runStackConv(){
  const base=readConfig(), N=+$("stackCount").value, rows=[]; $("runStackConv").textContent="Checking stack grid…";
  const sols=[];
  for(const n of [15,21,31]){ await new Promise(r=>setTimeout(r,8)); sols.push(stackThermalProjection(sanitizeConfig({...base, stackGrid:n}),N)); }
  const ref=sols[2].tmax;
  sols.forEach((t,idx)=>rows.push([`${[15,21,31][idx]}×${[15,21,31][idx]}×${N}`, fmt(t.noAln.tmax,3), fmt(t.tmax,3), fmt(t.tmaxReductionC,4), fmt(Math.abs(t.tmax-ref)/Math.max(Math.abs(ref),1e-9)*100,3), t.iterations, fmt(t.energyErrorPct,3)]));
  setTable(`${N}-Hi stack thermal grid convergence`,
    ["Grid × layers","No-AlN Tmax [°C]","AlN Tmax [°C]","Improve [K]","Error vs 31 [%]","Iterations","Energy err [%]"],rows);
  $("runStackConv").textContent="Stack thermal convergence 15/21/31";
}


function readDoeSettings(){
  const topK1=Math.max(3,Math.min(10,Math.round(+$('doeTopK1').value||5)));
  const topK2=Math.max(2,Math.min(topK1,Math.round(+$('doeTopK2').value||3)));
  return {
    topK1,topK2,
    depthValues:[1],
    yShiftValues:parseNumberList($('doeYShiftValues').value,[-1,0,1],{min:-3,max:3}),
    residualValues:[300,400,500],
    robustnessW0:parseNumberList($('doeRobustW0').value,[40,70,100],{min:0,max:300}),
    robustnessOcc:parseNumberList($('doeRobustOcc').value,[10,20,30],{min:0,max:100}),
    robustnessLiner:parseNumberList($('doeRobustLiner').value,[0.2,0.5,1.0],{min:0.01,max:5}),
    robustnessResidual:[300,400,500],
    highStackCounts:parseNumberList($('doeHighStacks').value,[16,20,24],{min:4,max:32,integer:true}),
    screenMechGrid:Math.max(15,Math.round(+$('doeMechGrid').value||21)),
    screenThermalGrid:Math.max(21,Math.round(+$('doeThermalGrid').value||25)),
    screenStackGrid:Math.max(11,Math.round(+$('doeStackGrid').value||11)),
    weights:{
      warpage:Math.max(0,+$('doeWeightWarpage').value||0),
      local:Math.max(0,+$('doeWeightLocal').value||0),
      thermal:Math.max(0,+$('doeWeightThermal').value||0),
      robust:Math.max(0,+$('doeWeightRobust').value||0)
    },
    gate:{
      volumeErrorPct:Math.max(0.01,+$('doeGateVolume').value||1),
      energyErrorPct:Math.max(0.01,+$('doeGateEnergy').value||1),
      convergenceErrorPct:Math.max(0.1,+$('doeGateConvergence').value||3)
    },
    tieBreakPoints:1,
    runFinalVerification:$('doeFinalVerification').checked,
    runStackVerification:$('doeStackVerification').checked
  };
}


function updateDoeEstimate(){
  const s=readDoeSettings();
  const stage1=3*5; // 15 layouts at fixed 1 µm depth / 2 µm width
  const stage2Geom=s.topK1*s.yShiftValues.length;
  const stage2Mech=stage2Geom*s.residualValues.length;
  const activeW0=readConfig().mechMode==='calibrated'?s.robustnessW0.length:1;
  const robustScenarios=activeW0*s.robustnessOcc.length*s.robustnessLiner.length*s.robustnessResidual.length;
  const robustComparisons=robustScenarios*s.topK2;
  const stackCases=s.topK2*s.highStackCounts.length;
  const w0Note=readConfig().mechMode==='calibrated'?'':' · W₀ robustness inactive in physics-generated mode';
  $('doeCaseEstimate').textContent=`Expected: ${stage1} pattern/coverage layouts · ${stage2Geom} refined geometries / ${stage2Mech} process-stress evaluations · ${robustScenarios} robustness scenarios / ${robustComparisons} candidate comparisons · ${stackCases} high-stack checks${w0Note}`;
}

function updateDoeWeightSum(){
  const ids=['doeWeightWarpage','doeWeightLocal','doeWeightThermal','doeWeightRobust'];
  const sum=ids.reduce((a,id)=>a+(+$(`${id}`).value||0),0);
  const el=$('doeWeightSum');
  el.textContent=`Weight sum = ${sum.toFixed(0)}%${Math.abs(sum-100)>1e-9?' · pipeline will normalize internally':''}`;
  el.style.color=Math.abs(sum-100)<1e-9?'#2f8059':'#a66a12';
}

function setPipelineStage(stage,state,message=''){
  for(let i=1;i<=5;i++){
    const el=$(`doeStage${i}`); if(!el)continue;
    if(i<stage && state==='running')el.className='pipelineStep done';
    else if(i===stage)el.className=`pipelineStep ${state}`;
    else if(state==='done' && i<=stage)el.className='pipelineStep done';
    else if(state==='failed' && i===stage)el.className='pipelineStep failed';
  }
  if(message){
    const el=$(`doeStage${stage}`)?.querySelector('small');
    if(el)el.textContent=message;
  }
}

function handlePipelineProgress(p){
  const frac=p.total>0?p.done/p.total:0;
  const overall=Math.max(0,Math.min(1,((p.stage-1)+frac)/5));
  $('doeProgressBar').style.width=`${(overall*100).toFixed(1)}%`;
  $('doeProgressText').textContent=`${p.name} · ${p.done}/${p.total} · ${p.message||''}`;
  $('doeOverallBadge').className='neutralBadge running';
  $('doeOverallBadge').textContent=p.name;
  setPipelineStage(p.stage,'running',p.message||'Running…');
}

function drawPareto(result){
  const cv=$('paretoCanvas'),ctx=cv.getContext('2d'),W=cv.width,H=cv.height;
  ctx.clearRect(0,0,W,H);ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
  const rows=result?.stages?.stage5?.pareto||[];
  if(!rows.length){ctx.fillStyle='#667085';ctx.font='13px system-ui';ctx.fillText('Run die-design optimization to generate the Pareto map.',18,28);return;}
  const xs=rows.map(r=>r.warpageCriterion),ys=rows.map(r=>r.thermalImproveK);
  let xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
  if(Math.abs(xmax-xmin)<1e-9){xmin-=1;xmax+=1;}if(Math.abs(ymax-ymin)<1e-9){ymin-=.001;ymax+=.001;}
  const padL=58,padR=24,padT=24,padB=45,pw=W-padL-padR,ph=H-padT-padB;
  const xof=v=>padL+(v-xmin)/(xmax-xmin)*pw,yof=v=>padT+ph-(v-ymin)/(ymax-ymin)*ph;
  ctx.strokeStyle='#d8dee7';ctx.strokeRect(padL,padT,pw,ph);
  ctx.fillStyle='#596675';ctx.font='11px system-ui';ctx.fillText('Warpage criterion [%] →',W/2-55,H-10);
  ctx.save();ctx.translate(13,H/2+35);ctx.rotate(-Math.PI/2);ctx.fillText('Single-die thermal improvement [K] →',0,0);ctx.restore();
  const finalIds=new Set((result.stages.stage5.ranking||[]).map(r=>r.id));
  const win=result.final?.id;
  for(const r of rows){
    const x=xof(r.warpageCriterion),y=yof(r.thermalImproveK);
    const isFinal=finalIds.has(r.id),isWin=r.id===win;
    ctx.fillStyle=isWin?'#111827':r.pareto?'#2f8059':isFinal?'#3f6fd8':'#b7c0ca';
    ctx.beginPath();ctx.arc(x,y,isWin?6:r.pareto?5:isFinal?4:2.7,0,Math.PI*2);ctx.fill();
    if(isWin){ctx.fillStyle='#111827';ctx.font='11px system-ui';ctx.fillText(`#1 ${patternName(r.pattern)}`,x+8,y-7);}
  }
  ctx.fillStyle='#2f8059';ctx.fillRect(padL+8,padT+8,9,9);ctx.fillStyle='#596675';ctx.fillText('Pareto',padL+22,padT+17);
  ctx.fillStyle='#3f6fd8';ctx.fillRect(padL+75,padT+8,9,9);ctx.fillStyle='#596675';ctx.fillText('Final Top-3',padL+89,padT+17);
}

function renderFinalCandidate(result){
  const f=result?.final;
  if(!f)return;
  $('finalCandidateTitle').textContent=`${f.primaryBenefitPass?'🥇':'⚠️'} ${designName(f.pattern,f.extension)} · depth=${fmt(f.depthUm,1)} µm / width=${fmt(f.widthUm,1)} µm · TSV Y=${fmt(f.tsvShiftY,2)} mm`;
  $('finalCandidateTitle').style.color=f.primaryBenefitPass?'#111827':'#9a4c18';
  $('applyFinalCandidate').disabled=false;
  $('finalCandidateMeta').textContent=`Process-constrained comparison · width = 2 × depth · actual AlN ${fmt(f.actualVolPct,3)} vol% · universal collar OD ${fmt(readConfig().tsvCollarOuterDiaUm,1)} µm · nominal PVD AlN residual stress ${fmt(result.settings?.nominalAlnResidualMPa??400,0)} MPa tensile`;
  $('finalPrimaryScore').textContent=fmt(f.primaryScore,1);
  $('finalRobustScore').textContent=`${fmt(f.robust.top2Pct,1)}%`;
  $('finalStackScore').textContent=fmt(f.stackScore,1);
  $('finalPareto').textContent=f.pareto?'YES':'NO';
  $('finalWarpageRed').textContent=`${fmt(f.meanWarpageReductionPct,2)} %`;
  $('finalWorstWarpage').textContent=`${fmt(f.worstWarpageReductionPct,2)} %`;
  $('finalLocal').textContent=`${fmt(f.meanLocalDeviationUm,4)} µm`;
  $('finalThermal').textContent=`+${fmt(f.thermalImproveK,4)} K`;
  $('finalYShift').textContent=`${fmt(f.tsvShiftY,2)} mm`;
  $('finalZ').textContent=`${fmt(f.depthUm,1)} µm`;
  $('finalWhyList').innerHTML=(f.why||[]).map(x=>`<li>${x}</li>`).join('');
  const v=result.stages.stage5.verification,box=$('finalVerifyBox');
  if(!v){box.className='verificationBox';box.textContent='Final convergence verification: not requested';}
  else{
    const pass=v.mechPass&&v.thermalPass&&(v.stackPass!==false);
    box.className=`verificationBox ${pass?'pass':'fail'}`;
    box.textContent=`Final convergence: mechanics ${fmt(v.mechErrorPct,2)}% ${v.mechPass?'PASS':'FAIL'} · single thermal ${fmt(v.thermalErrorPct,2)}% ${v.thermalPass?'PASS':'FAIL'}${Number.isFinite(v.stackErrorPct)?` · 24-Hi stack ${fmt(v.stackErrorPct,2)}% ${v.stackPass?'PASS':'FAIL'}`:''}`;
  }
}

function renderRanking(result){
  const rows=result?.stages?.stage5?.ranking||[];
  $('rankHead').innerHTML='<tr><th>Rank</th><th>Design</th><th>Depth / width [µm]</th><th>AlN vol%</th><th>TSV Y [mm]</th><th>Primary</th><th>W criterion [%]</th><th>Local [µm]</th><th>Thermal [K]</th><th>Robust Top-2 [%]</th><th>Stack score</th><th>Pareto</th></tr>';
  $('rankBody').innerHTML=rows.map(r=>`<tr><td>${r.finalRank}</td><td>${designName(r.pattern,r.extension)}</td><td>${fmt(r.depthUm,1)} / ${fmt(r.widthUm,1)}</td><td>${fmt(r.actualVolPct,3)}</td><td>${fmt(r.tsvShiftY,2)}</td><td><b>${fmt(r.primaryScore,1)}</b></td><td>${fmt(r.warpageCriterion,2)}</td><td>${fmt(r.meanLocalDeviationUm,4)}</td><td>${fmt(r.thermalImproveK,4)}</td><td>${fmt(r.robust.top2Pct,1)}</td><td>${fmt(r.stackScore,1)}</td><td>${r.pareto?'YES':'—'}</td></tr>`).join('');
  lastTable={title:'optimized_die_design_ranking',headers:['Rank','Design','Depth/width [µm]','AlN vol%','TSV Y [mm]','Primary','W criterion [%]','Local [µm]','Thermal [K]','Robust Top2 [%]','Stack score','Pareto'],rows:rows.map(r=>[r.finalRank,designName(r.pattern,r.extension),`${fmt(r.depthUm,1)}/${fmt(r.widthUm,1)}`,fmt(r.actualVolPct,3),fmt(r.tsvShiftY,2),fmt(r.primaryScore,2),fmt(r.warpageCriterion,3),fmt(r.meanLocalDeviationUm,5),fmt(r.thermalImproveK,5),fmt(r.robust.top2Pct,2),fmt(r.stackScore,2),r.pareto?'YES':'NO'])};
}

function renderSweepTab(tab=activeSweepTab){
  activeSweepTab=tab;
  document.querySelectorAll('.sweepTab').forEach(b=>b.classList.toggle('active',b.dataset.sweep===tab));
  const r=lastV53Result;if(!r){$('sweepHead').innerHTML='';$('sweepBody').innerHTML='<tr><td>Run die-design optimization first.</td></tr>';return;}
  let headers=[],rows=[];
  if(tab==='stage1'){
    headers=['Rank','Design','Depth / width [µm]','AlN vol%','Score','Warpage red. [%]','Local [µm]','Thermal [K]','Gate'];
    rows=r.stages.stage1.all.map((x,i)=>[i+1,designName(x.pattern,x.extension),`${fmt(x.depthUm,1)} / ${fmt(x.widthUm,1)}`,fmt(x.actualVolPct,3),fmt(x.score,1),fmt(x.warpageReductionPct,2),fmt(x.localDeviationUm,4),fmt(x.thermalImproveK,4),x.feasible?'PASS':x.reasons.join('; ')]);
  }else if(tab==='stage2'){
    headers=['Rank','Candidate','Score','Mean W red. [%]','Worst W red. [%]','Stress spread [µm]','Thermal [K]','Gate'];
    rows=r.stages.stage2.all.map((x,i)=>[i+1,`${designName(x.pattern,x.extension)} · depth ${fmt(x.depthUm,1)} µm / width ${fmt(x.widthUm,1)} µm · TSV Y ${fmt(x.tsvShiftY,2)} mm`,fmt(x.score,1),fmt(x.meanWarpageReductionPct,2),fmt(x.worstWarpageReductionPct,2),fmt(x.stressSpreadUm,3),fmt(x.thermalImproveK,4),x.feasible?'PASS':x.reasons.join('; ')]);
  }else if(tab==='stage3'){
    headers=['Candidate','Top-1 [%]','Top-2 [%]','Warpage benefit [%]','Valid [%]','Scenarios'];
    rows=r.stages.stage3.summary.map(x=>{const q=r.stages.stage2.all.find(y=>y.id===x.candidateId);return [q?`${designName(q.pattern,q.extension)} · depth ${fmt(q.depthUm,1)} µm · Y ${fmt(q.tsvShiftY,2)}`:x.candidateId,fmt(x.top1Pct,1),fmt(x.top2Pct,1),fmt(x.benefitPct,1),fmt(x.validPct,1),x.total];});
  }else{
    headers=['Candidate','Stack','Bow red. [%]','Tmax [°C]','Thermal improve [K]','Hottest layer','Energy err [%]'];
    rows=r.stages.stage4.records.map(x=>{const q=r.stages.stage2.all.find(y=>y.id===x.candidateId);return [q?`${designName(q.pattern,q.extension)} · depth ${fmt(q.depthUm,1)} µm · Y ${fmt(q.tsvShiftY,2)}`:x.candidateId,`${x.N}-Hi`,fmt(x.bowReductionPct,2),fmt(x.tmaxC,2),fmt(x.thermalImproveK,4),x.hottestLayer,fmt(x.energyErrorPct,3)];});
  }
  $('sweepHead').innerHTML=`<tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr>`;
  $('sweepBody').innerHTML=rows.map(row=>`<tr>${row.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('');
}

async function runFullV53(){
  const settings=readDoeSettings();
  v53Cancelled=false;
  $('runV53Pipeline').disabled=true;$('stopV53Pipeline').disabled=false;
  $('doeOverallBadge').className='neutralBadge running';$('doeOverallBadge').textContent='Running';
  $('doeProgressBar').style.width='0%';$('doeProgressText').textContent='Preparing design exploration…';
  for(let i=1;i<=5;i++)$(`doeStage${i}`).className='pipelineStep';
  try{
    const result=await runV53Pipeline(readConfig(),settings,{onProgress:handlePipelineProgress,isCancelled:()=>v53Cancelled});
    lastV53Result=result;
    $('doeProgressBar').style.width='100%';$('doeProgressText').textContent='Completed · reinforced-die candidate ready';
    const hasFinal=!!result.final;
    const positive=hasFinal && result.final.primaryBenefitPass!==false;
    $('doeOverallBadge').className=`neutralBadge ${positive?'done':'warn'}`;
    $('doeOverallBadge').textContent=!hasFinal?'No feasible candidate':positive?'Completed':'Completed · caution';
    for(let i=1;i<=5;i++)$(`doeStage${i}`).className='pipelineStep done';
    if(!hasFinal){$('finalCandidateTitle').textContent='No feasible candidate passed the current gates';$('finalCandidateTitle').style.color='#9a4c18';}
    renderFinalCandidate(result);renderRanking(result);drawPareto(result);renderSweepTab('stage1');
  }catch(e){
    if(e.message==='DOE_CANCELLED'){
      $('doeOverallBadge').className='neutralBadge warn';$('doeOverallBadge').textContent='Stopped';$('doeProgressText').textContent='Design optimization stopped by user.';
    }else{
      console.error(e);$('doeOverallBadge').className='neutralBadge warn';$('doeOverallBadge').textContent='Error';$('doeProgressText').textContent=`Design-optimization error: ${e.message}`;
    }
  }finally{
    $('runV53Pipeline').disabled=false;$('stopV53Pipeline').disabled=true;
  }
}


function applyFinalCandidateToControls(){
  const f=lastV53Result?.final;if(!f){alert('Run die-design optimization first.');return;}
  $('alnPattern').value=f.pattern;
  $('alnTopology').value=f.extension;
  $('alnTUm').value=f.depthUm;
  $('tsvShiftY').value=f.tsvShiftY;
  $('alnWidthMode').value='process';
  // Keep the process-grounded nominal tensile residual stress; variation is only a robustness check.
  $('alnResidualMPa').value=lastV53Result?.settings?.nominalAlnResidualMPa??400;
  invalidateV6ForConfigChange();
  updateMechanical();
  window.scrollTo({top:0,behavior:'smooth'});
}

function downloadDoeJson(){
  if(!lastV53Result){alert('Run die-design optimization first.');return;}
  const blob=new Blob([JSON.stringify(lastV53Result,null,2)],{type:'application/json;charset=utf-8'}),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download='HBM_AlN_die_design_optimization.json';a.click();URL.revokeObjectURL(a.href);
}


function v6StackCount(){ return +$("v6StackCount").value; }
function v6CurrentMask(){
  const N=v6StackCount(),mask=Array(N).fill(false);
  for(let layer=1;layer<=N;layer++){
    const el=$(`v6Layer_${layer}`); if(el)mask[layer-1]=el.checked;
  }
  return mask;
}
function v6SetMask(mask){
  const N=v6StackCount();
  for(let layer=1;layer<=N;layer++){
    const el=$(`v6Layer_${layer}`); if(el)el.checked=!!mask[layer-1];
  }
  updateV6SelectionPreview();
}
function buildV6LayerGrid(mask=null){
  const N=v6StackCount(),grid=$("v6LayerGrid");grid.innerHTML="";
  const use=mask&&mask.length?Array.from({length:N},(_,i)=>!!mask[i]):presetMask(N,$("v6Preset").value==="custom"?"bottom-25":$("v6Preset").value);
  for(let layer=N;layer>=1;layer--){
    const row=document.createElement("label");row.className="v6LayerRow";row.innerHTML=`<span><b>Layer ${layer}</b>${layer===N?' · TOP':''}${layer===1?' · nearest BASE':''}</span><input id="v6Layer_${layer}" type="checkbox" ${use[layer-1]?'checked':''}>`;
    grid.appendChild(row);
    row.querySelector("input").addEventListener("change",()=>{$("v6Preset").value="custom";updateV6SelectionPreview();});
  }
  updateV6SelectionPreview();
}
function updateV6SelectionPreview(){
  const mask=v6CurrentMask(),layers=layerNumbers(mask),N=mask.length;
  $("v6SelectionText").textContent=`Selected ${layers.length}/${N} modified core dies (${(100*layers.length/N).toFixed(1)}%). Layers: ${layers.length?layers.join(', '):'none'}. Layer 1 is the bottom core die.`;
  $("v6LayerLabel").textContent=`Layers: ${layers.length?layers.join(', '):'none'}`;
  $("v6ModifiedCount").textContent=`${layers.length} / ${N}`;
  $("v6ModifiedFraction").textContent=`${(100*layers.length/N).toFixed(1)} %`;
  drawV6StackMask(readConfig(),mask);
  if(lastV6Selected){$("v6StatusBadge").className="neutralBadge warn";$("v6StatusBadge").textContent="Selection changed · rerun";}
}
function applyV6Preset(){
  const p=$("v6Preset").value;if(p==="custom")return;
  v6SetMask(presetMask(v6StackCount(),p));
}
function v6CaptureText(c){ return c?.valid?`${fmt(c.capturePct,1)} %`:`N/A`; }
function v6EfficiencyText(summary){
  const b=summary?.replacementEfficiencyBow,t=summary?.replacementEfficiencyThermal;
  const bs=Number.isFinite(b)?`Bow ×${fmt(b,2)}`:'Bow N/A',ts=Number.isFinite(t)?`Thermal ×${fmt(t,2)}`:'Thermal N/A';
  return `${bs} / ${ts}`;
}
function drawV6StackMask(c,mask){
  const cv=$("v6StackMaskCanvas"),ctx=cv.getContext("2d"),W=cv.width,H=cv.height,N=mask.length;
  ctx.clearRect(0,0,W,H);ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);
  const x=125,w=Math.min(650,W-330),top=25,bottom=H-42,available=bottom-top;
  const bondPx=1.5,layerH=Math.max(4,(available-bondPx*(N-1))/N);
  let y=bottom;
  ctx.font="11px system-ui";ctx.fillStyle="#526170";ctx.fillText("TOP",x+w+22,top+8);ctx.fillText("Layer 1 = nearest logic/base die",18,H-12);
  for(let layer=1;layer<=N;layer++){
    y-=layerH;
    ctx.fillStyle=mask[layer-1]?"#3f6fd8":"#dfe5ec";ctx.fillRect(x,y,w,layerH);
    ctx.strokeStyle=mask[layer-1]?"#234b9c":"#9aa6b2";ctx.strokeRect(x,y,w,layerH);
    if(N<=16 || layer===1 || layer===N || layer%4===0){ctx.fillStyle="#263241";ctx.fillText(`${layer}`,x-24,y+layerH*.72);}
    if(mask[layer-1]){ctx.fillStyle="#fff";ctx.font="10px system-ui";ctx.fillText("M",x+8,y+Math.min(layerH-1,11));ctx.font="11px system-ui";}
    if(layer<N)y-=bondPx;
  }
  ctx.fillStyle="#e6a15e";ctx.fillRect(x,bottom+7,w,16);ctx.fillStyle="#fff";ctx.font="10px system-ui";ctx.fillText("LOGIC / BASE DIE",x+8,bottom+19);
  ctx.fillStyle="#3f6fd8";ctx.fillRect(W-185,35,13,13);ctx.fillStyle="#526170";ctx.font="11px system-ui";ctx.fillText("Modified core die",W-165,46);
  ctx.fillStyle="#dfe5ec";ctx.fillRect(W-185,58,13,13);ctx.fillStyle="#526170";ctx.fillText("Baseline core die",W-165,69);
  ctx.fillStyle="#526170";ctx.fillText(`${mask.filter(Boolean).length}/${N} modified`,W-185,94);
}
function drawV6FinalSections(m){
  const cv=$("v6FinalSectionCanvas"),ctx=cv.getContext("2d"),W=cv.width,H=cv.height,L=readConfig().coreSize*1e-3,a=L/2;
  ctx.clearRect(0,0,W,H);ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);
  const panels=[{title:"X-section",k:m.kx,x:16,color:"#3f6fd8"},{title:"Y-section",k:m.ky,x:W/2+8,color:"#e77d2f"}];
  for(const p of panels){
    const x0=p.x,y0=25,pw=W/2-24,ph=H-43,pad=18,vals=[];
    for(let i=0;i<=50;i++){const xx=-a+2*a*i/50;vals.push(0.5*p.k*xx*xx*1e6);}
    const lo=Math.min(...vals),hi=Math.max(...vals),span=Math.max(hi-lo,1e-9);
    ctx.fillStyle="#f8fafc";ctx.fillRect(x0,y0,pw,ph);ctx.strokeStyle="#e2e8f0";ctx.strokeRect(x0,y0,pw,ph);
    ctx.fillStyle="#222";ctx.font="12px system-ui";ctx.fillText(p.title,x0+7,y0+14);
    ctx.strokeStyle=p.color;ctx.lineWidth=2.2;ctx.beginPath();
    vals.forEach((v,i)=>{const x=x0+pad+(pw-2*pad)*i/50,y=y0+ph-pad-(ph-2*pad)*(v-lo)/span;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();
    const rel=0.5*p.k*a*a>0?"center lower":"center higher";ctx.fillStyle="#526170";ctx.font="11px system-ui";ctx.fillText(`${rel} · edge-center ${fmt(0.5*p.k*a*a*1e6,3)} µm`,x0+7,y0+ph-8);
  }
}
function drawV6LayerTemps(t){
  const cv=$("v6LayerTempCanvas"),ctx=cv.getContext("2d"),W=cv.width,H=cv.height,N=t.selective.N,padL=38,padR=18,padT=20,padB=30,pw=W-padL-padR,ph=H-padT-padB;
  ctx.clearRect(0,0,W,H);ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);
  const series=[{a:t.baseline.layerMaxC,c:"#9aa6b2",n:"Baseline"},{a:t.selective.layerMaxC,c:"#3f6fd8",n:"Selective"},{a:t.allModified.layerMaxC,c:"#2f8059",n:"All modified"}];
  const all=series.flatMap(s=>s.a),lo=Math.min(...all),hi=Math.max(...all),span=Math.max(hi-lo,1e-9);
  ctx.strokeStyle="#d9dfe7";ctx.strokeRect(padL,padT,pw,ph);
  const xof=i=>padL+pw*(N===1?0.5:i/(N-1)),yof=v=>padT+ph-(v-lo)/span*ph;
  for(const s of series){ctx.strokeStyle=s.c;ctx.lineWidth=2;ctx.beginPath();s.a.forEach((v,i)=>{const x=xof(i),y=yof(v);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();}
  ctx.fillStyle="#526170";ctx.font="10px system-ui";ctx.fillText(`L1`,padL-4,H-10);ctx.fillText(`L${N}`,W-padR-22,H-10);ctx.fillText(`${lo.toFixed(1)}°C`,2,H-padB);ctx.fillText(`${hi.toFixed(1)}°C`,2,padT+8);
  series.forEach((s,i)=>{ctx.fillStyle=s.c;ctx.fillRect(padL+8+i*105,padT+7,10,3);ctx.fillStyle="#526170";ctx.fillText(s.n,padL+22+i*105,padT+12);});
}
function renderV6Selected(result){
  lastV6Selected=result;const s=selectiveSummary(result),c=readConfig();
  $("v6StatusBadge").className="neutralBadge done";$("v6StatusBadge").textContent="Selected placement solved";
  $("v6DesignLabel").textContent=`Modified die: ${patternName(c.alnPattern)} / ${topologyName(c.alnTopology)} · depth ${fmt(c.alnTUm,1)} µm / width ${fmt(c.alnWidthUm,1)} µm · backside-adjacent`;
  $("v6LayerLabel").textContent=`Layers: ${s.layers.length?s.layers.join(', '):'none'}`;
  $("v6ModifiedCount").textContent=`${s.modifiedCount} / ${s.N}`;$("v6ModifiedFraction").textContent=`${fmt(100*s.modifiedFraction,1)} %`;
  $("v6BowCapture").textContent=s.bowCaptureValid?`${fmt(s.bowCapturePct,1)} %`:'N/A';
  $("v6ThermalCapture").textContent=s.thermalCaptureValid?`${fmt(s.thermalCapturePct,1)} %`:'N/A';
  $("v6Efficiency").textContent=v6EfficiencyText(s);
  $("v6BowBase").textContent=`${fmt(s.baselineBowUm,4)} µm`;$("v6BowSel").textContent=`${fmt(s.selectiveBowUm,4)} µm`;$("v6BowAll").textContent=`${fmt(s.allModifiedBowUm,4)} µm`;
  $("v6BowImprove").textContent=`${fmt(result.mechanical.selectiveImprovementPct,2)} %`;
  $("v6BowFullImprove").textContent=`${fmt(result.mechanical.allModifiedImprovementPct,2)} %`;
  $("v6Kappa").textContent=`${fmt(result.mechanical.selective.kx,5)} / ${fmt(result.mechanical.selective.ky,5)} 1/m`;
  $("v6XRelation").textContent=result.mechanical.selective.xSectionCenterRelation;$("v6YRelation").textContent=result.mechanical.selective.ySectionCenterRelation;
  if(result.thermal){
    $("v6TBase").textContent=`${fmt(s.baselineTmaxC,3)} °C`;$("v6TSel").textContent=`${fmt(s.selectiveTmaxC,3)} °C`;$("v6TAll").textContent=`${fmt(s.allModifiedTmaxC,3)} °C`;
    $("v6TImprove").textContent=`${fmt(result.thermal.selectiveImprovementK,5)} K`;
    $("v6TFullImprove").textContent=`${fmt(result.thermal.allModifiedImprovementK,5)} K`;
    $("v6HotLayer").textContent=`${result.thermal.selective.hottestLayer} / ${s.N}`;$("v6Energy").textContent=`${fmt(result.thermal.selective.energyErrorPct,3)} %`;$("v6Power").textContent=`${fmt(result.thermal.selective.totalPowerW,1)} W`;
    drawV6LayerTemps(result.thermal);
  }
  drawV6FinalSections(result.mechanical.selective);drawV6StackMask(c,result.mask);
}
function drawV6Cumulative(rows){
  const cv=$("v6CumulativeCanvas"),ctx=cv.getContext("2d"),W=cv.width,H=cv.height,pL=45,pR=20,pT=24,pB=32,pw=W-pL-pR,ph=H-pT-pB;
  ctx.clearRect(0,0,W,H);ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);
  const series=[{key:"baselineBowUm",c:"#9aa6b2",n:"All baseline"},{key:"selectiveBowUm",c:"#3f6fd8",n:"Selective"},{key:"allModifiedBowUm",c:"#2f8059",n:"All modified"}],all=series.flatMap(s=>rows.map(r=>r[s.key])),lo=Math.min(...all),hi=Math.max(...all),span=Math.max(hi-lo,1e-9),N=rows.length;
  ctx.strokeStyle="#d9dfe7";ctx.strokeRect(pL,pT,pw,ph);const xof=n=>pL+pw*(N===1?.5:(n-1)/(N-1)),yof=v=>pT+ph-(v-lo)/span*ph;
  series.forEach((s,si)=>{ctx.strokeStyle=s.c;ctx.lineWidth=2;ctx.beginPath();rows.forEach((r,i)=>{const x=xof(r.stage),y=yof(r[s.key]);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();ctx.fillStyle=s.c;ctx.fillRect(pL+8+si*120,pT+7,11,3);ctx.fillStyle="#526170";ctx.font="10px system-ui";ctx.fillText(s.n,pL+23+si*120,pT+12);});
  ctx.fillStyle="#526170";ctx.fillText("1",pL-2,H-10);ctx.fillText(String(N),W-pR-10,H-10);ctx.fillText("stacking stage (bottom → top)",W/2-65,H-8);ctx.fillText(`${lo.toFixed(3)} µm`,2,H-pB);ctx.fillText(`${hi.toFixed(3)} µm`,2,pT+8);
}
function drawV6Increment(rows){
  const cv=$("v6IncrementCanvas"),ctx=cv.getContext("2d"),W=cv.width,H=cv.height,pL=42,pR=18,pT=24,pB=32,pw=W-pL-pR,ph=H-pT-pB,N=rows.length;
  ctx.clearRect(0,0,W,H);ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);
  const vals=rows.map((r,i)=>i===0?0:r.deltaBowFromPreviousUm),mx=Math.max(...vals.map(Math.abs),1e-9),zero=pT+ph/2,barW=pw/N*.72;
  ctx.strokeStyle="#cbd5df";ctx.beginPath();ctx.moveTo(pL,zero);ctx.lineTo(pL+pw,zero);ctx.stroke();
  rows.forEach((r,i)=>{const v=vals[i],h=(ph*.45)*Math.abs(v)/mx,x=pL+pw*i/N+(pw/N-barW)/2,y=v>=0?zero-h:zero;ctx.fillStyle=r.addedModified?"#3f6fd8":"#b9c2cc";ctx.fillRect(x,y,barW,h);});
  ctx.fillStyle="#526170";ctx.font="10px system-ui";ctx.fillText("ΔBow when next layer is added",pL,pT-7);ctx.fillText("Blue = added modified die; gray = added baseline die",pL,H-8);
}
function renderV6History(rows){
  lastV6History=rows;drawV6Cumulative(rows);drawV6Increment(rows);
  $("v6HistoryHead").innerHTML='<tr><th>Stage</th><th>Added die</th><th>Modified count</th><th>Baseline bow [µm]</th><th>Selective bow [µm]</th><th>All-mod bow [µm]</th><th>ΔBow [µm]</th><th>Benefit capture [%]</th></tr>';
  $("v6HistoryBody").innerHTML=rows.map(r=>`<tr><td>${r.stage}</td><td>${r.addedModified?'Modified':'Baseline'}</td><td>${r.modifiedCount}/${r.stage}</td><td>${fmt(r.baselineBowUm,4)}</td><td>${fmt(r.selectiveBowUm,4)}</td><td>${fmt(r.allModifiedBowUm,4)}</td><td>${Number.isFinite(r.deltaBowFromPreviousUm)?fmt(r.deltaBowFromPreviousUm,4):'—'}</td><td>${r.bowCaptureValid?fmt(r.bowCapturePct,1):'N/A'}</td></tr>`).join('');
}
function drawV6Sensitivity(sens){
  const cv=$("v6SensitivityCanvas"),ctx=cv.getContext("2d"),W=cv.width,H=cv.height,pL=35,pR=16,pT=22,pB=32,pw=W-pL-pR,ph=H-pT-pB,N=sens.N,byLayer=[...sens.rows].sort((a,b)=>a.layer-b.layer),max=Math.max(...byLayer.map(r=>r.combinedScore),1);
  ctx.clearRect(0,0,W,H);ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);const bw=pw/N*.75;
  byLayer.forEach((r,i)=>{const h=ph*r.combinedScore/max,x=pL+pw*i/N+(pw/N-bw)/2;ctx.fillStyle="#3f6fd8";ctx.fillRect(x,pT+ph-h,bw,h);});
  ctx.fillStyle="#526170";ctx.font="10px system-ui";ctx.fillText("L1",pL,H-10);ctx.fillText(`L${N}`,W-pR-20,H-10);ctx.fillText("Combined one-layer importance",pL,pT-7);
}
function renderV6Sensitivity(sens){
  lastV6Sensitivity=sens;drawV6Sensitivity(sens);
  $("v6SensitivityHead").innerHTML='<tr><th>Rank</th><th>Layer</th><th>ΔBow [µm]</th><th>ΔTmax [K]</th><th>Mech score</th><th>Thermal score</th><th>Combined</th></tr>';
  $("v6SensitivityBody").innerHTML=sens.rows.map((r,i)=>`<tr><td>${i+1}</td><td><b>${r.layer}</b></td><td>${fmt(r.deltaBowUm,6)}</td><td>${fmt(r.deltaTmaxK,6)}</td><td>${fmt(r.mechanicalScore,1)}</td><td>${fmt(r.thermalScore,1)}</td><td><b>${fmt(r.combinedScore,1)}</b></td></tr>`).join('');
}
function drawV6Preset(comp){
  const cv=$("v6PresetCanvas"),ctx=cv.getContext("2d"),W=cv.width,H=cv.height,pL=45,pR=18,pT=24,pB=38,pw=W-pL-pR,ph=H-pT-pB;
  ctx.clearRect(0,0,W,H);ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);ctx.strokeStyle="#d9dfe7";ctx.strokeRect(pL,pT,pw,ph);
  const vals=comp.rows.flatMap(r=>[r.bowCaptureValid?r.bowCapturePct:NaN,r.thermalCaptureValid?r.thermalCapturePct:NaN]).filter(Number.isFinite),lo=Math.min(0,...vals),hi=Math.max(100,...vals),span=Math.max(hi-lo,1e-9);
  const xof=f=>pL+pw*f,yof=v=>pT+ph-(v-lo)/span*ph;
  for(const r of comp.rows){const x=xof(r.modifiedFraction);if(r.bowCaptureValid){ctx.fillStyle="#3f6fd8";ctx.beginPath();ctx.arc(x,yof(r.bowCapturePct),4,0,Math.PI*2);ctx.fill();}if(r.thermalCaptureValid){ctx.fillStyle="#e77d2f";ctx.beginPath();ctx.arc(x,yof(r.thermalCapturePct),4,0,Math.PI*2);ctx.fill();}}
  ctx.fillStyle="#526170";ctx.font="10px system-ui";ctx.fillText("0% modified",pL-8,H-12);ctx.fillText("100% modified",W-pR-65,H-12);ctx.fillStyle="#3f6fd8";ctx.fillText("● Bow capture",pL+5,pT+13);ctx.fillStyle="#e77d2f";ctx.fillText("● Thermal capture",pL+95,pT+13);
}
function renderV6Presets(comp){
  lastV6Presets=comp;drawV6Preset(comp);
  $("v6PresetHead").innerHTML='<tr><th>Preset</th><th>Modified</th><th>Bow [µm]</th><th>Bow capture [%]</th><th>Tmax est. [°C]</th><th>Thermal capture est. [%]</th></tr>';
  $("v6PresetBody").innerHTML=comp.rows.map(r=>`<tr><td>${r.preset}</td><td>${r.modifiedCount}/${comp.N}</td><td>${fmt(r.bowUm,4)}</td><td>${r.bowCaptureValid?fmt(r.bowCapturePct,1):'N/A'}</td><td>${fmt(r.tmaxC,3)}</td><td>${r.thermalCaptureValid?fmt(r.thermalCapturePct,1):'N/A'}</td></tr>`).join('');
}
function drawV6Plan(plan){
  const cv=$("v6PlanCanvas"),ctx=cv.getContext("2d"),W=cv.width,H=cv.height,pL=45,pR=18,pT=24,pB=34,pw=W-pL-pR,ph=H-pT-pB,N=plan.N;
  ctx.clearRect(0,0,W,H);ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);ctx.strokeStyle="#d9dfe7";ctx.strokeRect(pL,pT,pw,ph);
  const valid=plan.rows.flatMap(r=>[r.bowCaptureValid?r.bowCapturePct:NaN,r.thermalCaptureValid?r.thermalCapturePct:NaN,r.combinedCapturePct]).filter(Number.isFinite),lo=Math.min(0,...valid),hi=Math.max(100,...valid),span=Math.max(hi-lo,1e-9),xof=k=>pL+pw*(k-1)/Math.max(N-1,1),yof=v=>pT+ph-(v-lo)/span*ph;
  const series=[{g:r=>r.bowCapturePct,valid:r=>r.bowCaptureValid,c:"#3f6fd8",n:"Bow"},{g:r=>r.thermalCapturePct,valid:r=>r.thermalCaptureValid,c:"#e77d2f",n:"Thermal"},{g:r=>r.combinedCapturePct,valid:r=>Number.isFinite(r.combinedCapturePct),c:"#2f8059",n:"Combined"}];
  for(const ss of series){ctx.strokeStyle=ss.c;ctx.lineWidth=2;ctx.beginPath();let started=false;for(const r of plan.rows){if(!ss.valid(r))continue;const x=xof(r.k),y=yof(ss.g(r));if(!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y);}ctx.stroke();}
  for(const target of [50,75,90]){const y=yof(target);ctx.strokeStyle="#c6ced8";ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(pL,y);ctx.lineTo(pL+pw,y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#7a8795";ctx.font="9px system-ui";ctx.fillText(`${target}%`,pL+3,y-2);}
  ctx.fillStyle="#526170";ctx.font="10px system-ui";ctx.fillText("1",pL,H-10);ctx.fillText(String(N),W-pR-10,H-10);ctx.fillText("modified die count",W/2-40,H-8);
}
function renderV6Plan(plan){
  lastV6Plan=plan;drawV6Plan(plan);$("v6PriorityOrder").textContent=plan.order.join(' → ');
  for(const target of [50,75,90]){
    const r=plan.recommendations.find(x=>x.targetPct===target),el=$(`v6Target${target}`);
    if(el)el.textContent=!r?.found?'Not reached / N/A':`${r.requiredModified}/${plan.N} · Layers ${r.layers.join(', ')} · est ${fmt(r.estimatedCombinedCapturePct,1)}%${r.verified?` · verified ${fmt(r.verifiedCombinedCapturePct,1)}% ${r.verificationMeetsTarget?'PASS':'CHECK'}`:''}`;
  }
  $("v6PlanHead").innerHTML='<tr><th>k</th><th>Selected layers</th><th>Modified [%]</th><th>Bow capture [%]</th><th>Thermal capture est. [%]</th><th>Combined est. [%]</th></tr>';
  $("v6PlanBody").innerHTML=plan.rows.map(r=>`<tr><td>${r.k}</td><td>${r.layers.join(', ')}</td><td>${fmt(100*r.modifiedFraction,1)}</td><td>${r.bowCaptureValid?fmt(r.bowCapturePct,1):'N/A'}</td><td>${r.thermalCaptureValid?fmt(r.thermalCapturePct,1):'N/A'}</td><td><b>${fmt(r.combinedCapturePct,1)}</b></td></tr>`).join('');
}
function v6ScanOptions(){return {scanStackGrid:+$("v6ScanGrid").value,weightMechanical:+$("v6WeightMechanical").value,weightThermal:+$("v6WeightThermal").value};}
function v6SetProgress(p,text){$("v6ProgressBar").style.width=`${p}%`;$("v6ProgressText").textContent=text;}
async function runV6Selected(){
  const mask=v6CurrentMask();v6SetProgress(10,'Solving selected placement at current stack grid…');$("v6StatusBadge").className='neutralBadge running';$("v6StatusBadge").textContent='Solving';await new Promise(r=>setTimeout(r,10));
  try{const r=evaluateSelectivePlacement(readConfig(),mask,{thermal:true});renderV6Selected(r);v6SetProgress(100,'Selected placement complete.');return r;}catch(e){console.error(e);$("v6StatusBadge").className='neutralBadge warn';$("v6StatusBadge").textContent='Error';v6SetProgress(0,`Selected-placement error: ${e.message}`);throw e;}
}
async function runV6Cumulative(){v6SetProgress(15,'Recomputing Layer 1 → N equilibrium bow…');await new Promise(r=>setTimeout(r,10));const rows=cumulativeMechanicalHistory(readConfig(),v6CurrentMask());renderV6History(rows);v6SetProgress(100,'Cumulative mechanical history complete.');return rows;}
async function runV6Sensitivity(){const N=v6StackCount(),o=v6ScanOptions(),c=readConfig();v6SetProgress(15,`Running ${N} one-layer sensitivity cases at thermal grid ${o.scanStackGrid}…`);await new Promise(r=>setTimeout(r,10));const r=singleLayerSensitivity(c,N,{includeThermal:true,...o});r._configSignature=v6ConfigSignature(c);renderV6Sensitivity(r);v6SetProgress(100,'One-layer sensitivity complete.');return r;}
async function runV6Presets(){
  const N=v6StackCount(),o=v6ScanOptions();let sens=lastV6Sensitivity;
  if(!sens||sens.N!==N||sens.scanStackGrid!==o.scanStackGrid||sens._configSignature!==v6ConfigSignature())sens=await runV6Sensitivity();
  v6SetProgress(65,'Comparing placement presets from exact one-layer sensitivities…');await new Promise(r=>setTimeout(r,10));
  const r=presetComparison(readConfig(),N,{includeThermal:true,scanStackGrid:o.scanStackGrid,customMask:v6CurrentMask(),sensitivity:sens,...o});renderV6Presets(r);v6SetProgress(100,'Preset comparison complete · thermal columns are sensitivity-additive screening estimates.');return r;
}
async function runV6Plan(){
  const N=v6StackCount(),o=v6ScanOptions();let sens=lastV6Sensitivity;if(!sens||sens.N!==N||sens.scanStackGrid!==o.scanStackGrid){sens=await runV6Sensitivity();}
  const targets=parseNumberList($("v6CaptureTargets").value,[50,75,90],{min:0,max:150});v6SetProgress(30,'Evaluating priority-order prefixes for minimum replacement…');await new Promise(r=>setTimeout(r,10));
  const r=priorityDeploymentPlan(readConfig(),N,sens,{targets,includeThermal:true,verifyTargets:false,...o});renderV6Plan(r);v6SetProgress(100,'Minimum-replacement plan complete.');return r;
}
async function runV6Full(){
  $("runV6Full").disabled=true;$("v6StatusBadge").className='neutralBadge running';$("v6StatusBadge").textContent='Full analysis';
  try{
    v6SetProgress(5,'1/5 · selected final stack');await runV6Selected();
    v6SetProgress(25,'2/5 · cumulative 1→N mechanics');await runV6Cumulative();
    v6SetProgress(45,'3/5 · one-layer sensitivity');await runV6Sensitivity();
    v6SetProgress(65,'4/5 · preset comparison');await runV6Presets();
    v6SetProgress(82,'5/5 · minimum-replacement plan');await runV6Plan();
    $("v6StatusBadge").className='neutralBadge done';$("v6StatusBadge").textContent='Deployment complete';v6SetProgress(100,'Full selective-deployment analysis completed.');
  }catch(e){$("v6StatusBadge").className='neutralBadge warn';$("v6StatusBadge").textContent='Deployment error';v6SetProgress(0,`Selective-deployment error: ${e.message}`);}finally{$("runV6Full").disabled=false;}
}
function downloadV6Json(){
  const payload={version:'final-11.0',generatedAt:new Date().toISOString(),config:readConfig(),stackCount:v6StackCount(),selectedMask:v6CurrentMask(),selected:lastV6Selected,history:lastV6History,sensitivity:lastV6Sensitivity,presets:lastV6Presets,plan:lastV6Plan};
  if(!lastV6Selected&&!lastV6History&&!lastV6Sensitivity&&!lastV6Presets&&!lastV6Plan){alert('Run at least one placement analysis first.');return;}
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='HBM_AlN_selective_stack_deployment.json';a.click();URL.revokeObjectURL(a.href);
}


function finalStudySetProgress(pctValue,text){
  $('finalStudyProgressBar').style.width=`${Math.max(0,Math.min(100,pctValue))}%`;
  $('finalStudyProgressText').textContent=text;
}
function maskFromLayersUI(N,layers){
  const m=Array(N).fill(false);for(const l of layers||[])if(l>=1&&l<=N)m[l-1]=true;return m;
}

function architectureRowsFromStudy(stacks){
  return (stacks||[]).map(s=>({N:s.N,a:(lastArchitecture24&&s.N===24)?lastArchitecture24:s.architectureThermal,rec:s.recommendation})).filter(x=>x.a);
}
function drawArchitectureChart(rows){
  const cv=$('archCanvas');if(!cv)return;const ctx=cv.getContext('2d'),W=cv.width,H=cv.height;
  ctx.clearRect(0,0,W,H);ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
  if(!rows.length){ctx.fillStyle='#8792a3';ctx.font='16px system-ui';ctx.fillText('Run Complete Study to generate 16/20/24-Hi architecture comparison.',40,80);return;}
  const padL=58,padR=28,padT=38,padB=46;
  const series=[
    {name:'µ-bump + underfill',key:'microBumpUnderfill',stroke:'#8d98a8'},
    {name:'Hybrid bonding',key:'hybridBaseline',stroke:'#2f6fdd'},
    {name:'HCB + AlN',key:'proposedHcbAln',stroke:'#2b8a66'}
  ];
  const vals=[];for(const r of rows)for(const q of series)vals.push(r.a[q.key].tmax);
  const lo=Math.min(...vals),hi=Math.max(...vals),span=Math.max(hi-lo,1e-6),yLo=lo-0.08*span,yHi=hi+0.12*span;
  const xs=rows.map((r,i)=>padL+(W-padL-padR)*(rows.length===1?0.5:i/(rows.length-1)));
  const y=v=>padT+(H-padT-padB)*(yHi-v)/(yHi-yLo);
  ctx.strokeStyle='#dce2ea';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(padL,H-padB);ctx.lineTo(W-padR,H-padB);ctx.stroke();
  ctx.fillStyle='#687386';ctx.font='12px system-ui';
  rows.forEach((r,i)=>ctx.fillText(`${r.N}-Hi`,xs[i]-15,H-padB+24));
  ctx.fillText(`${yHi.toFixed(1)}°C`,6,padT+4);ctx.fillText(`${yLo.toFixed(1)}°C`,6,H-padB+4);
  series.forEach((q,si)=>{
    ctx.strokeStyle=q.stroke;ctx.lineWidth=2.5;ctx.beginPath();rows.forEach((r,i)=>{const yy=y(r.a[q.key].tmax);if(i===0)ctx.moveTo(xs[i],yy);else ctx.lineTo(xs[i],yy);});ctx.stroke();
    rows.forEach((r,i)=>{ctx.fillStyle=q.stroke;ctx.beginPath();ctx.arc(xs[i],y(r.a[q.key].tmax),4,0,Math.PI*2);ctx.fill();});
    ctx.fillStyle=q.stroke;ctx.fillText(q.name,padL+si*190,20);
  });
}
function renderArchitectureComparison(stacks){
  const rows=architectureRowsFromStudy(stacks);
  if(!rows.length)return;
  $('archBadge').className='neutralBadge done';$('archBadge').textContent=lastArchitecture24?'24-Hi grid-31 verified':'Screening complete';
  $('archHead').innerHTML='<tr><th>Stack</th><th>Reinforced layers</th><th>µ-bump+UF Tmax [°C]</th><th>HCB Tmax [°C]</th><th>HCB+AlN Tmax [°C]</th><th>µ-bump→HCB ΔT [K]</th><th>System Rθ reduction [%]</th><th>AlN incremental ΔT [K]</th><th>Grid</th></tr>';
  $('archBody').innerHTML=rows.map(({N,a,rec})=>`<tr><td><b>${N}-Hi</b></td><td>${rec?.layers?.join(', ')||'—'}</td><td>${fmt(a.microBumpUnderfill.tmax,2)}</td><td><b>${fmt(a.hybridBaseline.tmax,2)}</b></td><td>${fmt(a.proposedHcbAln.tmax,2)}</td><td><b>${fmt(a.hcbDeltaK,2)}</b></td><td>${fmt(a.hcbRthReductionPct,1)}%</td><td>${fmt(a.proposedDeltaK,5)}</td><td>${a.grid}</td></tr>`).join('');
  drawArchitectureChart(rows);
}
async function runArchitecture24Verification(){
  if(!lastIntegratedStudy){alert('Run the complete design + deployment study first.');return;}
  const s=lastIntegratedStudy.stacks.find(x=>x.N===24)||lastIntegratedStudy.stacks.at(-1);if(!s)return;
  const btn=$('runArch24');btn.disabled=true;$('arch24Status').textContent='Running 24-Hi grid-21 architecture verification…';
  try{
    await new Promise(r=>setTimeout(r,10));
    const cfg=readConfig(),mask=maskFromLayersUI(s.N,s.recommendation.layers);
    lastArchitecture24=interconnectThermalComparison(cfg,s.N,mask,21);
    $('arch24Status').textContent=`Verified: µ-bump ${fmt(lastArchitecture24.microBumpUnderfill.tmax,2)}°C → HCB ${fmt(lastArchitecture24.hybridBaseline.tmax,2)}°C → HCB+AlN ${fmt(lastArchitecture24.proposedHcbAln.tmax,2)}°C · energy error max ${fmt(lastArchitecture24.maxEnergyErrorPct,3)}%`;
    renderArchitectureComparison(lastIntegratedStudy.stacks);
  }catch(e){console.error(e);$('arch24Status').textContent=`Architecture verification error: ${e.message}`;}finally{btn.disabled=false;}
}
function renderIntegratedStudy(result){
  lastIntegratedStudy=result;
  const f=result?.design?.final,h=result?.headline;
  if(!f||!h)return;
  $('integratedBadge').className='neutralBadge done';$('integratedBadge').textContent='Ready';
  $('integratedHeadline').textContent=`${h.stackCount}-Hi recommendation: ${h.modifiedCount}/${h.stackCount} reinforced core dies · Layers ${h.layers.join(', ')}`;
  $('integratedDesignSummary').textContent=`Optimized reinforced die: ${designName(h.pattern,h.topology)} · embedded depth ${fmt(h.depthUm,1)} µm · process width ${fmt(h.widthUm,1)} µm (=2×depth) · backside-adjacent · TSV Y=${fmt(h.tsvShiftY,2)} mm · actual AlN ${fmt(h.actualAlnVolPct,3)} vol% · universal collar OD ${fmt(h.collarOuterDiaUm,1)} µm · +${fmt(h.alnResidualMPa,0)} MPa tensile.`;
  $('integratedWBase').textContent=`${fmt(result.singleDie.baselineWarpageUm,2)} µm`;
  $('integratedWMod').textContent=`${fmt(result.singleDie.modifiedWarpageUm,2)} µm`;
  $('integratedWImprove').textContent=`${fmt(result.singleDie.warpageReductionPct,2)} %`;
  $('integratedStress').textContent=`+${fmt(h.alnResidualMPa,0)} MPa`;
  $('integratedWidth').textContent=`${fmt(h.depthUm,1)} / ${fmt(h.widthUm,1)} µm`;
  $('integratedHead').innerHTML='<tr><th>Stack</th><th>Recommended reinforced layers</th><th>Modified fraction</th><th>Retained vs best explored placement</th><th>Baseline bow [µm]</th><th>Selective bow [µm]</th><th>Bow improve [%]</th><th>All-mod bow [µm]</th><th>Baseline Tmax [°C]</th><th>Selective Tmax [°C]</th><th>ΔT [K]</th></tr>';
  $('integratedBody').innerHTML=result.stacks.map(s=>{
    const r=s.recommendation,e=s.exact;
    return `<tr><td><b>${s.N}-Hi</b></td><td>${r.layers.join(', ')}</td><td>${fmt(100*r.modifiedFraction,1)}% (${r.modifiedCount}/${s.N})</td><td>${fmt(r.retainedVsBestPct,1)}%</td><td>${fmt(e.mechanical.baseline.bowUm,4)}</td><td><b>${fmt(e.mechanical.selective.bowUm,4)}</b></td><td>${fmt(e.mechanical.selectiveImprovementPct,2)}%</td><td>${fmt(e.mechanical.allModified.bowUm,4)}</td><td>${fmt(e.thermal.baseline.tmax,2)}</td><td><b>${fmt(e.thermal.selective.tmax,2)}</b></td><td>${fmt(e.thermal.selectiveImprovementK,4)}</td></tr>`;
  }).join('');
  const notes=[
    `Die-level optimization uses the locked process cross-section: 1.0 µm embedded AlN depth and 2.0 µm rib width (2:1 in-plane width/depth rule). These dimensions are not optimization variables. Every occupied TSV is recessed through the same 1.0 µm segment and receives a universal 360° AlN collar while SiO₂ liner remains below it. +${fmt(result.optimizedConfig.alnResidualMPa,0)} MPa tensile is the nominal process value; 300/400/500 MPa is retained only as a residual-stress sensitivity comparison.`,
    'Aggregate front/back residual-stress inputs are not used; baseline process deformation is represented by calibrated free-die warpage plus effective-stack thermo-mechanical mismatch.',
    'Placement cost is represented by the fraction of reinforced core dies, not by a monetary cost model or predicted yield percentage.',
    result.collarSensitivity?.length ? `Collar-OD sensitivity (5.5/6.0/6.5 µm) is reported as a one-dimensional geometry-margin check, not an optimized variable. In this run the single-die warpage spans ${fmt(Math.min(...result.collarSensitivity.map(x=>x.warpageUm)),3)}–${fmt(Math.max(...result.collarSensitivity.map(x=>x.warpageUm)),3)} µm and thermal improvement spans ${fmt(Math.min(...result.collarSensitivity.map(x=>x.thermalImprovementK)),5)}–${fmt(Math.max(...result.collarSensitivity.map(x=>x.thermalImprovementK)),5)} K.` : '',
    'The placement search uses exact stack mechanics and a fast baseline-temperature thermal proxy. The recommended mask is directly re-solved at grid 15 for stable one-click verification; the 24-Hi recommendation is then loaded into the interactive panel so you can run one final grid-31 verification for report values.',
    $('finalRecommendationPolicy').value==='knee' ? 'The headline recommendation uses the cost-performance Pareto knee, avoiding an arbitrary retained-performance threshold.' : `The headline recommendation uses the minimum reinforced-die count retaining at least ${$('finalTargetPct').value}% of the best explored combined placement score under the selected mechanical/thermal weights.`
  ];
  $('integratedNotes').innerHTML=notes.filter(Boolean).map(x=>`<li>${x}</li>`).join('');
  lastArchitecture24=null;renderArchitectureComparison(result.stacks);

  // Apply optimized die to the main controls so all standard plots correspond to the final candidate.
  $('alnPattern').value=f.pattern;$('alnTopology').value=f.extension;$('alnTUm').value=f.depthUm;$('tsvShiftY').value=f.tsvShiftY;
  $('alnWidthMode').value='process';$('alnResidualMPa').value=result.optimizedConfig.alnResidualMPa;
  lastV53Result=result.design;renderFinalCandidate(result.design);renderRanking(result.design);drawPareto(result.design);renderSweepTab('stage1');updateMechanical();

  // Put the 24-Hi (or highest requested) recommendation into the interactive placement workspace.
  const preferred=result.stacks.find(s=>s.N===h.stackCount)||result.stacks.at(-1);
  if(preferred){
    $('v6StackCount').value=String(preferred.N);$('v6Preset').value='custom';
    buildV6LayerGrid(maskFromLayersUI(preferred.N,preferred.recommendation.layers));
    renderV6Selected(preferred.exact);renderV6History(preferred.history);renderV6Sensitivity(preferred.sensitivity);
    $('v6StatusBadge').className='neutralBadge done';$('v6StatusBadge').textContent='Recommended placement loaded';
  }
}
async function runCompleteIntegratedStudy(){
  const btn=$('runIntegratedStudy');btn.disabled=true;$('integratedBadge').className='neutralBadge running';$('integratedBadge').textContent='Running';
  finalStudySetProgress(1,'Starting complete study…');
  try{
    const result=await runIntegratedFinalStudy(readConfig(),{
      designSettings:readDoeSettings(),stackCounts:[16,20,24],scanStackGrid:+$('finalScanGrid').value,verificationStackGrid:15,
      weightMechanical:+$('finalWeightMechanical').value,weightThermal:+$('finalWeightThermal').value,targetPct:+$('finalTargetPct').value,recommendationPolicy:$('finalRecommendationPolicy').value
    },{onProgress:p=>finalStudySetProgress(p.pct,p.message||p.phase),isCancelled:()=>false});
    renderIntegratedStudy(result);finalStudySetProgress(100,'Complete · report-ready recommendation generated.');
  }catch(e){console.error(e);$('integratedBadge').className='neutralBadge warn';$('integratedBadge').textContent='Error';finalStudySetProgress(0,`Complete-study error: ${e.message}`);}
  finally{btn.disabled=false;}
}
function downloadIntegratedJson(){
  if(!lastIntegratedStudy){alert('Run the complete study first.');return;}
  const blob=new Blob([JSON.stringify(lastIntegratedStudy,null,2)],{type:'application/json;charset=utf-8'}),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download='HBM_AlN_complete_design_and_deployment_study.json';a.click();URL.revokeObjectURL(a.href);
}

function downloadCsv(){
  if(!lastTable.headers.length){ alert("Run a DOE/sweep first."); return; }
  const esc=v=>`"${String(v).replaceAll('"','""')}"`;
  const csv=[lastTable.headers.map(esc).join(","), ...lastTable.rows.map(r=>r.map(esc).join(","))].join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}), a=document.createElement("a");
  a.href=URL.createObjectURL(blob); a.download=lastTable.title.replace(/[^\w가-힣]+/g,"_")+".csv"; a.click(); URL.revokeObjectURL(a.href);
}

[...numericIds,...enumIds].forEach(id=>$(id).addEventListener("input",()=>{scheduleUpdate();invalidateV6ForConfigChange();}));
$("includeBasePower").addEventListener("input",()=>{scheduleUpdate();invalidateV6ForConfigChange();});
$("stackCount").addEventListener("input",()=>{ scheduleUpdate(); drawStackSchematic(readConfig(), +$("stackCount").value); });
$("runThermal").addEventListener("click",runThermal);
$("runStack").addEventListener("click",runCurrentStack);
$("runStackSweep").addEventListener("click",runStackSweepUI);
$("runPatternDOE").addEventListener("click",runPatternDOE);
$("runTopoDOE").addEventListener("click",runTopoDOE);
$("runPosDOE").addEventListener("click",runPosDOE);
$("runShapeDOE").addEventListener("click",runShapeDOE);
$("runLinerDOE").addEventListener("click",runLinerDOE);
$("runMechConv").addEventListener("click",runMechConv);
$("runConv").addEventListener("click",runConv);
$("runStackConv").addEventListener("click",runStackConv);
$("downloadCsv").addEventListener("click",downloadCsv);
$("runV53Pipeline").addEventListener("click",runFullV53);
$("stopV53Pipeline").addEventListener("click",()=>{v53Cancelled=true;});
$("downloadDoeJson").addEventListener("click",downloadDoeJson);
$("applyFinalCandidate").addEventListener("click",applyFinalCandidateToControls);
['doeWeightWarpage','doeWeightLocal','doeWeightThermal','doeWeightRobust'].forEach(id=>$(id).addEventListener('input',updateDoeWeightSum));
['doeTopK1','doeTopK2','doeDepthValues','doeYShiftValues','doeResidualValues','doeRobustW0','doeRobustOcc','doeRobustLiner','doeRobustResidual','doeHighStacks'].forEach(id=>$(id).addEventListener('input',updateDoeEstimate));
document.querySelectorAll('.sweepTab').forEach(b=>b.addEventListener('click',()=>renderSweepTab(b.dataset.sweep)));
$("v6ApplyPreset").addEventListener("click",applyV6Preset);
$("v6StackCount").addEventListener("change",()=>{buildV6LayerGrid();lastV6Selected=null;lastV6History=null;lastV6Sensitivity=null;lastV6Presets=null;lastV6Plan=null;$("v6StatusBadge").className='neutralBadge';$("v6StatusBadge").textContent='Not run';});
$("v6Preset").addEventListener("change",()=>{if($("v6Preset").value!=="custom")applyV6Preset();});
$("runV6Selected").addEventListener("click",runV6Selected);
$("runV6Cumulative").addEventListener("click",runV6Cumulative);
$("runV6Sensitivity").addEventListener("click",runV6Sensitivity);
$("runV6Presets").addEventListener("click",runV6Presets);
$("runV6Plan").addEventListener("click",runV6Plan);
$("runV6Full").addEventListener("click",runV6Full);
$("downloadV6Json").addEventListener("click",downloadV6Json);
$("runIntegratedStudy").addEventListener("click",runCompleteIntegratedStudy);
$("runArch24").addEventListener("click",runArchitecture24Verification);
$("downloadIntegratedJson").addEventListener("click",downloadIntegratedJson);

updateDoeWeightSum();
updateDoeEstimate();
updateMechanical();
drawStackSweep(null);
drawPareto(null);
drawArchitectureChart([]);
renderSweepTab('stage1');
$("v6Preset").value="all-baseline";
buildV6LayerGrid();
drawV6StackMask(readConfig(),v6CurrentMask());
