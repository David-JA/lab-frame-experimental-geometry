import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Box3, Group, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { groupSceneLabels, labelPresentation, overlaps, placeLabels, SceneLabels, type LabelAnchor, type SceneLabel } from '../src/viewer/scene-labels';
import { viewPolicy } from '../src/viewer/view-policy';
import { GeometryViewer } from '../src/viewer/viewer';
import { load_scene, type Vec3 } from '../src/core';
import { example_config, lab_height_config } from '../src/example';

vi.mock('three',async importOriginal=>{
  const actual=await importOriginal<typeof import('three')>();
  return {...actual,WebGLRenderer:class {
    domElement=document.createElement('canvas');
    setPixelRatio(){} setSize(){} setAnimationLoop(){} render(){} dispose(){}
  }};
});
vi.mock('three/addons/controls/OrbitControls.js',async()=>{
  const { EventDispatcher, Vector3 }=await import('three');
  return {OrbitControls:class extends EventDispatcher {
    target=new Vector3();enableDamping=false;
    constructor(private camera:PerspectiveCamera){super();}
    update(){this.camera.lookAt(this.target);this.camera.updateMatrixWorld();}
    dispose(){}
  }};
});

describe('screen-space label placement',()=>{
  it('keeps a valid label side through subpixel pan rounding instead of alternating left and right',()=>{
    let previousOffset:{x:number;y:number}|undefined;
    let initialOffset:number|undefined;
    const sides:number[]=[];
    for(const x of [200.1,200.9,201.1,201.9,202.1,202.9]){
      const anchor:LabelAnchor&{previousOffset?:{x:number;y:number}}={x,y:200,width:100,height:30,priority:6,preferSide:true,previousOffset};
      const box=placeLabels([anchor],800,600)[0]!;
      sides.push(Math.sign(box.x+box.width/2-x));previousOffset={x:box.x-x,y:box.y-anchor.y};
      initialOffset??=previousOffset.x;expect(previousOffset.x).toBeCloseTo(initialOffset,8);
    }
    expect(sides).toEqual([1,1,1,1,1,1]);
  });
  it('abandons a remembered placement when it would leave the canvas',()=>{
    const anchor:LabelAnchor={x:370,y:200,width:100,height:30,priority:6,preferSide:true,previousOffset:{x:28,y:-15}};
    const box=placeLabels([anchor],390,400)[0]!;
    expect(box.x+box.width).toBeLessThan(anchor.x-24);expect(box.x).toBeGreaterThanOrEqual(8);expect(box.x+box.width).toBeLessThanOrEqual(382);
  });
  it.each([[1062,756],[390,400]])('keeps dense labels separate and inside a %sx%s canvas',(width,height)=>{
    const anchors:LabelAnchor[]=Array.from({length:16},(_,i)=>({x:width/2+i%3,y:height/2+i%4,width:i===0?176:60,height:i===0?64:30,priority:i===0?5:1}));
    const boxes=placeLabels(anchors,width,height);
    expect(boxes.every(Boolean)).toBe(true);
    boxes.forEach((box,i)=>{
      expect(box!.x).toBeGreaterThanOrEqual(8);expect(box!.y).toBeGreaterThanOrEqual(8);
      expect(box!.x+box!.width).toBeLessThanOrEqual(width-8);expect(box!.y+box!.height).toBeLessThanOrEqual(height-8);
      for(const other of boxes.slice(i+1))expect(overlaps(box!,other!)).toBe(false);
      for(const anchor of anchors)expect(anchor.x>=box!.x-4&&anchor.x<=box!.x+box!.width+4&&anchor.y>=box!.y-4&&anchor.y<=box!.y+box!.height+4).toBe(false);
    });
    expect(placeLabels(anchors,width,height)).toEqual(boxes);
  });
  it.each([[792,726],[390,400]])('places compact point badges beside the sample with short leaders in %sx%s',(width,height)=>{
    const anchors:LabelAnchor[]=[{x:width/2,y:height/2,width:114,height:30,priority:7,preferSide:true},{x:width/2,y:height/2-110,width:96,height:24,priority:5}],before=structuredClone(anchors);
    const boxes=placeLabels(anchors,width,height),badge=boxes[0]!,point=anchors[0];
    expect(badge.x>=point.x+24||badge.x+badge.width<=point.x-24).toBe(true);
    expect(Math.abs(badge.y+badge.height/2-point.y)).toBeLessThanOrEqual(1);
    const gap=badge.x>point.x?badge.x-point.x:point.x-badge.x-badge.width;
    expect(gap).toBeGreaterThan(24);expect(gap).toBeLessThanOrEqual(28);
    expect(overlaps(badge,boxes[1]!)).toBe(false);expect(anchors).toEqual(before);
    expect(badge.x).toBeGreaterThanOrEqual(8);expect(badge.x+badge.width).toBeLessThanOrEqual(width-8);
  });
  it.each([20,370])('switches badge sides near canvas edge x=%s',(x)=>{
    const anchor:LabelAnchor={x,y:200,width:114,height:30,priority:7,preferSide:true},box=placeLabels([anchor],390,400)[0]!;
    expect(x===20?box.x>x:box.x+box.width<x).toBe(true);
    expect(box.x).toBeGreaterThanOrEqual(8);expect(box.x+box.width).toBeLessThanOrEqual(382);
  });
  it('reserves vertical sample clearance when neither side can fit',()=>{
    const anchor:LabelAnchor={x:50,y:120,width:70,height:26,priority:7,preferSide:true},box=placeLabels([anchor],100,240)[0]!;
    expect(box).toBeDefined();expect(box.y+box.height<anchor.y-44||box.y>anchor.y+44).toBe(true);
    expect(box.x).toBeGreaterThanOrEqual(8);expect(box.x+box.width).toBeLessThanOrEqual(92);
  });
  it('places high-priority labels first when space is limited',()=>{
    const anchors=[{x:2,y:2,width:60,height:30,priority:1},{x:2,y:2,width:60,height:30,priority:5}];
    const boxes=placeLabels(anchors,100,60);
    expect(boxes[0]).toBeUndefined();expect(boxes[1]).toBeDefined();
  });
  it('rejects labels that cannot fit instead of clipping them',()=>{
    expect(placeLabels([{x:20,y:20,width:100,height:30,priority:1}],80,60)).toEqual([undefined]);
  });
  it('clamps edge anchors without changing their coordinates',()=>{
    const anchors=[{x:0,y:0,width:55,height:25,priority:1},{x:200,y:100,width:55,height:25,priority:1}],before=structuredClone(anchors);
    const boxes=placeLabels(anchors,200,100);
    expect(boxes.every(Boolean)).toBe(true);expect(anchors).toEqual(before);
  });
});

