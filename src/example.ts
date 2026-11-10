import devices from '../examples/experimental-setup/devices.json';
import assembly from '../examples/experimental-setup/assembly.json';
import experiment_state from '../examples/experimental-setup/experiment_state.json';
import { load_scene, type SceneConfig } from './core';
export const example_config = ():SceneConfig => load_scene({schema_version:1,devices,assembly,experiment_state}).save_state();

// Tape-survey dimensions and synthetic component widths share the existing snapshot format.
export function lab_height_config():SceneConfig {
  const c=example_config(),device=(id:string)=>c.devices.devices.find(d=>d.id===id)!,frame=(id:string)=>c.assembly.frames.find(f=>f.id===id)!;
  c.assembly.description='实验室卷尺粗测：光斑离地约1380 mm，台面约670 mm，可升约100 mm；六轴含两块各15 mm转接板总高约460 mm。Z平台高度10–20 cm。横向尺寸、XYθ、样品及pivot为示意，未实物标定。';
  const rotary=device('rotary');rotary.visual.size_mm[1]=670;rotary.visual.offset_mm=[0,-356,0];
  rotary.elevation={base_mount_y_mm:691,travel_mm:100};
  rotary.description='台面基准离地约670 mm，可升约100 mm；升高时带动整个上方装配，光束与探测器保持固定。';
  frame('R').mount.position_mm=[0,691,0];
  const phi=frame('R').motion;if(phi.kind==='revolute')phi.center_mm=[0,691,0];
  device('hexapod').visual.adapter_thickness_mm=15;
  device('hexapod').description='上下转接板外表面间距约460 mm，包含两块各15 mm转接板；圆盘厚度与支杆连接点沿用示意尺寸。';
  frame('H1').mount.position_mm=[0,418,0];
  const hex=frame('H1').motion;if(hex.kind==='six_dof')hex.pivot_mm=[0,689,0];
  c.assembly.frames.push(
    {id:'Z0',parent:'H1',mount:{position_mm:[0,21,0],quaternion_xyzw:[-Math.SQRT1_2,0,0,Math.SQRT1_2]},motion:{kind:'fixed'}},
    {id:'Z1',parent:'Z0',mount:{position_mm:[0,0,0],quaternion_xyzw:[0,0,0,1]},motion:{kind:'prismatic',joint:'z_stage.z',axis:[0,0,1]}},
  );
  frame('P0').parent='Z1';frame('P0').mount={position_mm:[0,0,39.5],quaternion_xyzw:[0,0,0,1]};
  c.devices.devices.push({id:'z_stage',type:'z_stage',output_frame:'Z1',visual:{shape:'box',size_mm:[120,120,12],color:'#252A30'},provenance:'synthetic',description:'连接六轴上转接板与XYθ平台。高度指上下安装面间距，可调10–20 cm；横向尺寸与剪叉轮廓为简化示意。'});
  c.assembly.joints.push({id:'z_stage.z',unit:'mm',limits:[100,200]});c.experiment_state.joints['z_stage.z']=150;
  c.assembly.beam.point_mm=[0,1380,0];frame('D').mount.position_mm=[0,1380,1000];
  return load_scene(c).save_state();
}
