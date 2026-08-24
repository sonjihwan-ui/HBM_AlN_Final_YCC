import { MATERIALS } from "./constants.js";
import { frontSkinProps, backSkinProps, tsvBodyProps, tsvSegmentedIsolationParticipation, tsvLateralThermalProps } from "./homogenization.js";
import { buildTsvZones, pointInTsvZone } from "./geometry.js";
import { buildTopology, coverageAt } from "./topology.js";

function harmonic(a,b){ return 2*a*b/Math.max(a+b,1e-30); }

function networkConnectedCollarFraction(cfg, topo){
  // Every occupied TSV has a 360° AlN collar after the common-depth liner recess.
  // This function estimates only what fraction of those collars are intersected by
  // a rib network; electrical isolation no longer depends on rib direction.
  const s=Math.max(1,Math.round(cfg.alnStride));
  const p=cfg.tsvPitchUm;
  const P=s*p;
  const w=topo.width*1000; // mm -> µm
  const r=(w+(topo.collar?.outerDiaUm||cfg.tsvCollarOuterDiaUm))/2;
  function axisFrac(offsetPitches){
    const off=offsetPitches*p;
    let hit=0;
    for(let q=0;q<s;q++){
      const pos=q*p;
      let d=Math.abs((pos-off)%P);
      d=Math.min(d,P-d);
      if(d<=r+1e-9) hit++;
    }
    return hit/s;
  }
  if(cfg.alnPattern==='V3') return cfg.alnV3Direction==='x'?axisFrac(cfg.alnOffsetY):axisFrac(cfg.alnOffsetX);
  const fx=axisFrac(cfg.alnOffsetX), fy=axisFrac(cfg.alnOffsetY);
  // Diagonal braces in the X-braced family can connect additional collars. The
  // orthogonal union remains the conservative shared lower-bound connection proxy.
  return fx+fy-fx*fy;
}

export function buildThermalMaps(cfg,n,withAln=true){
  const L=cfg.coreSize*1e-3;
  const dx=L/n;
  const cellMm=cfg.coreSize/n;
  const half=cfg.coreSize/2;
  const zones=buildTsvZones(cfg);
  const topo=buildTopology(cfg,withAln);
  const front=frontSkinProps(cfg), back=backSkinProps(cfg), tsvBase=tsvBodyProps(cfg);
  const tf=cfg.frontT*1e-6, ts=cfg.siBodyT*1e-6, tb=cfg.backT*1e-6, ta=cfg.alnTUm*1e-6;

  const Kx=new Float64Array(n*n), Ky=new Float64Array(n*n);
  const q=new Float64Array(n*n), Rz=new Float64Array(n*n);
  const area=L*L;
  const tsvArea=cfg.tsvW*1e-3*cfg.tsvH*1e-3;
  const bankArea=Math.max(area-tsvArea,1e-12);
  const qBank=cfg.bankPowerW/bankArea;
  const qTsv=cfg.tsvPowerW/Math.max(tsvArea,1e-12);

  const segmented=tsvSegmentedIsolationParticipation(cfg);
  const fContact=withAln?networkConnectedCollarFraction(cfg,topo):0;
  // Baseline: SiO2 liner along the full TSV height. Modified die: every occupied
  // TSV replaces the liner with an AlN collar only through the AlN-depth segment;
  // below that segment the SiO2 liner remains. Connected collars receive an extra
  // reduced-order network-coupling increment limited by the recessed height fraction.
  const etaLiner=segmented.etaLiner;
  const etaCollar=segmented.etaCollar;
  const recessFraction=segmented.recessedFraction;
  const etaUniversal=withAln?segmented.etaUniversal:etaLiner;
  const etaCu=withAln?Math.min(1,etaUniversal+(1-etaUniversal)*fContact*recessFraction):etaLiner;
  const tsv=tsvLateralThermalProps(cfg,etaCu);

  for(let j=0;j<n;j++){
    const ymm=-half+(j+0.5)*cellMm;
    for(let i=0;i<n;i++){
      const xmm=-half+(i+0.5)*cellMm, id=j*n+i;
      const inTsv=pointInTsvZone(xmm,ymm,zones);
      const body=inTsv?tsv:MATERIALS.si;
      let ks=front.kxy*tf + body.kxy*ts + back.kxy*tb;
      let kx=ks,ky=ks;
      if(withAln && topo.segments.length){
        const cov=coverageAt(xmm,ymm,cellMm,topo);
        const deltaK=(cfg.alnEmbeddingMode==="additive")
          ? MATERIALS.aln.kxy
          : (MATERIALS.aln.kxy-MATERIALS.si.kxy);
        // Spatial continuity of the line network is resolved by the map itself.
        // Directional coverage is used only for how much of each face is AlN-rich.
        kx += deltaK*ta*Math.max(0,cov.x+0.15*cov.y);
        ky += deltaK*ta*Math.max(0,cov.y+0.15*cov.x);
      }
      Kx[id]=Math.max(kx,1e-12);
      Ky[id]=Math.max(ky,1e-12);
      q[id]=inTsv?qTsv:qBank;

      const bodyKz=Math.max(body.kz,1e-9);
      Rz[id]=tf/Math.max(front.kz,1e-9)+ts/bodyKz+tb/Math.max(back.kz,1e-9);
    }
  }
  // Normalize the discrete cell-centered source so the requested Bank and TSV
  // powers are exactly conserved despite pixelization of the TSV-zone boundary.
  const cellArea=(L/n)*(L/n);
  let bankDiscrete=0,tsvDiscrete=0;
  for(let j=0;j<n;j++){
    const ymm=-half+(j+0.5)*cellMm;
    for(let i=0;i<n;i++){
      const xmm=-half+(i+0.5)*cellMm,id=j*n+i;
      if(pointInTsvZone(xmm,ymm,zones)) tsvDiscrete+=q[id]*cellArea;
      else bankDiscrete+=q[id]*cellArea;
    }
  }
  const sBank=bankDiscrete>0?cfg.bankPowerW/bankDiscrete:1;
  const sTsv=tsvDiscrete>0?cfg.tsvPowerW/tsvDiscrete:1;
  for(let j=0;j<n;j++){
    const ymm=-half+(j+0.5)*cellMm;
    for(let i=0;i<n;i++){
      const xmm=-half+(i+0.5)*cellMm,id=j*n+i;
      q[id]*=pointInTsvZone(xmm,ymm,zones)?sTsv:sBank;
    }
  }
  return {n,L,dx,cellMm,Kx,Ky,q,Rz,zones,topo,qBank,qTsv,fContact,etaLiner,etaCollar,etaUniversal,etaCu,recessFraction,tsvThermal:tsv,
    collarMode:withAln?'UNIVERSAL_OCCUPIED_TSV_COLLAR':'BASELINE_SIO2_LINER'};
}