function label(text:string,parent=new Group(),position=new Vector3(),options:Partial<SceneLabel>={}):SceneLabel{
  return {text,parent,position,role:'frame',color:'#36566c',priority:1,...options};
}
describe('world coincidence and sparse captions',()=>{
  it('groups transformed world anchors, never labels sharing only a projection',()=>{
    const a=new Group(),b=new Group();a.position.set(1,2,3);b.position.set(1,2,4);
    const camera=new PerspectiveCamera(42,1,1,100);camera.position.set(1,2,10);camera.lookAt(1,2,0);camera.updateMatrixWorld();
    const entries=[label('A',a),label('B',b),label('same world',b,new Vector3(0,0,-1))];
    const groups=groupSceneLabels(entries);
    const pa=groups[0].world.clone().project(camera),pb=groups[1].world.clone().project(camera);
    expect(pa.x).toBeCloseTo(pb.x);expect(pa.y).toBeCloseTo(pb.y);
    expect(groups.map(g=>g.entries.map(e=>e.text))).toEqual([['A','same world'],['B']]);
    expect(entries[2].position.toArray()).toEqual([0,0,-1]);
  });
  it('uses numerical world tolerance without merging nearby distinct points',()=>{
    const entries=[label('a'),label('roundoff',undefined,new Vector3(1e-9,0,0)),label('separate',undefined,new Vector3(1e-4,0,0))];
    expect(groupSceneLabels(entries).map(g=>g.entries.length)).toEqual([2,1]);
  });
  it('keeps target explicit and selected caption short while retaining hidden members',()=>{
    const entries=[label('P0',undefined,undefined,{visible:false}),label('P1',undefined,undefined,{emphasis:'selected',caption:'theta · P1'}),
      label('样品中心',undefined,undefined,{role:'point',visible:false}),label('目标点',undefined,undefined,{role:'point',targetPoint:true})];
    const group=groupSceneLabels(entries)[0],routine=labelPresentation(group.entries);
    expect(routine.summary).toBe('目标点 · theta · P1');expect(routine.emphasis).toBe('coincident');expect(routine.details).toEqual([]);
    expect(group.entries).toHaveLength(4);
    expect(groupSceneLabels([entries[0],entries[2]])).toEqual([]);
    expect(labelPresentation([entries[1]]).emphasis).toBe('selected');
  });
  it('keeps C basis, lattice and target direction semantically distinct',()=>{
    const entries=[label('晶体 X',undefined,undefined,{role:'crystal'}),label('[100]',undefined,undefined,{role:'lattice'}),label('目标方向 [1 0 0]',undefined,undefined,{role:'target',priority:5})];
    const presentation=labelPresentation(entries,true);
    expect(presentation.primary?.role).toBe('target');expect(presentation.details.map(e=>e.role)).toEqual(['crystal','lattice']);
    expect(labelPresentation(entries).details).toEqual([]);
    expect(presentation.coincident).toBe(false);
  });
  it('never creates common-point groups from display arrow tips or axis captions',()=>{
    const p=new Vector3(55,200,0);
    const entries=[label('S',undefined,p),label('目标点',undefined,p,{role:'point'}),label('晶体 X',undefined,p,{role:'crystal'}),
      label('[100]',undefined,p,{role:'lattice'}),label('目标方向 [1 0 0]',undefined,p,{role:'target'}),label('φ 轴',undefined,p,{role:'axis'})];
    expect(groupSceneLabels(entries).map(g=>g.entries.map(e=>e.text))).toEqual([['S','目标点'],['晶体 X'],['[100]'],['目标方向 [1 0 0]'],['φ 轴']]);
  });
});

