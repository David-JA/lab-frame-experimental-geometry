import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Scene as GeometryScene, SceneConfig, Device, Mat4, Vec3 } from '../core';
import { point, direction, unit } from '../core/math';
import { detectorSupport } from '../core/detector-support';
import { SceneLabels, type SceneLabel, type LabelRole } from './scene-labels';
import { viewPolicy, type ViewerCallbacks, type ViewerView } from './view-policy';

interface Body {id:string;mesh:THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;color:THREE.Color;edges:THREE.LineBasicMaterial}
interface PointerGesture {id:number;x:number;y:number;dragged:boolean}

const colors={xyz:[0xb42318,0x00643f,0x1d4ed8],phi:0x8a5700,theta:0x6525a8,beam:0x006878,pivot:0x3f4e5c,sample:0x243e52,target:0xad0d65};
const vector=(p:Vec3)=>new THREE.Vector3(...p);
function matrix(m:Mat4){
  return new THREE.Matrix4().set(m[0],m[1],m[2],m[3],m[4],m[5],m[6],m[7],m[8],m[9],m[10],m[11],m[12],m[13],m[14],m[15]);
}
export class GeometryViewer {
  readonly renderer:THREE.WebGLRenderer;
  readonly scene=new THREE.Scene();
  readonly camera=new THREE.PerspectiveCamera(42,1,1,10000);
  readonly controls:OrbitControls;
  #root=new THREE.Group();#dynamic=new THREE.Group();#groups=new Map<string,THREE.Group>();
  #axes=new Map<string,THREE.AxesHelper>();#key='';#revision=-1;#maxError=0;#rodError=0;#detectorError=0;#crystalOriginError=0;#config?:SceneConfig;
  #activePanels:{id:string;mesh:THREE.Mesh;width:number;height:number}[]=[];
  #bodies:Body[]=[];#geometry?:GeometryScene;#view:ViewerView={};#policy?:ReturnType<typeof viewPolicy>;
  #pointer?:PointerGesture;#raycaster=new THREE.Raycaster();
  #sampleFocus:Vec3=[0,200,0];#sampleRadius=100;
  #labels:SceneLabels;#labelEntries:SceneLabel[]=[];
  #observer:ResizeObserver;
  #grid:THREE.GridHelper;
  constructor(private container:HTMLElement,private callbacks:ViewerCallbacks={}){
    this.scene.background=new THREE.Color('#edf0f2');
    this.renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    this.renderer.domElement.setAttribute('aria-label','实验装置三维场景');container.append(this.renderer.domElement);
    this.#labels=new SceneLabels(container,position=>this.callbacks.onInspectCoincident?.(position));
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;
    this.controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.PAN,RIGHT:null};
    this.controls.addEventListener('change',this.#onControlsChange);
    const canvas=this.renderer.domElement;
    canvas.addEventListener('pointerdown',this.#onPointerDown);
    canvas.addEventListener('pointermove',this.#onPointerMove);
    canvas.addEventListener('pointerup',this.#onPointerUp);
    canvas.addEventListener('pointercancel',this.#onPointerCancel);
    this.scene.add(new THREE.HemisphereLight(0xf3f6fa,0xb3bac0,2.4));
    this.scene.add(new THREE.AmbientLight(0xffffff,.55));
    const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(500,1000,500);this.scene.add(light);
    const grid=this.#grid=new THREE.GridHelper(1800,18,0xc1c9cf,0xd7dde1);grid.position.y=-30;
    grid.material.transparent=true;grid.material.opacity=.5;this.scene.add(grid);
    this.scene.add(this.#root,this.#dynamic);this.reset_camera();
    this.#observer=new ResizeObserver(()=>this.resize());this.#observer.observe(container);this.resize();
    this.renderer.setAnimationLoop(()=>{this.controls.update();this.renderer.render(this.scene,this.camera);this.#labels.render(this.camera);});
  }
  #onControlsChange=()=>{if(this.#pointer)this.#pointer.dragged=true;};
  #onPointerDown=(event:PointerEvent)=>{
    if(this.#pointer){this.#pointer.dragged=true;return;}
    if(event.button===0&&event.isPrimary)this.#pointer={id:event.pointerId,x:event.clientX,y:event.clientY,dragged:false};
  };
  #onPointerMove=(event:PointerEvent)=>{
    if(this.#pointer&&event.pointerId===this.#pointer.id&&Math.hypot(event.clientX-this.#pointer.x,event.clientY-this.#pointer.y)>5)this.#pointer.dragged=true;
  };
  #onPointerCancel=(event:PointerEvent)=>{if(event.pointerId===this.#pointer?.id)this.#pointer=undefined;};
  #onPointerUp=(event:PointerEvent)=>{
    const gesture=this.#pointer;if(!gesture||gesture.id!==event.pointerId)return;this.#pointer=undefined;
    if(gesture.dragged||event.button!==0||Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>5)return;
    const rect=this.renderer.domElement.getBoundingClientRect();
    if(!rect.width||!rect.height||event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)return;
    this.camera.updateMatrixWorld();this.#root.updateWorldMatrix(true,true);
    this.#raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),this.camera);
    const hit=this.#raycaster.intersectObjects(this.#bodies.map(b=>b.mesh),false)[0];
    if(!hit)return;
    const id=hit.object.userData.deviceId as string;
    this.set_view({selectedDeviceId:id});this.callbacks.onSelect?.(id);
  };
  set_view(options:ViewerView):void{
    const next={...this.#view,...options};
    if(next.selectedDeviceId===this.#view.selectedDeviceId&&next.diagnostics===this.#view.diagnostics&&next.diagnosticPreset===this.#view.diagnosticPreset)return;
    this.#view=next;if(this.#geometry)this.update(this.#geometry);
  }
  #bodyBounds(predicate:(body:Body)=>boolean=()=>true){
    this.#root.updateWorldMatrix(true,true);
    const bounds=new THREE.Box3();
    for(const body of this.#bodies.filter(predicate)){
      body.mesh.geometry.computeBoundingBox();
      bounds.union(body.mesh.geometry.boundingBox!.clone().applyMatrix4(body.mesh.matrixWorld));
    }
    return bounds;
  }
  #fitCamera(center:THREE.Vector3,radius:number){
    const vertical=THREE.MathUtils.degToRad(this.camera.fov),horizontal=2*Math.atan(Math.tan(vertical/2)*this.camera.aspect);
    const distance=Math.max(radius,20)/Math.sin(Math.min(vertical,horizontal)/2)*1.12;
    this.controls.target.copy(center);this.camera.position.copy(center).add(new THREE.Vector3(1.1,.65,1.5).normalize().multiplyScalar(distance));
    this.controls.update();
  }
  reset_camera(){
    const box=this.#bodyBounds();
    if(box.isEmpty()){this.camera.position.set(950,640,1450);this.controls.target.set(0,180,400);this.controls.update();}
    else{const sphere=box.getBoundingSphere(new THREE.Sphere());this.#fitCamera(sphere.center,sphere.radius);}
  }
  focus_sample(){this.#fitCamera(vector(this.#sampleFocus),this.#sampleRadius);this.#labels.render(this.camera);}
  focus_apparatus(){
    const detectors=new Set(this.#config?.devices.devices.filter(d=>d.type==='detector'||d.type==='detector_support').map(d=>d.id));
    const box=this.#bodyBounds(body=>!detectors.has(body.id));
    if(box.isEmpty())return;
    const sphere=box.getBoundingSphere(new THREE.Sphere());this.#fitCamera(sphere.center,sphere.radius);this.#labels.render(this.camera);
  }
  resize(){const w=this.container.clientWidth,h=this.container.clientHeight;this.camera.aspect=w/Math.max(h,1);this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);}
  #clear(group:THREE.Group){
    group.traverse(o=>{
      if(o instanceof THREE.Mesh||o instanceof THREE.Line||o instanceof THREE.Sprite){
        if('geometry' in o)o.geometry.dispose();
        for(const m of Array.isArray(o.material)?o.material:[o.material]){
          if('map' in m&&m.map instanceof THREE.Texture)m.map.dispose();m.dispose();
        }
      }
    });group.clear();
  }
  #label(text:string,parent:THREE.Object3D,position:Vec3,role:LabelRole='frame',color=0x36566c,priority=1,options:Pick<SceneLabel,'visible'|'emphasis'|'targetPoint'|'caption'>={}){
    this.#labelEntries.push({text,parent,position:vector(position),role,color:'#'+color.toString(16).padStart(6,'0'),priority,...options});
  }
  #highlightBodies(){
    for(const body of this.#bodies){
      const selected=body.id===this.#policy?.selected?.id;
      body.mesh.material.color.copy(body.color);
      body.mesh.material.emissive.setHex(selected?0x18384f:0x000000);body.mesh.material.emissiveIntensity=selected?.06:0;
      body.edges.color.setHex(selected?0x155b91:0x647683);body.edges.opacity=selected?1:.24;
      body.mesh.userData.selection=selected?'selected':'none';
    }
  }
  #body(d:Device){
    const [x,y,z]=d.visual.size_mm;
    const metal=d.type==='hexapod'||d.type==='theta'||d.type==='xy';
    const material=new THREE.MeshStandardMaterial({color:d.visual.color,metalness:d.type==='hexapod'?.25:metal?.4:d.type==='rotary'?.02:.12,roughness:metal?.28:.7});
    const register=(frame:string,geometry:THREE.BufferGeometry,mat:THREE.MeshStandardMaterial,position:Vec3,part:string)=>{
      const mesh=new THREE.Mesh(geometry,mat);mesh.position.copy(vector(position));
      const edges=new THREE.LineBasicMaterial({color:0x4b545b,transparent:true,opacity:.24});
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry,12),edges));mesh.userData.deviceId=d.id;mesh.userData.bodyPart=part;
      this.#groups.get(frame)!.add(mesh);this.#bodies.push({id:d.id,mesh,color:mat.color.clone(),edges});return mesh;
    };
    if(d.type==='detector_support'){
      // Keep the LAB-aligned hardware behind the full calibrated panel envelope.
      const panels=new THREE.Box3();
      for(const panel of this.#config!.devices.devices.filter(panel=>panel.detector&&detectorSupport(this.#config!,panel.id)?.device.id===d.id)){
        const [width,height,depth]=panel.visual.size_mm,offset=panel.visual.offset_mm??[0,0,0];
        const envelope=new THREE.Box3(new THREE.Vector3(-width/2,-height/2,0),new THREE.Vector3(width/2,height/2,depth));
        envelope.translate(vector(offset)).applyMatrix4(matrix(this.#geometry!.get_frame_transform(d.output_frame,panel.output_frame).matrix));panels.union(envelope);
      }
      const center=panels.isEmpty()?new THREE.Vector3():panels.getCenter(new THREE.Vector3());
      const rear=(panels.isEmpty()?20:panels.max.z)+2,postZ=rear+55/2;
      const postBottom=-y+35,postTop=center.y-45/2,postHeight=Math.max(1,postTop-postBottom);
      register(d.output_frame,new THREE.BoxGeometry(55,postHeight,55),material,[center.x,postTop-postHeight/2,postZ],'support-post');
      register(d.output_frame,new THREE.BoxGeometry(x,35,z),material.clone(),[center.x,-y+35/2,postZ],'support-carriage');
      register(d.output_frame,new THREE.BoxGeometry(110,45,30),material.clone(),[center.x,center.y,rear+30/2],'panel-bracket');
      return;
    }
    if(d.type==='rotary'&&d.visual.shape==='box'){
      const offset=d.visual.offset_mm??[0,0,0],thickness=Math.min(20,y);
      const bottom=offset[1]-y/2,diameter=Math.hypot(x,z);
      // The base occupies the bottom of the existing envelope; the table top stays fixed.
      const baseMaterial=new THREE.MeshStandardMaterial({color:0x77818b,metalness:.3,roughness:.45});
      register(d.output_frame,new THREE.CylinderGeometry(diameter/2,diameter/2,thickness,64),baseMaterial,[offset[0],bottom+thickness/2,offset[2]],'rotary-base');
      if(y>thickness)register(d.output_frame,new THREE.BoxGeometry(x,y-thickness,z),material,[offset[0],offset[1]+thickness/2,offset[2]],'body');
      return;
    }
    if(d.type==='hexapod'&&d.visual.shape==='cylinder'){
      const f=this.#config!.assembly.frames.find(f=>f.id===d.output_frame)!,offset=d.visual.offset_mm??[0,0,0];
      const [ux,uy,uz]=d.visual.upper_disc_size_mm??[x*.75,y,z*.75];
      const disc=(dx:number,dy:number,dz:number)=>new THREE.CylinderGeometry(.5,.5,1,64).scale(dx,dy,dz);
      const adapterMaterial=new THREE.MeshStandardMaterial({color:0x77818b,metalness:.3,roughness:.45});
      register(d.output_frame,disc(ux,uy,uz),material,offset,'upper-disc');
      register(f.parent,disc(x,y,z),material.clone(),[0,0,0],'lower-disc');
      const thickness=d.visual.adapter_thickness_mm??y;
      register(d.output_frame,new THREE.BoxGeometry(x*.85,thickness,z*.85),adapterMaterial,[offset[0],offset[1]+(uy+thickness)/2,offset[2]],'upper-adapter');
      register(f.parent,new THREE.BoxGeometry(x*1.08,thickness,z*1.08),adapterMaterial.clone(),[0,-(y+thickness)/2,0],'lower-adapter');
      return;
    }
    if(d.type==='z_stage'){
      const f=this.#config!.assembly.frames.find(f=>f.id===d.output_frame)!;
      register(d.output_frame,new THREE.BoxGeometry(x,y,z),material,[0,0,-z/2],'upper-plate');
      register(f.parent,new THREE.BoxGeometry(x,y,z),material.clone(),[0,0,z/2],'lower-plate');
      return;
    }
    let geometry:THREE.BufferGeometry;
    if(d.visual.shape==='cylinder'){
      const vertical=d.type==='rotary';geometry=new THREE.CylinderGeometry(.5,.5,1,32);
      if(!vertical)geometry.rotateX(Math.PI/2);
      geometry.scale(x,y,z);
    }else geometry=new THREE.BoxGeometry(x,y,z);
    const position=[...(d.visual.offset_mm??[0,0,0])] as Vec3;if(d.type==='detector')position[2]+=z/2;
    register(d.output_frame,geometry,material,position,'body');
    if(d.detector){
      const [nu,nv]=d.detector.pixels,[px,py]=d.detector.pixel_size_mm;
      const active=new THREE.Mesh(new THREE.PlaneGeometry(nu*px,nv*py),new THREE.MeshBasicMaterial({color:0x293743,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
      this.#groups.get(d.output_frame)!.add(active);
      this.#activePanels.push({id:d.id,mesh:active,width:nu*px,height:nv*py});
    }
    if(d.type==='hexapod'){
      const f=this.#config!.assembly.frames.find(f=>f.id===d.output_frame)!;
      register(f.parent,new THREE.BoxGeometry(x,y,z),material.clone(),[0,0,0],'lower-plate');
    }
  }
  #rebuild(c:SceneConfig){
    this.#clear(this.#root);this.#groups.clear();this.#axes.clear();this.#bodies=[];this.#activePanels=[];this.#config=c;
    const root=new THREE.Group();root.name='LAB';this.#root.add(root);this.#groups.set('LAB',root);
    const create=(id:string):THREE.Group=>{
      if(this.#groups.has(id))return this.#groups.get(id)!;
      const f=c.assembly.frames.find(f=>f.id===id)!,g=new THREE.Group();
      g.name=id;g.matrixAutoUpdate=false;create(f.parent).add(g);this.#groups.set(id,g);return g;
    };
    c.assembly.frames.forEach(f=>create(f.id));
    c.devices.devices.filter(d=>d.crystal).forEach(d=>{
      const g=new THREE.Group();g.name=d.crystal!.frame;g.matrixAutoUpdate=false;this.#groups.get(d.output_frame)!.add(g);this.#groups.set(g.name,g);
    });
    const crystalFrames=new Set(c.devices.devices.filter(d=>d.crystal).map(d=>d.crystal!.frame));
    for(const [id,g]of this.#groups){
      if(!crystalFrames.has(id)){const axes=new THREE.AxesHelper(id==='LAB'?180:35);axes.setColors(...colors.xyz as [number,number,number]);g.add(axes);this.#axes.set(id,axes);}
    }
    c.devices.devices.forEach(d=>this.#body(d));
  }
  #line(a:Vec3,b:Vec3,color:number,radius=1.5,metallic=false){
    const delta=vector(b).sub(vector(a)),length=delta.length();
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,1,16),metallic?new THREE.MeshStandardMaterial({color,metalness:.3,roughness:.3}):new THREE.MeshBasicMaterial({color}));
    mesh.position.copy(vector(a).add(vector(b)).multiplyScalar(.5));mesh.scale.y=length;
    if(length>1e-12)mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
    this.#dynamic.add(mesh);return mesh;
  }
  #dashedLine(a:Vec3,b:Vec3,color:number,overlay=false,radius=1.1){
    const delta=vector(b).sub(vector(a)),length=delta.length();if(length<1e-12)return;
    const direction=delta.normalize();
    for(let start=0;start<length;start+=19){
      const line=this.#line(vector(a).addScaledVector(direction,start).toArray(),vector(a).addScaledVector(direction,Math.min(start+11,length)).toArray(),color,radius);
      line.material.depthTest=!overlay;if(overlay)line.renderOrder=2;
    }
  }
  #marker(p:Vec3,color:number,label:string,pivot=false,visible=true,targetPoint=false){
    if(visible){
      const geometry=pivot?new THREE.OctahedronGeometry(7):new THREE.SphereGeometry(4,14,10);
      const marker=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,wireframe:pivot,depthTest:false}));
      marker.position.copy(vector(p));if(targetPoint)marker.renderOrder=3;this.#dynamic.add(marker);
    }
    this.#label(label,this.#dynamic,p,'point',color,targetPoint?7:5,{visible,targetPoint});
  }
  #arrow(p:Vec3,d:Vec3,color:number,label:string|undefined,length=75,role:LabelRole='crystal',dashed=false){
    const head=role==='target'?14:11,radius=role==='target'?1.5:1;
    const arrow=new THREE.ArrowHelper(vector(d),vector(p),length,color,head,role==='target'?9:7);this.#dynamic.add(arrow);
    arrow.line.visible=false;
    (arrow.cone.material as THREE.MeshBasicMaterial).depthTest=false;arrow.cone.renderOrder=3;
    const end=p.map((x,i)=>x+d[i]*length) as Vec3;
    const shaft=p.map((x,i)=>x+d[i]*(length-head)) as Vec3;
    if(dashed)this.#dashedLine(p,shaft,color,true,radius);
    else{const line=this.#line(p,shaft,color,radius);line.material.depthTest=false;line.renderOrder=2;}
    if(label)this.#label(label,this.#dynamic,end,role,color,role==='target'?5:3);
    return arrow;
  }
  update(geometry:GeometryScene){
    this.#geometry=geometry;
    const c=geometry.save_state(),key=JSON.stringify({devices:c.devices,assembly:c.assembly});
    this.#policy=viewPolicy(c,this.#view);const {selected,diagnostics,diagnosticPreset,layers,axisDeviceIds}=this.#policy;
    const deviceContext=diagnostics&&(diagnosticPreset==='devices'||diagnosticPreset==='all');
    const primarySample=selected?.crystal?selected:c.devices.devices.find(d=>d.crystal);
    if(primarySample)this.#sampleFocus=geometry.get_sample_point(primarySample.id).position;
    if(this.#key!==key){this.#rebuild(c);this.#key=key;}
    for(const [id,g]of this.#groups)g.matrix.copy(matrix(geometry.get_local_transform(id)));
    this.#axes.forEach((a,id)=>a.visible=!diagnostics&&id===selected?.output_frame);
    this.#highlightBodies();this.#clear(this.#dynamic);this.#labelEntries=[];
    const crystalFrames=new Set(c.devices.devices.filter(d=>d.crystal).map(d=>d.crystal!.frame));
    const integratedTheta=selected?.type==='theta'&&c.devices.devices.some(d=>d.type==='xy'&&d.integrated_into===selected.id);
    const selectedCaption=selected?(diagnostics&&diagnosticPreset==='all'?selected.id+' · '+selected.output_frame:integratedTheta?'XYθ':selected.crystal?'样品':'当前装置'):undefined;
    for(const [id,g]of this.#groups){
      const isSelected=id===selected?.output_frame,frameVisible=layers.frames&&(diagnosticPreset==='all'||id==='LAB'||isSelected),visible=isSelected||(crystalFrames.has(id)?layers.crystal:frameVisible);
      if(!diagnostics||visible)this.#label(id,g,[0,0,0],'frame',0x36566c,isSelected?6:1,{visible,emphasis:isSelected?'selected':'plain',caption:isSelected?selectedCaption:undefined});
      if(frameVisible&&!crystalFrames.has(id)){
        const m=geometry.get_frame_transform('LAB',id).matrix,p=point(m,[0,0,0]);
        ([[1,0,0],[0,1,0],[0,0,1]] as Vec3[]).forEach((v,i)=>this.#arrow(p,unit(direction(m,v)),colors.xyz[i],diagnosticPreset==='devices'?(id==='LAB'?'实验室 ':'装置 ')+['X','Y','Z'][i]:undefined,id==='LAB'?60:38,'axis'));
      }
    }
    const beam=c.assembly.beam,pb=beam.point_mm;
    this.#line([pb[0],pb[1],pb[2]-250],[pb[0],pb[1],pb[2]+1200],colors.beam,.55);
    if(deviceContext)this.#label('入射光束 +Z',this.#dynamic,[pb[0],pb[1],pb[2]+700],'beam',colors.beam,2);
    const axes=c.devices.devices.filter(d=>(d.type==='rotary'||d.type==='theta')&&axisDeviceIds.has(d.id)).map(d=>{
      const axis=geometry.get_axis(d.id),m=geometry.get_frame_transform('LAB',axis.frame).matrix;
      return {device:d,p:point(m,axis.point_mm),v:unit(direction(m,axis.direction))};
    });
    const coaxial=(a:typeof axes[number],b:typeof axes[number])=>vector(a.v).cross(vector(b.v)).length()<1e-8&&vector(a.p).sub(vector(b.p)).cross(vector(b.v)).length()<1e-6;
    this.#rodError=0;this.#crystalOriginError=0;
    for(const s of c.assembly.supports){
      const a=point(geometry.get_frame_transform('LAB',s.base_frame).matrix,s.base_point_mm),b=point(geometry.get_frame_transform('LAB',s.moving_frame).matrix,s.moving_point_mm);
      const owner=c.devices.devices.find(d=>d.type==='hexapod'&&d.output_frame===s.moving_frame);
      const radius=owner?.visual.upper_disc_size_mm?owner.visual.size_mm[1]/2:4.5;
      const color=owner?new THREE.Color(owner.visual.color).getHex():0xb9c3cc;
      const rod=this.#line(a,b,color,radius,true);rod.updateMatrixWorld(true);
      this.#rodError=Math.max(this.#rodError,new THREE.Vector3(0,-.5,0).applyMatrix4(rod.matrixWorld).distanceTo(vector(a)),new THREE.Vector3(0,.5,0).applyMatrix4(rod.matrixWorld).distanceTo(vector(b)));
    }
    let primaryTargetTip:THREE.Vector3|undefined;
    for(const d of c.devices.devices){
      if(d.type==='z_stage'){
        const f=c.assembly.frames.find(f=>f.id===d.output_frame)!,[x,y,z]=d.visual.size_mm;
        const base=geometry.get_frame_transform('LAB',f.parent).matrix,top=geometry.get_world_transform(d.id).matrix;
        for(const side of [-1,1])for(const diagonal of [-1,1]){
          this.#line(point(base,[-diagonal*x*.4,side*y*.35,z]),point(top,[diagonal*x*.4,side*y*.35,-z]),0x30363c,3);
        }
      }
      if(d.type==='hexapod')this.#marker(geometry.get_pivot(d.id).position,colors.pivot,'旋转参考点',true,deviceContext&&(diagnosticPreset==='all'||selected?.id===d.id));
      if((d.type==='rotary'||d.type==='theta')&&axisDeviceIds.has(d.id)){
        const a=axes.find(a=>a.device.id===d.id)!,{p,v}=a;
        const focusDistance=vector(this.#sampleFocus).sub(vector(p)).dot(vector(v)),extent=Math.max(260,focusDistance+100);
        const start=p.map((x,i)=>x-v[i]*80) as Vec3,end=p.map((x,i)=>x+v[i]*extent) as Vec3;
        if(d.type==='theta')this.#dashedLine(start,end,colors.theta,true);else this.#line(start,end,colors.phi,1.2);
        const shared=axes.find(b=>b.device.type!==d.type&&coaxial(a,b));
        if(d.type==='theta'&&shared)continue;
        const label=shared?'φ / θ 共轴':d.type==='rotary'?'φ 轴':'θ 轴';
        const captionDistance=Math.max(-65,Math.min(extent===260?245:extent-15,focusDistance+60));
        this.#label(label,this.#dynamic,p.map((x,i)=>x+v[i]*captionDistance) as Vec3,'axis',d.type==='rotary'?colors.phi:colors.theta,4);
      }
      if(d.crystal){
        const p=geometry.get_sample_point(d.id,'center').position,target=geometry.get_sample_point(d.id).position,state=c.experiment_state.samples[d.id];
        this.#marker(p,colors.sample,'样品中心',false,deviceContext);
        this.#marker(target,colors.target,'目标点',false,true,true);
        const basis:Vec3[]=[[1,0,0],[0,1,0],[0,0,1]];
        if(layers.crystal){
          const r=geometry.get_frame_transform('LAB',d.crystal.frame).matrix;
          const origin=point(r,[0,0,0]);
          basis.forEach((v,i)=>{
            const arrow=this.#arrow(origin,unit(direction(r,v)),colors.xyz[i],'晶体 '+['X','Y','Z'][i],55);arrow.updateWorldMatrix(true,false);
            this.#crystalOriginError=Math.max(this.#crystalOriginError,new THREE.Vector3().setFromMatrixPosition(arrow.matrixWorld).distanceTo(vector(origin)));
          });
        }
        if(layers.lattice)basis.forEach((v,i)=>this.#arrow(p,geometry.get_crystal_direction(d.id,v).vector,colors.xyz[i],'晶向 '+['[100]','[010]','[001]'][i],85,'lattice',true));
        const targetDirection=geometry.get_crystal_direction(d.id,state.target_indices,state.direction_type).vector,targetLength=110;
        this.#arrow(target,targetDirection,colors.target,(state.direction_type==='direct'?'目标方向 [':'目标法向 (')+state.target_indices.join(' ')+(state.direction_type==='direct'?']':')'),targetLength,'target');
        if(d.id===primarySample?.id)primaryTargetTip=vector(target).addScaledVector(vector(targetDirection),targetLength);
      }
    }
    this.scene.updateMatrixWorld(true);this.#maxError=0;
    const upperFrames=new Set<string>();let upperFrame=primarySample?.output_frame;
    while(upperFrame&&!upperFrames.has(upperFrame)){
      upperFrames.add(upperFrame);upperFrame=c.assembly.frames.find(f=>f.id===upperFrame)?.parent;
    }
    const upperIds=new Set(c.devices.devices.filter(d=>upperFrames.has(d.output_frame)&&(d.type==='theta'||d.type==='xy'||d.crystal)).map(d=>d.id));
    const upper=this.#bodyBounds(body=>upperIds.has(body.id));
    this.#sampleRadius=65;
    if(!upper.isEmpty())for(const x of [upper.min.x,upper.max.x])for(const y of [upper.min.y,upper.max.y])for(const z of [upper.min.z,upper.max.z])
      this.#sampleRadius=Math.max(this.#sampleRadius,new THREE.Vector3(x,y,z).distanceTo(vector(this.#sampleFocus)));
    // Reserve caption space around the primary scientific direction, not long auxiliary axes.
    if(primaryTargetTip)this.#sampleRadius=Math.max(this.#sampleRadius,primaryTargetTip.distanceTo(vector(this.#sampleFocus))*1.2);
    for(const [id,g]of this.#groups){
      const expected=geometry.get_frame_transform('LAB',id).matrix,e=g.matrixWorld.elements;
      expected.forEach((v,i)=>this.#maxError=Math.max(this.#maxError,Math.abs(v-e[(i%4)*4+Math.floor(i/4)])));
    }
    this.#detectorError=0;
    for(const panel of this.#activePanels){
      const t=geometry.get_world_transform(panel.id).matrix;
      for(const p of [[0,0,0],[-panel.width/2,panel.height/2,0],[panel.width/2,-panel.height/2,0]] as Vec3[])
        this.#detectorError=Math.max(this.#detectorError,vector(p).applyMatrix4(panel.mesh.matrixWorld).distanceTo(vector(point(t,p))));
    }
    const floor=this.#bodyBounds();if(!floor.isEmpty())this.#grid.position.y=floor.min.y-2;
    if(this.#revision<0)this.reset_camera();
    this.#labels.set(this.#labelEntries,geometry.revision,{diagnostics:diagnostics&&diagnosticPreset==='all'});this.#labels.render(this.camera);
    this.#revision=geometry.revision;
  }
  diagnostics(){return {rendered_revision:this.#revision,frame_count:this.#groups.size,max_world_matrix_error:this.#maxError,max_support_endpoint_error_mm:this.#rodError,max_detector_plane_error_mm:this.#detectorError,max_crystal_origin_error_mm:this.#crystalOriginError,selected_device_id:this.#policy?.selected?.id??null,diagnostic_layers:{enabled:this.#policy?.diagnostics??false,...(this.#policy?.layers??{frames:false,crystal:false,lattice:false})},webgl:true};}
  dispose(){
    this.renderer.setAnimationLoop(null);this.#observer.disconnect();
    const canvas=this.renderer.domElement;
    canvas.removeEventListener('pointerdown',this.#onPointerDown);canvas.removeEventListener('pointermove',this.#onPointerMove);
    canvas.removeEventListener('pointerup',this.#onPointerUp);canvas.removeEventListener('pointercancel',this.#onPointerCancel);
    this.controls.removeEventListener('change',this.#onControlsChange);this.controls.dispose();
    this.#clear(this.#root);this.#clear(this.#dynamic);this.#labels.dispose();this.renderer.dispose();this.#geometry=undefined;
  }
}
