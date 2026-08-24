import { buildTsvZones } from "./geometry.js";

function linspacePositions(min,max,pitch,offset=0){
  const out=[]; if(pitch<=0||max<min)return out;
  const start=Math.ceil((min-offset)/pitch)*pitch+offset;
  for(let v=start;v<=max+1e-12;v+=pitch)out.push(v);
  return out;
}
function uniquePts(pts,tol=1e-9){
  const out=[];
  for(const p of pts){
    if(!out.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<tol))out.push(p);
  }
  return out;
}
function clipDiagRect(rect,c,sign){
  const x1=rect.cx-rect.w/2,x2=rect.cx+rect.w/2,y1=rect.cy-rect.h/2,y2=rect.cy+rect.h/2;
  const pts=[];
  // sign=+1 => x-y=c ; sign=-1 => x+y=c
  if(sign===1){
    for(const x of [x1,x2]){const y=x-c;if(y>=y1-1e-12&&y<=y2+1e-12)pts.push({x,y});}
    for(const y of [y1,y2]){const x=y+c;if(x>=x1-1e-12&&x<=x2+1e-12)pts.push({x,y});}
  }else{
    for(const x of [x1,x2]){const y=c-x;if(y>=y1-1e-12&&y<=y2+1e-12)pts.push({x,y});}
    for(const y of [y1,y2]){const x=c-y;if(x>=x1-1e-12&&x<=x2+1e-12)pts.push({x,y});}
  }
  const u=uniquePts(pts);
  if(u.length<2)return null;
  let best=[u[0],u[1]],bd=-1;
  for(let i=0;i<u.length;i++)for(let j=i+1;j<u.length;j++){
    const d=Math.hypot(u[i].x-u[j].x,u[i].y-u[j].y);
    if(d>bd){bd=d;best=[u[i],u[j]];}
  }
  return {x1:best[0].x,y1:best[0].y,x2:best[1].x,y2:best[1].y,ori:"diag"};
}

function addPatternInRect(raw,rect,cfg,p,ox,oy,fullPrimary=false){
  const x1=rect.cx-rect.w/2,x2=rect.cx+rect.w/2,y1=rect.cy-rect.h/2,y2=rect.cy+rect.h/2;
  const half=cfg.coreSize/2;
  const add=(s)=>raw.push(s);
  const H=linspacePositions(y1,y2,p,oy);
  const V=linspacePositions(x1,x2,p,ox);

  if(cfg.alnPattern==="V3"){
    if(cfg.alnV3Direction==="x"){
      for(const y of H)add({x1:fullPrimary?-half:x1,y1:y,x2:fullPrimary?half:x2,y2:y,ori:"x"});
    }else{
      for(const x of V)add({x1:x,y1:fullPrimary?-half:y1,x2:x,y2:fullPrimary?half:y2,ori:"y"});
    }
    return {H,V};
  }

  for(const y of H)add({x1:fullPrimary?-half:x1,y1:y,x2:fullPrimary?half:x2,y2:y,ori:"x"});
  for(const x of V)add({x1:x,y1:fullPrimary?-half:y1,x2:x,y2:fullPrimary?half:y2,ori:"y"});

  if(cfg.alnPattern==="V2"){
    const c1min=x1-y2,c1max=x2-y1,off1=ox-oy;
    for(const c of linspacePositions(c1min,c1max,p,off1)){
      const s=clipDiagRect(rect,c,1);if(s)add(s);
    }
    const c2min=x1+y1,c2max=x2+y2,off2=ox+oy;
    for(const c of linspacePositions(c2min,c2max,p,off2)){
      const s=clipDiagRect(rect,c,-1);if(s)add(s);
    }
  }
  return {H,V};
}

function mergeAxisCollinear(segments){
  const axis=segments.filter(s=>s.ori==="x"||s.ori==="y");
  const other=segments.filter(s=>s.ori!=="x"&&s.ori!=="y");
  const maps={x:new Map(),y:new Map()};
  for(const s of axis){
    const coord=(s.ori==="x"?s.y1:s.x1).toFixed(9),m=maps[s.ori];
    if(!m.has(coord))m.set(coord,[]);m.get(coord).push(s);
  }
  const out=[...other];
  for(const ori of ["x","y"]){
    for(const arr of maps[ori].values()){
      const ranges=arr.map(s=>ori==="x"?[Math.min(s.x1,s.x2),Math.max(s.x1,s.x2)]:[Math.min(s.y1,s.y2),Math.max(s.y1,s.y2)]).sort((a,b)=>a[0]-b[0]);
      let [a,b]=ranges[0];
      const coord=ori==="x"?arr[0].y1:arr[0].x1;
      for(let i=1;i<ranges.length;i++){
        if(ranges[i][0]<=b+1e-12)b=Math.max(b,ranges[i][1]);
        else{
          out.push(ori==="x"?{x1:a,y1:coord,x2:b,y2:coord,ori}:{x1:coord,y1:a,x2:coord,y2:b,ori});
          [a,b]=ranges[i];
        }
      }
      out.push(ori==="x"?{x1:a,y1:coord,x2:b,y2:coord,ori}:{x1:coord,y1:a,x2:coord,y2:b,ori});
    }
  }
  return out;
}

