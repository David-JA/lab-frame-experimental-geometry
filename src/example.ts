import devices from '../examples/experimental-setup/devices.json';
import assembly from '../examples/experimental-setup/assembly.json';
import experiment_state from '../examples/experimental-setup/experiment_state.json';
import { load_scene, type SceneConfig } from './core';
export const example_config = ():SceneConfig => load_scene({schema_version:1,devices,assembly,experiment_state}).save_state();

// Drawing dimensions, tape-survey installation heights and synthetic parts share one snapshot.
export function lab_height_config():SceneConfig {
  const c=example_config(),device=(id:string)=>c.devices.devices.find(d=>d.id===id)!,frame=(id:string)=>c.assembly.frames.find(f=>f.id===id)!;
  c.assembly.description='六轴图纸本体高320 mm，加上下各15 mm转接板总高350 mm。台面450×450 mm，离地约670 mm，可升约100 mm；光斑离地约1380 mm。Z平台10–20 cm；XYθ、样品、pivot与支杆连接点为示意，未实物标定。';
  const rotary=device('rotary');rotary.visual.size_mm=[450,670,450];rotary.visual.offset_mm=[0,-365,0];
  rotary.elevation={base_mount_y_mm:700,travel_mm:100};
  rotary.description='台面基准离地约670 mm，可升约100 mm；升高时带动整个上方装配，光束与探测器保持固定。';
  frame('R').mount.position_mm=[0,700,0];
  const phi=frame('R').motion;if(phi.kind==='revolute')phi.center_mm=[0,700,0];
  const hexDevice=device('hexapod');hexDevice.visual.size_mm=[348,30,348];hexDevice.visual.upper_disc_size_mm=[260,18.2,260];hexDevice.visual.adapter_thickness_mm=15;
  hexDevice.visual.color='#DDE3E8';
  device('theta').visual.color='#3E817B';device('xy').visual.color='#87B9AC';
  hexDevice.description='图纸本体高320 mm，已含上盘18.2 mm与下盘30 mm；上盘直径260 mm、下盘外径348 mm。另加上下各15 mm转接板，总高350 mm。内部H1仍在上盘中心，不等同于厂图原点；转接板边长、支杆轮廓与连接点为示意。';
  frame('H1').mount.position_mm=[0,295.9,0];
  const hex=frame('H1').motion;if(hex.kind==='six_dof')hex.pivot_mm=[0,680,0];
  for(let i=0;i<c.assembly.supports.length;i++){
    const a=i*Math.PI/3,b=a+(i%2?-1:1)*20*Math.PI/180;
    c.assembly.supports[i].base_point_mm=[145*Math.cos(a),15,145*Math.sin(a)];
    c.assembly.supports[i].moving_point_mm=[105*Math.cos(b),-9.1,105*Math.sin(b)];
  }
  c.assembly.frames.push(
    {id:'Z0',parent:'H1',mount:{position_mm:[0,24.1,0],quaternion_xyzw:[-Math.SQRT1_2,0,0,Math.SQRT1_2]},motion:{kind:'fixed'}},
    {id:'Z1',parent:'Z0',mount:{position_mm:[0,0,0],quaternion_xyzw:[0,0,0,1]},motion:{kind:'prismatic',joint:'z_stage.z',axis:[0,0,1]}},
  );
  frame('P0').parent='Z1';frame('P0').mount={position_mm:[0,0,39.5],quaternion_xyzw:[0,0,0,1]};
  c.devices.devices.push({id:'z_stage',type:'z_stage',output_frame:'Z1',visual:{shape:'box',size_mm:[120,120,12],color:'#252A30'},provenance:'synthetic',description:'连接六轴上转接板与XYθ平台。高度指上下安装面间距，可调10–20 cm；横向尺寸与剪叉轮廓为简化示意。'});
  c.assembly.joints.push({id:'z_stage.z',unit:'mm',limits:[100,200]});c.experiment_state.joints['z_stage.z']=150;
  c.assembly.beam.point_mm=[0,1380,0];frame('D').mount.position_mm=[0,1380,1000];
  return load_scene(c).save_state();
}