describe('presentation-only layer policy',()=>{
  it('isolates diagnostic families and their device context without rewriting saved display choices',()=>{
    const config=example_config(),before=structuredClone(config);
    expect(viewPolicy(config,{diagnostics:true}).layers).toEqual({frames:false,crystal:true,lattice:false});
    expect([...viewPolicy(config,{diagnostics:true}).axisDeviceIds]).toEqual([]);
    expect(viewPolicy(config,{diagnostics:true,diagnosticPreset:'lattice'}).layers).toEqual({frames:false,crystal:false,lattice:true});
    expect(viewPolicy(config,{diagnostics:true,diagnosticPreset:'devices'}).layers).toEqual({frames:true,crystal:false,lattice:false});
    expect(config).toEqual(before);
    config.experiment_state.display.crystal=false;
    expect(viewPolicy(config,{diagnostics:true,diagnosticPreset:'crystal'}).layers).toEqual({frames:false,crystal:false,lattice:false});
  });
  it('defaults to the integrated theta host without changing scientific display flags',()=>{
    const config=example_config(),before=structuredClone(config),policy=viewPolicy(config,{});
    expect(policy.selected?.id).toBe('theta');expect(policy.diagnostics).toBe(false);
    expect(policy.layers).toEqual({frames:false,crystal:false,lattice:false});
    expect([...policy.axisDeviceIds]).toEqual(['rotary','theta']);expect(config).toEqual(before);
    config.devices.devices.find(d=>d.id==='xy')!.integrated_into=undefined;
    expect(viewPolicy(config,{}).selected?.id).toBe('rotary');
    expect(viewPolicy(config,{selectedDeviceId:null}).selected).toBeUndefined();
  });
  it('honors each independent display flag only in diagnostics',()=>{
    const config=example_config();config.experiment_state.display={frames:false,crystal:true,lattice:false};
    expect(viewPolicy(config,{diagnostics:true,diagnosticPreset:'all',selectedDeviceId:'xy'}).layers).toEqual({frames:false,crystal:true,lattice:false});
    config.experiment_state.display={frames:true,crystal:false,lattice:true};
    expect(viewPolicy(config,{diagnostics:true,diagnosticPreset:'all'}).layers).toEqual({frames:true,crystal:false,lattice:true});
    expect(viewPolicy(config,{diagnostics:false}).layers).toEqual({frames:false,crystal:false,lattice:false});
  });
});

