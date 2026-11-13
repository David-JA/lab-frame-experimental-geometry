import { it,expect } from 'vitest';
import { integrateReflection,pixelPoint,previewGrid,downsample,type Density } from '../src/diffraction/forward';
import { LOCAL_SIZE,localRectangle,rawWindow } from '../src/diffraction/local';
import type { Panel } from '../src/diffraction/model';
import { scale,unit,sub } from '../src/core/math';
import { diffraction_demo_config } from '../src/example';
import { load_scene } from '../src/core/scene';
import { DiffractionModel } from '../src/diffraction/model';

const panel:Panel={center:[0,0,1000],x:[1,0,0],y:[0,1,0],normal:[0,0,1],pixels:[81,81],pixel_size_mm:[.1,.1]};
const source:[number,number,number]=[0,0,0],k=8;
const centre=(u:number,v:number)=>sub(scale(unit(pixelPoint(panel,u,v)),k),[0,0,k]);
it('uses a 256x256 raw window centered and snapped to the same global grid',()=>{
  expect(LOCAL_SIZE).toBe(256);expect(localRectangle(200.75,300.25)).toEqual({u0:72,v0:172,width:256,height:256});
  const r=rawWindow([],panel.pixels,localRectangle(0,0));expect(r.data.length).toBe(65536);expect(r.mask.reduce((a,b)=>a+b,0)).toBe(81*81);
});
it('uses exact globally aligned 8x8 display bins, preserves coarse sums and custom grids',()=>{
  expect(previewGrid([4288,4288])).toEqual([536,536]);expect(previewGrid([81,97])).toEqual([512,512]);
  const raw={u0:7,v0:7,width:3,height:3,data:Float64Array.from([1,2,3,4,5,6,7,8,9])};
  const reduced=downsample([raw],[4288,4288],previewGrid([4288,4288]));
  expect(reduced[0]).toBeCloseTo(1,10);expect(reduced[1]).toBeCloseTo(5,10);expect(reduced[536]).toBeCloseTo(11,10);expect(reduced[537]).toBeCloseTo(28,10);
  const coarse={u0:0,v0:0,width:1,height:1,stride:16,data:Float64Array.of(8)};
  const grouped=downsample([coarse],[4288,4288],[536,536]);expect([grouped[0],grouped[1],grouped[536],grouped[537]]).toEqual([2,2,2,2]);
});
it('restricts integration before spending pixel budget, retains raw coordinates and off-window centres',()=>{
  for(const d of [{kind:'gaussian_3d',sigma_g_invA:.0008},{kind:'uniform_sphere_3d',radius_g_invA:.002}] as Density[]){
    const g=centre(40.2,40.35),roi={u0:41,v0:38,width:3,height:5};
    const raw=integrateReflection(panel,source,g,k,d),local=integrateReflection(panel,source,g,k,d,1,[2,0,0],{rawROI:roi,maxPixels:15});
    expect(local.status,local.reason).toBe('resolved');expect(local.integration_scope).toBe('roi');expect(local.sampling_stride).toBe(1);
    expect(local.tile.data.length).toBeLessThanOrEqual(15);expect(local.pixel_sum).toBeGreaterThan(0);expect(local.pixel_sum).toBeLessThan(raw.pixel_sum);
    const expected=rawWindow([raw.tile],panel.pixels,roi),actual=rawWindow([local.tile],panel.pixels,roi);
    for(let i=0;i<actual.data.length;i++)expect(Math.abs(actual.data[i]-expected.data[i])).toBeLessThan(1e-8*local.error_scale+1e-3*expected.data[i]);
    expect(rawWindow([local.tile,local.tile],panel.pixels,roi).data).toEqual(Float64Array.from(actual.data,v=>2*v));
  }
});
it('keeps detector exterior masked and rejects grouped images and invalid raw ROI requests',()=>{
  const roi={u0:-2,v0:79,width:5,height:5},r=rawWindow([],panel.pixels,roi);
  expect(r.mask.reduce((a,b)=>a+b,0)).toBe(6);expect(r.data.every(v=>v===0)).toBe(true);
  expect(()=>rawWindow([{u0:0,v0:0,width:1,height:1,stride:2,data:Float64Array.of(1)}],panel.pixels,roi)).toThrow('grouped');
  const g=centre(40.2,40.35),d:Density={kind:'gaussian_3d',sigma_g_invA:.001};
  expect(()=>integrateReflection(panel,source,g,k,d,1,[2,0,0],{rawROI:{...roi,u0:.2}})).toThrow('ROI');
  expect(()=>integrateReflection(panel,source,g,k,d,1,[2,0,0],{rawROI:roi,adaptiveBinning:true})).toThrow('stride');
  const failed=integrateReflection(panel,source,g,k,d,1,[2,0,0],{rawROI:{u0:35,v0:35,width:10,height:10},maxEvaluations:12});
  expect(failed.status).toBe('unresolved');
  expect(failed.completed_cells).toBeLessThan(failed.tile.data.length);
});
it('includes two distinct overlapping HKLs and recovers detail erased by coarse groups',()=>{
  const c=diffraction_demo_config(),p=c.diffraction!,sample=c.devices.devices.find(d=>d.id===p.sample_id)!;
  sample.crystal!.cell.a=sample.crystal!.cell.b=sample.crystal!.cell.c=1000;p.reflection_model='primitive';p.hkl_limit=1;p.intensity_model={kind:'gaussian_3d',sigma_g_invA:.0004};
  const scene=load_scene(c),roi={u0:1980,v0:2010,width:128,height:128},hkls:[[number,number,number],[number,number,number]]=[[1,0,0],[1,0,1]],model=new DiffractionModel();
  const pair=model.compute(scene,p,{rawROI:roi,hkls}),single=hkls.map(hkl=>model.compute(scene,p,{rawROI:roi,hkls:[hkl]}));
  expect(pair.integration_status).toBe('resolved');expect(pair.images).toHaveLength(2);
  const both=rawWindow(pair.images!.map(i=>i.tile),pair.panel.pixels,roi),ones=single.map(r=>rawWindow(r.images!.map(i=>i.tile),r.panel.pixels,roi));
  expect(ones.every(r=>r.data.some(v=>v>0))).toBe(true);
  for(let i=0;i<both.data.length;i++)expect(both.data[i]).toBeCloseTo(ones[0].data[i]+ones[1].data[i],10);
  const g=centre(40.2,40.35),d:Density={kind:'gaussian_3d',sigma_g_invA:.0008},window={u0:32,v0:32,width:16,height:16};
  const local=integrateReflection(panel,source,g,k,d,1,[2,0,0],{rawROI:window}),group=integrateReflection(panel,source,g,k,d,1,[2,0,0],{pixelStride:16});
  const detail=rawWindow([local.tile],panel.pixels,window).data,coarse=group.tile.data[(32-group.tile.v0)/16*group.tile.width+(32-group.tile.u0)/16]/256;
  expect(Math.max(...detail)).toBeGreaterThan(coarse*10);expect(Math.min(...detail)).toBeLessThan(coarse/10);
});
