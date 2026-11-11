import { describe, it, expect } from 'vitest';
import { detectorSupport, withDetectorSupport, withDetectorSupportPosition, load_scene, type SceneConfig, type Vec3 } from '../src/core';
import { example_config, lab_height_config, diffraction_demo_config } from '../src/example';
import { defaultDiffraction, excite, enumerateReflections, projectRay, detectorPanel, illumination, sampleSegment, DiffractionModel, HC_KEV_A } from '../src/diffraction/model';
import { aprilPanelPose, detectorNormalDistance, withDefaultDiffractionParameters, withAprilParameters } from '../src/diffraction/presets';

function close(a:number[],b:number[],eps=1e-7){a.forEach((v,i)=>expect(Math.abs(v-b[i])).toBeLessThan(eps));}
function cylinderFixture(tilt=0):SceneConfig {
  const c=example_config(),s=c.assembly.frames.find(f=>f.id==='S')!;
  // Existing P2 rotates -90 degrees around X; make the physical S cylinder axis LAB Z at tilt=0.
  const angle=(90+tilt)*Math.PI/360;s.mount.quaternion_xyzw=[Math.sin(angle),0,0,Math.cos(angle)];
  c.diffraction=defaultDiffraction(c)!;c.diffraction.sample_shape={kind:'cylinder',size_mm:[2,2,3]};c.diffraction.beam_size_mm=[4,4];return c;
}
describe('LAB-aligned detector support and calibrated panel',()=>{
  it('moves only support X/Z and preserves a tilted, offset panel mount',()=>{
    const c=lab_height_config(),support=detectorSupport(c,'detector')!,panel=c.assembly.frames.find(f=>f.id==='D')!;
    panel.mount={position_mm:[12,-6,25],quaternion_xyzw:[0,Math.sin(Math.PI/12),0,Math.cos(Math.PI/12)]};
    const inputCopy=structuredClone(c),before=load_scene(c),original=before.save_state(),oldPanel=detectorPanel(before,'detector');
    const moved=withDetectorSupportPosition(c,'detector',{x_mm:support.frame.mount.position_mm[0]+40,z_mm:support.frame.mount.position_mm[2]+100});
    const after=load_scene(moved),newPanel=detectorPanel(after,'detector');
    close(newPanel.center,oldPanel.center.map((v,i)=>v+[40,0,100][i]),1e-9);close(newPanel.normal,[.5,0,Math.sqrt(3)/2],1e-12);
    const movedMount=moved.assembly.frames.find(f=>f.id==='D')!.mount;
    expect(movedMount.position_mm).toEqual(panel.mount.position_mm);close(movedMount.quaternion_xyzw,panel.mount.quaternion_xyzw,1e-12);
    expect(moved.assembly.frames.filter(f=>f.id!==support.frame.id&&f.id!=='D')).toEqual(original.assembly.frames.filter(f=>f.id!==support.frame.id&&f.id!=='D'));
    expect(moved.experiment_state).toEqual(original.experiment_state);expect(c).toEqual(inputCopy);
    close(after.get_sample_point('sample').position,before.get_sample_point('sample').position,1e-10);
    expect(detectorNormalDistance(moved,'detector')-detectorNormalDistance(c,'detector')).toBeCloseTo(20+100*Math.sqrt(3)/2,9);
    expect(load_scene(JSON.parse(JSON.stringify(moved))).save_state()).toEqual(moved);
  });
  it('upgrades legacy LAB/shared/child frames without moving other objects or mutating the input',()=>{
    for(const mode of ['LAB','shared','child']){
      const c=example_config(),d=c.devices.devices.find(d=>d.id==='detector')!;
      if(mode==='LAB')d.output_frame='LAB';
      const other=structuredClone(d);other.id='other_detector';c.devices.devices.push(other);
      if(mode==='child')c.assembly.frames.push({id:'detector_child',parent:'D',mount:{position_mm:[3,4,5],quaternion_xyzw:[0,0,0,1]},motion:{kind:'fixed'}});
      c.assembly.frames.push({id:d.output_frame+'_support',parent:'LAB',mount:{position_mm:[1,2,3],quaternion_xyzw:[0,0,0,1]},motion:{kind:'fixed'}});
      c.devices.devices.push({id:'detector_support',type:'fixture',output_frame:'LAB',visual:{shape:'box',size_mm:[1,1,1],color:'#888888'},provenance:'synthetic'});
      const before=load_scene(c),original=before.save_state(),upgraded=withDetectorSupport(c,'detector'),support=detectorSupport(upgraded,'detector')!;
      close(load_scene(upgraded).get_world_transform('detector').matrix,before.get_world_transform('detector').matrix,1e-9);
      expect(withDetectorSupport(upgraded,'detector')).toEqual(upgraded);expect(c).toEqual(original);
      const moved=withDetectorSupportPosition(upgraded,'detector',{x_mm:support.frame.mount.position_mm[0]+17,z_mm:support.frame.mount.position_mm[2]+80}),after=load_scene(moved);
      close(after.get_world_position('other_detector').position,before.get_world_position('other_detector').position,1e-9);
      close(after.get_world_position('detector').position,before.get_world_position('detector').position.map((v,i)=>v+[17,0,80][i]),1e-9);
      if(mode==='child')close(after.get_frame_transform('LAB','detector_child').matrix,before.get_frame_transform('LAB','detector_child').matrix,1e-9);
    }
  });
  it('keeps old snapshots unchanged and rejects support axes that are not LAB aligned',()=>{
    const legacy=example_config();expect(load_scene(JSON.parse(JSON.stringify(legacy))).save_state()).toEqual(legacy);
    expect(detectorSupport(legacy,'detector')).toBeUndefined();
    for(const change of ['rotation','parent']){
      const c=lab_height_config(),f=detectorSupport(c,'detector')!.frame;
      if(change==='rotation')f.mount.quaternion_xyzw=[0,Math.sin(.1),0,Math.cos(.1)];else f.parent='R';
      expect(()=>load_scene(c)).toThrow('LAB-aligned');
    }
  });
  it('preserves mechanical positioning and calibration on preview reset, while an explicit calibration preserves support X/Z',()=>{
    const c=lab_height_config(),support=detectorSupport(c,'detector')!;
    support.frame.mount.position_mm[0]+=37;support.frame.mount.position_mm[2]+=100;
    const f=c.assembly.frames.find(f=>f.id==='D')!;f.mount={position_mm:[12,-6,25],quaternion_xyzw:[0,Math.sin(.1),0,Math.cos(.1)]};
    const reset=withDefaultDiffractionParameters(c);expect(reset.assembly).toEqual(c.assembly);expect(reset.experiment_state).toEqual(c.experiment_state);
    expect(reset.devices.devices.find(d=>d.id==='detector')).toEqual(c.devices.devices.find(d=>d.id==='detector'));
    const calibrated=withAprilParameters(c);expect(detectorSupport(calibrated,'detector')!.frame).toEqual(support.frame);
    const panel=detectorPanel(load_scene(calibrated),'detector');close(panel.center,[47.121992294674304,1373.96699562071,support.frame.mount.position_mm[2]],1e-8);
  });
});