// Minimal DOM/renderer doubles exercise display policy without a browser or WebGL.
class ElementStub extends EventTarget {
  children:ElementStub[]=[];parent?:ElementStub;className='';dataset:Record<string,string>={};hidden=false;title='';type='';
  clientWidth=1062;clientHeight=756;namespaceURI='http://www.w3.org/2000/svg';
  style={fontSize:'',pointerEvents:'',transform:'',setProperty:(_name:string,_value:string)=>{}};
  classList={add:(value:string)=>{this.className+=' '+value;}};
  attributes=new Map<string,string>();#text='';
  get offsetWidth(){return Math.min(300,Math.max(60,this.textContent.length*7));}get offsetHeight(){return this.children.length>1?40:24;}
  get textContent():string{return this.#text+this.children.map(c=>c.textContent).join('');}set textContent(value:string){this.#text=value;this.children=[];}
  append(...children:ElementStub[]){children.forEach(c=>{c.parent=this;this.children.push(c);});}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
  replaceChildren(){this.children=[];}
  setAttribute(name:string,value:string){this.attributes.set(name,value);}
  toggleAttribute(name:string,force:boolean){if(force)this.attributes.set(name,'');else this.attributes.delete(name);}
  querySelectorAll(selector:string):ElementStub[]{return this.children.flatMap(c=>[...(c.className.split(' ').includes(selector.slice(1))?[c]:[]),...c.querySelectorAll(selector)]);}
  getBoundingClientRect(){return {left:0,top:0,right:this.clientWidth,bottom:this.clientHeight,width:this.clientWidth,height:this.clientHeight};}
}
class ButtonStub extends ElementStub {}
function pointer(target:EventTarget,type:string,x:number,y:number){
  target.dispatchEvent(Object.assign(new Event(type),{pointerId:1,button:0,isPrimary:true,clientX:x,clientY:y}));
}
describe('viewer display integration',()=>{
  let host:ElementStub,viewer:GeometryViewer|undefined;
  beforeEach(()=>{
    host=new ElementStub();
    vi.stubGlobal('document',{createElement:(tag:string)=>tag==='button'?new ButtonStub():new ElementStub(),createElementNS:()=>new ElementStub()});
    vi.stubGlobal('HTMLButtonElement',ButtonStub);vi.stubGlobal('window',{devicePixelRatio:1});
    vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}});
  });
  afterEach(()=>{viewer?.dispose();viewer=undefined;vi.unstubAllGlobals();});
  it('places surveyed ground, adapters and independent Z plates at their actual height references',()=>{
    const geometry=load_scene(lab_height_config());viewer=new GeometryViewer(host as unknown as HTMLElement);viewer.update(geometry);
    const part=(id:string,name='body')=>{let mesh:Mesh|undefined;viewer!.scene.traverse(o=>{if(o instanceof Mesh&&o.userData.deviceId===id&&o.userData.bodyPart===name)mesh=o;});expect(mesh).toBeDefined();return mesh!;};
    const bounds=(id:string,name='body')=>new Box3().setFromObject(part(id,name));
    expect(bounds('rotary').min.y).toBeCloseTo(0,8);expect(bounds('rotary').max.y).toBeCloseTo(670,8);
    expect(bounds('hexapod','lower-adapter').min.y).toBeCloseTo(670,8);expect(bounds('hexapod','lower-adapter').max.y).toBeCloseTo(685,8);
    expect(bounds('rotary').getSize(new Vector3()).toArray()).toEqual([450,670,450]);
    expect(bounds('hexapod','lower-disc').min.y).toBeCloseTo(685,8);expect(bounds('hexapod','lower-disc').max.y).toBeCloseTo(715,8);
    // Mesh vertices are Float32; the 18.2 mm drawing thickness is not exactly representable.
    expect(bounds('hexapod','upper-disc').min.y).toBeCloseTo(986.8,6);expect(bounds('hexapod','upper-disc').max.y).toBeCloseTo(1005,6);
    expect(bounds('hexapod','upper-disc').getSize(new Vector3()).x).toBeCloseTo(260,8);expect(bounds('hexapod','lower-disc').getSize(new Vector3()).x).toBeCloseTo(348,8);
    expect(bounds('hexapod','upper-disc').max.y-bounds('hexapod','lower-disc').min.y).toBeCloseTo(320,6);
    expect(bounds('hexapod','upper-adapter').min.y).toBeCloseTo(1005,8);expect(bounds('hexapod','upper-adapter').max.y).toBeCloseTo(1020,8);
    expect(bounds('hexapod','upper-adapter').max.y-bounds('hexapod','lower-adapter').min.y).toBeCloseTo(350,8);
    expect(bounds('z_stage','lower-plate').min.y).toBeCloseTo(1020,8);expect(bounds('z_stage','upper-plate').max.y).toBeCloseTo(1170,8);
    expect(bounds('theta').min.y).toBeCloseTo(1170,8);expect(bounds('theta').max.y).toBeCloseTo(bounds('xy').min.y,8);expect(bounds('xy').max.y).toBeCloseTo(bounds('sample').min.y,8);
    geometry.set_joint_value('z_stage.z',200);viewer.update(geometry);
    expect(bounds('z_stage','lower-plate').min.y).toBeCloseTo(1020,8);expect(bounds('z_stage','upper-plate').max.y).toBeCloseTo(1220,8);expect(bounds('theta').min.y).toBeCloseTo(1220,8);
    geometry.set_platform_pose('hexapod',{translation_mm:[2,3,4],rotation_deg:[0,0,90]});viewer.update(geometry);
    const upper=new Vector3().setFromMatrixPosition(part('hexapod','upper-adapter').matrixWorld);
    expect(upper.x).toBeCloseTo(369.5,8);expect(upper.y).toBeCloseTo(1383,8);expect(upper.z).toBeCloseTo(4,8);
    expect(new Vector3().setFromMatrixPosition(part('hexapod','lower-adapter').matrixWorld).toArray()).toEqual([0,677.5,0]);
    expect(viewer.diagnostics().max_world_matrix_error).toBeLessThan(1e-8);
  });
  it('keeps compact metal discs, adapter plates and the column attached to their actual frames',()=>{
    const geometry=load_scene(example_config());viewer=new GeometryViewer(host as unknown as HTMLElement);viewer.update(geometry);
    const bodies:Mesh[]=[];viewer.scene.traverse(o=>{if(o instanceof Mesh&&o.userData.deviceId)bodies.push(o);});
    const part=(id:string,name='body')=>bodies.find(o=>o.userData.deviceId===id&&o.userData.bodyPart===name)!;
    const bounds=(id:string,name='body')=>new Box3().setFromObject(part(id,name));
    expect(part('hexapod','upper-disc').geometry.type).toBe('CylinderGeometry');
    expect(part('hexapod','lower-disc').geometry.type).toBe('CylinderGeometry');
    expect(bounds('hexapod','upper-disc').getSize(new Vector3()).x).toBeCloseTo(180,8);
    expect(bounds('hexapod','lower-disc').getSize(new Vector3()).x).toBeCloseTo(240,8);
    for(const name of ['upper-adapter','lower-adapter'])expect(part('hexapod',name).geometry.type).toBe('BoxGeometry');
    expect(part('hexapod','upper-adapter').parent!.name).toBe('H1');expect(part('hexapod','lower-adapter').parent!.name).toBe('H0');
    expect(bounds('rotary').max.y).toBeCloseTo(bounds('hexapod','lower-adapter').min.y,8);
    expect(bounds('hexapod','lower-adapter').max.y).toBeCloseTo(bounds('hexapod','lower-disc').min.y,8);
    expect(bounds('hexapod','upper-disc').max.y).toBeCloseTo(bounds('hexapod','upper-adapter').min.y,8);
    expect(bounds('hexapod','upper-adapter').max.y).toBeCloseTo(bounds('theta').min.y,8);
    expect(bounds('theta').max.y).toBeCloseTo(bounds('xy').min.y,8);expect(bounds('xy').max.y).toBeCloseTo(bounds('sample').min.y,8);
    viewer.set_view({selectedDeviceId:'rotary'});expect((part('rotary').material as any).color.getHexString()).toBe('f8e68a');
    geometry.set_platform_pose('hexapod',{translation_mm:[2,3,4],rotation_deg:[0,0,90]});viewer.update(geometry);
    const upper=new Vector3().setFromMatrixPosition(part('hexapod','upper-adapter').matrixWorld);
    expect(upper.x).toBeCloseTo(47.5,8);expect(upper.y).toBeCloseTo(203,8);expect(upper.z).toBeCloseTo(4,8);
    expect(new Vector3().setFromMatrixPosition(part('hexapod','lower-adapter').matrixWorld).toArray()).toEqual([0,-12,0]);
    expect(geometry.save_state().assembly.supports).toHaveLength(6);
  });
  it('remembers the selected label placement across real camera projection updates',()=>{
    const labels=new SceneLabels(host as unknown as HTMLElement),camera=new PerspectiveCamera(42,host.clientWidth/host.clientHeight,1,10000);
    labels.set([label('当前装置',undefined,undefined,{emphasis:'selected',priority:6})],0);
    const sides:number[]=[];
    for(const x of [0,.05,0,.05,0,.05]){
      camera.position.set(x,0,1000);camera.lookAt(x,0,0);labels.render(camera);
      const el=host.querySelectorAll('.scene-label')[0],boxX=Number(el.style.transform.match(/-?\d+(?:\.\d+)?/)![0]);
      const projected=(new Vector3().project(camera).x+1)*host.clientWidth/2;
      sides.push(Math.sign(boxX+el.offsetWidth/2-projected));
    }
    expect(new Set(sides).size).toBe(1);labels.dispose();
  });
  it('routes a compact common-point button to a fresh world-position tuple',()=>{
    const inspect=vi.fn(),labels=new SceneLabels(host as unknown as HTMLElement,inspect),entries=[label('目标点',undefined,new Vector3(1,2,3),{targetPoint:true,role:'point'}),label('C',undefined,new Vector3(1,2,3),{visible:false})];
    labels.set(entries,7);
    const element=host.querySelectorAll('.scene-label')[0],button=host.querySelectorAll('.scene-label-inspect')[0];
    expect(element.dataset.emphasis).toBe('coincident');expect(element.textContent).toBe('目标点 · 共点');
    expect(JSON.parse(element.dataset.members)).toHaveLength(2);expect(JSON.parse(element.dataset.world)).toEqual([1,2,3]);
    expect(button.style.pointerEvents).toBe('auto');expect(element.style.pointerEvents).toBe('none');expect(element.style.fontSize).toBe('12px');
    button.dispatchEvent(new Event('click'));expect(inspect).toHaveBeenLastCalledWith([1,2,3]);
    inspect.mock.calls[0][0][0]=99;button.dispatchEvent(new Event('click'));expect(inspect).toHaveBeenLastCalledWith([1,2,3]);labels.dispose();
  });
  it('redraws cached geometry without revising or persisting selection or layers',()=>{
    const geometry=load_scene(example_config()),before=geometry.save_state();viewer=new GeometryViewer(host as unknown as HTMLElement);viewer.update(geometry);
    expect(viewer.diagnostics().selected_device_id).toBe('theta');
    const physicalBefore:unknown[]=[];viewer.scene.traverse(o=>{if(o instanceof Mesh&&o.userData.deviceId)physicalBefore.push([o.uuid,Array.from(o.geometry.attributes.position.array),[...o.matrixWorld.elements]]);});
    const captions=host.querySelectorAll('.scene-label').map(el=>el.textContent);
    expect(captions.join(' ')).toContain('目标点');expect(captions.join(' ')).not.toContain('晶体 X');expect(captions.join(' ')).not.toContain('[100]');expect(captions.join(' ')).not.toContain('pivot');
    expect(captions.join(' ')).toContain('XYθ');expect(captions.join(' ')).not.toContain('theta');expect(captions.join(' ')).not.toContain('P1');
    expect(host.querySelectorAll('.scene-label').some(el=>JSON.parse(el.dataset.members).some((entry:{text:string})=>entry.text==='P1'))).toBe(true);
    viewer.set_view({selectedDeviceId:'hexapod',diagnostics:true,diagnosticPreset:'all'});
    const bodies:Mesh[]=[];viewer.scene.traverse(o=>{if(o instanceof Mesh&&o.userData.deviceId)bodies.push(o);});
    expect(bodies.filter(o=>o.userData.selection==='selected').map(o=>o.userData.bodyPart).sort()).toEqual(['lower-adapter','lower-disc','upper-adapter','upper-disc']);
    expect(host.querySelectorAll('.scene-label').map(el=>el.textContent).join(' ')).toContain('晶体 X');
    expect(host.querySelectorAll('.scene-label').map(el=>el.textContent).join(' ')).toContain('[100]');
    viewer.set_view({diagnostics:false});expect(viewer.diagnostics().selected_device_id).toBe('hexapod');
    const physicalAfter=bodies.map(o=>[o.uuid,Array.from(o.geometry.attributes.position.array),[...o.matrixWorld.elements]]);
    expect(physicalAfter).toEqual(physicalBefore);expect(geometry.revision).toBe(0);expect(geometry.save_state()).toEqual(before);
  });
  it('preserves matrix, support, detector-plane and C-origin diagnostics under nonzero poses',()=>{
    const config=example_config(),sample=config.devices.devices.find(d=>d.crystal)!;sample.crystal!.center_s_mm=[3,7,-2];sample.crystal!.target_point_s_mm=[9,-4,6];
    const geometry=load_scene(config);geometry.set_platform_pose('hexapod',{translation_mm:[2,4,6],rotation_deg:[13,21,-9]});geometry.set_joint_value('rotary.phi',31);geometry.set_joint_value('theta.angle',47);
    viewer=new GeometryViewer(host as unknown as HTMLElement);viewer.set_view({diagnostics:true,diagnosticPreset:'all'});viewer.update(geometry);
    for(const key of ['max_world_matrix_error','max_support_endpoint_error_mm','max_detector_plane_error_mm','max_crystal_origin_error_mm'] as const)expect(viewer.diagnostics()[key]).toBeLessThan(1e-8);
    viewer.focus_sample();expect(viewer.controls.target.toArray()).toEqual(geometry.get_sample_point('sample').position);
    const closeDistance=viewer.camera.position.distanceTo(viewer.controls.target);viewer.reset_camera();
    expect(viewer.camera.position.distanceTo(viewer.controls.target)).toBeGreaterThan(closeDistance*2);
    expect(viewer.controls.target.z).toBeGreaterThan(400);
  });
  it.each([[1320,770],[390,400]])('keeps target-direction tips and captions visible in a %sx%s sample closeup',(width,height)=>{
    host.clientWidth=width;host.clientHeight=height;
    for(const indices of [[0,0,1],[1,0,0],[0,1,0],[0,0,-1],[-1,0,0],[0,-1,0]] as Vec3[]){
      const config=example_config();config.experiment_state.samples.sample.target_indices=indices;
      const geometry=load_scene(config);viewer=new GeometryViewer(host as unknown as HTMLElement);viewer.update(geometry);viewer.focus_sample();
      const caption=host.querySelectorAll('.scene-label').find(el=>JSON.parse(el.dataset.members).some((entry:{role:string})=>entry.role==='target'))!;
      expect(caption.hidden).toBe(false);expect(caption.textContent).toContain('目标方向');
      const tip=new Vector3(...JSON.parse(caption.dataset.world)).project(viewer.camera);
      expect(Math.abs(tip.x)).toBeLessThan(.85);expect(Math.abs(tip.y)).toBeLessThan(.85);expect(Math.abs(tip.z)).toBeLessThan(1);
      const [x,y]=caption.style.transform.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      expect(x).toBeGreaterThanOrEqual(8);expect(y).toBeGreaterThanOrEqual(8);
      expect(x+caption.offsetWidth).toBeLessThanOrEqual(width-8);expect(y+caption.offsetHeight).toBeLessThanOrEqual(height-8);
      const badge=host.querySelectorAll('.scene-label').find(el=>JSON.parse(el.dataset.members).some((entry:{text:string})=>entry.text==='目标点'))!;
      const anchor=new Vector3(...JSON.parse(badge.dataset.world)).project(viewer.camera),anchorX=(anchor.x+1)*width/2;
      const [badgeX]=badge.style.transform.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      expect(badge.hidden).toBe(false);expect(badgeX>=anchorX+24||badgeX+badge.offsetWidth<=anchorX-24).toBe(true);
      expect(viewer.camera.position.distanceTo(viewer.controls.target)).toBeLessThan(600);
      viewer.dispose();viewer=undefined;
    }
  });
  it('renders lattice independently of C and generic frames in diagnostics',()=>{
    const config=example_config();config.experiment_state.display={frames:false,crystal:false,lattice:true};
    viewer=new GeometryViewer(host as unknown as HTMLElement);viewer.update(load_scene(config));viewer.set_view({diagnostics:true,diagnosticPreset:'all'});
    const labels=host.querySelectorAll('.scene-label'),text=labels.map(el=>el.textContent).join(' ');
    expect(text).toContain('[100]');expect(text).not.toContain('晶体 X');expect(text).toContain('theta · P1');
    const frames=labels.flatMap(el=>JSON.parse(el.dataset.members)).filter((entry:{role:string})=>entry.role==='frame');
    expect(frames.map((entry:{text:string})=>entry.text)).toEqual(['P1']);
    expect(viewer.diagnostics().diagnostic_layers).toEqual({enabled:true,frames:false,crystal:false,lattice:true});
  });
  it('keeps coincident C-X and lattice-100 display tips separate for an offset sample center',()=>{
    const config=example_config();config.devices.devices.find(d=>d.crystal)!.crystal!.center_s_mm=[-30,0,0];
    viewer=new GeometryViewer(host as unknown as HTMLElement);viewer.set_view({diagnostics:true,diagnosticPreset:'all'});viewer.update(load_scene(config));
    const labels=host.querySelectorAll('.scene-label');
    const find=(text:string)=>labels.find(el=>JSON.parse(el.dataset.members).some((entry:{text:string})=>entry.text===text))!;
    const cX=find('晶体 X'),a=find('晶向 [100]');
    expect(cX).not.toBe(a);expect(JSON.parse(cX.dataset.world)).toEqual([55,200,0]);expect(cX.dataset.world).toBe(a.dataset.world);
    expect(cX.textContent).toBe('晶体 X');expect(a.textContent).toBe('晶向 [100]');
    expect(cX.dataset.emphasis).toBe('plain');expect(a.dataset.emphasis).toBe('plain');
    expect(cX.querySelectorAll('.scene-label-inspect')).toHaveLength(0);expect(a.querySelectorAll('.scene-label-inspect')).toHaveLength(0);
  });
  it('picks real XY bodies with raw ids and ignores pointer drags and control changes',()=>{
    const select=vi.fn(),geometry=load_scene(example_config());viewer=new GeometryViewer(host as unknown as HTMLElement,{onSelect:select});viewer.update(geometry);
    const p=new Vector3(30,175,30).project(viewer.camera),x=(p.x+1)*host.clientWidth/2,y=(1-p.y)*host.clientHeight/2;
    const canvas=viewer.renderer.domElement;
    pointer(canvas,'pointerdown',x,y);pointer(canvas,'pointerup',x,y);expect(select).toHaveBeenLastCalledWith('xy');
    select.mockClear();pointer(canvas,'pointerdown',x,y);pointer(canvas,'pointermove',x+20,y);pointer(canvas,'pointermove',x,y);pointer(canvas,'pointerup',x,y);expect(select).not.toHaveBeenCalled();
    pointer(canvas,'pointerdown',x,y);viewer.controls.dispatchEvent({type:'change'});pointer(canvas,'pointerup',x,y);expect(select).not.toHaveBeenCalled();
  });
});
