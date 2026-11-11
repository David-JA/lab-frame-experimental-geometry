import { load_scene } from './scene';
import { toQuat } from './math';
import { SceneError, type SceneConfig, type Vec3 } from './types';

export function detectorSupport(c:SceneConfig,id:string){
  const detector=c.devices.devices.find(d=>d.id===id&&d.detector);
  if(!detector)throw new SceneError('INVALID_DETECTOR',id,'Expected detector');
  let parent=c.assembly.frames.find(f=>f.id===detector.output_frame)?.parent;
  while(parent&&parent!=='LAB'){
    const frame=c.assembly.frames.find(f=>f.id===parent);
    const device=c.devices.devices.find(d=>d.type==='detector_support'&&d.output_frame===parent);
    if(device&&frame)return {device,frame};
    if(!frame||frame.motion.kind!=='fixed')break;parent=frame.parent;
  }
  return undefined;
}

/** Explicitly introduce a support without changing the panel's world pose or other objects. */
export function withDetectorSupport(input:SceneConfig,id:string):SceneConfig{
  const scene=load_scene(input),c=scene.save_state();if(detectorSupport(c,id))return c;
  const d=c.devices.devices.find(d=>d.id===id)!,world=scene.get_world_transform(id).matrix;
  const frames=new Set(['LAB',...c.assembly.frames.map(f=>f.id),...c.devices.devices.flatMap(d=>d.crystal?[d.crystal.frame]:[])]);
  const unique=(base:string,used:Set<string>)=>{let value=base;for(let i=2;used.has(value);i++)value=base+'_'+i;used.add(value);return value;};
  const supportId=unique(id+'_support',new Set(c.devices.devices.map(d=>d.id)));
  const supportFrame=unique(d.output_frame+'_support',frames),oldFrame=c.assembly.frames.find(f=>f.id===d.output_frame);
  const exclusive=oldFrame&&oldFrame.motion.kind==='fixed'&&!c.devices.devices.some(other=>other.id!==id&&other.output_frame===oldFrame.id)&&!c.assembly.frames.some(f=>f.parent===oldFrame.id)&&!c.assembly.supports.some(s=>s.base_frame===oldFrame.id||s.moving_frame===oldFrame.id);
  const panelFrame=exclusive?oldFrame:{id:unique(id+'_panel',frames),parent:supportFrame,mount:{position_mm:[0,0,0] as Vec3,quaternion_xyzw:[0,0,0,1] as [number,number,number,number]},motion:{kind:'fixed' as const}};
  const origin:Vec3=[c.assembly.beam.point_mm[0],c.assembly.beam.point_mm[1],world[11]];
  panelFrame.parent=supportFrame;panelFrame.mount={position_mm:[world[3]-origin[0],world[7]-origin[1],0],quaternion_xyzw:toQuat(world)};
  if(!exclusive){c.assembly.frames.push(panelFrame);d.output_frame=panelFrame.id;}
  c.assembly.frames.push({id:supportFrame,parent:'LAB',mount:{position_mm:origin,quaternion_xyzw:[0,0,0,1]},motion:{kind:'fixed'}});
  c.devices.devices.push({id:supportId,type:'detector_support',output_frame:supportFrame,visual:{shape:'box',size_mm:[260,Math.max(250,origin[1]),360],color:'#7B8790'},provenance:'synthetic',description:'LAB 对齐的 X/Z 双轴支撑架。平板架内安装位姿由标定确定；支架外形为示意。'});
  return load_scene(c).save_state();
}

export function withDetectorSupportPosition(input:SceneConfig,id:string,position:{x_mm:number;z_mm:number}):SceneConfig{
  if(!Number.isFinite(position.x_mm)||!Number.isFinite(position.z_mm))throw new SceneError('INVALID_POSITION',id,'Support X/Z must be finite');
  const c=withDetectorSupport(input,id),support=detectorSupport(c,id)!;
  support.frame.mount.position_mm[0]=position.x_mm;support.frame.mount.position_mm[2]=position.z_mm;
  return load_scene(c).save_state();
}
