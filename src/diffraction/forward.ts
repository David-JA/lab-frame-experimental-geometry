import type { Vec3 } from '../core/types';
import { add, sub, scale, dot, cross, norm, unit } from '../core/math';
import type { Panel } from './model';

/** Reciprocal g-space, A^-1, g_ref=1 A^-1; unit exposure, no material weights. */
export type Density = {kind:'gaussian_3d';sigma_g_invA:number} | {kind:'uniform_sphere_3d';radius_g_invA:number};
export interface PixelTile { u0:number;v0:number;width:number;height:number;data:Float64Array }
export interface IntegrationOptions {
  relativeTolerance?:number; absoluteScale?:number; maxPixels?:number; maxEvaluations?:number; maxDepth?:number;
}
export interface ReflectionImage {
  hkl:Vec3;g_lab:Vec3;W:number;density:Density;tile:PixelTile;
  sphere_integral:number;pixel_sum:number;received_fraction_estimate:number|null;
  reference_board_integral:null;reference_retained_fraction:null;
  error_scale:number;scale_kind:'on_ewald_reference'|'supplied';tail_bound:number;cutoff_sigma:number|null;
  estimated_quadrature_error:number;evaluations:number;status:'resolved'|'unresolved';reason?:string;
}
const TAU=2*Math.PI, clamp=(v:number)=>Math.max(-1,Math.min(1,v));
export function densityValue(d:Density,r:number,W=1):number {
  return d.kind==='gaussian_3d'?W/((2*Math.PI)**1.5*d.sigma_g_invA**3)*Math.exp(-.5*(r/d.sigma_g_invA)**2)
    :r<d.radius_g_invA?3*W/(4*Math.PI*d.radius_g_invA**3):0;
}
export function sphereIntegral(d:Density,k:number,c:number,W=1):number {
  if(W===0)return 0;
  if(c===0)return 4*Math.PI*k*k*densityValue(d,k,W);
  if(d.kind==='gaussian_3d'){
    const s=d.sigma_g_invA,z=2*k*c/(s*s);
    // expm1(z)/z also handles a centre arbitrarily close to the Ewald centre.
    return W*4*Math.PI*k*k/((2*Math.PI)**1.5*s**3)*Math.exp(-.5*((c-k)/s)**2)*(z===0?1:-Math.expm1(-z)/z);
  }
  const R=d.radius_g_invA;
  if(R<=Math.abs(c-k))return 0;
  const area=R>=c+k?4*Math.PI*k*k:Math.PI*k/c*(R-Math.abs(c-k))*(R+Math.abs(c-k));
  return area*3*W/(4*Math.PI*R**3);
}
export function pixelPoint(panel:Panel,u:number,v:number):Vec3 {
  return add(panel.center,add(scale(panel.x,panel.pixel_size_mm[0]*(u-(panel.pixels[0]-1)/2)),scale(panel.y,panel.pixel_size_mm[1]*((panel.pixels[1]-1)/2-v))));
}
export function pixelSolidAngle(corners:Vec3[]):number {
  const triangle=(a:Vec3,b:Vec3,c:Vec3)=>2*Math.atan2(Math.abs(dot(a,cross(b,c))),1+dot(a,b)+dot(b,c)+dot(c,a));
  return triangle(corners[0],corners[1],corners[2])+triangle(corners[0],corners[2],corners[3]);
}
function cone(panel:Panel,source:Vec3,bounds:[number,number,number,number]) {
  const [u0,u1,v0,v1]=bounds,corners=[[u0,v0],[u1,v0],[u1,v1],[u0,v1]].map(([u,v])=>unit(sub(pixelPoint(panel,u,v),source)));
  const center=unit(corners.reduce((a,b)=>add(a,b),[0,0,0] as Vec3));
  const normals=corners.map((a,i)=>{let n=unit(cross(a,corners[(i+1)%4]));if(dot(n,center)<0)n=scale(n,-1);return n;});
  return {corners,normals};
}
/** Exact azimuth arcs inside a rectangular pixel cone on a polar Ewald ring. */
function ringLength(t:number,coefficients:Vec3[]):number {
  const ct=1-t,st=Math.sqrt(Math.max(0,t*(2-t)));let arcs:[number,number][]=[[0,TAU]];
  for(const [na,nb,nd]of coefficients){
    const A=na*ct,B=nb*st,C=nd*st,amp=Math.hypot(B,C);
    if(amp<1e-30){if(A<0)return 0;continue;}
    const boundary=-A/amp;if(boundary<=-1)continue;if(boundary>=1)return 0;
    const half=Math.acos(boundary),angle=(Math.atan2(C,B)+TAU)%TAU;
    const lo=angle-half,hi=angle+half;
    const allowed:[number,number][]=lo<0?[[0,hi],[lo+TAU,TAU]]:hi>TAU?[[lo,TAU],[0,hi-TAU]]:[[lo,hi]];
    const next:[number,number][]=[];
    for(const [l,r]of arcs)for(const [al,ar]of allowed){const a=Math.max(l,al),b=Math.min(r,ar);if(b>a)next.push([a,b]);}
    arcs=next;if(!arcs.length)return 0;
  }
  return arcs.reduce((s,[a,b])=>s+b-a,0);
}
// Ring topology changes at vertices and at extrema on great-circle edges.
function polarBreaks(axis:Vec3,corners:Vec3[],normals:Vec3[]):number[] {
  const candidates=[...corners];
  for(let i=0;i<4;i++){
    const p=corners[i],q=corners[(i+1)%4],n=normals[i],projection=sub(axis,scale(n,dot(n,axis)));
    if(norm(projection)<1e-15)continue;
    for(const s of [unit(projection),scale(unit(projection),-1)]){
      const edge=cross(p,q);
      if(dot(cross(p,s),edge)>=-1e-25&&dot(cross(s,q),edge)>=-1e-25)candidates.push(s);
    }
  }
  for(const s of [axis,scale(axis,-1)])if(normals.every(n=>dot(n,s)>=-1e-15))candidates.push(s);
  // |s-axis|^2/2 avoids catastrophic cancellation for subpixel caps.
  return candidates.map(s=>{const r=sub(s,axis);return Math.min(2,dot(r,r)/2);}).sort((a,b)=>a-b);
}
const G8X=[.1834346424956498,.525532409916329,.7966664774136267,.9602898564975363];
const G8W=[.362683783378362,.3137066458778873,.2223810344533745,.1012285362903763];
const G4X=[.3399810435848563,.8611363115940526],G4W=[.6521451548625461,.3478548451374538];
function gauss(f:(x:number)=>number,a:number,b:number,x:number[],w:number[]):number {
  const mid=(a+b)/2,h=(b-a)/2;let s=0;
  for(let i=0;i<x.length;i++)s+=w[i]*(f(mid-h*x[i])+f(mid+h*x[i]));return s*h;
}
function adaptive(f:(x:number)=>number,a:number,b:number,abs:number,rel:number,depth:number,state:{evaluations:number;max:number;ok:boolean}):[number,number] {
  if(state.evaluations+12>state.max){state.ok=false;return [0,Infinity];}
  const fine=gauss(f,a,b,G8X,G8W),coarse=gauss(f,a,b,G4X,G4W);state.evaluations+=12;
  const error=Math.abs(fine-coarse);
  if(error<=abs+rel*Math.abs(fine))return [fine,error];
  if(depth===0){state.ok=false;return [fine,error];}
  const m=(a+b)/2,l=adaptive(f,a,m,abs/2,rel,depth-1,state),r=adaptive(f,m,b,abs/2,rel,depth-1,state);
  return [l[0]+r[0],l[1]+r[1]];
}
function componentRange(a:number,t:number):[number,number] {
  const theta=2*Math.asin(Math.sqrt(t/2)),angle=Math.acos(clamp(a)),spread=Math.sqrt(Math.max(0,1-a*a))*Math.sqrt(Math.max(0,t*(2-t))),center=a*(1-t);
  return [Math.PI-angle<=theta?-1:center-spread,angle<=theta?1:center+spread];
}
function supportROI(panel:Panel,source:Vec3,axis:Vec3,t:number):[number,number,number,number] {
  const L=dot(panel.normal,sub(panel.center,source)),n=scale(panel.normal,Math.sign(L));
  const [dl,dh]=componentRange(dot(n,axis),t),[Nu,Nv]=panel.pixels;
  if(dh<=0)return [0,-1,0,-1];
  if(dl<=0)return [0,Nu-1,0,Nv-1];
  const ratio=(basis:Vec3)=>{const [a,b]=componentRange(dot(basis,axis),t);return [a/dl,a/dh,b/dl,b/dh];};
  const xs=ratio(panel.x).map(v=>dot(sub(source,panel.center),panel.x)+Math.abs(L)*v),ys=ratio(panel.y).map(v=>dot(sub(source,panel.center),panel.y)+Math.abs(L)*v);
  const us=xs.map(x=>x/panel.pixel_size_mm[0]+(Nu-1)/2),vs=ys.map(y=>(Nv-1)/2-y/panel.pixel_size_mm[1]);
  return [Math.max(0,Math.ceil(Math.min(...us)-.5)),Math.min(Nu-1,Math.floor(Math.max(...us)+.5)),Math.max(0,Math.ceil(Math.min(...vs)-.5)),Math.min(Nv-1,Math.floor(Math.max(...vs)+.5))];
}
export function integrateReflection(panel:Panel,source:Vec3,g:Vec3,k:number,d:Density,W=1,hkl:Vec3=[0,0,0],options:IntegrationOptions={}):ReflectionImage {
  if(d.kind!=='gaussian_3d'&&d.kind!=='uniform_sphere_3d')throw new Error('Unknown reciprocal density');
  if([source,g,hkl,panel.center,panel.x,panel.y,panel.normal].some(v=>!Array.isArray(v)||v.length!==3)||!Array.isArray(panel.pixels)||panel.pixels.length!==2||!Array.isArray(panel.pixel_size_mm)||panel.pixel_size_mm.length!==2)throw new Error('Invalid geometry dimensions');
  if([...source,...g,...hkl,...panel.center,...panel.x,...panel.y,...panel.normal].some(v=>!Number.isFinite(v)))throw new Error('Nonfinite geometry');
  if(panel.pixels.some(v=>!Number.isInteger(v)||v<1)||panel.pixel_size_mm.some(v=>!Number.isFinite(v)||v<=0))throw new Error('Invalid raw pixel grid');
  if([panel.x,panel.y,panel.normal].some(v=>Math.abs(norm(v)-1)>1e-8)||Math.abs(dot(panel.x,panel.y))>1e-8||norm(sub(cross(panel.x,panel.y),panel.normal))>1e-8)throw new Error('Panel basis must be right-handed and orthonormal');
  for(const name of ['relativeTolerance','absoluteScale','maxPixels','maxEvaluations','maxDepth'] as const){
    const value=options[name];
    if(value===undefined)continue;
    if(!Number.isFinite(value)||value<0||((name==='maxPixels'||name==='maxEvaluations'||name==='maxDepth')&&!Number.isInteger(value))||((name==='relativeTolerance'||name==='maxPixels'||name==='maxEvaluations')&&value===0))throw new Error(`Invalid integration option ${name}`);
  }
  if(!(k>0&&Number.isFinite(k)&&Number.isFinite(W)&&W>=0))throw new Error('Invalid k or relative weight');
  const width=d.kind==='gaussian_3d'?d.sigma_g_invA:d.radius_g_invA;
  if(!(width>0&&Number.isFinite(width)))throw new Error('Invalid reciprocal width');
  const q=add(g,[0,0,k]),c=norm(q),J=sphereIntegral(d,k,c,W),Jscale=options.absoluteScale??sphereIntegral(d,k,k,W);
  if(!Number.isFinite(J)||!Number.isFinite(Jscale)||!Number.isFinite(c))throw new Error('Reciprocal density exceeds numerical range');
  const axis:Vec3=c>0?scale(q,1/c):[0,0,1],b=unit(cross(axis,Math.abs(axis[1])<.8?[0,1,0]:[1,0,0])),e=cross(axis,b);
  const result:ReflectionImage={hkl:[...hkl],g_lab:[...g],W,density:{...d},tile:{u0:0,v0:0,width:0,height:0,data:new Float64Array()},sphere_integral:J,pixel_sum:0,received_fraction_estimate:J>0?0:null,reference_board_integral:null,reference_retained_fraction:null,error_scale:Jscale,scale_kind:options.absoluteScale===undefined?'on_ewald_reference':'supplied',tail_bound:0,cutoff_sigma:null,estimated_quadrature_error:0,evaluations:0,status:'resolved'};
  if(Math.abs(dot(panel.normal,sub(panel.center,source)))<1e-10){result.status='unresolved';result.reason='Detector plane contains the source';return result;}
  if(J===0)return result;
  // Direction/frame arithmetic has O(epsilon) angular uncertainty. Below this
  // scale a subpixel boundary cannot be resolved to the stated intensity gate.
  if(width/k<1e-11){result.status='unresolved';result.reason='Reciprocal width is below angular numerical resolution';return result;}
  let tcap=2,alpha=0,base=densityValue(d,Math.abs(c-k),W)*k*k;
  if(d.kind==='gaussian_3d'&&c>0){
    const sigma=d.sigma_g_invA;alpha=k*c/(sigma*sigma);let m=8;
    for(;m<=32;m+=2){
      tcap=Math.max(0,Math.min(2,(m*m*sigma*sigma-(c-k)**2)/(2*k*c)));
      result.tail_bound=tcap===2?0:base/alpha*TAU*Math.exp(-alpha*tcap)*(-Math.expm1(-alpha*(2-tcap)));
      if(result.tail_bound<=1e-10*Jscale)break;
    }
    result.cutoff_sigma=m;
    if(result.tail_bound>1e-6*Jscale){result.status='unresolved';result.reason='Tail budget exceeded';return result;}
  }else if(d.kind==='uniform_sphere_3d'&&c>0)tcap=Math.min(2,(d.radius_g_invA**2-(c-k)**2)/(2*k*c));
  if(tcap<=0)return result;
  const [u0,u1,v0,v1]=supportROI(panel,source,axis,tcap),widthPixels=Math.max(0,u1-u0+1),height=Math.max(0,v1-v0+1),count=widthPixels*height;
  if(count>(options.maxPixels??200000)){result.status='unresolved';result.reason=`ROI ${count} pixels exceeds integration budget`;return result;}
  result.tile={u0,v0,width:widthPixels,height,data:new Float64Array(count)};
  const rel=options.relativeTolerance??2e-6,state={evaluations:0,max:options.maxEvaluations??2000000,ok:true};
  const perPixelAbs=1e-10*Jscale/Math.max(1,count),depth=options.maxDepth??16;
  pixels:for(let j=0;j<height;j++)for(let i=0;i<widthPixels;i++){
    if(!state.ok)break pixels;
    const {corners,normals}=cone(panel,source,[u0+i-.5,u0+i+.5,v0+j-.5,v0+j+.5]);
    let value=0,error=0;
    if(c===0)value=base*pixelSolidAngle(corners);
    else{
      const breaks=polarBreaks(axis,corners,normals),low=breaks[0],high=Math.min(tcap,breaks[breaks.length-1]);
      if(low>=high)continue;
      if(d.kind==='uniform_sphere_3d'&&breaks[breaks.length-1]<=tcap)value=base*pixelSolidAngle(corners);
      else{
        const edges=[low,...breaks.filter(t=>t>low&&t<high),high],coeff=normals.map(n=>[dot(n,axis),dot(n,b),dot(n,e)] as Vec3);
        for(let n=1;n<edges.length;n++){
          const l=edges[n-1],r=edges[n];if(!(r>l))continue;
          // sin² substitution removes ring/edge square-root endpoint singularities.
          const f=(z:number)=>{const sn=Math.sin(z),t=l+(r-l)*sn*sn;return base*Math.exp(-alpha*t)*ringLength(t,coeff)*(r-l)*Math.sin(2*z);};
          const integral=adaptive(f,0,Math.PI/2,perPixelAbs/Math.max(1,edges.length-1),rel,depth,state);value+=integral[0];error+=integral[1];
        }
      }
    }
    result.tile.data[j*widthPixels+i]=value;result.pixel_sum+=value;result.estimated_quadrature_error+=error;
  }
  result.evaluations=state.evaluations;result.received_fraction_estimate=J>0?result.pixel_sum/J:null;
  if(!Number.isFinite(result.pixel_sum)||!Number.isFinite(result.estimated_quadrature_error)){result.status='unresolved';result.reason='Nonfinite pixel quadrature result';return result;}
  if(!state.ok||result.estimated_quadrature_error>1e-3*result.pixel_sum+1e-6*Jscale){result.status='unresolved';result.reason='Pixel quadrature budget or convergence limit reached';}
  return result;
}

/** Conservative area-overlap reduction of raw integrated pixels (never interpolates intensities). */
export function downsample(tiles:PixelTile[],pixels:[number,number],size:[number,number]):Float64Array {
  const [w,h]=size,out=new Float64Array(w*h),sx=w/pixels[0],sy=h/pixels[1];
  for(const tile of tiles)for(let j=0;j<tile.height;j++)for(let i=0;i<tile.width;i++){
    const value=tile.data[j*tile.width+i];if(value===0)continue;
    const x0=(tile.u0+i)*sx,x1=x0+sx,y0=(tile.v0+j)*sy,y1=y0+sy;
    for(let y=Math.floor(y0);y<Math.ceil(y1)&&y<h;y++)for(let x=Math.floor(x0);x<Math.ceil(x1)&&x<w;x++){
      if(x<0||y<0)continue;
      out[y*w+x]+=value*Math.max(0,Math.min(x1,x+1)-Math.max(x0,x))/sx*Math.max(0,Math.min(y1,y+1)-Math.max(y0,y))/sy;
    }
  }
  return out;
}
