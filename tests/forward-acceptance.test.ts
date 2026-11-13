import { it,expect } from 'vitest';
import { mkdirSync,writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { diffraction_demo_config } from '../src/example';
import { load_scene } from '../src/core/scene';
import { direction,inverseTranspose,lattice,mat3Vector,add,scale,unit,sub,cross } from '../src/core/math';
import { HC_KEV_A,type Panel } from '../src/diffraction/model';
import { computeForwardFrames } from '../src/diffraction/frames';
import { integrateReflection,sphereIntegral,pixelPoint,downsample,type Density,type ReflectionImage } from '../src/diffraction/forward';

const sum=(a:ArrayLike<number>)=>Array.from(a).reduce((a,b)=>a+b,0);
const jsonImage=(i:ReflectionImage)=>({...i,tile:{...i.tile,data:Array.from(i.tile.data)}});
function sampledFwhm(rows:{psi_deg:number;pixel_sum:number}[]):number {
  const peak=Math.max(...rows.map(r=>r.pixel_sum)),half=peak/2,roots=[];
  for(let i=1;i<rows.length;i++){
    const a=rows[i-1],b=rows[i];
    if((a.pixel_sum-half)*(b.pixel_sum-half)<=0&&a.pixel_sum!==b.pixel_sum)roots.push(a.psi_deg+(b.psi_deg-a.psi_deg)*(half-a.pixel_sum)/(b.pixel_sum-a.pixel_sum));
  }
  return roots[roots.length-1]-roots[0];
}
it('A1–A3: fixed-pose rocking, translated pixels/edges and two lattice reflections',()=>{
  const snapshot=diffraction_demo_config(),p=snapshot.diffraction!,sample=snapshot.devices.devices.find(d=>d.id===p.sample_id)!,B=inverseTranspose(lattice(sample.crystal!.cell));
  const k=p.energy_keV/HC_KEV_A,bragg=snapshot.experiment_state.joints['rotary.phi'],scene=load_scene(snapshot);
  const gAt=(phi:number)=>{scene.set_joint_value('rotary.phi',phi);return direction(scene.get_frame_transform('LAB',sample.crystal!.frame).matrix,mat3Vector(B,[2,0,0]));};
  const response=(d:Density,phi:number)=>sphereIntegral(d,k,Math.hypot(...add(gAt(phi),[0,0,k])));
  function peakAndWidth(d:Density){
    let a=bragg-.2,b=bragg+.2;
    for(let i=0;i<60;i++){const x=a+(b-a)/3,y=b-(b-a)/3;if(response(d,x)<response(d,y))a=x;else b=y;}
    const centre=(a+b)/2,peak=response(d,centre),root=(sign:number)=>{
      let lo=0,hi=.4;for(let i=0;i<45;i++){const mid=(lo+hi)/2;if(response(d,centre+sign*mid)>peak/2)lo=mid;else hi=mid;}return centre+sign*(lo+hi)/2;
    };
    return {centre,peak,width:root(1)-root(-1)};
  }
  const A1=[];
  for(const kind of ['gaussian_3d','uniform_sphere_3d'] as const){
    let lo=1e-6,hi=.005;
    const density=(w:number):Density=>kind==='gaussian_3d'?{kind,sigma_g_invA:w}:{kind,radius_g_invA:w};
    for(let i=0;i<35;i++){const mid=(lo+hi)/2;if(peakAndWidth(density(mid)).width>.1)hi=mid;else lo=mid;}
    const d=density((lo+hi)/2),fit=peakAndWidth(d);
    expect(Math.abs(fit.width/.1-1)).toBeLessThan(.005);
    const c=structuredClone(snapshot);c.diffraction!.intensity_model={kind,sigma_g_invA:kind==='gaussian_3d'?(d as {sigma_g_invA:number}).sigma_g_invA:.001};
    if(d.kind==='uniform_sphere_3d')c.diffraction!.spot_diameter_invA=2*d.radius_g_invA;
    const scalar=[];const representatives=[];
    for(let n=-64;n<=64;n++){
      const angle=fit.centre+n*.0025,frame=computeForwardFrames(c,[{id:`${kind}-${n}`,joints:{'rotary.phi':angle}}],{hkls:[[2,0,0]],absoluteScale:fit.peak})[0],image=frame.result.images![0];
      expect(image.status,image.reason).toBe('resolved');
      expect(Math.abs(image.pixel_sum-image.sphere_integral)).toBeLessThanOrEqual(1e-3*image.sphere_integral+1e-6*fit.peak);
      scalar.push({psi_deg:angle,offset_deg:n*.0025,pixel_sum:image.pixel_sum,J:image.sphere_integral,error:image.estimated_quadrature_error});
    }
    const thresholdAngle=(sign:number)=>{let lo=0,hi=.4;for(let i=0;i<50;i++){const mid=(lo+hi)/2;if(response(d,fit.centre+sign*mid)>fit.peak*.1)lo=mid;else hi=mid;}return sign*(lo+hi)/2;};
    for(const offset of [-.4,thresholdAngle(-1),-.05,0,.05,thresholdAngle(1),.4]){
      const frame=computeForwardFrames(c,[{id:`${kind}-representative-${offset}`,joints:{'rotary.phi':fit.centre+offset}}],{hkls:[[2,0,0]],absoluteScale:fit.peak})[0],image=frame.result.images![0];
      expect(image.status,image.reason).toBe('resolved');
      representatives.push({id:frame.id,psi_deg:fit.centre+offset,offset_deg:offset,k,integration_options:frame.integration_options,source:frame.result.illumination.centroid_lab_mm,panel:frame.result.panel,crystal_to_lab:frame.crystal_to_lab,image:jsonImage(image)});
    }
    const shifted=[];
    for(let n=-32;n<=32;n++){
      const angle=fit.centre+n*.005+.0025,frame=computeForwardFrames(c,[{id:`half-phase-${n}`,joints:{'rotary.phi':angle}}],{hkls:[[2,0,0]],absoluteScale:fit.peak})[0],im=frame.result.images![0];
      expect(im.status,im.reason).toBe('resolved');shifted.push({psi_deg:angle,pixel_sum:im.pixel_sum,J:im.sphere_integral});
    }
    const sampledWidths={fine_0_0025_deg:sampledFwhm(scalar),coarse_0_005_deg:sampledFwhm(scalar.filter((_,i)=>i%2===0)),shifted_0_005_deg:sampledFwhm(shifted)};
    for(const value of Object.values(sampledWidths))expect(Math.abs(value/fit.width-1)).toBeLessThan(.005);
    A1.push({kind,density:d,fit,snapshot:c,scalar,representatives,sampledWidths,half_step_phase_sequence:shifted});
  }
  const source:[number,number,number]=[0,0,0],x:[number,number,number]=[Math.cos(.2),0,-Math.sin(.2)],y:[number,number,number]=[0,1,0];
  const panel:Panel={center:[0,0,1000],x,y,normal:cross(x,y),pixels:[81,65],pixel_size_mm:[.1,.15]};
  const target=[40.2,32.35],g=sub(scale(unit(pixelPoint(panel,...target as [number,number])),k),[0,0,k]);
  const A2=[];
  for(const d of [{kind:'gaussian_3d',sigma_g_invA:.0001},{kind:'uniform_sphere_3d',radius_g_invA:.0004}] as Density[]){
    const cases=[];
    for(const [u,v]of [[40,32],[40.25,32.25],[40.5,32],[40.5,32.5],[40.75,32.25],[40.2,32.35],[80.2,32.35],[80.5,32.35],[80.65,32.35],[81.5,32.35]]){
      const moved={...panel,center:add(panel.center,add(scale(x,(target[0]-u)*.1),scale(y,(v-target[1])*.15)))};
      const image=integrateReflection(moved,source,g,k,d);
      expect(image.status,image.reason).toBe('resolved');
      if(u<70)expect(image.pixel_sum/image.sphere_integral).toBeCloseTo(1,5);
      const selectedPixels=[];for(let j=Math.floor(v)-1;j<=Math.floor(v)+1;j++)for(let i=Math.floor(u)-1;i<=Math.floor(u)+1;i++)if(i>=0&&i<81&&j>=0&&j<65)selectedPixels.push([i,j]);
      cases.push({target:[u,v],panel:moved,source,k,image:jsonImage(image),selectedPixels});
    }
    A2.push({density:d,cases});
  }
  // Two actual integer HKLs in one deliberately large synthetic cubic cell.
  // This isolates overlap without shifting a detector kernel by hand.
  const overlap=structuredClone(snapshot),cell=overlap.devices.devices.find(d=>d.id===p.sample_id)!.crystal!.cell;
  cell.a=cell.b=cell.c=1000;overlap.diffraction!.intensity_model={kind:'gaussian_3d',sigma_g_invA:.001};overlap.diffraction!.reflection_model='primitive';
  const poses=[{id:'overlap',joints:{'rotary.phi':bragg}}],a=computeForwardFrames(overlap,poses,{hkls:[[2,0,0]]})[0],b=computeForwardFrames(overlap,poses,{hkls:[[2,0,2]]})[0],both=computeForwardFrames(overlap,poses,{hkls:[[2,0,0],[2,0,2]]})[0];
  expect(both.result.images!.every(i=>i.status==='resolved')).toBe(true);
  const all=both.result.images!,merged=downsample(all.map(i=>i.tile),both.result.panel.pixels,[512,512]),first=downsample(a.result.images!.map(i=>i.tile),both.result.panel.pixels,[512,512]),second=downsample(b.result.images!.map(i=>i.tile),both.result.panel.pixels,[512,512]);
  expect(sum(merged)).toBeCloseTo(sum(first)+sum(second),8);
  let maxResidual=0;merged.forEach((v,i)=>maxResidual=Math.max(maxResidual,Math.abs(v-first[i]-second[i])));expect(maxResidual).toBeLessThan(1e-10);
  for(let n=0;n<all.length;n++)expect(Array.from(all[n].tile.data)).toEqual(Array.from((n===0?a:b).result.images![0].tile.data));
  const singles=[a.result.images![0],b.result.images![0]],tiles=[...singles,...all].map(i=>i.tile);
  const u0=Math.min(...tiles.map(t=>t.u0)),v0=Math.min(...tiles.map(t=>t.v0)),u1=Math.max(...tiles.map(t=>t.u0+t.width)),v1=Math.max(...tiles.map(t=>t.v0+t.height)),width=u1-u0,height=v1-v0;
  const raw=(images:ReflectionImage[])=>{const array=new Float64Array(width*height);for(const im of images){const t=im.tile;for(let j=0;j<t.height;j++)for(let i=0;i<t.width;i++)array[(t.v0+j-v0)*width+t.u0+i-u0]+=t.data[j*t.width+i];}return array;};
  const rawFirst=raw([singles[0]]),rawSecond=raw([singles[1]]),rawCombined=raw(all);
  let maxRawResidual=0,maxRawPixel=[u0,v0],overlapPixels=0;
  rawCombined.forEach((value,index)=>{const residual=Math.abs(value-rawFirst[index]-rawSecond[index]);if(residual>maxRawResidual){maxRawResidual=residual;maxRawPixel=[u0+index%width,v0+Math.floor(index/width)];}expect(residual).toBeLessThanOrEqual(1e-12*Math.max(1,Math.abs(rawFirst[index])+Math.abs(rawSecond[index])));if(rawFirst[index]>0&&rawSecond[index]>0)overlapPixels++;});
  expect(overlapPixels).toBeGreaterThan(0);
  const A3={snapshot:overlap,panel:both.result.panel,source:both.result.illumination.centroid_lab_mm,crystal_to_lab:both.crystal_to_lab,images:all.map(jsonImage),single_images:singles.map(jsonImage),raw:{u0,v0,width,height,first:Array.from(rawFirst),second:Array.from(rawSecond),combined:Array.from(rawCombined)},maxRawResidual,maxRawPixel,overlapPixels,maxPreviewResidual:maxResidual,preview_sum:sum(merged)};
  const output=process.env.FORWARD_AUDIT_OUTPUT;
  if(output){mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify({algorithm:'ewald-pixel-rings-v1',convention:'g=1/d, A^-1; g_ref=1 A^-1; dS=k^2 dOmega',unit_exposure:true,default_integration_options:{relativeTolerance:2e-6,maxPixels:200000,maxEvaluations:2000000,maxDepth:16},acceptance_gate:{frame_relative:1e-3,frame_absolute_scale_fraction:1e-6,pixel_relative:1e-3,pixel_absolute_scale_fraction:1e-8,oracle_absolute_scale_fraction:1e-9},A1,A2,A3},null,2),'utf8');}
},60000);
