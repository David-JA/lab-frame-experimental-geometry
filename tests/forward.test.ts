import { describe,it,expect } from 'vitest';
import { integrateReflection,sphereIntegral,pixelPoint,downsample,type Density } from '../src/diffraction/forward';
import type { Panel } from '../src/diffraction/model';
import type { IntensityModel } from '../src/core/types';
import { unit,scale,sub } from '../src/core/math';
import { diffraction_demo_config } from '../src/example';
import { load_scene,compare_states } from '../src/core/scene';
import { withAprilParameters,withDefaultDiffractionParameters } from '../src/diffraction/presets';
import { computeForwardFrames } from '../src/diffraction/frames';

const panel:Panel={center:[0,0,1000],x:[1,0,0],y:[0,1,0],normal:[0,0,1],pixels:[81,81],pixel_size_mm:[.1,.1]};
const k=8,source:[number,number,number]=[0,0,0];
const centre=(u:number,v:number,p=panel)=>sub(scale(unit(pixelPoint(p,u,v)),k),[0,0,k]);
describe('reciprocal density to raw pixel integrals',()=>{
  it('preserves full signal at a second distance and converts g/Q density and surface units consistently',()=>{
    const d:Density={kind:'gaussian_3d',sigma_g_invA:.001},g=centre(40.2,40.35);
    const a=integrateReflection(panel,source,g,k,d),b=integrateReflection({...panel,center:[0,0,2000]},source,g,k,d);
    expect(a.status).toBe('resolved');expect(b.status).toBe('resolved');expect(a.pixel_sum/b.pixel_sum).toBeCloseTo(1,5);
    const tau=2*Math.PI,c=8.00002;
    expect(tau*sphereIntegral({kind:'gaussian_3d',sigma_g_invA:tau*.001},tau*k,tau*c)).toBeCloseTo(sphereIntegral(d,k,c),7);
    expect(tau*sphereIntegral({kind:'uniform_sphere_3d',radius_g_invA:tau*.001},tau*k,tau*c)).toBeCloseTo(sphereIntegral({kind:'uniform_sphere_3d',radius_g_invA:.001},k,c),7);
  });
  it('propagates unresolved illumination and accepts an exactly sufficient final-frame pixel budget',()=>{
    const c=diffraction_demo_config();c.diffraction!.intensity_model={kind:'gaussian_3d',sigma_g_invA:.001};
    const poses=[{id:'single',joints:{}}],options={hkls:[[2,0,0] as [number,number,number]]};
    const first=computeForwardFrames(c,poses,options)[0].result.images![0];
    const exact=computeForwardFrames(c,poses,{...options,maxPixels:first.tile.width*first.tile.height})[0];
    expect(exact.result.integration_status).toBe('resolved');
    c.diffraction!.sample_shape={kind:'cylinder',size_mm:[.0001,.0001,.01]};
    const unresolved=computeForwardFrames(c,poses,options)[0];
    expect(unresolved.result.illumination.status).toBe('unresolved');expect(unresolved.result.integration_status).toBe('unresolved');
  });
  it('roundtrips optional model settings, preserves legacy and rejects bad weights atomically',()=>{
    const c=diffraction_demo_config(),legacy=load_scene(c).save_state();expect(legacy.diffraction).not.toHaveProperty('intensity_model');
    c.diffraction!.intensity_model={kind:'gaussian_3d',sigma_g_invA:.0004,gray_max:25,display_threshold:.01,weights:[{hkl:[2,0,0],total_relative_intensity:2}]};
    const scene=load_scene(c),saved=scene.save_state();expect(saved).toEqual(c);expect(compare_states(legacy,saved).diffraction_changed).toBe(true);
    expect(withAprilParameters(c).diffraction!.intensity_model).toEqual(c.diffraction!.intensity_model);
    expect(withDefaultDiffractionParameters(c).diffraction!.intensity_model).toEqual({kind:'gaussian_3d',sigma_g_invA:.001});
    for(const im of [{kind:'gaussian_3d',sigma_g_invA:0},{kind:'gaussian_3d'},{kind:'bad'},{kind:'uniform_sphere_3d',weights:[{hkl:[2,0,0],total_relative_intensity:-1}]},{kind:'uniform_sphere_3d',weights:[{hkl:[2,0,0],total_relative_intensity:1},{hkl:[2,0,0],total_relative_intensity:2}]}]){
      const bad=structuredClone(c);bad.diffraction!.intensity_model=im as IntensityModel;
      expect(()=>scene.restore_state(bad)).toThrow();expect(scene.save_state()).toEqual(saved);
    }
  });
  it('uses the analytic Ewald sphere measure including zero and coincident open-sphere cases',()=>{
    const d:Density={kind:'gaussian_3d',sigma_g_invA:.3},c=2.1,n=100000;
    let integral=0;
    for(let i=0;i<n;i++){
      const t=-1+(i+.5)*2/n,r2=4+c*c-4*c*t;
      integral+=Math.exp(-r2/(2*.3**2))/(2*Math.PI)**1.5/.3**3;
    }
    expect(sphereIntegral(d,2,c)).toBeCloseTo(integral*2/n*8*Math.PI,7);
    expect(sphereIntegral({kind:'uniform_sphere_3d',radius_g_invA:2},2,0)).toBe(0);
    expect(sphereIntegral({kind:'uniform_sphere_3d',radius_g_invA:3},2,0)).toBeCloseTo(4/9,12);
    expect(sphereIntegral(d,2,c,0)).toBe(0);
  });
  for(const density of [{kind:'gaussian_3d',sigma_g_invA:.0001},{kind:'uniform_sphere_3d',radius_g_invA:.0004}] as Density[]){
    it(`${density.kind}: conserves a narrow complete spot at asymmetric subpixel positions`,()=>{
      for(const [u,v]of [[40,40],[40.2,40.35],[40.5,40]]){
        const r=integrateReflection(panel,source,centre(u,v),k,density);
        expect(r.status,r.reason).toBe('resolved');
        expect(r.pixel_sum/r.sphere_integral).toBeCloseTo(1,5);
        expect(r.tail_bound).toBeLessThan(1e-8*r.error_scale);
        expect(r.tile.width*r.tile.height).toBeGreaterThan(0);
      }
    });
    it(`${density.kind}: retains an outside-centred partial spot, reports loss and zero weights`,()=>{
      const inside=integrateReflection(panel,source,centre(80.5,40.2),k,density);
      expect(inside.status,inside.reason).toBe('resolved');
      expect(inside.received_fraction_estimate!).toBeCloseTo(.5,3);
      const outside=integrateReflection(panel,source,centre(80.65,40.2),k,density);
      expect(outside.pixel_sum).toBeGreaterThan(0);
      expect(outside.pixel_sum).toBeLessThan(inside.pixel_sum);
      const zero=integrateReflection(panel,source,centre(40,40),k,density,0);
      expect(zero.pixel_sum).toBe(0);expect(zero.received_fraction_estimate).toBeNull();
    });
  }
  it('sums on a shared raw grid and conserves integrated signal when resized',()=>{
    const d:Density={kind:'gaussian_3d',sigma_g_invA:.0008};
    const a=integrateReflection(panel,source,centre(40.2,40.35),k,d),b=integrateReflection(panel,source,centre(41,40.5),k,d,2);
    const first=downsample([a.tile],panel.pixels,[17,13]),second=downsample([b.tile],panel.pixels,[17,13]),both=downsample([a.tile,b.tile],panel.pixels,[17,13]);
    both.forEach((v,i)=>expect(v).toBeCloseTo(first[i]+second[i],10));
    expect(both.reduce((a,b)=>a+b,0)).toBeCloseTo(a.pixel_sum+b.pixel_sum,9);
  });
  it('reports budget failure instead of accepting an empty image',()=>{
    const r=integrateReflection(panel,source,centre(40,40),k,{kind:'gaussian_3d',sigma_g_invA:.01},1,[2,0,0],{maxPixels:1});
    expect(r.status).toBe('unresolved');expect(r.reason).toContain('budget');
  });
  it('keeps the support conservative for an extremely narrow boundary crossing, and reports unresolvable widths',()=>{
    const r=integrateReflection(panel,source,centre(40.4999999,40),k,{kind:'gaussian_3d',sigma_g_invA:1e-8});
    expect(r.status,r.reason).toBe('resolved');expect(r.tile.width).toBeGreaterThanOrEqual(2);
    expect(r.pixel_sum/r.sphere_integral).toBeCloseTo(1,4);
    const tiny=integrateReflection(panel,source,centre(40.2,40),k,{kind:'gaussian_3d',sigma_g_invA:1e-13});
    expect(tiny.status).toBe('unresolved');expect(tiny.reason).toContain('resolution');
  });
  it('rejects nonfinite geometry, unknown models and invalid integration controls',()=>{
    const g=centre(40.2,40),d:Density={kind:'gaussian_3d',sigma_g_invA:.001};
    expect(()=>integrateReflection({...panel,pixel_size_mm:[NaN,.1]},source,g,k,d)).toThrow();
    expect(()=>integrateReflection({...panel,pixels:[81] as unknown as [number,number]},source,g,k,d)).toThrow();
    expect(()=>integrateReflection({...panel,pixel_size_mm:[.1] as unknown as [number,number]},source,g,k,d)).toThrow();
    expect(()=>integrateReflection(panel,[0,0] as unknown as [number,number,number],g,k,d)).toThrow();
    expect(()=>integrateReflection(panel,source,g,k,{kind:'typo',radius_g_invA:.001} as unknown as Density)).toThrow();
    for(const options of [{absoluteScale:Infinity},{relativeTolerance:0},{maxDepth:-1},{maxPixels:NaN}])expect(()=>integrateReflection(panel,source,g,k,d,1,[2,0,0],options)).toThrow();
    expect(()=>integrateReflection(panel,source,g,k,{kind:'gaussian_3d',sigma_g_invA:1e-110})).toThrow();
  });
});
