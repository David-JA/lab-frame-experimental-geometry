import { validatedConfig } from './config';
import { clone, SceneError, type SceneConfig, type Mat4, type Vec3, type Axis, type DirectionType } from './types';
import { add, sub, scale, dot, cross, norm, unit, identity, multiply, translation, fromQuat, toQuat, around, rotation, point, direction, inverseRigid, lattice, inverseTranspose, mat3Vector, axisAngle, directedAngle, rotationDelta } from './math';

function evaluate(c:SceneConfig) {
  const local=new Map<string,Mat4>([['LAB',identity()]]),world=new Map<string,Mat4>([['LAB',identity()]]);
  const frames=new Map(c.assembly.frames.map(f=>[f.id,f])),j=c.experiment_state.joints;
  function calculate(id:string):Mat4{
    if(world.has(id))return world.get(id)!;
    const f=frames.get(id)!;let motion=identity();
    const m=f.motion;
    if(m.kind==='revolute')motion=around(m.center_mm,rotation(m.axis,j[m.joint]));
    if(m.kind==='six_dof'){
      const [x,y,z,u,v,w]=m.joints.map(id=>j[id]);
      const r=multiply(multiply(rotation([0,0,1],w),rotation([0,1,0],v)),rotation([1,0,0],u));
      motion=multiply(translation([x,y,z]),around(m.pivot_mm,r));
    }
    if(m.kind==='xy_translation')motion=translation(add(scale(m.axes[0],j[m.joints[0]]),scale(m.axes[1],j[m.joints[1]])));
    const t=multiply(motion,multiply(translation(f.mount.position_mm),fromQuat(f.mount.quaternion_xyzw)));
    const wt=multiply(calculate(f.parent),t);
    if(wt.some(v=>!Number.isFinite(v)))throw new SceneError('NONFINITE_TRANSFORM','/assembly/frames/'+id,'Pose overflow');
    local.set(id,t);world.set(id,wt);return wt;
  }
  c.assembly.frames.forEach(f=>calculate(f.id));
  c.devices.devices.filter(d=>d.crystal).forEach(d=>{
    const t=fromQuat(c.experiment_state.samples[d.id].orientation_quaternion_xyzw);
    local.set(d.crystal!.frame,t);world.set(d.crystal!.frame,multiply(world.get(d.output_frame)!,t));
  });
  return {local,world};
}
function vec(v:Vec3,path:string):Vec3{
  if(!Array.isArray(v)||v.length!==3||v.some(x=>typeof x!=='number'||!Number.isFinite(x)))throw new SceneError('INVALID_VECTOR',path,'Expected three finite numbers');
  return v;
}
function stable(v:unknown):string{
  if(Array.isArray(v))return '['+v.map(stable).join(',')+']';
  if(v!==null&&typeof v==='object')return '{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>JSON.stringify(k)+':'+stable(x)).join(',')+'}';
  return JSON.stringify(v);
}
export class Scene {
  #config:SceneConfig;#transforms:ReturnType<typeof evaluate>;#revision=0;
  constructor(input:unknown){this.#config=validatedConfig(input);this.#transforms=evaluate(this.#config);}
  get revision(){return this.#revision;}
  save_state():SceneConfig{return clone(this.#config);}
  restore_state(input:unknown):number{
    const candidate=validatedConfig(input),transforms=evaluate(candidate);
    this.#config=candidate;this.#transforms=transforms;return ++this.#revision;
  }
  #matrix(frame:string):Mat4{
    const m=this.#transforms.world.get(frame);
    if(!m)throw new SceneError('UNKNOWN_FRAME',frame,'Unknown frame');return m;
  }
  #device(id:string){
    const d=this.#config.devices.devices.find(d=>d.id===id);
    if(!d)throw new SceneError('UNKNOWN_DEVICE',id,'Unknown device');return d;
  }
  set_joint_value(id:string,value:number):number{
    if(!Object.hasOwn(this.#config.experiment_state.joints,id))throw new SceneError('UNKNOWN_JOINT',id,'Unknown joint');
    const c=this.save_state();c.experiment_state.joints[id]=value;return this.restore_state(c);
  }
  set_platform_pose(id:string,pose:{translation_mm:Vec3;rotation_deg:Vec3}):number{
    const d=this.#device(id),frame=this.#config.assembly.frames.find(f=>f.id===d.output_frame);
    if(frame?.motion.kind!=='six_dof')throw new SceneError('INVALID_DEVICE',id,'Expected six_dof platform');
    vec(pose?.translation_mm,'translation_mm');vec(pose?.rotation_deg,'rotation_deg');
    const c=this.save_state(),values=[...pose.translation_mm,...pose.rotation_deg];
    frame.motion.joints.forEach((joint,i)=>c.experiment_state.joints[joint]=values[i]);
    return this.restore_state(c);
  }
  get_world_transform(id:string){
    const frame=this.#device(id).output_frame;
    return {frame_from:frame,frame_to:'LAB',length_unit:'mm',matrix:clone(this.#matrix(frame))};
  }
  get_frame_transform(a:string,b:string){
    return {frame_from:b,frame_to:a,length_unit:'mm',matrix:multiply(inverseRigid(this.#matrix(a)),this.#matrix(b))};
  }
  get_local_transform(frame:string):Mat4{
    this.#matrix(frame);return clone(this.#transforms.local.get(frame)!);
  }
  get_world_position(id:string){return {frame:'LAB',unit:'mm',position:point(this.#matrix(this.#device(id).output_frame),[0,0,0])};}
  get_world_orientation(id:string){return {frame:'LAB',quaternion_xyzw:toQuat(this.#matrix(this.#device(id).output_frame))};}
  get_crystal_direction(id:string,indices:Vec3,type:DirectionType='direct',frame='LAB'){
    vec(indices,'indices');unit(indices);
    const d=this.#device(id);
    if(!d.crystal)throw new SceneError('NOT_A_SAMPLE',id,'Device has no crystal');
    if(type!=='direct'&&type!=='reciprocal')throw new SceneError('INVALID_DIRECTION_TYPE','direction_type','Expected direct or reciprocal');
    const a=lattice(d.crystal.cell),basis=type==='direct'?a:inverseTranspose(a);
    const r=multiply(inverseRigid(this.#matrix(frame)),this.#matrix(d.crystal.frame));
    return {frame,unit:'1',normalized:true,direction_type:type,vector:unit(direction(r,mat3Vector(basis,indices)))};
  }
  get_axis(id:string):Axis{
    const d=this.#device(id),f=this.#config.assembly.frames.find(f=>f.id===d.output_frame);
    if(f?.motion.kind!=='revolute')throw new SceneError('NOT_AN_AXIS',id,'Expected rotary device');
    return {frame:f.parent,point_mm:clone(f.motion.center_mm),direction:clone(f.motion.axis)};
  }
  #worldAxis(axis:Axis){
    if(!axis)throw new SceneError('INVALID_AXIS','','Expected axis');
    const m=this.#matrix(axis.frame);
    return {frame:'LAB',point_mm:point(m,vec(axis.point_mm,'axis.point_mm')),direction:unit(direction(m,vec(axis.direction,'axis.direction')))};
  }
  get_point_to_axis_distance(p:{frame:string;position_mm:Vec3},axis:Axis){
    const a=this.#worldAxis(axis),pLab=point(this.#matrix(p.frame),vec(p.position_mm,'point.position_mm'));
    return {frame:'LAB',unit:'mm',distance_mm:norm(cross(sub(pLab,a.point_mm),a.direction))};
  }
  get_sample_point(id:string,kind:'center'|'target'='target'){
    const d=this.#device(id);if(!d.crystal)throw new SceneError('NOT_A_SAMPLE',id,'Expected crystal sample');
    return {frame:'LAB',unit:'mm',position:point(this.#matrix(d.output_frame),kind==='center'?d.crystal.center_s_mm:d.crystal.target_point_s_mm)};
  }
  get_pivot(id:string){
    const d=this.#device(id),f=this.#config.assembly.frames.find(f=>f.id===d.output_frame);
    if(f?.motion.kind!=='six_dof')throw new SceneError('INVALID_DEVICE',id,'Expected six_dof platform');
    const t=f.motion.joints.slice(0,3).map(id=>this.#config.experiment_state.joints[id]) as Vec3;
    return {frame:'LAB',unit:'mm',position:point(this.#matrix(f.parent),add(f.motion.pivot_mm,t))};
  }
  get_zone_axis_alignment(id:string,indices:Vec3,axisInput:Axis|string){
    const axis=this.#worldAxis(typeof axisInput==='string'?this.get_axis(axisInput):axisInput);
    const d=this.get_crystal_direction(id,indices,'direct','LAB').vector,p=this.get_sample_point(id);
    const angle=axisAngle(d,axis.direction),distance=this.get_point_to_axis_distance({frame:'LAB',position_mm:p.position},axis).distance_mm;
    const t=this.#config.assembly.alignment_tolerance,da=angle<=t.angle_deg,pc=distance<=t.distance_mm;
    return {frame:'LAB',angle_unit:'deg',length_unit:'mm',axis_error_deg:angle,signed_dot:dot(d,axis.direction),point_distance_mm:distance,direction_lab:d,axis_lab:axis.direction,direction_aligned:da,point_centered:pc,aligned:da&&pc,tolerance:clone(t)};
  }
  get_detector_pixel(id:string,u:number,v:number){
    const d=this.#device(id);
    if(!d.detector)throw new SceneError('NOT_A_DETECTOR',id,'Expected detector');
    const [nu,nv]=d.detector.pixels,[px,py]=d.detector.pixel_size_mm;
    if(!Number.isInteger(u)||!Number.isInteger(v)||u<0||u>=nu||v<0||v>=nv)throw new SceneError('INVALID_PIXEL','pixel','Pixel center indices out of range');
    return {frame:d.output_frame,unit:'mm',position:[(u-(nu-1)/2)*px,((nv-1)/2-v)*py,0] as Vec3};
  }
  compare_states(a:unknown,b:unknown){return compare_states(a,b);}
}
export const load_scene=(config:unknown)=>new Scene(config);

function topology(c:SceneConfig){
  const ordered=<T extends {id:string}>(items:T[])=>[...items].sort((a,b)=>a.id.localeCompare(b.id));
  return {
    devices:ordered(c.devices.devices).map(d=>({id:d.id,type:d.type,output_frame:d.output_frame,crystal_frame:d.crystal?.frame})),
    frames:ordered(c.assembly.frames).map(f=>({id:f.id,parent:f.parent,kind:f.motion.kind,joints:f.motion.kind==='revolute'?[f.motion.joint]:'joints' in f.motion?f.motion.joints:[]})),
    joints:ordered(c.assembly.joints).map(j=>({id:j.id,unit:j.unit})),samples:Object.keys(c.experiment_state.samples).sort()
  };
}
export function compare_states(inputA:unknown,inputB:unknown){
  const a=load_scene(inputA),b=load_scene(inputB),ca=a.save_state(),cb=b.save_state();
  if(stable(topology(ca))!==stable(topology(cb)))throw new SceneError('STATE_TOPOLOGY_MISMATCH','','Snapshot IDs, joint roles/units or parent graph differ');
  return {
    frame:'LAB',configuration_changed:stable({devices:ca.devices,assembly:ca.assembly})!==stable({devices:cb.devices,assembly:cb.assembly}),
    display_changed:stable(ca.experiment_state.display)!==stable(cb.experiment_state.display),
    joint_delta:Object.fromEntries(ca.assembly.joints.map(j=>[j.id,{a:ca.experiment_state.joints[j.id],b:cb.experiment_state.joints[j.id],delta:cb.experiment_state.joints[j.id]-ca.experiment_state.joints[j.id],unit:j.unit}])),
    device_delta:Object.fromEntries(ca.devices.devices.map(d=>[d.id,{
      translation_delta_lab_mm:sub(b.get_world_position(d.id).position,a.get_world_position(d.id).position),
      rotation_delta_deg:rotationDelta(a.get_world_transform(d.id).matrix,b.get_world_transform(d.id).matrix)
    }])),
    sample_delta:Object.fromEntries(ca.devices.devices.filter(d=>d.crystal).map(d=>{
      const sa=ca.experiment_state.samples[d.id],sb=cb.experiment_state.samples[d.id];
      const va=a.get_crystal_direction(d.id,sa.target_indices,sa.direction_type).vector,vb=b.get_crystal_direction(d.id,sb.target_indices,sb.direction_type).vector;
      const changed=sa.direction_type!==sb.direction_type||stable(sa.target_indices)!==stable(sb.target_indices);
      return [d.id,{
        crystal_rotation_delta_deg:rotationDelta(a.get_frame_transform('LAB',d.crystal!.frame).matrix,b.get_frame_transform('LAB',d.crystal!.frame).matrix),
        target_a:{indices:clone(sa.target_indices),direction_type:sa.direction_type,direction_lab:va},
        target_b:{indices:clone(sb.target_indices),direction_type:sb.direction_type,direction_lab:vb},
        target_changed:changed,direction_delta_deg:changed?null:directedAngle(va,vb),
        target_point_delta_lab_mm:sub(b.get_sample_point(d.id).position,a.get_sample_point(d.id).position)
      }];
    }))
  };
}
