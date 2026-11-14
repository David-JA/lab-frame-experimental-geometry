import { it,expect } from 'vitest';
import { mkdirSync,writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { diffraction_demo_config,lab_height_config } from '../src/example';
import { load_scene } from '../src/core/scene';
import { DiffractionModel } from '../src/diffraction/model';
import type { IntegrationOptions } from '../src/diffraction/forward';
import type { Vec3 } from '../src/core/types';

it.runIf(!!process.env.GAUSSIAN_BENCHMARK_OUTPUT)('compares identical Gaussian grids, error and repeated warm wall time',()=>{
  const rows:any[]=[];
  const median=(a:number[])=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
  function compare(reference:ReturnType<DiffractionModel['compute']>,fast:ReturnType<DiffractionModel['compute']>){
    expect(fast.images!.length).toBe(reference.images!.length);let maxPixel=0,maxTotal=0;
    for(let h=0;h<reference.images!.length;h++){
      const a=reference.images![h],b=fast.images![h];expect(b.tile.data.length).toBe(a.tile.data.length);
      expect([b.tile.u0,b.tile.v0,b.sampling_stride]).toEqual([a.tile.u0,a.tile.v0,a.sampling_stride]);
      for(let j=0;j<a.tile.data.length;j++)maxPixel=Math.max(maxPixel,Math.abs(a.tile.data[j]-b.tile.data[j])/(1e-3*a.tile.data[j]+1e-8*a.error_scale||1));
      maxTotal=Math.max(maxTotal,Math.abs(a.pixel_sum-b.pixel_sum)/(1e-3*a.pixel_sum+1e-6*a.error_scale||1));
    }
    expect(maxPixel).toBeLessThanOrEqual(1);expect(maxTotal).toBeLessThanOrEqual(1);return {max_pixel_gate_ratio:maxPixel,max_total_gate_ratio:maxTotal};
  }
  for(const [name,make]of [['lab',lab_height_config],['demo',diffraction_demo_config]] as const)for(const sigma of [.001,.003,.01,.03,.05]){
    const c=make(),p=c.diffraction!;p.intensity_model={kind:'gaussian_3d',sigma_g_invA:sigma};const scene=load_scene(c);
    const global=new DiffractionModel().compute(scene,p,{adaptiveBinning:true}),spot=global.spots.find(s=>s.hkl.join(',')==='2,0,0')??global.spots[0];
    const cases:{id:string;options:IntegrationOptions&{hkls?:Vec3[]}}[]=[{id:'global-adaptive',options:{adaptiveBinning:true}},{id:'global-stride8',options:{pixelStride:8}},{id:'single-200-stride8',options:{pixelStride:8,hkls:[[2,0,0]]}}];
    // Freeze the original 128-raw timing baseline independently of the UI's window size.
    if(spot)cases.push({id:'local-128',options:{rawROI:{u0:Math.floor(spot.u)-64,v0:Math.floor(spot.v)-64,width:128,height:128}}});
    for(const {id,options}of cases){
      const models={rings:new DiffractionModel(),plane:new DiffractionModel()},run=(kind:'rings'|'plane')=>models[kind].compute(scene,p,{...options,gaussianQuadrature:kind});
      const reference=run('rings'),fast=run('plane');
      const row:any={scene:name,sigma,case:id,options,status:{rings:reference.integration_status,plane:fast.integration_status},reason:{rings:reference.images?.find(i=>i.status==='unresolved')?.reason,plane:fast.images?.find(i=>i.status==='unresolved')?.reason},cells:fast.images!.reduce((s,i)=>s+i.tile.data.length,0),plane_cells:fast.images!.reduce((s,i)=>s+i.plane_cells,0),fallback_cells:fast.images!.reduce((s,i)=>s+i.fallback_cells,0),evaluations:{rings:reference.images!.reduce((s,i)=>s+i.evaluations,0),plane:fast.images!.reduce((s,i)=>s+i.evaluations,0)}};
      rows.push(row);
      if(fast.integration_status!=='resolved')continue;
      if(reference.integration_status!=='resolved'){
        if(id==='local-128'){
          const expanded=models.rings.compute(scene,p,{...options,gaussianQuadrature:'rings',maxEvaluations:20000000});
          row.explicit_reference_budget={maxEvaluations:20000000,status:expanded.integration_status};expect(expanded.integration_status).toBe('resolved');Object.assign(row,compare(expanded,fast));
          const times=[];for(let i=0;i<5;i++)times.push(run('plane').duration_ms);row.plane_only_warm_ms=times;row.plane_only_median_ms=median(times);
        }
        continue;
      }
      Object.assign(row,compare(reference,fast));
      const times={rings:[] as number[],plane:[] as number[]};
      for(let i=0;i<5;i++)for(const kind of (i%2?['plane','rings']:['rings','plane']) as ('rings'|'plane')[]){const r=run(kind);expect(r.integration_status).toBe('resolved');times[kind].push(r.duration_ms);}
      row.wall_ms=times;row.median_ms={rings:median(times.rings),plane:median(times.plane)};row.speedup=row.median_ms.rings/row.median_ms.plane;
    }
  }
  const path=process.env.GAUSSIAN_BENCHMARK_OUTPUT!;mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify({node:process.version,platform:process.platform,default_budget:{maxPixels:200000,maxEvaluations:2000000},warmups:1,repeats:5,rows},null,2));
},300000);