function solveSheet(cfg,maps){
  const {n,dx,Kx,Ky,q}=maps;
  const A=maps.L*maps.L;
  const h=1/Math.max(cfg.externalRthKW*A,1e-30);
  const T=new Float64Array(n*n);
  T.fill(cfg.ambientC+(cfg.bankPowerW+cfg.tsvPowerW)*cfg.externalRthKW);
  const maxIter=7000,tol=1e-6,omega=1.35;
  let it=0,err=Infinity;

  for(;it<maxIter;it++){
    err=0;
    for(let j=0;j<n;j++){
      for(let i=0;i<n;i++){
        const id=j*n+i;
        let ap=h, rhs=h*cfg.ambientC+q[id];

        if(i>0){
          const a=harmonic(Kx[id],Kx[id-1])/(dx*dx);
          ap+=a; rhs+=a*T[id-1];
        }
        if(i<n-1){
          const a=harmonic(Kx[id],Kx[id+1])/(dx*dx);
          ap+=a; rhs+=a*T[id+1];
        }
        if(j>0){
          const a=harmonic(Ky[id],Ky[id-n])/(dx*dx);
          ap+=a; rhs+=a*T[id-n];
        }
        if(j<n-1){
          const a=harmonic(Ky[id],Ky[id+n])/(dx*dx);
          ap+=a; rhs+=a*T[id+n];
        }
        const raw=rhs/ap;
        const nv=T[id]+omega*(raw-T[id]);
        err=Math.max(err,Math.abs(nv-T[id]));
        T[id]=nv;
      }
    }
    if(err<tol) break;
  }

  let tmax=-Infinity,tmin=Infinity,sum=0,imax=0,sink=0;
  const cellArea=A/(n*n);
  for(let i=0;i<T.length;i++){
    const v=T[i];sum+=v;
    if(v>tmax){tmax=v;imax=i;}
    if(v<tmin)tmin=v;
    sink+=h*(v-cfg.ambientC)*cellArea;
  }
  const mean=sum/T.length;
  const ix=imax%n,iy=Math.floor(imax/n);
  const half=cfg.coreSize/2;
  const hotx=-half+(ix+0.5)*maps.cellMm, hoty=-half+(iy+0.5)*maps.cellMm;
  const generated=cfg.bankPowerW+cfg.tsvPowerW;
  return {
    T,tmax,tmin,mean,delta:tmax-mean,iterations:it+1,error:err,h,
    hotx,hoty,generatedW:generated,sinkW:sink,
    energyErrorPct:generated>0?(sink-generated)/generated*100:0
  };
}

export function thermalSolve(cfg,nOverride=null){
  const n=nOverride||cfg.thermalGrid;
  const maps=buildThermalMaps(cfg,n,true);
  const current=solveSheet(cfg,maps);
  const noMaps=buildThermalMaps(cfg,n,false);
  const noAln=solveSheet(cfg,noMaps);
  return {
    ...current,maps,noAln,
    tmaxReductionC:noAln.tmax-current.tmax,
    tmaxReductionPct:(noAln.tmax-cfg.ambientC)>1e-12?
      (noAln.tmax-current.tmax)/(noAln.tmax-cfg.ambientC)*100:0
  };
}