describe('panel calibration isolation',()=>{
  it('recalibrates one supported panel without moving shared devices or child frames',()=>{
    const c=lab_height_config(),d=c.devices.devices.find(d=>d.id==='detector')!,f=c.assembly.frames.find(f=>f.id===d.output_frame)!;
    f.mount={position_mm:[30,40,50],quaternion_xyzw:[0,Math.sin(.1),0,Math.cos(.1)]};
    const other=structuredClone(d);other.id='other_detector';c.devices.devices.push(other);
    c.assembly.frames.push({id:'panel_child',parent:f.id,mount:{position_mm:[3,4,5],quaternion_xyzw:[0,0,0,1]},motion:{kind:'fixed'}});
    const before=load_scene(c),calibrated=withAprilParameters(c),after=load_scene(calibrated);
    expect(calibrated.devices.devices.find(d=>d.id==='detector')!.output_frame).not.toBe(f.id);
    close(after.get_world_transform('other_detector').matrix,before.get_world_transform('other_detector').matrix,1e-10);
    close(after.get_frame_transform('LAB','panel_child').matrix,before.get_frame_transform('LAB','panel_child').matrix,1e-10);
    const support=detectorSupport(calibrated,'detector')!;expect(support.frame).toEqual(detectorSupport(c,'detector')!.frame);
    const moved=withDetectorSupportPosition(calibrated,'detector',{x_mm:support.frame.mount.position_mm[0]+40,z_mm:support.frame.mount.position_mm[2]+100});
    close(load_scene(moved).get_world_position('other_detector').position,after.get_world_position('other_detector').position.map((v,i)=>v+[40,0,100][i]),1e-9);
  });
});