function segLen(s){return Math.hypot(s.x2-s.x1,s.y2-s.y1);}

function pairOverlapCoefficient(segments){
  // Pairwise strip-overlap correction: overlap ≈ w²/|sin(theta)|.
  // Exact for an isolated two-line crossing; multi-line junctions are a
  // documented reduced-order accounting approximation for V2.
  let C=0,n=0;
  for(let i=0;i<segments.length;i++){
    const a=segments[i],rx=a.x2-a.x1,ry=a.y2-a.y1,lr=Math.hypot(rx,ry);
    for(let j=i+1;j<segments.length;j++){
      const b=segments[j],sx=b.x2-b.x1,sy=b.y2-b.y1,ls=Math.hypot(sx,sy);
      const cross=rx*sy-ry*sx;
      if(Math.abs(cross)<1e-12*lr*ls)continue;
      const qx=b.x1-a.x1,qy=b.y1-a.y1;
      const t=(qx*sy-qy*sx)/cross;
      const u=(qx*ry-qy*rx)/cross;
      if(t>=-1e-10&&t<=1+1e-10&&u>=-1e-10&&u<=1+1e-10){
        const sin=Math.abs(cross)/(lr*ls);
        C+=1/Math.max(sin,0.2);n++;
      }
    }
  }
  return {C,n};
}


function mergeIntervals(intervals){
  if(!intervals.length)return [];
  const a=intervals.sort((u,v)=>u[0]-v[0]),out=[];
  let [x1,x2]=a[0];
  for(let i=1;i<a.length;i++){
    if(a[i][0]<=x2+1e-12)x2=Math.max(x2,a[i][1]);
    else{out.push([x1,x2]);[x1,x2]=a[i];}
  }
  out.push([x1,x2]);return out;
}
function bankOnlyHorizontal(y,zones,half){
  const cuts=[];
  for(const z of zones){
    if(y>=z.cy-z.h/2-1e-12&&y<=z.cy+z.h/2+1e-12)cuts.push([z.cx-z.w/2,z.cx+z.w/2]);
  }
  const m=mergeIntervals(cuts),out=[];let cur=-half;
  for(const [a,b] of m){if(a>cur+1e-12)out.push({x1:cur,y1:y,x2:a,y2:y,ori:"x"});cur=Math.max(cur,b);}
  if(cur<half-1e-12)out.push({x1:cur,y1:y,x2:half,y2:y,ori:"x"});
  return out;
}
function bankOnlyVertical(x,zones,half){
  const cuts=[];
  for(const z of zones){
    if(x>=z.cx-z.w/2-1e-12&&x<=z.cx+z.w/2+1e-12)cuts.push([z.cy-z.h/2,z.cy+z.h/2]);
  }
  const m=mergeIntervals(cuts),out=[];let cur=-half;
  for(const [a,b] of m){if(a>cur+1e-12)out.push({x1:x,y1:cur,x2:x,y2:a,ori:"y"});cur=Math.max(cur,b);}
  if(cur<half-1e-12)out.push({x1:x,y1:cur,x2:x,y2:half,ori:"y"});
  return out;
}


function pointInRectLocal(x,y,r){
  return Math.abs(x-r.cx)<=r.w/2+1e-12 && Math.abs(y-r.cy)<=r.h/2+1e-12;
}

export function buildUniversalCollarStats(cfg,zones=buildTsvZones(cfg)){
  const pitch=Math.max(cfg.tsvPitchUm,1e-9);
  let candidateSites=0,zoneArea=0;
  for(const z of zones){
    const nx=Math.max(0,Math.floor((z.w*1000)/pitch));
    const ny=Math.max(0,Math.floor((z.h*1000)/pitch));
    candidateSites+=nx*ny; zoneArea+=z.w*z.h;
  }
  const occupiedSites=candidateSites*(cfg.tsvOccPct/100);
  const innerDiaUm=cfg.tsvDiaUm;
  const outerDiaUm=Math.max(cfg.tsvCollarOuterDiaUm,innerDiaUm);
  const radialMarginUm=Math.max(0,(outerDiaUm-innerDiaUm)/2);
  const ringAreaUm2=Math.PI*Math.max(0,outerDiaUm*outerDiaUm-innerDiaUm*innerDiaUm)/4;
  const collarAreaMm2=occupiedSites*ringAreaUm2*1e-6;
  const areaFracInTsvZone=zoneArea>0?Math.min(1,collarAreaMm2/zoneArea):0;
  const recessDepthUm=cfg.alnTUm;
  const recessedHeightFraction=cfg.siBodyT>0?Math.min(1,recessDepthUm/cfg.siBodyT):0;
  return {
    mode:'UNIVERSAL_OCCUPIED_TSV_COLLAR',candidateSites,occupiedSites,innerDiaUm,outerDiaUm,radialMarginUm,
    ringAreaUm2,collarAreaMm2,zoneAreaMm2:zoneArea,areaFracInTsvZone,recessDepthUm,recessedHeightFraction,
    note:'Every occupied TSV is recessed through the AlN-depth segment and receives a 360-degree AlN collar; below that segment the SiO2 liner remains.'
  };
}

