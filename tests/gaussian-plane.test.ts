import { it,expect } from 'vitest';
import { densityValue,integrateReflection,pixelPoint,pixelSolidAngle,type Density } from '../src/diffraction/forward';
import { scale,sub,unit,add } from '../src/core/math';
import type { Panel } from '../src/diffraction/model';
import { diffraction_demo_config } from '../src/example';
import { computeForwardFrames } from '../src/diffraction/frames';

const p:Panel={center:[0,0,1000],x:[1,0,0],y:[0,1,0],normal:[0,0,1],pixels:[81,81],pixel_size_mm:[.1,.1]},s:[number,number,number]=[0,0,0],k=8;
const gAt=(panel:Panel,u:number,v:number)=>sub(scale(unit(pixelPoint(panel,u,v)),k),[0,0,k]);
it('matches ring cells for smooth Gaussian, off-Bragg frames, asymmetric phases and board clipping',()=>{
  for(const panel of [p,{...p,x:[Math.cos(.15),0,-Math.sin(.15)],normal:[Math.sin(.15),0,Math.cos(.15)],pixel_size_mm:[.12,.08]} as Panel]){
    for(const centre of [[40.2,40.35],[80.5,40.35],[81.2,40.35]])for(const off of [-.001,0,.001]){
      const g=add(gAt(panel,centre[0],centre[1]),[0,0,off]),d:Density={kind:'gaussian_3d',sigma_g_invA:.002};
      const a=integrateReflection(panel,s,g,k,d),b=integrateReflection(panel,s,g,k,d,1,[2,0,0],{gaussianQuadrature:'plane'});
      expect(a.status,a.reason).toBe('resolved');expect(b.status,b.reason).toBe('resolved');expect(b.plane_cells).toBeGreaterThan(0);
      expect(b.tile.u0).toBe(a.tile.u0);expect(b.tile.v0).toBe(a.tile.v0);expect(b.tile.data.length).toBe(a.tile.data.length);
      for(let i=0;i<a.tile.data.length;i++)expect(Math.abs(a.tile.data[i]-b.tile.data[i])).toBeLessThanOrEqual(1e-3*a.tile.data[i]+1e-8*a.error_scale);
    }
  }
});
it('protects subpixel peaks, constant spherical density, zero W and shared failure budgets',()=>{
  const g=gAt(p,40.13,40.72),d:Density={kind:'gaussian_3d',sigma_g_invA:.00004};
  const a=integrateReflection(p,s,g,k,d),b=integrateReflection(p,s,g,k,d,1,[1,0,0],{gaussianQuadrature:'plane'});
  expect(b.status).toBe('resolved');expect(b.plane_cells).toBe(0);expect(b.fallback_cells).toBeGreaterThan(0);expect(b.pixel_sum).toBe(a.pixel_sum);
  const zero=integrateReflection(p,s,g,k,d,0,[1,0,0],{gaussianQuadrature:'plane'});expect(zero.pixel_sum).toBe(0);
  const c0=integrateReflection(p,s,[0,0,-k],k,{kind:'gaussian_3d',sigma_g_invA:3},1,[1,0,0],{gaussianQuadrature:'plane'});expect(c0.status).toBe('resolved');expect(c0.plane_cells).toBe(0);
  const fail=integrateReflection(p,s,g,k,{kind:'gaussian_3d',sigma_g_invA:.002},1,[1,0,0],{gaussianQuadrature:'plane',maxEvaluations:300});
  expect(fail.status).toBe('unresolved');expect(fail.evaluations).toBeLessThanOrEqual(300);expect(fail.plane_evaluations).toBeGreaterThan(0);expect(fail.completed_cells).toBeLessThan(fail.tile.data.length);
});
it('guards the geometric Jacobian even when the Gaussian is nearly constant',()=>{
  const panel:Panel={center:[-14.706187664444485,-14.706187664444485,1],x:[1,0,0],y:[0,1,0],normal:[0,0,1],pixels:[1,1],pixel_size_mm:[100,100]},d:Density={kind:'gaussian_3d',sigma_g_invA:1};
  const r=integrateReflection(panel,s,[1e-6,0,-1],1,d,1,[1,0,0],{gaussianQuadrature:'plane'});
  const solid=pixelSolidAngle([[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([u,v])=>unit(pixelPoint(panel,u,v))));
  expect(r.status,r.reason).toBe('resolved');expect(r.plane_cells).toBe(0);expect(r.fallback_cells).toBe(1);
  expect(r.pixel_sum).toBeGreaterThanOrEqual(densityValue(d,1+1e-6)*solid-1e-8);
  expect(r.pixel_sum).toBeLessThanOrEqual(densityValue(d,1-1e-6)*solid+1e-8);
});
it('labels only actual Gaussian-plane requests as that algorithm',()=>{
  const c=diffraction_demo_config();c.diffraction!.intensity_model={kind:'uniform_sphere_3d'};
  const r=computeForwardFrames(c,[{id:'sphere',joints:{}}],{hkls:[[2,0,0]],gaussianQuadrature:'plane'})[0];
  expect(r.algorithm).toBe('ewald-pixel-rings-v1');
});
