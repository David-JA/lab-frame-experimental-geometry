import { SceneError, type Vec3, type Quat, type Mat4, type Cell } from './types';
export const radians = (d: number) => d * Math.PI / 180;
export const degrees = (r: number) => r * 180 / Math.PI;
export const add = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v + b[i]) as Vec3;
export const sub = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v - b[i]) as Vec3;
export const scale = (a: Vec3, s: number): Vec3 => a.map(v => v * s) as Vec3;
export const dot = (a: Vec3, b: Vec3) => a.reduce((s, v, i) => s + v * b[i], 0);
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const norm = (a: Vec3) => Math.hypot(...a);
export function unit(a: Vec3): Vec3 {
  const n = norm(a);
  if (!Number.isFinite(n) || n < 1e-12) throw new SceneError('INVALID_VECTOR', '', 'Direction must be finite and nonzero');
  return scale(a, 1/n);
}
export const identity = (): Mat4 => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
export function multiply(a: Mat4, b: Mat4): Mat4 {
  return Array.from({length:16}, (_,i) => {
    const r=Math.floor(i/4), c=i%4;
    return [0,1,2,3].reduce((s,k)=>s+a[4*r+k]*b[4*k+c],0);
  });
}
export function translation(p: Vec3): Mat4 { const m=identity(); m[3]=p[0];m[7]=p[1];m[11]=p[2];return m; }
export function direction(m: Mat4, p: Vec3): Vec3 {
  return [0,1,2].map(r=>[0,1,2].reduce((s,k)=>s+m[r*4+k]*p[k],0)) as Vec3;
}
export const point = (m: Mat4,p:Vec3): Vec3 => add(direction(m,p),[m[3],m[7],m[11]]);
export function inverseRigid(m: Mat4): Mat4 {
  const out=identity();
  for(let r=0;r<3;r++) for(let c=0;c<3;c++) out[4*r+c]=m[4*c+r];
  const t=direction(out,[m[3],m[7],m[11]]);
  out[3]=-t[0];out[7]=-t[1];out[11]=-t[2];return out;
}
export function rotation(axis: Vec3, angleDeg: number): Mat4 {
  const [x,y,z]=unit(axis), a=radians(angleDeg),c=Math.cos(a),s=Math.sin(a),v=1-c;
  return [x*x*v+c,x*y*v-z*s,x*z*v+y*s,0, y*x*v+z*s,y*y*v+c,y*z*v-x*s,0, z*x*v-y*s,z*y*v+x*s,z*z*v+c,0, 0,0,0,1];
}
export function normalizeQuat(q: Quat): Quat {
  const n=Math.hypot(...q);
  if(!Number.isFinite(n)||Math.abs(n-1)>1e-8) throw new SceneError('INVALID_QUATERNION','','Quaternion must have unit norm');
  return q.map(v=>v/n) as Quat;
}
export function fromQuat(input: Quat): Mat4 {
  const [x,y,z,w]=normalizeQuat(input);
  return [1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),0, 2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),0, 2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),0, 0,0,0,1];
}
export function toQuat(m: Mat4): Quat {
  const t=m[0]+m[5]+m[10]; let x:number,y:number,z:number,w:number;
  if(t>0){const s=Math.sqrt(t+1)*2;w=s/4;x=(m[9]-m[6])/s;y=(m[2]-m[8])/s;z=(m[4]-m[1])/s;}
  else if(m[0]>m[5]&&m[0]>m[10]){const s=Math.sqrt(1+m[0]-m[5]-m[10])*2;w=(m[9]-m[6])/s;x=s/4;y=(m[1]+m[4])/s;z=(m[2]+m[8])/s;}
  else if(m[5]>m[10]){const s=Math.sqrt(1+m[5]-m[0]-m[10])*2;w=(m[2]-m[8])/s;x=(m[1]+m[4])/s;y=s/4;z=(m[6]+m[9])/s;}
  else {const s=Math.sqrt(1+m[10]-m[0]-m[5])*2;w=(m[4]-m[1])/s;x=(m[2]+m[8])/s;y=(m[6]+m[9])/s;z=s/4;}
  const n=Math.hypot(x,y,z,w), sign=w<0?-1:1; return [x,y,z,w].map(v=>sign*v/n) as Quat;
}
export function around(center: Vec3,r:Mat4): Mat4 {return multiply(multiply(translation(center),r),translation(scale(center,-1)));}
export function rotationDelta(a:Mat4,b:Mat4):number {
  const q=toQuat(multiply(inverseRigid(a),b));
  return degrees(2*Math.atan2(Math.hypot(q[0],q[1],q[2]),Math.abs(q[3])));
}
export const directedAngle = (a:Vec3,b:Vec3) => degrees(Math.atan2(norm(cross(unit(a),unit(b))),dot(unit(a),unit(b))));
export const axisAngle = (a:Vec3,b:Vec3) => degrees(Math.atan2(norm(cross(unit(a),unit(b))),Math.abs(dot(unit(a),unit(b)))));
export function lattice(cell:Cell):number[][] {
  const {a,b,c}=cell,al=radians(cell.alpha_deg),be=radians(cell.beta_deg),ga=radians(cell.gamma_deg);
  if([a,b,c].some(v=>!Number.isFinite(v)||v<=0)||[al,be,ga].some(v=>!Number.isFinite(v)||v<=0||v>=Math.PI)) throw new SceneError('INVALID_CELL','','Cell lengths/angles are invalid');
  const cy=c*(Math.cos(al)-Math.cos(be)*Math.cos(ga))/Math.sin(ga),cx=c*Math.cos(be),cz2=c*c-cx*cx-cy*cy;
  if(!Number.isFinite(cz2)||cz2/(c*c)<1e-12||Math.sin(ga)<1e-8)throw new SceneError('INVALID_CELL','','Cell is degenerate, overflowing or not positive definite');
  return [[a,b*Math.cos(ga),cx],[0,b*Math.sin(ga),cy],[0,0,Math.sqrt(cz2)]];
}
export function inverseTranspose(a:number[][]):number[][] {
  const c0:Vec3=[a[0][0],a[1][0],a[2][0]],c1:Vec3=[a[0][1],a[1][1],a[2][1]],c2:Vec3=[a[0][2],a[1][2],a[2][2]];
  const volume=dot(c0,cross(c1,c2)),cols=[cross(c1,c2),cross(c2,c0),cross(c0,c1)].map(c=>scale(c,1/volume));
  return [0,1,2].map(r=>cols.map(c=>c[r]));
}
export const mat3Vector=(m:number[][],v:Vec3):Vec3=>m.map(r=>r.reduce((s,x,i)=>s+x*v[i],0)) as Vec3;
