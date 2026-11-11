import { type Cell, type DiffractionSettings, type SceneConfig, type Vec3, SceneError, clone } from '../core/types';
import type { Scene } from '../core/scene';
import { add, sub, scale, dot, cross, norm, unit, point, direction, inverseRigid, lattice, inverseTranspose, mat3Vector } from '../core/math';

export const HC_KEV_A = 12.3984198433;
export const isCubic = (c: Cell) => Math.max(Math.abs(c.a-c.b),Math.abs(c.a-c.c)) < 1e-8 && [c.alpha_deg,c.beta_deg,c.gamma_deg].every(a=>Math.abs(a-90)<1e-8);
export function defaultDiffraction(c: SceneConfig, sampleId?: string, detectorId?: string): DiffractionSettings | undefined {
  const samples=c.devices.devices.filter(d=>d.crystal),detectors=c.devices.devices.filter(d=>d.detector);
  const s=sampleId?samples.find(d=>d.id===sampleId):samples.length===1?samples[0]:undefined;
  const d=detectorId?detectors.find(d=>d.id===detectorId):detectors.length===1?detectors[0]:undefined;
  if(!s||!d)return;
  return {sample_id:s.id,detector_id:d.id,energy_keV:HC_KEV_A/0.1265,spot_diameter_invA:0.1,beam_size_mm:[0.2,0.2],sample_shape:{kind:'cylinder',size_mm:[1.92,1.92,3]},reflection_model:isCubic(s.crystal!.cell)?'fcc':'primitive',hkl_limit:8,show_hkl:true};
}
export function validateDiffraction(c: SceneConfig) {
  const p=c.diffraction;if(!p)return;
  const fail=(message:string)=>{throw new SceneError('INVALID_DIFFRACTION','/diffraction',message);};
  const s=c.devices.devices.find(d=>d.id===p.sample_id&&d.crystal),d=c.devices.devices.find(d=>d.id===p.detector_id&&d.detector);
  if(!s||!d)fail('衍射预览需要有效的样品和探测器 ID。');
  if(p.reflection_model==='fcc'&&!isCubic(s!.crystal!.cell))fail('FCC 预览需要立方晶胞；请先改用简单点阵，或设置立方晶格。');
  if(p.sample_shape.kind==='cylinder'&&Math.abs(p.sample_shape.size_mm[0]-p.sample_shape.size_mm[1])>1e-8)fail('圆柱照明模型的 X/Y 直径必须相等。');
}
export interface Reflection { hkl: Vec3; g_lab: Vec3; d_A: number; error_invA: number; weight: number; direction_lab: Vec3; two_theta_deg: number; section_radius_invA: number }
// ReciPro's solid-sphere / excitation-only tangent-section approximation.
// See NOTICE.md: upstream uses reciprocal nm^-1 and radius; this API uses A^-1 and diameter.
export function excite(g: Vec3, wavelength_A: number, diameter_invA: number) {
  const k=1/wavelength_A,q=add(g,[0,0,k]),error=norm(q)-k,r=diameter_invA/2;
  const weight=Math.max(0,1-(error/r)**2);
  return {error_invA:error,weight,direction_lab:norm(q)>1e-12?unit(q):[0,0,1] as Vec3,section_radius_invA:Math.sqrt(Math.max(0,r*r-error*error))};
}
export function enumerateReflections(cell: Cell, limit: number, model: 'fcc'|'primitive') {
  const b=inverseTranspose(lattice(cell)),out:{hkl:Vec3;g:Vec3;d_A:number}[]=[];
  for(let h=-limit;h<=limit;h++)for(let k=-limit;k<=limit;k++)for(let l=-limit;l<=limit;l++){
    if(h===0&&k===0&&l===0)continue;
    if(model==='fcc'&&!(Math.abs(h%2)===Math.abs(k%2)&&Math.abs(k%2)===Math.abs(l%2)))continue;
    const hkl:Vec3=[h,k,l],g=mat3Vector(b,hkl);out.push({hkl,g,d_A:1/norm(g)});
  }
  return out;
}
export interface Panel { center: Vec3; x: Vec3; y: Vec3; normal: Vec3; pixels:[number,number]; pixel_size_mm:[number,number] }
export function detectorPanel(scene: Scene, id: string): Panel {
  const d=scene.save_state().devices.devices.find(d=>d.id===id&&d.detector);
  if(!d?.detector)throw new SceneError('INVALID_DIFFRACTION',id,'找不到探测器。');
  const m=scene.get_frame_transform('LAB',d.output_frame).matrix,x=direction(m,[1,0,0]),y=direction(m,[0,1,0]);
  return {center:point(m,[0,0,0]),x,y,normal:unit(cross(x,y)),...clone(d.detector)};
}
export function projectRay(panel: Panel, source: Vec3, ray: Vec3) {
  const denominator=dot(panel.normal,ray);if(Math.abs(denominator)<1e-12)return;
  const t=dot(panel.normal,sub(panel.center,source))/denominator;if(t<=0)return;
  const hit=add(source,scale(ray,t)),p=sub(hit,panel.center);
  const u=dot(p,panel.x)/panel.pixel_size_mm[0]+(panel.pixels[0]-1)/2;
  const v=(panel.pixels[1]-1)/2-dot(p,panel.y)/panel.pixel_size_mm[1];
  return {point_lab_mm:hit,u,v,on_panel:u>=-0.5&&u<panel.pixels[0]-0.5&&v>=-0.5&&v<panel.pixels[1]-0.5};
}
// Return the segment on the infinite ray p+t*d, clipped by both side walls and end caps.
export function sampleSegment(p: Vec3, d: Vec3, shape: DiffractionSettings['sample_shape']): [number,number] | undefined {
  const half=shape.size_mm.map(v=>v/2);let lo=-Infinity,hi=Infinity;
  const slab=(i:number)=>{
    if(Math.abs(d[i])<1e-14)return Math.abs(p[i])<=half[i];
    const a=(-half[i]-p[i])/d[i],b=(half[i]-p[i])/d[i];lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));return hi>lo;
  };
  if(!slab(2))return;
  if(shape.kind==='box'){if(!slab(0)||!slab(1))return;}
  else {
    const a=d[0]**2+d[1]**2,b=2*(p[0]*d[0]+p[1]*d[1]),c=p[0]**2+p[1]**2-half[0]**2;
    if(a<1e-24){if(c>=0)return;}else{
      const discriminant=b*b-4*a*c;if(discriminant<=0)return;
      const root=Math.sqrt(discriminant);lo=Math.max(lo,(-b-root)/(2*a));hi=Math.min(hi,(-b+root)/(2*a));
    }
  }
  return hi>lo&&Number.isFinite(lo)&&Number.isFinite(hi)?[lo,hi]:undefined;
}
export interface Illumination { status:'lit'|'outside'|'unresolved'; volume_mm3:number; centroid_lab_mm?:Vec3; resolution:number }
export function illumination(scene: Scene, p: DiffractionSettings, resolution=32): Illumination {
  const c=scene.save_state(),sample=c.devices.devices.find(d=>d.id===p.sample_id)!;
  const m=scene.get_frame_transform('LAB',sample.output_frame).matrix,inv=inverseRigid(m),center=sample.crystal!.center_s_mm;
  const worldCenter=point(m,center),beam=c.assembly.beam.point_mm,half=p.sample_shape.size_mm.map(v=>v/2);
  // Oriented enclosing box proves disjointness; otherwise a missed thin overlap stays unresolved.
  const ext=[0,1].map(i=>[0,1,2].reduce((v,j)=>v+Math.abs(m[4*i+j])*half[j],0));
  if([0,1].some(i=>Math.abs(worldCenter[i]-beam[i])>=ext[i]+p.beam_size_mm[i]/2))return {status:'outside',volume_mm3:0,resolution:0};
  const dir=direction(inv,[0,0,1]);let length=0,moment:Vec3=[0,0,0];
  for(let i=0;i<resolution;i++)for(let j=0;j<resolution;j++){
    const start:Vec3=[beam[0]+((i+0.5)/resolution-0.5)*p.beam_size_mm[0],beam[1]+((j+0.5)/resolution-0.5)*p.beam_size_mm[1],beam[2]];
    const interval=sampleSegment(sub(point(inv,start),center),dir,p.sample_shape);if(!interval)continue;
    const [a,b]=interval,l=b-a;length+=l;moment=add(moment,scale(add(start,[0,0,(a+b)/2]),l));
  }
  if(length===0)return {status:'unresolved',volume_mm3:0,resolution};
  return {status:'lit',volume_mm3:length*p.beam_size_mm[0]*p.beam_size_mm[1]/resolution**2,centroid_lab_mm:scale(moment,1/length),resolution};
}
export interface Spot extends Reflection { u:number;v:number;radius_mm:number }
export interface Preview { revision:number;illumination:Illumination;spots:Spot[];excited_count:number;panel:Panel;direct?:{u:number;v:number;on_panel:boolean};duration_ms:number }
export class DiffractionModel {
  #candidateKey='';#candidates:ReturnType<typeof enumerateReflections>=[];#lightKey='';#light?:Illumination;
  compute(scene:Scene,p:DiffractionSettings):Preview {
    const started=performance.now(),c=scene.save_state(),sample=c.devices.devices.find(d=>d.id===p.sample_id)!;
    const key=JSON.stringify([sample.crystal!.cell,p.hkl_limit,p.reflection_model]);
    if(key!==this.#candidateKey){this.#candidates=enumerateReflections(sample.crystal!.cell,p.hkl_limit,p.reflection_model);this.#candidateKey=key;}
    const lightKey=JSON.stringify([scene.get_frame_transform('LAB',sample.output_frame).matrix,sample.crystal!.center_s_mm,c.assembly.beam,p.beam_size_mm,p.sample_shape]);
    if(lightKey!==this.#lightKey){
      let light=illumination(scene,p,32);
      if(light.status!=='outside'){
        const fine=illumination(scene,p,64);
        const disagreement=light.volume_mm3===0?fine.volume_mm3>0:Math.abs(fine.volume_mm3-light.volume_mm3)/light.volume_mm3>0.005;
        light=disagreement||fine.status==='unresolved'?illumination(scene,p,128):fine;
      }
      this.#light=light;this.#lightKey=lightKey;
    }
    const light=this.#light!,panel=detectorPanel(scene,p.detector_id),spots:Spot[]=[],source=light.centroid_lab_mm;
    let excited_count=0;const lambda=HC_KEV_A/p.energy_keV,m=scene.get_frame_transform('LAB',sample.crystal!.frame).matrix;
    if(source)for(const candidate of this.#candidates){
      const g_lab=direction(m,candidate.g),e=excite(g_lab,lambda,p.spot_diameter_invA);if(e.weight<=0)continue;excited_count++;
      const hit=projectRay(panel,source,e.direction_lab);if(!hit?.on_panel)continue;
      spots.push({hkl:candidate.hkl,g_lab,d_A:candidate.d_A,...e,two_theta_deg:Math.acos(Math.max(-1,Math.min(1,e.direction_lab[2])))*180/Math.PI,u:hit.u,v:hit.v,radius_mm:Math.abs(dot(panel.normal,sub(panel.center,source)))*lambda*e.section_radius_invA});
    }
    spots.sort((a,b)=>b.weight-a.weight||a.hkl.join(',').localeCompare(b.hkl.join(',')));
    const direct=projectRay(panel,c.assembly.beam.point_mm,c.assembly.beam.direction);
    return {revision:scene.revision,illumination:light,spots,excited_count,panel,direct,duration_ms:performance.now()-started};
  }
}
