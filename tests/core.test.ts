import { describe, expect, it } from 'vitest';
import { compare_states, load_scene, SceneError, type Mat4, type SceneConfig, type Vec3 } from '../src/core';
import { example_config } from '../src/example';

// Oracles deliberately do not import production matrix/rotation/lattice helpers.
function close(a:number[],b:number[],tol=1e-8){expect(a.length).toBe(b.length);a.forEach((x,i)=>expect(Math.abs(x-b[i])).toBeLessThanOrEqual(tol));}
function apply(m:Mat4,p:Vec3):Vec3{return [0,1,2].map(r=>m[4*r]*p[0]+m[4*r+1]*p[1]+m[4*r+2]*p[2]+m[4*r+3]) as Vec3;}
function rotate(p:Vec3,axis:'x'|'y'|'z',deg:number):Vec3{
  const a=deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a),[x,y,z]=p;
  return axis==='x'?[x,c*y-s*z,s*y+c*z]:axis==='y'?[c*x+s*z,y,-s*x+c*z]:[c*x-s*y,s*x+c*y,z];
}
const angle=(a:Vec3,b:Vec3)=>{
  const dot=a.reduce((s,v,i)=>s+v*b[i],0),cross=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  return Math.atan2(Math.hypot(...cross),dot)*180/Math.PI;
};
const frame=(c:SceneConfig,id:string)=>c.assembly.frames.find(f=>f.id===id)!;
function code(action:()=>unknown,expected?:string){
  try {action();throw new Error('Expected rejection');}catch(e){expect(e).toBeInstanceOf(SceneError);if(expected)expect((e as SceneError).code).toBe(expected);}
}
describe('independent kinematics (V01–V05, V07, V11)',()=>{
  it('V01: configured zero installation and +Y rotation sign',()=>{
    const s=load_scene(example_config());
    close(s.get_world_position('sample').position,[0,200,0]);
    close(s.get_world_position('hexapod').position,[0,100,0]);
    s.set_joint_value('rotary.phi',90);
    close(apply(s.get_world_transform('rotary').matrix,[1,0,0]),[0,0,-1]);
    close(s.get_world_position('sample').position,[0,200,0]);
  });
  it('V02: outer inheritance preserves internal pose and detector/beam',()=>{
    const s=load_scene(example_config());
    s.set_platform_pose('hexapod',{translation_mm:[2,3,4],rotation_deg:[11,22,33]});
    const relative=s.get_frame_transform('H0','H1').matrix,det=s.get_world_transform('detector').matrix,beam=s.save_state().assembly.beam;
    s.set_joint_value('rotary.phi',73);
    close(s.get_frame_transform('H0','H1').matrix,relative);
    expect(s.get_world_transform('detector').matrix).toEqual(det);
    expect(s.save_state().assembly.beam).toEqual(beam);
  });
  it('V03: nonzero pivot translation and T0 are not omitted',()=>{
    const c=example_config(),m=frame(c,'H1').motion;
    if(m.kind!=='six_dof')throw Error();
    m.pivot_mm=[0,150,0];const s=load_scene(c);
    s.set_platform_pose('hexapod',{translation_mm:[0,0,0],rotation_deg:[0,0,90]});
    close(s.get_world_position('hexapod').position,[50,150,0]);
    for(const w of [0,31,90,179]){
      s.set_platform_pose('hexapod',{translation_mm:[3,4,5],rotation_deg:[0,0,w]});
      close(apply(s.get_world_transform('hexapod').matrix,[0,50,0]),[3,154,5]);
      close(s.get_pivot('hexapod').position,[3,154,5]);
    }
    close(s.get_world_position('hexapod').position,[3+50*Math.sin(179*Math.PI/180),154-50*Math.cos(179*Math.PI/180),5]);
  });
  it('V04: H1 motion does not move H0',()=>{
    const s=load_scene(example_config()),h0=s.get_frame_transform('LAB','H0').matrix;
    s.set_platform_pose('hexapod',{translation_mm:[12,13,14],rotation_deg:[15,16,17]});
    expect(s.get_frame_transform('LAB','H0').matrix).toEqual(h0);
  });
  it('V05: local XY removes eccentricity even under parent rotation',()=>{
    const s=load_scene(example_config());
    s.set_platform_pose('hexapod',{translation_mm:[2,3,4],rotation_deg:[12,23,34]});
    s.set_joint_value('rotary.phi',57);s.set_joint_value('xy.x',1);
    const distance=()=>s.get_point_to_axis_distance({frame:'LAB',position_mm:s.get_sample_point('sample','center').position},s.get_axis('theta')).distance_mm;
    expect(distance()).toBeCloseTo(1,9);
    s.set_joint_value('xy.x',0);expect(distance()).toBeLessThan(1e-8);
    const center=s.get_sample_point('sample','center').position;
    s.set_joint_value('theta.angle',119);close(s.get_sample_point('sample','center').position,center);
  });
  it('V07/V11: 100 seed-38 composed poses vs independent scalar rotations',()=>{
    let seed=38;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2**32;};
    const c=example_config(),a=17*Math.PI/360;
    c.experiment_state.samples.sample.orientation_quaternion_xyzw=[0,Math.sin(a),0,Math.cos(a)];
    const s=load_scene(c);
    for(let i=0;i<100;i++){
      const [phi,u,v,w,theta]=Array.from({length:5},()=>random()*120-60);
      const [x,y]=[random()*10-5,random()*10-5];
      const t:Vec3=[random()*10,random()*10,random()*10];
      s.set_platform_pose('hexapod',{translation_mm:t,rotation_deg:[u,v,w]});
      s.set_joint_value('rotary.phi',phi);s.set_joint_value('theta.angle',theta);s.set_joint_value('xy.x',x);s.set_joint_value('xy.y',y);
      let delta=rotate(rotate([x,y,0],'z',theta),'x',-90);
      delta=rotate(rotate(rotate(delta,'x',u),'y',v),'z',w);
      const p=rotate([delta[0]+t[0],delta[1]+t[1]+200,delta[2]+t[2]],'y',phi);
      close(s.get_sample_point('sample').position,p);
      let d=rotate([Math.SQRT1_2,Math.SQRT1_2,0],'y',17);
      d=rotate(rotate(d,'z',theta),'x',-90);
      d=rotate(rotate(rotate(rotate(d,'x',u),'y',v),'z',w),'y',phi);
      close(s.get_crystal_direction('sample',[1,1,0]).vector,d,1e-10);
    }
  });
  it('V11: relative frame inverse and detector pixel centers',()=>{
    const s=load_scene(example_config());
    s.set_joint_value('rotary.phi',29);s.set_joint_value('theta.angle',41);
    const p:Vec3=[7,8,9],a=s.get_frame_transform('P1','LAB').matrix,b=s.get_frame_transform('LAB','P1').matrix;
    close(apply(b,apply(a,p)),p);
    close(s.get_detector_pixel('detector',0,0).position,[-214.35,214.35,0]);
    close(s.get_detector_pixel('detector',4287,4287).position,[214.35,-214.35,0]);
    code(()=>s.get_detector_pixel('detector',4288,0),'INVALID_PIXEL');
  });
});
describe('crystal directions and geometry (V06/V08)',()=>{
  it('V06: cubic direction/normal and nonorthogonal 30-degree counterexample',()=>{
    const c=example_config(),s=load_scene(c);
    close(s.get_crystal_direction('sample',[1,0,0]).vector,s.get_crystal_direction('sample',[1,0,0],'reciprocal').vector);
    c.devices.devices.find(d=>d.id==='sample')!.crystal!.cell={a:1,b:1,c:2,alpha_deg:90,beta_deg:90,gamma_deg:60};
    const skew=load_scene(c),direct=skew.get_crystal_direction('sample',[1,0,0],'direct','C').vector,normal=skew.get_crystal_direction('sample',[1,0,0],'reciprocal','C').vector;
    close(direct,[1,0,0],1e-10);close(normal,[Math.sqrt(3)/2,-.5,0],1e-10);
    expect(angle(direct,normal)).toBeCloseTo(30,9);
  });
  it('V08: parallel/antiparallel and orbit geometry',()=>{
    const s=load_scene(example_config());
    for(const sign of [1,-1]){
      const a=s.get_zone_axis_alignment('sample',[0,0,sign],'rotary');
      expect(a.aligned).toBe(true);expect(a.axis_error_deg).toBeLessThan(1e-8);expect(a.signed_dot).toBeCloseTo(sign,10);
    }
    s.set_joint_value('xy.x',1);
    for(const phi of [0,30,90,180]){
      s.set_joint_value('rotary.phi',phi);
      expect(s.get_zone_axis_alignment('sample',[0,0,1],'rotary').point_distance_mm).toBeCloseTo(1,9);
    }
    const c=example_config(),half=15*Math.PI/180;
    c.experiment_state.samples.sample.orientation_quaternion_xyzw=[Math.sin(half),0,0,Math.cos(half)];
    const tilted=load_scene(c),before=tilted.get_crystal_direction('sample',[0,0,1]).vector;
    expect(tilted.get_zone_axis_alignment('sample',[0,0,1],'rotary').axis_error_deg).toBeCloseTo(30,9);
    tilted.set_joint_value('rotary.phi',90);
    expect(angle(before,tilted.get_crystal_direction('sample',[0,0,1]).vector)).toBeCloseTo(Math.acos(.75)*180/Math.PI,9);
  });
});
describe('configuration and atomic state (V09/V10)',()=>{
  const invalidCases:[string,(c:any)=>void][]=[
    ['missing field',c=>delete c.assembly],
    ['bad unit',c=>c.assembly.joints[0].unit='rad'],
    ['unknown output frame',c=>c.devices.devices[0].output_frame='missing'],
    ['duplicate frame',c=>c.assembly.frames.push(c.assembly.frames[0])],
    ['crystal frame collides with LAB',c=>c.devices.devices.find((d:any)=>d.id==='sample').crystal.frame='LAB'],
    ['crystal frame collides with assembly frame',c=>c.devices.devices.find((d:any)=>d.id==='sample').crystal.frame='S'],
    ['duplicate crystal frame',c=>{const sample=structuredClone(c.devices.devices.find((d:any)=>d.id==='sample'));sample.id='second_sample';c.devices.devices.unshift(sample);c.experiment_state.samples.second_sample=structuredClone(c.experiment_state.samples.sample);}],
    ['non-sample crystal definition',c=>c.devices.devices.find((d:any)=>d.id==='sample').type='fixture'],
    ['unknown parent',c=>c.assembly.frames[0].parent='missing'],
    ['cycle',c=>c.assembly.frames[0].parent='H1'],
    ['zero axis',c=>c.assembly.frames[0].motion.axis=[0,0,0]],
    ['collinear XY',c=>c.assembly.frames.find((f:any)=>f.id==='P2').motion.axes=[[1,0,0],[2,0,0]]],
    ['nonunit quat',c=>c.assembly.frames[0].mount.quaternion_xyzw=[0,0,0,2]],
    ['invalid cell',c=>c.devices.devices.find((d:any)=>d.id==='sample').crystal.cell.gamma_deg=0],
    ['overflowing cell',c=>c.devices.devices.find((d:any)=>d.id==='sample').crystal.cell.c=1e308],
    ['impossible cell',c=>{const cell=c.devices.devices.find((d:any)=>d.id==='sample').crystal.cell;cell.alpha_deg=10;cell.beta_deg=10;cell.gamma_deg=170;}],
    ['zero target',c=>c.experiment_state.samples.sample.target_indices=[0,0,0]],
    ['NaN',c=>c.experiment_state.joints['xy.x']=NaN],
    ['Infinity',c=>c.experiment_state.joints['xy.x']=Infinity],
    ['unknown convention',c=>c.assembly.frames.find((f:any)=>f.id==='H1').motion.rotation_convention='unknown'],
    ['beam on moving frame',c=>c.assembly.beam.frame='S'],
    ['beam not along LAB +Z',c=>c.assembly.beam.direction=[1,0,0]],
    ['detector attached to moving stage',c=>c.assembly.frames.find((f:any)=>f.id==='D').parent='H1'],
    ['detector missing pixel metadata',c=>delete c.devices.devices.find((d:any)=>d.id==='detector').detector],
    ['hexapod detached from rotary',c=>c.assembly.frames.find((f:any)=>f.id==='H0').parent='LAB'],
    ['theta detached from hexapod',c=>c.assembly.frames.find((f:any)=>f.id==='P0').parent='H0'],
    ['XY detached from theta',c=>c.assembly.frames.find((f:any)=>f.id==='P2').parent='H1'],
    ['integrated XY references unknown theta',c=>c.devices.devices.find((d:any)=>d.id==='xy').integrated_into='missing'],
    ['integration on non-XY device',c=>c.devices.devices.find((d:any)=>d.id==='rotary').integrated_into='theta'],
    ['integration references non-theta device',c=>c.devices.devices.find((d:any)=>d.id==='xy').integrated_into='hexapod'],
    ['integrated XY base off theta center',c=>c.assembly.frames.find((f:any)=>f.id==='P2').mount.position_mm=[1,0,0]],
    ['sample detached from XY',c=>c.assembly.frames.find((f:any)=>f.id==='S').parent='P1'],
    ['unknown joint',c=>c.experiment_state.joints.unknown=0],
    ['unbound joint',c=>{c.assembly.joints.push({id:'extra',unit:'mm'});c.experiment_state.joints.extra=0;}],
  ];
  it.each(invalidCases)('V09 rejects %s without modifying active state',(_,mutate)=>{
    const s=load_scene(example_config()),before=s.save_state(),c=s.save_state();mutate(c);
    code(()=>s.restore_state(c));expect(s.revision).toBe(0);expect(s.save_state()).toEqual(before);
  });
  it('V09 rejects limits, invalid IDs and wrong query types',()=>{
    const c=example_config();c.assembly.joints.find(j=>j.id==='xy.x')!.limits=[-1,1];
    const s=load_scene(c);code(()=>s.set_joint_value('xy.x',2));expect(s.revision).toBe(0);
    code(()=>s.set_joint_value('unknown',1),'UNKNOWN_JOINT');
    code(()=>s.get_crystal_direction('sample',[0,0,0]));
    code(()=>s.get_crystal_direction('sample',[1,0,0],'bad' as any),'INVALID_DIRECTION_TYPE');
    code(()=>s.get_frame_transform('missing','LAB'),'UNKNOWN_FRAME');
  });
  it.each(['before sample','after sample','reversed'])('V09/V10 resolves crystal-bound fixtures regardless of device order: %s',order=>{
    const c=example_config();
    c.devices.devices.push({id:'crystal_fixture',type:'fixture',output_frame:'C',visual:{shape:'box',size_mm:[1,1,1],color:'#ffffff'},provenance:'synthetic'});
    if(order==='before sample')c.devices.devices.unshift(c.devices.devices.pop()!);
    if(order==='reversed')c.devices.devices.reverse();
    c.experiment_state.joints['rotary.phi']=90;
    c.experiment_state.samples.sample.orientation_quaternion_xyzw=[0,0,Math.SQRT1_2,Math.SQRT1_2];
    const s=load_scene(c);
    close(s.get_world_position('crystal_fixture').position,[0,200,0]);
    close(apply(s.get_world_transform('crystal_fixture').matrix,[1,0,0]),[-1,200,0]);
    s.set_joint_value('theta.angle',90);
    close(apply(s.get_world_transform('crystal_fixture').matrix,[1,0,0]),[0,200,1]);
    const snapshot=s.save_state();snapshot.devices.devices.reverse();
    s.restore_state(snapshot);
    close(apply(s.get_world_transform('crystal_fixture').matrix,[1,0,0]),[0,200,1]);
    expect(s.revision).toBe(2);
  });
  it('V09 permits fixed support/shim frames without changing motion inheritance',()=>{
    const c=example_config();
    c.assembly.frames.push({id:'detector_support',parent:'LAB',mount:{position_mm:[10,20,30],quaternion_xyzw:[0,0,0,1]},motion:{kind:'fixed'}});
    frame(c,'D').parent='detector_support';
    for(const [id,parent,child]of [['base_shim','R','H0'],['theta_shim','P1','P2'],['sample_holder','P2','S']]){
      c.assembly.frames.push({id,parent,mount:{position_mm:[0,0,0],quaternion_xyzw:[0,0,0,1]},motion:{kind:'fixed'}});
      frame(c,child).parent=id;
    }
    const s=load_scene(c);s.set_joint_value('rotary.phi',90);s.set_joint_value('theta.angle',90);
    close(s.get_world_position('detector').position,[10,220,1030]);
    close(s.get_sample_point('sample').position,[0,200,0]);
  });
  it('V05/V09 integrated XYtheta preserves centered installation while retaining all three joints',()=>{
    const s=load_scene(example_config()),mount=frame(s.save_state(),'P2').mount;
    s.set_platform_pose('hexapod',{translation_mm:[2,3,4],rotation_deg:[12,23,34]});s.set_joint_value('rotary.phi',57);
    const base=apply(s.get_frame_transform('LAB','P1').matrix,[0,0,0]);
    s.set_joint_value('xy.x',3);s.set_joint_value('xy.y',-2);
    for(const theta of [0,30,90,179]){
      s.set_joint_value('theta.angle',theta);
      close(apply(s.get_frame_transform('LAB','P1').matrix,[0,0,0]),base);
      expect(s.get_point_to_axis_distance({frame:'LAB',position_mm:s.get_sample_point('sample','center').position},s.get_axis('theta')).distance_mm).toBeCloseTo(Math.sqrt(13),9);
      expect(frame(s.save_state(),'P2').mount).toEqual(mount);
      expect(s.save_state().devices.devices.find(d=>d.id==='xy')!.integrated_into).toBe('theta');
    }
  });
  it('V09 integrated XYtheta checks the assembled base through fixed shims',()=>{
    const c=example_config();
    c.assembly.frames.push({id:'xy_shim',parent:'P1',mount:{position_mm:[4,0,0],quaternion_xyzw:[0,0,Math.SQRT1_2,Math.SQRT1_2]},motion:{kind:'fixed'}});
    frame(c,'P2').parent='xy_shim';frame(c,'P2').mount.position_mm=[0,4,0];
    const s=load_scene(c);s.set_joint_value('theta.angle',90);close(s.get_sample_point('sample').position,[0,200,0]);
    frame(c,'P2').mount.position_mm=[0,3,0];code(()=>s.restore_state(c),'INVALID_CONFIG');
    expect(s.revision).toBe(1);close(s.get_sample_point('sample').position,[0,200,0]);
  });
  it('V09 integrated XYtheta centers on the actual rotation axis rather than the theta frame origin',()=>{
    const c=example_config(),motion=frame(c,'P1').motion;if(motion.kind!=='revolute')throw Error();
    motion.center_mm=[5,6,0];frame(c,'P2').mount.position_mm=[5,6,0];
    const s=load_scene(c);s.set_joint_value('theta.angle',90);close(s.get_sample_point('sample').position,[5,200,-6]);
    s.set_joint_value('xy.x',1);close(s.get_sample_point('sample').position,[5,200,-7]);
  });
  it('V09 preserves legacy standalone XY mounts when integration is not declared',()=>{
    const c=example_config();delete c.devices.devices.find(d=>d.id==='xy')!.integrated_into;
    frame(c,'P2').mount.position_mm=[3,0,0];
    close(load_scene(c).get_sample_point('sample').position,[3,200,0]);
  });
  it('V10 round-trips all configuration and guards returned copies',()=>{
    const s=load_scene(example_config());s.set_platform_pose('hexapod',{translation_mm:[1,2,3],rotation_deg:[4,5,6]});
    const snapshot=s.save_state(),original=s.get_world_transform('sample').matrix;
    const modified=s.save_state();frame(modified,'P0').mount.position_mm=[7,8,9];
    modified.devices.devices.find(d=>d.id==='sample')!.crystal!.cell.a=3.7;
    modified.experiment_state.samples.sample.orientation_quaternion_xyzw=[0,0,Math.SQRT1_2,Math.SQRT1_2];
    s.restore_state(modified);s.restore_state(snapshot);expect(s.save_state()).toEqual(snapshot);close(s.get_world_transform('sample').matrix,original);
    s.get_world_transform('sample').matrix[0]=99;s.save_state().assembly.frames[0].mount.position_mm[0]=99;
    close(s.get_world_transform('sample').matrix,original);
  });
});
describe('bounded snapshot comparison (V13)',()=>{
  it('same state has zero differences, q/-q equivalent',()=>{
    const a=example_config(),b=structuredClone(a);
    b.experiment_state.samples.sample.orientation_quaternion_xyzw=[0,0,0,-1];
    const d=compare_states(a,b);
    expect(d.configuration_changed).toBe(false);
    for(const v of Object.values(d.joint_delta))expect(v.delta).toBe(0);
    for(const v of Object.values(d.device_delta)){close(v.translation_delta_lab_mm,[0,0,0]);expect(v.rotation_delta_deg).toBeLessThan(1e-8);}
    expect(d.sample_delta.sample.crystal_rotation_delta_deg).toBeLessThan(1e-8);
  });
  it('B-A local X gives +1 LAB X; outer phi preserves zone axis but rotates full crystal',()=>{
    const a=example_config(),b=structuredClone(a);b.experiment_state.joints['xy.x']=1;
    const d=compare_states(a,b);expect(d.joint_delta['xy.x'].delta).toBe(1);close(d.device_delta.sample.translation_delta_lab_mm,[1,0,0]);
    expect(d.sample_delta.sample.direction_delta_deg).toBeLessThan(1e-8);
    b.experiment_state.joints['xy.x']=0;b.experiment_state.joints['rotary.phi']=90;
    const p=compare_states(a,b);expect(p.device_delta.sample.rotation_delta_deg).toBeCloseTo(90,9);
    expect(p.sample_delta.sample.direction_delta_deg).toBeLessThan(1e-8);close(p.device_delta.detector.translation_delta_lab_mm,[0,0,0]);
  });
  it('R_SC spin around target is not a false zero change',()=>{
    const a=example_config(),b=structuredClone(a);b.experiment_state.samples.sample.orientation_quaternion_xyzw=[0,0,Math.SQRT1_2,Math.SQRT1_2];
    const d=compare_states(a,b);
    expect(d.sample_delta.sample.crystal_rotation_delta_deg).toBeCloseTo(90,9);
    expect(d.sample_delta.sample.direction_delta_deg).toBeLessThan(1e-8);
    expect(d.device_delta.sample.rotation_delta_deg).toBeLessThan(1e-8);
  });
  it('target changes, configuration changes and display changes remain distinct',()=>{
    const a=example_config(),b=structuredClone(a);b.experiment_state.samples.sample.target_indices=[1,0,0];
    let d=compare_states(a,b);expect(d.sample_delta.sample.target_changed).toBe(true);expect(d.sample_delta.sample.direction_delta_deg).toBe(null);
    b.experiment_state.samples.sample.target_indices=[0,0,1];b.devices.devices[0].visual.size_mm[0]+=1;b.experiment_state.display.frames=false;
    d=compare_states(a,b);expect(d.configuration_changed).toBe(true);expect(d.display_changed).toBe(true);
  });
  it('topology mismatch is rejected and comparison leaves active revision unchanged',()=>{
    const a=example_config(),b=structuredClone(a),s=load_scene(a);
    b.assembly.joints.find(j=>j.id==='xy.x')!.id='xy.other';
    const xy=frame(b,'P2').motion;if(xy.kind==='xy_translation')xy.joints[0]='xy.other';
    delete b.experiment_state.joints['xy.x'];b.experiment_state.joints['xy.other']=0;
    code(()=>s.compare_states(a,b),'STATE_TOPOLOGY_MISMATCH');expect(s.revision).toBe(0);expect(s.save_state()).toEqual(a);
  });
});
