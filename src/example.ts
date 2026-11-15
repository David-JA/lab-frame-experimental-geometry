import devices from '../examples/experimental-setup/devices.json';
import assembly from '../examples/experimental-setup/assembly.json';
import experiment_state from '../examples/experimental-setup/experiment_state.json';
import { load_scene, type SceneConfig } from './core';
import { withAprilParameters } from './diffraction/presets';
export const example_config = ():SceneConfig => load_scene({schema_version:1,devices,assembly,experiment_state}).save_state();

// Drawing dimensions, tape-survey installation heights and synthetic parts share one snapshot.
export function lab_height_config():SceneConfig {
  const c=example_config(),device=(id:string)=>c.devices.devices.find(d=>d.id===id)!,frame=(id:string)=>c.assembly.frames.find(f=>f.id===id)!;
  c.assembly.description='实验室高度配置，待复测：台面基础高度670 mm、额外升高0–100 mm，450×450 mm方柱；六轴含转接板350 mm；Z平台取200 mm，六轴Y取+20.5 mm；XYθ总高120 mm。样品中心1378 mm，低于固定光束2 mm，未自动补偿。XYθ内部拆分、样品、pivot与支杆为示意，不是实物标定。';
  const rotary=device('rotary');rotary.visual.size_mm=[450,670,450];rotary.visual.offset_mm=[0,-365,0];
  rotary.elevation={base_mount_y_mm:700,travel_mm:100};
  rotary.description='台面最低离地670 mm，额外可升约100 mm，最高770 mm；升高带动上方装配，光束与探测器固定。';
  frame('R').mount.position_mm=[0,700,0];
  const phi=frame('R').motion;if(phi.kind==='revolute')phi.center_mm=[0,700,0];
  const hexDevice=device('hexapod');hexDevice.visual.size_mm=[348,30,348];hexDevice.visual.upper_disc_size_mm=[260,18.2,260];hexDevice.visual.adapter_thickness_mm=15;
  hexDevice.visual.color='#DDE3E8';
  // User-specified total/widths; the internal 70/20/30 split and motors remain schematic.
  const thetaHeight=70,xyBaseHeight=20,xyMovingHeight=30,xyHeight=xyBaseHeight+xyMovingHeight,sampleHalfHeight=device('sample').visual.size_mm[2]/2;
  const theta=device('theta'),xy=device('xy');
  theta.visual.size_mm=[130,130,thetaHeight];theta.visual.offset_mm=[0,0,-(sampleHalfHeight+xyHeight+thetaHeight/2)];theta.visual.color='#AEB6BC';
  theta.visual.motor_size_mm=[60,42,40];
  xy.visual.size_mm=[80,80,xyMovingHeight];xy.visual.offset_mm=[0,0,-(sampleHalfHeight+xyMovingHeight/2)];xy.visual.color='#D5DADD';
  xy.visual.fixed_base_size_mm=[100,100,xyBaseHeight];xy.visual.motor_size_mm=[40,55,20];
  theta.description='θ圆台直径130 mm；上方固定方底座100×100 mm、移动XY滑台80×80 mm，总高120 mm（不含样品/夹具）。θ70 mm、底座20 mm、滑台30 mm及侧伸电机外壳均为示意；底座随θ旋转但不随XY平移。';
  xy.description='100 mm方底座固定在θ中心；80 mm上层随X/Y平移，底座电机随θ旋转、不随XY平移。分层厚度和电机尺寸为示意。';
  hexDevice.description='图纸本体高320 mm，已含上盘18.2 mm与下盘30 mm；上盘直径260 mm、下盘外径348 mm。另加上下各15 mm转接板，总高350 mm。内部H1仍在上盘中心，不等同于厂图原点；转接板边长、支杆轮廓与连接点为示意。';
  frame('H1').mount.position_mm=[0,295.9,0];
  // Synthetic pivot follows the sample reference with this initial translation; not a controller calibration.
  const hex=frame('H1').motion;if(hex.kind==='six_dof')hex.pivot_mm=[0,657.5,0];
  for(let i=0;i<c.assembly.supports.length;i++){
    const a=i*Math.PI/3,b=a+(i%2?-1:1)*20*Math.PI/180;
    c.assembly.supports[i].base_point_mm=[145*Math.cos(a),15,145*Math.sin(a)];
    c.assembly.supports[i].moving_point_mm=[105*Math.cos(b),-9.1,105*Math.sin(b)];
  }
  c.assembly.frames.push(
    {id:'Z0',parent:'H1',mount:{position_mm:[0,24.1,0],quaternion_xyzw:[-Math.SQRT1_2,0,0,Math.SQRT1_2]},motion:{kind:'fixed'}},
    {id:'Z1',parent:'Z0',mount:{position_mm:[0,0,0],quaternion_xyzw:[0,0,0,1]},motion:{kind:'prismatic',joint:'z_stage.z',axis:[0,0,1]}},
  );
  frame('P0').parent='Z1';frame('P0').mount={position_mm:[0,0,thetaHeight+xyHeight+sampleHalfHeight],quaternion_xyzw:[0,0,0,1]};
  c.devices.devices.push({id:'z_stage',type:'z_stage',output_frame:'Z1',visual:{shape:'box',size_mm:[240,240,12],color:'#252A30'},provenance:'synthetic',description:'连接六轴上转接板与XYθ平台。上下方板240×240 mm，边长按用户要求由120 mm放大两倍；高度指上下安装面间距，可调10–20 cm。板厚和剪叉轮廓为简化示意。'});
  c.assembly.joints.push({id:'z_stage.z',unit:'mm',limits:[100,200]});c.experiment_state.joints['z_stage.z']=200;
  c.experiment_state.joints['hexapod.y']=20.5;
  c.assembly.beam.point_mm=[0,1380,0];frame('D').mount.position_mm=[0,1380,1000];
  return withAprilParameters(load_scene(c).save_state());
}

export function diffraction_demo_config():SceneConfig {
  const c=withAprilParameters(example_config());
  c.experiment_state.joints['rotary.phi']=Math.asin(0.1265/3.59033485)*180/Math.PI;
  c.assembly.description='理想对中衍射示例：合成装配与取向，借用四月能量、探测器和晶格参照；不是实测四月姿态。';
  return load_scene(c).save_state();
}
