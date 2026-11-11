import Ajv from 'ajv';
import schema from '../../schema/setup.schema.json';
import { clone, SceneError, type SceneConfig } from './types';
import { cross, fromQuat, inverseRigid, lattice, multiply, norm, normalizeQuat, point, sub, translation, unit } from './math';
import { validateDiffraction } from '../diffraction/model';

const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);
function requireThat(ok: unknown, path: string, message: string): asserts ok {
  if (!ok) throw new SceneError('INVALID_CONFIG', path, message);
}
function located<T>(path:string,operation:()=>T):T {
  try{return operation();}catch(error){if(error instanceof SceneError)throw new SceneError(error.code,path,error.message);throw error;}
}
export function validatedConfig(input: unknown): SceneConfig {
  if (!validate(input)) {
    const error=validate.errors![0];
    throw new SceneError('SCHEMA_ERROR', error.instancePath, error.message ?? 'Invalid configuration');
  }
  const c=clone(input as unknown as SceneConfig), frames=new Map(c.assembly.frames.map(f=>[f.id,f]));
  const devices=new Map(c.devices.devices.map(d=>[d.id,d])), joints=new Map(c.assembly.joints.map(j=>[j.id,j]));
  requireThat(frames.size===c.assembly.frames.length&&!frames.has('LAB'),'/assembly/frames','Frame IDs must be unique and LAB is reserved');
  requireThat(devices.size===c.devices.devices.length,'/devices','Device IDs must be unique');
  requireThat(joints.size===c.assembly.joints.length,'/assembly/joints','Joint IDs must be unique');
  const visited=new Set<string>(),active=new Set<string>();
  function visit(id:string) {
    if(id==='LAB'||visited.has(id))return;
    requireThat(frames.has(id),'/assembly/frames/'+id,'Unknown parent frame');
    requireThat(!active.has(id),'/assembly/frames/'+id,'Cyclic frame graph');
    active.add(id);visit(frames.get(id)!.parent);active.delete(id);visited.add(id);
  }
  const bound=new Set<string>();
  const bind=(id:string,unitName:string) => {
    requireThat(joints.has(id)&&joints.get(id)!.unit===unitName,'/assembly/joints/'+id,'Missing joint or incompatible unit');
    requireThat(!bound.has(id),'/assembly/joints/'+id,'Joint is bound more than once');bound.add(id);
  };
  for(const f of c.assembly.frames){
    visit(f.id);
    f.mount.quaternion_xyzw=located('/assembly/frames/'+f.id+'/mount/quaternion_xyzw',()=>normalizeQuat(f.mount.quaternion_xyzw));
    const m=f.motion;
    if(m.kind==='revolute'){m.axis=located('/assembly/frames/'+f.id+'/motion/axis',()=>unit(m.axis));bind(m.joint,'deg');}
    if(m.kind==='prismatic'){m.axis=located('/assembly/frames/'+f.id+'/motion/axis',()=>unit(m.axis));bind(m.joint,'mm');}
    if(m.kind==='six_dof')m.joints.forEach((id,i)=>bind(id,i<3?'mm':'deg'));
    if(m.kind==='xy_translation'){
      m.axes=located('/assembly/frames/'+f.id+'/motion/axes',()=>[unit(m.axes[0]),unit(m.axes[1])]);
      requireThat(norm(cross(...m.axes))>1e-8,'/assembly/frames/'+f.id,'XY axes must be independent');
      m.joints.forEach(id=>bind(id,'mm'));
    }
  }
  requireThat(bound.size===joints.size,'/assembly/joints','Unbound joint definition');
  const stateIds=Object.keys(c.experiment_state.joints);
  requireThat(stateIds.length===joints.size&&stateIds.every(id=>joints.has(id)),'/experiment_state/joints','Joint values must exactly match definitions');
  for(const j of c.assembly.joints){
    if(j.limits){
      requireThat(j.limits[0]<=j.limits[1],'/assembly/joints/'+j.id,'Reversed joint limits');
      const v=c.experiment_state.joints[j.id];
      requireThat(v>=j.limits[0]&&v<=j.limits[1],'/experiment_state/joints/'+j.id,'Joint outside configured limits');
    }
  }
  const known=new Set(['LAB',...frames.keys()]),sampleIds:string[]=[];
  // Register derived frames before resolving references from any device.
  for(const d of c.devices.devices){
    if(d.type==='sample')requireThat(d.crystal,'/devices/'+d.id,'Sample requires crystal definition');
    if(d.crystal){
      requireThat(d.type==='sample'&&!known.has(d.crystal.frame),'/devices/'+d.id,'Invalid or duplicate crystal frame');
      known.add(d.crystal.frame);sampleIds.push(d.id);
      try {lattice(d.crystal.cell);} catch(e) {throw new SceneError('INVALID_CELL','/devices/'+d.id+'/crystal/cell',(e as Error).message);}
    }
  }
  for(const d of c.devices.devices){
    requireThat(known.has(d.output_frame),'/devices/'+d.id,'Unknown output frame');
    if(d.type==='detector')requireThat(d.detector,'/devices/'+d.id+'/detector','Detector requires pixel metadata');
    if(d.type==='detector_support'){
      const f=frames.get(d.output_frame),q=f?.mount.quaternion_xyzw;
      requireThat(f?.parent==='LAB'&&f.motion.kind==='fixed'&&q&&norm(q.slice(0,3) as [number,number,number])<1e-8,'/devices/'+d.id,'Detector support must be fixed in LAB with LAB-aligned axes');
    }
    const motion=frames.get(d.output_frame)?.motion;
    const expected={rotary:'revolute',theta:'revolute',hexapod:'six_dof',z_stage:'prismatic',xy:'xy_translation'}[d.type as 'rotary'|'theta'|'hexapod'|'z_stage'|'xy'];
    if(expected)requireThat(motion?.kind===expected,'/devices/'+d.id,'Device motion kind mismatch');
    if(d.type==='z_stage'&&motion?.kind==='prismatic'){
      const f=frames.get(d.output_frame)!;
      const [qx,qy,qz]=f.mount.quaternion_xyzw;
      requireThat(norm(sub(motion.axis,[0,0,1]))<1e-8&&norm(f.mount.position_mm)<1e-8&&norm([qx,qy,qz])<1e-8,'/devices/'+d.id,'Z stage requires a +Z prismatic axis and identity zero-height mount');
    }
    if(d.type==='rotary')requireThat(frames.get(d.output_frame)?.parent==='LAB','/devices/'+d.id,'Outer rotary axis must be defined in LAB');
    if(d.elevation){
      const f=frames.get(d.output_frame),e=d.elevation;
      requireThat(d.type==='rotary'&&d.visual.shape==='box'&&f?.parent==='LAB','/devices/'+d.id+'/elevation','Elevation requires a LAB-mounted rotary column');
      const r=fromQuat(f.mount.quaternion_xyzw);
      requireThat(f.motion.kind==='revolute'&&norm(sub(f.motion.axis,[0,1,0]))<1e-8&&norm(sub([r[1],r[5],r[9]],[0,1,0]))<1e-8,'/devices/'+d.id+'/elevation','Elevating column must retain a vertical +Y rotary axis');
      const rise=f.mount.position_mm[1]-e.base_mount_y_mm;
      requireThat(rise>=0&&rise<=e.travel_mm,'/devices/'+d.id+'/elevation','Elevation outside configured range');
    }
  }
  // Moving roles may be separated by fixed mounting/shim frames, not by another motion.
  const fixedPathTo=(start:string,stop:(id:string)=>boolean):boolean=>{
    let id=start;
    while(!stop(id)){
      const f=frames.get(id);
      if(!f||f.motion.kind!=='fixed')return false;
      id=f.parent;
    }
    return true;
  };
  const roleAt=(role:string)=>(id:string)=>c.devices.devices.some(d=>d.type===role&&d.output_frame===id);
  for(const d of c.devices.devices){
    const f=frames.get(d.output_frame);
    if(d.type==='detector')requireThat(fixedPathTo(d.output_frame,id=>id==='LAB'),'/devices/'+d.id,'Detector must be fixed to LAB');
    const parentRole={hexapod:'rotary',z_stage:'hexapod',xy:'theta'}[d.type as 'hexapod'|'z_stage'|'xy'];
    if(parentRole)requireThat(f&&fixedPathTo(f.parent,roleAt(parentRole)),'/devices/'+d.id,'Invalid motion ancestry; expected '+parentRole+' through fixed mounts');
    if(d.type==='theta')requireThat(f&&fixedPathTo(f.parent,id=>roleAt('hexapod')(id)||roleAt('z_stage')(id)),'/devices/'+d.id,'Theta must descend from hexapod or Z stage through fixed mounts');
    if(d.type==='sample')requireThat(fixedPathTo(d.output_frame,roleAt('xy')),'/devices/'+d.id,'Sample must be fixed to the XY output');
    if(d.integrated_into!==undefined){
      const host=devices.get(d.integrated_into),theta=host&&frames.get(host.output_frame);
      requireThat(d.type==='xy'&&host?.type==='theta'&&theta?.motion.kind==='revolute'&&f,'/devices/'+d.id+'/integrated_into','Integrated XY must reference a theta device');
      requireThat(fixedPathTo(f.parent,id=>id===theta.id),'/devices/'+d.id+'/integrated_into','Integrated XY must descend from its theta output through fixed mounts');
      const mount=(frame:typeof f)=>multiply(translation(frame.mount.position_mm),fromQuat(frame.mount.quaternion_xyzw));
      let base=mount(f),parent=f.parent;
      while(parent!==theta.id){const fixed=frames.get(parent)!;base=multiply(mount(fixed),base);parent=fixed.parent;}
      // Compare the zero-travel base to the axis center, not the translated XY output.
      const center=point(inverseRigid(mount(theta)),theta.motion.center_mm);
      requireThat(norm(sub(point(base,[0,0,0]),center))<=1e-8,'/assembly/frames/'+f.id+'/mount','Integrated XY base must remain at theta rotation center');
    }
  }
  const stateSamples=Object.keys(c.experiment_state.samples);
  requireThat(stateSamples.length===sampleIds.length&&stateSamples.every(id=>sampleIds.includes(id)),'/experiment_state/samples','Sample states must exactly match devices');
  for(const [id,s]of Object.entries(c.experiment_state.samples)){
    s.orientation_quaternion_xyzw=located('/experiment_state/samples/'+id+'/orientation_quaternion_xyzw',()=>normalizeQuat(s.orientation_quaternion_xyzw));
    requireThat(norm(s.target_indices)>1e-12,'/experiment_state/samples/'+id,'Target indices cannot be zero');
  }
  requireThat(c.assembly.beam.frame==='LAB','/assembly/beam','Beam belongs to LAB');
  c.assembly.beam.direction=located('/assembly/beam/direction',()=>unit(c.assembly.beam.direction));
  requireThat(norm([c.assembly.beam.direction[0],c.assembly.beam.direction[1],c.assembly.beam.direction[2]-1])<1e-10,'/assembly/beam/direction','Incident beam defines LAB +Z');
  for(const s of c.assembly.supports)requireThat(known.has(s.base_frame)&&known.has(s.moving_frame),'/assembly/supports','Unknown support frame');
  validateDiffraction(c);
  return c;
}
