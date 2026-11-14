import { load_scene } from '../core/scene';
import type { SceneConfig,Vec3 } from '../core/types';
import { DiffractionModel } from './model';
import type { IntegrationOptions } from './forward';

/** Fixed-pose unit exposures; snapshots remain the only source of geometry. */
export function computeForwardFrames(snapshot:SceneConfig,poses:{id:string;joints:Record<string,number>}[],options:IntegrationOptions&{hkls?:Vec3[]}={}) {
  const model=new DiffractionModel();
  return poses.map(pose=>{
    const scene=load_scene(snapshot),next=scene.save_state();
    for(const [id,value]of Object.entries(pose.joints)){
      if(!Object.hasOwn(next.experiment_state.joints,id))throw new Error(`Unknown joint ${id}`);
      next.experiment_state.joints[id]=value;
    }
    scene.restore_state(next);const p=next.diffraction;
    if(!p?.intensity_model)throw new Error('A 3D intensity model must be selected explicitly');
    const sample=next.devices.devices.find(d=>d.id===p.sample_id)!;
    return {id:pose.id,snapshot:scene.save_state(),crystal_to_lab:scene.get_frame_transform('LAB',sample.crystal!.frame).matrix,convention:'g=1/d; A^-1',surface_measure:'dS_g=k^2 dOmega; g_ref=1 A^-1',algorithm:options.gaussianQuadrature==='plane'&&p.intensity_model.kind==='gaussian_3d'?'ewald-gaussian-plane-with-ring-fallback-v1':'ewald-pixel-rings-v1',integration_scope:options.rawROI?'roi':'board',integration_options:{relativeTolerance:2e-6,maxPixels:200000,maxEvaluations:2000000,maxDepth:16,...options},acceptance_gate:{frame_relative:1e-3,frame_absolute_scale_fraction:1e-6},result:model.compute(scene,p,options)};
  });
}
