import { MATERIALS } from "./constants.js";
import { frontSkinProps, backSkinProps, tsvBodyProps } from "./homogenization.js";
import { buildTsvZones, pointInTsvZone, zonesFitCore } from "./geometry.js";
import { buildTopology, coverageAt } from "./topology.js";

function solveLinear(A,b){
  const n=b.length, M=A.map((r,i)=>[...r,b[i]]);
  for(let k=0;k<n;k++){
    let piv=k;
    for(let i=k+1;i<n;i++) if(Math.abs(M[i][k])>Math.abs(M[piv][k])) piv=i;
    [M[k],M[piv]]=[M[piv],M[k]];
    const d=M[k][k];
    if(Math.abs(d)<1e-30) throw new Error("Singular matrix in reduced-order mechanics solve");
    for(let j=k;j<=n;j++) M[k][j]/=d;
    for(let i=0;i<n;i++){
      if(i===k) continue;
      const f=M[i][k];
      if(Math.abs(f)<1e-30) continue;
      for(let j=k;j<=n;j++) M[i][j]-=f*M[k][j];
    }
  }
  return M.map(r=>r[n]);
}

function q2(E,nu){
  const c=E/(1-nu*nu);
  return [[c,nu*c],[nu*c,c]];
}
function add2(A,B,f=1){
  for(let i=0;i<2;i++) for(let j=0;j<2;j++) A[i][j]+=f*B[i][j];
}
function matVec2(A,v){
  return [A[0][0]*v[0]+A[0][1]*v[1], A[1][0]*v[0]+A[1][1]*v[1]];
}

export function laminateLocal(cfg, bodyProps=MATERIALS.si, bodyIsTsv=false){
  const front=frontSkinProps(cfg), back=backSkinProps(cfg);
  const tf=cfg.frontT*1e-6, ts=cfg.siBodyT*1e-6, tb=cfg.backT*1e-6;
  const total=(cfg.totalDieT)*1e-6;
  const z0=-total/2;

  const layers=[
    {name:"back", t:tb, ...back, depT:cfg.backProcessC, stress:cfg.backResidualMPa*1e6},
    {name:"body", t:ts, ...bodyProps, depT:bodyIsTsv?cfg.tsvRefC:cfg.finalC, stress:0},
    {name:"front",t:tf, ...front, depT:cfg.frontProcessC,stress:cfg.frontResidualMPa*1e6}
  ];

  const A=[[0,0],[0,0]],B=[[0,0],[0,0]],D=[[0,0],[0,0]];
  const N=[0,0],M=[0,0];
  let z=z0;
  for(const L of layers){
    const z1=z,z2=z+L.t; z=z2;
    const Q=q2(L.E,L.nu);
    add2(A,Q,z2-z1);
    add2(B,Q,(z2*z2-z1*z1)/2);
    add2(D,Q,(z2*z2*z2-z1*z1*z1)/3);

    let epsTherm=0;
    if(L.name==="front" || L.name==="back"){
      epsTherm=(L.alpha-MATERIALS.si.alpha)*(cfg.finalC-L.depT);
    } else if(bodyIsTsv){
      epsTherm=(L.alpha-MATERIALS.si.alpha)*(cfg.finalC-cfg.tsvRefC);
    }
    const epsStress=(L.name==="front" || L.name==="back") ? L.stress/Math.max(L.E,1):0;
    const eps=[epsTherm+epsStress,epsTherm+epsStress];
    const qeps=matVec2(Q,eps);
    N[0]+=qeps[0]*(z2-z1); N[1]+=qeps[1]*(z2-z1);
    M[0]+=qeps[0]*(z2*z2-z1*z1)/2; M[1]+=qeps[1]*(z2*z2-z1*z1)/2;
  }

  const K=[
    [A[0][0],A[0][1],B[0][0],B[0][1]],
    [A[1][0],A[1][1],B[1][0],B[1][1]],
    [B[0][0],B[0][1],D[0][0],D[0][1]],
    [B[1][0],B[1][1],D[1][0],D[1][1]]
  ];
  const x=solveLinear(K,[N[0],N[1],M[0],M[1]]);
  return {
    epsx:x[0],epsy:x[1],kx:x[2],ky:x[3],
    D11:D[0][0],D22:D[1][1],
    A11:A[0][0],B11:B[0][0],
    layers,front,back
  };
}

