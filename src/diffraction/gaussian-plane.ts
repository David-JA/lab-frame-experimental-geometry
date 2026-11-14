import type { Vec3 } from '../core/types';
import type { Panel } from './model';

interface Budget {evaluations:number;max:number}
const X2=[-1/Math.sqrt(3),1/Math.sqrt(3)],X3=[-Math.sqrt(3/5),0,Math.sqrt(3/5)],W3=[5/9,8/9,5/9];
/** Smooth original Gaussian on the physical detector, no hard cap at sample points.
 * Undefined selects the ring oracle/fallback, retaining the evaluations already spent.
 */
export function gaussianPlaneCell(panel:Panel,source:Vec3,axis:Vec3,kc:number,sigma:number,base:number,bounds:[number,number,number,number],budget:Budget,abs:number,rel:number,depth=2):{value:number;error:number}|undefined {
  const [px,py]=panel.pixel_size_mm,[nu,nv]=panel.pixels,ox=panel.center[0]-source[0],oy=panel.center[1]-source[1],oz=panel.center[2]-source[2];
  const [xx,xy,xz]=panel.x,[yx,yy,yz]=panel.y,mx=(nu-1)/2,my=(nv-1)/2;
  const L=Math.abs(ox*panel.normal[0]+oy*panel.normal[1]+oz*panel.normal[2]);
  const us=mx-(ox*xx+oy*xy+oz*xz)/px,vs=my+(ox*yx+oy*yy+oz*yz)/py;
  const point=(u:number,v:number):Vec3=>{const a=(u-mx)*px,b=(my-v)*py;return [ox+a*xx+b*yx,oy+a*xy+b*yy,oz+a*xz+b*yz];};
  const nearest=point(Math.max(bounds[0],Math.min(bounds[1],us)),Math.max(bounds[2],Math.min(bounds[3],vs)));
  const diameter=Math.hypot((bounds[1]-bounds[0])*px,(bounds[3]-bounds[2])*py);
  // An independent geometric guard prevents both point rules missing a narrow peak.
  const relativeSize=diameter/Math.hypot(...nearest);
  // The geometric Jacobian can be sharply peaked even for a broad/near-constant Gaussian.
  if(relativeSize>1||Math.sqrt(kc)*relativeSize/sigma>1||budget.max-budget.evaluations<256)return;
  const f=(u:number,v:number)=>{
    const a=(u-mx)*px,b=(my-v)*py,x=ox+a*xx+b*yx,y=oy+a*xy+b*yy,z=oz+a*xz+b*yz,r=Math.hypot(x,y,z);
    const dx=x/r-axis[0],dy=y/r-axis[1],dz=z/r-axis[2];
    return base*Math.exp(-kc/(2*sigma*sigma)*(dx*dx+dy*dy+dz*dz))*L/(r*r*r)*px*py;
  };
  const [u0,u1,v0,v1]=bounds,um=(u0+u1)/2,vm=(v0+v1)/2,uh=(u1-u0)/2,vh=(v1-v0)/2;
  let coarse=0,fine=0;
  for(const x of X2)for(const y of X2)coarse+=f(um+uh*x,vm+vh*y);
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)fine+=W3[i]*W3[j]*f(um+uh*X3[i],vm+vh*X3[j]);
  budget.evaluations+=13;coarse*=uh*vh;fine*=uh*vh;
  const error=Math.abs(fine-coarse);
  if(Number.isFinite(fine)&&Number.isFinite(error)&&error<=abs+rel*Math.abs(fine))return {value:fine,error};
  if(depth<=0)return;
  let value=0,totalError=0;
  for(const sub of [[u0,um,v0,vm],[um,u1,v0,vm],[u0,um,vm,v1],[um,u1,vm,v1]] as [number,number,number,number][]){
    const r=gaussianPlaneCell(panel,source,axis,kc,sigma,base,sub,budget,abs/4,rel,depth-1);if(!r)return;value+=r.value;totalError+=r.error;
  }
  return {value,error:totalError};
}