export function buildTopology(cfg,withAln=true){
  const L=cfg.coreSize,half=L/2,p=(cfg.tsvPitchUm*cfg.alnStride)/1000;
  const ox=cfg.alnOffsetX*(cfg.tsvPitchUm/1000),oy=cfg.alnOffsetY*(cfg.tsvPitchUm/1000);
  const zones=buildTsvZones(cfg);
  const emptyCollar={mode:'NONE',candidateSites:0,occupiedSites:0,innerDiaUm:cfg.tsvDiaUm,outerDiaUm:cfg.tsvDiaUm,radialMarginUm:0,ringAreaUm2:0,collarAreaMm2:0,zoneAreaMm2:zones.reduce((a,z)=>a+z.w*z.h,0),areaFracInTsvZone:0,recessDepthUm:0,recessedHeightFraction:0};
  if(!withAln||(cfg.alnWidthMode!=="process"&&cfg.alnVolPct<=0))return {segments:[],pitch:p,width:0,totalLength:0,lineLengthX:0,lineLengthY:0,
    intersections:0,overlapCoeff:0,areaUnion:0,areaFrac:0,areaFracX:0,areaFracY:0,targetArea:0,targetVolume:0,valid:true,maxWidth:p*.5,
    collar:emptyCollar,zones,ribArea:0,ribTargetArea:0,actualVolume:0,actualVolPct:0,widthMode:cfg.alnWidthMode,wideBand:false};

  let raw=[];
  const collar=buildUniversalCollarStats(cfg,zones);
  if(cfg.alnTopology==="T4"){
    // Shape-maintaining continuation: the selected V1/V2/V3 family fills the full die.
    addPatternInRect(raw,{cx:0,cy:0,w:L,h:L},cfg,p,ox,oy,false);
  }else{
    // Preserve the chosen central pattern inside TSV zone(s).
    for(const z of zones) addPatternInRect(raw,z,cfg,p,ox,oy,false);

    // T1/T2/T3 are deliberately BANK-ONLY simple ribs.  They do not overwrite
    // the central V1/V2/V3 pattern, which keeps "pattern family" and
    // "outside-TSV simplification" as independent DOE variables.
    if(cfg.alnTopology==="T1"||cfg.alnTopology==="T3"){
      for(const y of linspacePositions(-half,half,p,oy)) raw.push(...bankOnlyHorizontal(y,zones,half));
    }
    if(cfg.alnTopology==="T2"||cfg.alnTopology==="T3"){
      for(const x of linspacePositions(-half,half,p,ox)) raw.push(...bankOnlyVertical(x,zones,half));
    }
  }

  const segments=mergeAxisCollinear(raw);
  let Ltot=0,Lx=0,Ly=0;
  for(const s of segments){
    const len=segLen(s);Ltot+=len;
    const ux=Math.abs(s.x2-s.x1)/Math.max(len,1e-30);
    const uy=Math.abs(s.y2-s.y1)/Math.max(len,1e-30);
    Lx+=len*ux*ux;Ly+=len*uy*uy;
  }
  const overlap=pairOverlapCoefficient(segments);
  const dieArea=L*L,siBodyMm=cfg.siBodyT/1000,tAln=cfg.alnTUm/1000;
  const processMode=cfg.alnWidthMode==="process";
  const targetVolume=processMode?0:(cfg.alnVolPct/100)*dieArea*siBodyMm;
  const targetArea=processMode?0:targetVolume/Math.max(tAln,1e-12);
  // In legacy constant-volume mode the universal TSV collars consume the same material budget as the ribs.
  // In final process-constrained mode, width and depth are fixed by fabrication geometry and the actual AlN usage is an output.
  const ribTargetArea=processMode?0:Math.max(0,targetArea-collar.collarAreaMm2);
  const collarConsumesAllTarget=processMode?false:collar.collarAreaMm2>targetArea+1e-12;

  let width=0;
  if(processMode){
    width=(cfg.alnWidthDepthRatio*cfg.alnTUm)/1000;
  }else if(cfg.alnWidthMode === "manual"){
    width = cfg.alnWidthUm/1000;
  }else if(Ltot>0 && ribTargetArea>0){
    if(overlap.C>0){
      const disc=Ltot*Ltot-4*overlap.C*ribTargetArea;
      width=disc>0?(Ltot-Math.sqrt(disc))/(2*overlap.C):ribTargetArea/Ltot;
    }else width=ribTargetArea/Ltot;
  }
  const ribArea=Math.max(0,Ltot*width-overlap.C*width*width);
  // Rib/collar overlap is deliberately small at the mapped scale. The volume accounting assigns
  // the collar first and solves the rib budget from the remainder; local coverageAt() uses a union rule.
  const areaUnion=collar.collarAreaMm2+ribArea;
  const ax=Math.max(0,collar.collarAreaMm2+Lx*width-0.5*overlap.C*width*width);
  const ay=Math.max(0,collar.collarAreaMm2+Ly*width-0.5*overlap.C*width*width);
  const maxWidth=.5*p;
  const valid=!collarConsumesAllTarget && width>0&&width<=maxWidth&&areaUnion<=dieArea&&Number.isFinite(width);
  const widthUm=width*1000;

  return {segments,pitch:p,width,totalLength:Ltot,lineLengthX:Lx,lineLengthY:Ly,
    intersections:overlap.n,overlapCoeff:overlap.C,areaUnion,areaFrac:areaUnion/dieArea,
    areaFracX:ax/dieArea,areaFracY:ay/dieArea,targetArea,targetVolume,valid,maxWidth,
    collar,ribArea,ribTargetArea,collarConsumesAllTarget,zones,wideBand:widthUm>cfg.tsvPitchUm,
    widthMode:cfg.alnWidthMode, processWidthDepthRatio:processMode?cfg.alnWidthDepthRatio:null,
    placementMode:processMode?"BACKSIDE_ADJACENT":"USER_Z",
    actualVolume:areaUnion*tAln, actualVolPct: siBodyMm>0 && dieArea>0 ? (areaUnion*tAln)/(dieArea*siBodyMm)*100 : 0};
}