export function tsvStats(cfg){
  const nx=Math.floor((cfg.tsvW*1000)/cfg.tsvPitchUm);
  const ny=Math.floor((cfg.tsvH*1000)/cfg.tsvPitchUm);
  const sites=nx*ny;
  const count=Math.round(sites*(cfg.tsvOccPct/100));
  const tsv=tsvBodyProps(cfg);
  return {nx,ny,sites,count,cuAreaFraction:tsv.fCu,singleFill:tsv.singleFill};
}


function addNormalEq(H,g,row,target,weight){
  for(let i=0;i<row.length;i++){
    g[i]+=weight*row[i]*target;
    for(let j=0;j<row.length;j++) H[i][j]+=weight*row[i]*row[j];
  }
}

function ritzSurface(cfg, withAln=true){
  const n=cfg.mechGrid;
  const Lm=cfg.coreSize*1e-3;
  const half=cfg.coreSize/2;
  const cell=cfg.coreSize/n; // cell-centered mechanical mapping, mm
  const dA=(Lm/n)*(Lm/n);
  const zones=buildTsvZones(cfg);
  const bankLam=laminateLocal(cfg,MATERIALS.si,false);
  const tsvProps=tsvBodyProps(cfg);
  const tsvLam=laminateLocal(cfg,tsvProps,true);
  const topo=buildTopology(cfg,withAln);

  const kCal=cfg.warpSign * 4*(cfg.w0Um*1e-6)/(Lm*Lm);
  const totalT=cfg.totalDieT*1e-6;
  const tb=cfg.backT*1e-6, ts=cfg.siBodyT*1e-6;
  const zAln=-totalT/2 + tb + cfg.alnZ*ts;
  const tAln=cfg.alnTUm*1e-6;
  const Ea=MATERIALS.aln.E/(1-MATERIALS.aln.nu*MATERIALS.aln.nu);
  const EsiPlane=MATERIALS.si.E/(1-MATERIALS.si.nu*MATERIALS.si.nu);
  const Ereinforce = cfg.alnEmbeddingMode==="additive" ? Ea : (Ea-EsiPlane);
  const sig=cfg.alnResidualMPa*1e6;
  const epsAlnTherm=(MATERIALS.aln.alpha-MATERIALS.si.alpha)*(cfg.finalC-cfg.alnProcessC);
  const sigAlnTherm=Ea*epsAlnTherm;

  // Quartic Ritz surface:
  // p = [a,c,b,d,e,f,g,h,i,j,k,l]
  // w = 1/2 a x² + bxy + 1/2 c y²
  //   + d x³/6 + e x²y/2 + f xy²/2 + g y³/6
  //   + h x⁴/24 + i x³y/6 + j x²y²/4 + k xy³/6 + l y⁴/24
  const NV=12;
  const H=Array.from({length:NV},()=>Array(NV).fill(0));
  const gvec=Array(NV).fill(0);
  const cells=[];
  let tsvCells=0;

  for(let jg=0;jg<n;jg++){
    const ymm=-half+(jg+0.5)*cell;
    for(let ig=0;ig<n;ig++){
      const xmm=-half+(ig+0.5)*cell;
      const x=xmm*1e-3, y=ymm*1e-3;
      const isTsv=pointInTsvZone(xmm,ymm,zones);
      if(isTsv) tsvCells++;
      const lam=isTsv?tsvLam:bankLam;

      let k0x,k0y;
      if(cfg.mechMode==="calibrated"){
        k0x=kCal+(lam.kx-bankLam.kx);
        k0y=kCal+(lam.ky-bankLam.ky);
      }else{
        k0x=lam.kx; k0y=lam.ky;
      }

      let Dx=lam.D11, Dy=lam.D22;
      let px=0,py=0;
      if(withAln && topo.segments.length){
        const cov=coverageAt(xmm,ymm,cell,topo);
        const tEqX=cov.x*tAln;
        const tEqY=cov.y*tAln;
        const dDx=Ereinforce*tEqX*(zAln*zAln+tAln*tAln/12);
        const dDy=Ereinforce*tEqY*(zAln*zAln+tAln*tAln/12);
        const Mx=(sig+sigAlnTherm)*tEqX*zAln;
        const My=(sig+sigAlnTherm)*tEqY*zAln;
        const nextDx=Math.max(Dx+dDx,0.05*Dx);
        const nextDy=Math.max(Dy+dDy,0.05*Dy);
        k0x=(Dx*k0x+Mx)/nextDx;
        k0y=(Dy*k0y+My)/nextDy;
        Dx=nextDx; Dy=nextDy;
        px=cov.x; py=cov.y;
      }
      const Dtw=0.45*Math.sqrt(Math.max(Dx*Dy,1e-30));

      // kx = a + d x + e y + 1/2 h x² + ixy + 1/2 j y²
      const rowX=[1,0,0,x,y,0,0,0.5*x*x,x*y,0.5*y*y,0,0];
      // ky = c + f x + g y + 1/2 j x² + kxy + 1/2 l y²
      const rowY=[0,1,0,0,0,x,y,0,0,0.5*x*x,x*y,0.5*y*y];
      // engineering twist = 2b + 2ex + 2fy + i x² + 2jxy + k y²
      const rowXY=[0,0,2,0,2*x,2*y,0,0,x*x,2*x*y,y*y,0];

      addNormalEq(H,gvec,rowX,k0x,Dx*dA);
      addNormalEq(H,gvec,rowY,k0y,Dy*dA);
      addNormalEq(H,gvec,rowXY,0,Dtw*dA);
      cells.push({x,y,xmm,ymm,isTsv,Dx,Dy,k0x,k0y,px,py});
    }
  }

  for(let i=0;i<NV;i++) H[i][i]+=1e-24;
  const p=solveLinear(H,gvec);
  const [a,c,b,d,e,f,g,h,ii,jj,k,l]=p;

  const nodeN=n+1;
  const W=new Float64Array(nodeN*nodeN);
  let wmin=Infinity,wmax=-Infinity;
  let wxMin=Infinity,wxMax=-Infinity,wyMin=Infinity,wyMax=-Infinity;
  let localMin=Infinity,localMax=-Infinity;

  function wAt(x,y){
    return 0.5*a*x*x+b*x*y+0.5*c*y*y+
      d*x*x*x/6+0.5*e*x*x*y+0.5*f*x*y*y+g*y*y*y/6+
      h*x*x*x*x/24+ii*x*x*x*y/6+jj*x*x*y*y/4+k*x*y*y*y/6+l*y*y*y*y/24;
  }
  function quadAt(x,y){ return 0.5*a*x*x+b*x*y+0.5*c*y*y; }

  for(let jg=0;jg<nodeN;jg++){
    const ymm=-half+jg*(cfg.coreSize/n), y=ymm*1e-3;
    for(let ig=0;ig<nodeN;ig++){
      const xmm=-half+ig*(cfg.coreSize/n), x=xmm*1e-3;
      const w=wAt(x,y);
      W[jg*nodeN+ig]=w;
      wmin=Math.min(wmin,w); wmax=Math.max(wmax,w);
      if(Math.abs(ymm)<cfg.coreSize/n*0.51){ wxMin=Math.min(wxMin,w);wxMax=Math.max(wxMax,w); }
      if(Math.abs(xmm)<cfg.coreSize/n*0.51){ wyMin=Math.min(wyMin,w);wyMax=Math.max(wyMax,w); }
      if(pointInTsvZone(xmm,ymm,zones)){
        const residual=w-quadAt(x,y);
        localMin=Math.min(localMin,residual); localMax=Math.max(localMax,residual);
      }
    }
  }

  return {
    topo,zones,bankLam,tsvLam,tsvCells,cells,coeff:p,nodeN,W,
    totalUm:(wmax-wmin)*1e6,
    wxUm:(wxMax-wxMin)*1e6,
    wyUm:(wyMax-wyMin)*1e6,
    kxCenter:a,kyCenter:c,kxyCenter:2*b,
    localDeviationUm:(Number.isFinite(localMax)?(localMax-localMin)*1e6:0),
    geometryValid:zonesFitCore(cfg,zones) && topo.valid
  };
}

export function mechanicalSolve(cfg){
  const withAln=ritzSurface(cfg,true);
  const noAln=ritzSurface(cfg,false);
  const tsv=tsvStats(cfg);
  return {
    ...withAln,
    noAln,
    tsv,
    reductionPct:noAln.totalUm>1e-12?(1-withAln.totalUm/noAln.totalUm)*100:0,
    topologyVolumeErrorPct:withAln.topo.widthMode==="process"?0:(withAln.topo.targetArea>0?
      (withAln.topo.areaUnion-withAln.topo.targetArea)/withAln.topo.targetArea*100:0)
  };
}