describe('diffraction numerical contracts DP01–DP06',()=>{
  it('uses reciprocal diameter, no 2pi, and a fixed excitation weight',()=>{
    const g:Vec3=[Math.sqrt(3)/2,0,-0.5],e=excite(g,1,0.02);
    expect(e.error_invA).toBeCloseTo(0,13);expect(e.weight).toBeCloseTo(1,12);close(e.direction_lab,[Math.sqrt(3)/2,0,0.5]);
    expect(excite([0,0,0.005],1,0.02).weight).toBeCloseTo(0.75,10);
    expect(excite([0,0,0.02],1,0.02).weight).toBe(0);
    // Same physical diameter: 0.06 nm^-1 = 0.006 A^-1, internally radius 0.003 A^-1.
    expect(excite([0,0,0.0015],1,0.06/10).weight).toBeCloseTo(0.75,10);
  });
  it('keeps reciprocal magnitudes and enforces FCC parity including negative indices',()=>{
    const c={a:4,b:4,c:4,alpha_deg:90,beta_deg:90,gamma_deg:90},all=enumerateReflections(c,2,'fcc');
    expect(all.find(r=>r.hkl.join()==='2,0,0')!.d_A).toBeCloseTo(2,12);
    expect(all.some(r=>r.hkl.join()==='1,0,0'||r.hkl.join()==='1,1,0')).toBe(false);
    expect(all.some(r=>r.hkl.join()==='-1,1,-1')).toBe(true);
    // Independent reciprocal for gamma=60 degrees, a=b=4, c=5: (100) magnitude=1/(4*sin60).
    const skew=enumerateReflections({...c,c:5,gamma_deg:60},1,'primitive').find(r=>r.hkl.join()==='1,0,0')!;
    expect(skew.d_A).toBeCloseTo(4*Math.sin(Math.PI/3),12);
  });
  it('projects an arbitrary source, respects half-pixel edges and rejects backwards/parallel rays',()=>{
    const panel={center:[0,0,1000] as Vec3,x:[1,0,0] as Vec3,y:[0,1,0] as Vec3,normal:[0,0,1] as Vec3,pixels:[100,100] as [number,number],pixel_size_mm:[1,1] as [number,number]};
    const h=projectRay(panel,[10,20,0],[0,0,1])!;close(h.point_lab_mm,[10,20,1000]);expect(h.u).toBe(59.5);expect(h.v).toBe(29.5);
    expect(projectRay(panel,[0,0,0],[1,0,0])).toBeUndefined();expect(projectRay(panel,[0,0,0],[0,0,-1])).toBeUndefined();
    expect(projectRay(panel,[-50,0,0],[0,0,1])!.on_panel).toBe(true);expect(projectRay(panel,[50,0,0],[0,0,1])!.on_panel).toBe(false);
  });
  it('matches the independent PWA PoniPlane fixture, not a production roundtrip',()=>{
    // Frozen from PWA 12f8c493 scripts/tools/_g0_poni_comparator.py and calibration/calibration.poni.
    const c=lab_height_config();c.assembly.beam.point_mm=[0,0,0];const m=aprilPanelPose([0,0,0]),f=c.assembly.frames.find(f=>f.id==='D')!;
    // Verify world fixture in original lab_height scene (anchor=beam Y1380).
    const s=load_scene(lab_height_config()),panel=detectorPanel(s,'detector');
    close(panel.center,[10.121992294674304,1373.96699562071,1283.917156078967],1e-8);
    close(panel.x,[0.999998848777996,-6.542926218378991e-7,0.0015173800626388887],1e-12);
    close(panel.y,[-6.542926214684745e-7,0.9999996281352916,0.000862397153476635],1e-12);
    const hit=projectRay(panel,[10,1400,0],[0.03,-0.01,1])!;
    close(hit.point_lab_mm,[48.51960393035996,1387.1601320232133,1283.9867976786652],1e-6);
    expect(hit.u).toBeCloseTo(2527.4766447211337,7);expect(hit.v).toBeCloseTo(2011.56833568115,7);
    close(panel.center.map((v,i)=>v-214.35*panel.x[i]+214.35*panel.y[i]),[-204.22790118851256,1588.3170561591331,1283.7767604923882],1e-6);
    expect(m[3]).toBeCloseTo(10.121992294674304,8);expect(f.parent).toBe(detectorSupport(c,'detector')!.frame.id);
    const baseline=lab_height_config();expect(detectorNormalDistance(baseline,'detector')).toBeCloseTo(1283.9050444983084,8);
    const support=detectorSupport(baseline,'detector')!.frame;
    const moved=withDetectorSupportPosition(baseline,'detector',{x_mm:support.mount.position_mm[0],z_mm:support.mount.position_mm[2]+100}),p2=detectorPanel(load_scene(moved),'detector');
    close(p2.normal,panel.normal,1e-12);close(p2.center,[panel.center[0],panel.center[1],panel.center[2]+100],1e-8);
    expect(detectorNormalDistance(moved,'detector')).toBeCloseTo(1283.9050444983084+100*panel.normal[2],8);
  });
  it('integrates fully illuminated cylinders and boxes and handles tangent/disjoint segments',()=>{
    const c=cylinderFixture(),s=load_scene(c),p=c.diffraction!,lit=illumination(s,p,128);
    expect(lit.status).toBe('lit');expect(lit.volume_mm3/(3*Math.PI)).toBeCloseTo(1,2);close(lit.centroid_lab_mm!,[0,200,0],1e-9);
    p.sample_shape.kind='box';expect(illumination(s,p,64).volume_mm3).toBeCloseTo(12,9);
    expect(sampleSegment([1,0,0],[0,0,1],{kind:'cylinder',size_mm:[2,2,3]})).toBeUndefined();
    p.beam_size_mm=[0.2,0.2];c.assembly.beam.point_mm=[20,200,0];expect(illumination(load_scene(c),p).status).toBe('outside');
    const thin=cylinderFixture();thin.diffraction!.sample_shape.size_mm=[0.0001,0.0001,0.01];
    expect(illumination(load_scene(thin),thin.diffraction!,128).status).toBe('unresolved');
    const tilted=cylinderFixture(-30);tilted.diffraction!.sample_shape.kind='box';
    const box=illumination(load_scene(tilted),tilted.diffraction!,128);expect(Math.abs(box.volume_mm3-12)).toBeLessThan(0.02);close(box.centroid_lab_mm!,[0,200,0],1e-9);
  });
  it('checks tilted eccentric finite cylinder with an independent volume-grid oracle including caps',()=>{
    const c=cylinderFixture(-30),f=c.assembly.frames.find(f=>f.id==='S')!;f.mount.position_mm=[0.65,0,0.3];
    const p=c.diffraction!;p.beam_size_mm=[1.6,1.4];const s=load_scene(c),actual=illumination(s,p,128);
    // Independent Cartesian voxel integration over S, not beam rays or sampleSegment.
    const a=-Math.PI/6,cos=Math.cos(a),sin=Math.sin(a),n=180,step=[2/n,2/n,3/n];let count=0,sx=0,sy=0,sz=0;
    for(let i=0;i<n;i++)for(let j=0;j<n;j++){
      const x=-1+(i+0.5)*step[0],y=-1+(j+0.5)*step[1];if(x*x+y*y>=1)continue;
      for(let k=0;k<n;k++){
        const z=-1.5+(k+0.5)*step[2],wx=x+0.65,wy=200.3+cos*y-sin*z,wz=sin*y+cos*z;
        if(Math.abs(wx)<0.8&&Math.abs(wy-200)<0.7){count++;sx+=wx;sy+=wy;sz+=wz;}
      }
    }
    const volume=count*step[0]*step[1]*step[2];expect(Math.abs(actual.volume_mm3/volume-1)).toBeLessThan(0.02);
    close(actual.centroid_lab_mm!,[sx/count,sy/count,sz/count],0.01);
    // Changing crystal orientation leaves the mechanical illumination unchanged.
    c.experiment_state.samples.sample.orientation_quaternion_xyzw=[0,Math.SQRT1_2,0,Math.SQRT1_2];
    expect(illumination(load_scene(c),p,128)).toEqual(actual);
  });
  it('roundtrips optional configuration, rejects explicit bad settings atomically, and preserves legacy ambiguity',()=>{
    const legacy=example_config(),s=load_scene(legacy);expect(s.save_state().diffraction).toBeUndefined();expect(defaultDiffraction(legacy)).toBeDefined();
    legacy.devices.devices.find(d=>d.crystal)!.crystal!.cell.gamma_deg=70;
    expect(defaultDiffraction(load_scene(legacy).save_state())!.reflection_model).toBe('primitive');
    const empty=example_config();empty.devices.devices=empty.devices.devices.filter(d=>!d.crystal&&!d.detector);empty.experiment_state.samples={};
    expect(defaultDiffraction(load_scene(empty).save_state())).toBeUndefined();
    const multi=example_config(),copy=structuredClone(multi.devices.devices.find(d=>d.crystal)!);copy.id='sample2';copy.crystal!.frame='C2';multi.devices.devices.push(copy);multi.experiment_state.samples.sample2=structuredClone(multi.experiment_state.samples.sample);
    expect(defaultDiffraction(load_scene(multi).save_state())).toBeUndefined();expect(defaultDiffraction(multi,'sample2','detector')!.sample_id).toBe('sample2');
    const valid=lab_height_config(),scene=load_scene(valid),before=scene.save_state();
    for(const patch of [{sample_id:'bad'},{energy_keV:Infinity},{hkl_limit:13},{spot_diameter_invA:0}]){
      const c=structuredClone(before);Object.assign(c.diffraction!,patch);expect(()=>scene.restore_state(c)).toThrow();expect(scene.save_state()).toEqual(before);
    }
    const invalid=structuredClone(before);invalid.devices.devices.find(d=>d.crystal)!.crystal!.cell.gamma_deg=70;expect(()=>scene.restore_state(invalid)).toThrow(/FCC/);
    const changed=structuredClone(before);changed.diffraction!.energy_keV=100;expect(scene.compare_states(before,changed).diffraction_changed).toBe(true);
    scene.restore_state(JSON.parse(JSON.stringify(before)));expect(scene.save_state()).toEqual(before);
    const customized=structuredClone(before);Object.assign(customized.diffraction!,{energy_keV:110,show_hkl:false,hkl_limit:5,reflection_model:'primitive',spot_diameter_invA:0.02});
    const april=withAprilParameters(customized).diffraction!;
    expect({labels:april.show_hkl,limit:april.hkl_limit,model:april.reflection_model,diameter:april.spot_diameter_invA}).toEqual({labels:false,limit:5,model:'primitive',diameter:0.02});
    expect(april.energy_keV).toBeCloseTo(HC_KEV_A/0.1265,10);
  });
});
describe('live ideal model DP07',()=>{
  it('reproduces the screenshot miss and verifies the raised laboratory alignment without replacing its assembly',()=>{
    const c=lab_height_config(),s=load_scene(c),model=new DiffractionModel(),p=c.diffraction!;
    expect(c.devices.devices.find(d=>d.id==='rotary')!.visual.size_mm).toEqual([450,770,450]);
    expect(c.experiment_state.joints['z_stage.z']).toBe(200);expect(c.experiment_state.joints['hexapod.y']).toBe(20.5);
    const lit=model.compute(s,p);expect(lit.illumination.status).toBe('lit');close(lit.illumination.centroid_lab_mm!,[0,1380,0],1e-7);
    // The user's screenshot configuration: base R800, P0=55.5, Z200, hex Y0 -> center1375.5.
    const shown=structuredClone(c);shown.experiment_state.joints['hexapod.y']=0;shown.assembly.frames.find(f=>f.id==='P0')!.mount.position_mm[2]=55.5;
    const screenshot=load_scene(shown);expect(screenshot.get_sample_point('sample').position[1]).toBeCloseTo(1375.5,8);
    expect(model.compute(screenshot,p).illumination.status).toBe('outside');
    // Its 35mm visual body spans the beam, while the physical 3mm body stops at1377mm.
    expect(1375.5+shown.devices.devices.find(d=>d.id==='sample')!.visual.size_mm[2]/2).toBeGreaterThan(1380);
    expect(1375.5+p.sample_shape.size_mm[2]/2+p.beam_size_mm[1]/2).toBeLessThan(1380);
    s.set_joint_value('rotary.phi',Math.asin(0.1265/3.59033485)*180/Math.PI);
    expect(model.compute(s,p).spots.find(spot=>spot.hkl.join()==='2,0,0')!.weight).toBeCloseTo(1,10);
  });
  it('shows 200 in the centered demo and removes it across an excitation boundary',()=>{
    const c=diffraction_demo_config(),s=load_scene(c),model=new DiffractionModel(),p=c.diffraction!;
    const initial=model.compute(s,p);expect(initial.illumination.status).toBe('lit');expect(initial.spots.find(r=>r.hkl.join()==='2,0,0')!.weight).toBeCloseTo(1,10);
    // The wider default sphere still excites 200 at 5 degrees; 10 degrees is outside it.
    s.set_joint_value('rotary.phi',10);expect(model.compute(s,p).spots.some(r=>r.hkl.join()==='2,0,0')).toBe(false);
    s.set_joint_value('hexapod.x',5);const dark=model.compute(s,p);expect(dark.illumination.status).toBe('outside');expect(dark.spots).toEqual([]);expect(dark.direct?.on_panel).toBe(true);
    expect(HC_KEV_A/p.energy_keV).toBeCloseTo(0.1265,12);
  });
  it('keeps excitation under translation while an endcap-clipped eccentric source moves',()=>{
    const c=cylinderFixture(-30),p=c.diffraction!;p.beam_size_mm=[1.6,1.4];c.assembly.frames.find(f=>f.id==='S')!.mount.position_mm=[0.65,0,0.3];
    c.experiment_state.joints['rotary.phi']=Math.asin(0.1265/3.5)*180/Math.PI;
    const s=load_scene(c),model=new DiffractionModel(),a=model.compute(s,p);s.set_joint_value('hexapod.x',0.2);const b=model.compute(s,p);
    expect(a.excited_count).toBe(b.excited_count);expect(a.spots.map(r=>[r.hkl,r.weight])).toEqual(b.spots.map(r=>[r.hkl,r.weight]));
    expect(b.illumination.centroid_lab_mm).not.toEqual(a.illumination.centroid_lab_mm);
    expect(b.direct).toEqual(a.direct);
    const a200=a.spots.find(s=>s.hkl.join()==='2,0,0')!,b200=b.spots.find(s=>s.hkl.join()==='2,0,0')!;
    expect(a200).toBeDefined();expect(b200.u).not.toBeCloseTo(a200.u,4);
  });
});
