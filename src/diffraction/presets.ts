import { load_scene } from '../core/scene';
import type { SceneConfig, Vec3 } from '../core/types';
import { clone } from '../core/types';
import { add, sub, dot, cross, direction, point, inverseRigid, multiply, translation, fromQuat, toQuat, scale, unit } from '../core/math';
import { defaultDiffraction, detectorPanel } from './model';

// April 2026 adopted calibration. PONI values are mm / radians here.
export const APRIL_PONI={distance:1283.9050444983084,p1:209.47423774212873,p2:202.32982511592143,r1:-0.0015173812091801163,r2:-0.0008623972603749447,r3:6.542928647768065e-7};
function product(a:number[][],b:number[][]){return a.map(r=>b[0].map((_,j)=>r.reduce((s,v,k)=>s+v*b[k][j],0)));}
export function aprilPanelPose(anchor:Vec3) {
  const {r1,r2,r3,p1,p2,distance}=APRIL_PONI,c1=Math.cos(r1),s1=Math.sin(r1),c2=Math.cos(r2),s2=Math.sin(r2),c3=Math.cos(r3),s3=Math.sin(r3);
  const r=product(product([[c3,-s3,0],[s3,c3,0],[0,0,1]],[[c2,0,-s2],[0,1,0],[s2,0,c2]]),[[1,0,0],[0,c1,s1],[0,-s1,c1]]);
  // pyFAI slow/fast/beam with orientation=2 -> project LAB; raw row is flipped once.
  const basis=[r[1],r[0].map(v=>-v),r[2]],d1=214.4-p1,d2=214.4-p2;
  const center=add(anchor,basis.map(row=>row[0]*d1+row[1]*d2+row[2]*distance) as Vec3);
  const x=basis.map(row=>row[1]) as Vec3,y=basis.map(row=>-row[0]) as Vec3,n=unit(cross(x,y));
  return [x[0],y[0],n[0],center[0],x[1],y[1],n[1],center[1],x[2],y[2],n[2],center[2],0,0,0,1];
}
function setDetectorWorld(c:SceneConfig,id:string,world:number[]):SceneConfig {
  const scene=load_scene(c),d=c.devices.devices.find(d=>d.id===id)!,f=c.assembly.frames.find(f=>f.id===d.output_frame);
  if(!f||f.motion.kind!=='fixed')throw new Error('探测器需要独立的固定安装 frame，不能覆盖 LAB 或晶体 frame。');
  const parent=scene.get_frame_transform('LAB',f.parent).matrix,local=multiply(inverseRigid(parent),world);
  f.mount={position_mm:point(local,[0,0,0]),quaternion_xyzw:toQuat(local)};return c;
}
export function withAprilParameters(input:SceneConfig,sampleId?:string,detectorId?:string):SceneConfig {
  const c=clone(input),p=defaultDiffraction(c,sampleId??c.diffraction?.sample_id,detectorId??c.diffraction?.detector_id);
  if(!p)throw new Error('请先选择一个样品和探测器。');
  if(c.diffraction){p.show_hkl=c.diffraction.show_hkl;p.hkl_limit=c.diffraction.hkl_limit;p.reflection_model=c.diffraction.reflection_model;p.spot_diameter_invA=c.diffraction.spot_diameter_invA;}
  const sample=c.devices.devices.find(d=>d.id===p.sample_id)!,detector=c.devices.devices.find(d=>d.id===p.detector_id)!;
  sample.crystal!.cell={a:3.59033485,b:3.59033485,c:3.59033485,alpha_deg:90,beta_deg:90,gamma_deg:90};
  detector.detector={pixels:[4288,4288],pixel_size_mm:[0.1,0.1],provenance:'source_statement'};
  c.diffraction=p;
  return load_scene(setDetectorWorld(c,p.detector_id,aprilPanelPose(c.assembly.beam.point_mm))).save_state();
}
export function detectorDistance(input:SceneConfig,id:string):number {
  const panel=detectorPanel(load_scene(input),id);return dot(sub(panel.center,input.assembly.beam.point_mm),panel.normal);
}
export function withDetectorDistance(input:SceneConfig,id:string,distance:number):SceneConfig {
  if(!Number.isFinite(distance)||distance<=0||distance>100000)throw new Error('探测器距离需要大于 0 且不超过 100000 mm。');
  const c=clone(input),scene=load_scene(c),d=c.devices.devices.find(d=>d.id===id)!,m=scene.get_frame_transform('LAB',d.output_frame).matrix;
  const panel=detectorPanel(scene,id),next=add(panel.center,scale(panel.normal,distance-detectorDistance(c,id)));
  m[3]=next[0];m[7]=next[1];m[11]=next[2];return setDetectorWorld(c,id,m);
}
