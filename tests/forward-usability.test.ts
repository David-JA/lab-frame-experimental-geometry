import { it,expect } from 'vitest';
import { mkdirSync,writeFileSync } from 'node:fs';
import { diffraction_demo_config,lab_height_config } from '../src/example';
import { load_scene } from '../src/core/scene';
import { DiffractionModel } from '../src/diffraction/model';
import { formatIntegrationFailure } from '../src/ui/diffraction-panel';

it('completes ordinary broad spots with adaptive pixel groups and keeps the full candidate scope',()=>{
  const rows=[];
  for(const [sceneName,make]of [['lab',lab_height_config],['demo',diffraction_demo_config]] as const){
    for(const width of [.001,.003,.01,.03,.05]){
      const c=make();c.diffraction!.intensity_model={kind:'gaussian_3d',sigma_g_invA:width};
      const scene=load_scene(c),r=new DiffractionModel().compute(scene,c.diffraction!,{adaptiveBinning:true});
      expect(r.integration_status,r.images!.find(i=>i.status==='unresolved')?.reason).toBe('resolved');
      expect(r.images).toHaveLength(1240);
      expect(r.images!.every(i=>Number.isFinite(i.pixel_sum))).toBe(true);
      rows.push({scene:sceneName,kind:'gaussian',width,ms:r.duration_ms,status:r.integration_status,stride:Math.max(...r.images!.map(i=>i.sampling_stride)),computed:r.images!.length,reason:r.images!.find(i=>i.status==='unresolved')?.reason,evaluations:r.images!.reduce((s,i)=>s+i.evaluations,0)});
    }
    const c=make();c.diffraction!.intensity_model={kind:'uniform_sphere_3d'};
    const r=new DiffractionModel().compute(load_scene(c),c.diffraction!,{adaptiveBinning:true});
    expect(r.integration_status).toBe('resolved');expect(r.images).toHaveLength(1240);
    rows.push({scene:sceneName,kind:'sphere',width:c.diffraction!.spot_diameter_invA,ms:r.duration_ms,status:r.integration_status,computed:r.images!.length,reason:r.images!.find(i=>i.status==='unresolved')?.reason,evaluations:r.images!.reduce((s,i)=>s+i.evaluations,0)});
  }
  if(process.env.FORWARD_USABILITY_OUTPUT){mkdirSync('artifacts/issue3-usability',{recursive:true});writeFileSync(process.env.FORWARD_USABILITY_OUTPUT,JSON.stringify(rows,null,2));}
},120000);

it('describes a real evaluation budget failure instead of reporting a fictitious nonfinite intensity',()=>{
  const c=diffraction_demo_config();c.diffraction!.intensity_model={kind:'gaussian_3d',sigma_g_invA:.001};
  const r=new DiffractionModel().compute(load_scene(c),c.diffraction!,{hkls:[[2,0,0]],maxEvaluations:12});
  expect(r.integration_status).toBe('unresolved');
  expect(r.images![0].reason).toContain('budget');expect(r.images![0].reason).not.toContain('Nonfinite');
});

it('keeps ROI capacity, quadrature counts and Gaussian tails distinct in user-facing diagnostics',()=>{
  const roi=formatIntegrationFailure('ROI needs 56169 integration cells (224676 raw pixels); remaining frame budget 1200');
  expect(roi).toContain('56169');expect(roi).toContain('224676');expect(roi).toContain('1200');
  const evals=formatIntegrationFailure('Pixel quadrature evaluation budget exhausted (6948/6956)');
  expect(evals).toContain('6948/6956');expect(evals).not.toContain('非有限');
  expect(formatIntegrationFailure('Tail budget exceeded')).toContain('尾部');expect(formatIntegrationFailure('Tail budget exceeded')).not.toContain('次数');
});