function pointSegmentDistance(x,y,s){
  const vx=s.x2-s.x1,vy=s.y2-s.y1,wx=x-s.x1,wy=y-s.y1;
  const vv=vx*vx+vy*vy;
  const t=vv>0?Math.max(0,Math.min(1,(wx*vx+wy*vy)/vv)):0;
  const px=s.x1+t*vx,py=s.y1+t*vy;
  return Math.hypot(x-px,y-py);
}

export function coverageAt(x,y,cellSize,topo){
  const inTsv=(topo.zones||[]).some(r=>pointInRectLocal(x,y,r));
  const collar=inTsv?Math.max(0,Math.min(1,topo.collar?.areaFracInTsvZone||0)):0;
  let remain=1,cx=0,cy=0;
  for(const s of topo.segments||[]){
    const len=segLen(s);if(len<=0||topo.width<=0)continue;
    const dist=pointSegmentDistance(x,y,s);
    const reach=0.5*cellSize+0.5*topo.width;
    if(dist<=reach){
      const frac=Math.min(1,topo.width/Math.max(cellSize,topo.width));
      const ux=Math.abs(s.x2-s.x1)/len,uy=Math.abs(s.y2-s.y1)/len;
      const add=remain*frac;
      cx+=add*ux*ux;cy+=add*uy*uy;remain*=1-frac;
    }
  }
  const ribTotal=1-remain;
  // Every occupied TSV has an isotropic annular AlN collar in the recessed segment.
  // Combine that homogenized collar coverage with the directional rib coverage by a union rule.
  return {
    total:Math.min(1,collar+(1-collar)*ribTotal),
    x:Math.min(1,collar+(1-collar)*cx),
    y:Math.min(1,collar+(1-collar)*cy),
    collar,ribTotal,ribX:Math.min(1,cx),ribY:Math.min(1,cy)
  };
}

export function topologyName(t){
  return ({
    T0:"TSV zone only",
    T1:"TSV zone + horizontal bank ribs",
    T2:"TSV zone + vertical bank ribs",
    T3:"TSV zone + orthogonal bank ribs",
    T4:"Full-die continuation of selected pattern"
  })[t]||t;
}
export function patternName(v){
  return ({
    V1:"Orthogonal reinforcement grid",
    V2:"X-braced reinforcement grid",
    V3:"Parallel reinforcement lines"
  })[v]||v;
}

export function designName(pattern,topology){
  return `${patternName(pattern)} · ${topologyName(topology)}`;
}
