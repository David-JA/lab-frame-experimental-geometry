import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Scene as GeometryScene, SceneConfig, Device, Mat4, Vec3 } from '../core';
import { point, direction, unit } from '../core/math';
import { SceneLabels, type SceneLabel, type LabelRole } from './scene-labels';

const colors={xyz:[0xb44545,0x277959,0x3d6bb0],phi:0x9a6500,theta:0x7251b3,beam:0x087e9a,pivot:0x566574,sample:0x243e52,target:0xb33774};
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
  #axes:THREE.Object3D[]=[];#key='';#revision=-1;#maxError=0;#rodError=0;#detectorError=0;#crystalOriginError=0;#config?:SceneConfig;
  #activePanels:{id:string;mesh:THREE.Mesh;width:number;height:number}[]=[];
  #sampleFocus:Vec3=[0,200,0];
  #labels:SceneLabels;#labelEntries:SceneLabel[]=[];
  #observer:ResizeObserver;
  constructor(private container:HTMLElement){
    this.scene.background=new THREE.Color('#edf2f6');
    this.renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    this.renderer.domElement.setAttribute('aria-label','实验装置三维场景');container.append(this.renderer.domElement);
    this.#labels=new SceneLabels(container);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;
    this.scene.add(new THREE.HemisphereLight(0xd6edff,0x28354a,2.7));
    const light=new THREE.DirectionalLight(0xffffff,2.3);light.position.set(500,1000,500);this.scene.add(light);
    const grid=new THREE.GridHelper(1800,18,0x9fb3c3,0xcbd7e0);grid.position.y=-30;this.scene.add(grid);
    this.scene.add(this.#root,this.#dynamic);this.reset_camera();
    this.#observer=new ResizeObserver(()=>this.resize());this.#observer.observe(container);this.resize();
    this.renderer.setAnimationLoop(()=>{this.controls.update();this.renderer.render(this.scene,this.camera);this.#labels.render(this.camera);});
  }
  reset_camera(){
    const box=new THREE.Box3().setFromObject(this.#root);
    if(box.isEmpty()){this.camera.position.set(950,640,1450);this.controls.target.set(0,180,400);}
    else{
      const sphere=box.getBoundingSphere(new THREE.Sphere()),vertical=THREE.MathUtils.degToRad(this.camera.fov);
      const horizontal=2*Math.atan(Math.tan(vertical/2)*this.camera.aspect);
      const distance=sphere.radius/Math.sin(Math.min(vertical,horizontal)/2)*1.12;
      this.controls.target.copy(sphere.center);this.camera.position.copy(sphere.center).add(new THREE.Vector3(1.1,.65,1.5).normalize().multiplyScalar(distance));
    }
    this.controls.update();
  }
  focus_sample(){this.controls.target.copy(vector(this.#sampleFocus));this.camera.position.copy(vector(this.#sampleFocus)).add(new THREE.Vector3(430,250,550));this.controls.update();}
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
  #label(text:string,parent:THREE.Object3D,position:Vec3,role:LabelRole='frame',color=0x36566c,priority=1){
    this.#labelEntries.push({text,parent,position:vector(position),role,color:'#'+color.toString(16).padStart(6,'0'),priority});
  }
  #body(d:Device){
    const [x,y,z]=d.visual.size_mm;let geometry:THREE.BufferGeometry;
    if(d.visual.shape==='cylinder'){
      const vertical=d.type==='rotary';geometry=new THREE.CylinderGeometry(.5,.5,1,32);
      if(!vertical)geometry.rotateX(Math.PI/2);
      geometry.scale(x,y,z);
    }else geometry=new THREE.BoxGeometry(x,y,z);
    const material=new THREE.MeshStandardMaterial({color:d.visual.color,metalness:.25,roughness:.65,transparent:d.type==='detector',opacity:d.type==='detector'?.22:1});
    const mesh=new THREE.Mesh(geometry,material);mesh.position.copy(vector(d.visual.offset_mm??[0,0,0]));
    if(d.type==='detector')mesh.position.z+=z/2;
    this.#groups.get(d.output_frame)!.add(mesh);
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:0xa9c4d9,transparent:true,opacity:.35})));
    if(d.detector){
      const [nu,nv]=d.detector.pixels,[px,py]=d.detector.pixel_size_mm;
      const active=new THREE.Mesh(new THREE.PlaneGeometry(nu*px,nv*py),new THREE.MeshBasicMaterial({color:0x79cadd,side:THREE.DoubleSide,transparent:true,opacity:.2,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
      this.#groups.get(d.output_frame)!.add(active);
      this.#activePanels.push({id:d.id,mesh:active,width:nu*px,height:nv*py});
    }
    if(d.type==='hexapod'){
      const f=this.#config!.assembly.frames.find(f=>f.id===d.output_frame)!;
      this.#groups.get(f.parent)!.add(new THREE.Mesh(new THREE.BoxGeometry(x,y,z),material.clone()));
    }
  }
  #rebuild(c:SceneConfig){
    this.#clear(this.#root);this.#groups.clear();this.#axes=[];this.#activePanels=[];this.#config=c;
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
      if(!crystalFrames.has(id)){const axes=new THREE.AxesHelper(id==='LAB'?180:35);axes.setColors(...colors.xyz as [number,number,number]);g.add(axes);this.#axes.push(axes);}
    }
    c.devices.devices.forEach(d=>this.#body(d));
  }
  #line(a:Vec3,b:Vec3,color:number,radius=1.5){
    const delta=vector(b).sub(vector(a)),length=delta.length();
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,1,10),new THREE.MeshBasicMaterial({color}));
    mesh.position.copy(vector(a).add(vector(b)).multiplyScalar(.5));mesh.scale.y=length;
    if(length>1e-12)mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
    this.#dynamic.add(mesh);return mesh;
  }
  #dashedLine(a:Vec3,b:Vec3,color:number,overlay=false){
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([vector(a),vector(b)]),new THREE.LineDashedMaterial({color,dashSize:8,gapSize:5,depthTest:!overlay}));
    line.computeLineDistances();if(overlay)line.renderOrder=2;this.#dynamic.add(line);return line;
  }
  #marker(p:Vec3,color:number,label:string,pivot=false){
    const geometry=pivot?new THREE.OctahedronGeometry(7):new THREE.SphereGeometry(4,14,10);
    const marker=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,wireframe:pivot,depthTest:false}));
    marker.position.copy(vector(p));this.#dynamic.add(marker);this.#label(label,this.#dynamic,p,'point',color,5);
  }
  #arrow(p:Vec3,d:Vec3,color:number,label:string,length=75,role:LabelRole='crystal',dashed=false){
    const arrow=new THREE.ArrowHelper(vector(d),vector(p),length,color,dashed?6:9,dashed?3:4);this.#dynamic.add(arrow);
    const end=p.map((x,i)=>x+d[i]*length) as Vec3;
    if(dashed){arrow.line.visible=false;this.#dashedLine(p,end,color,true);}
    this.#label(label,this.#dynamic,end,role,color,role==='target'?5:3);
    return arrow;
  }
  update(geometry:GeometryScene){
    const c=geometry.save_state(),key=JSON.stringify({devices:c.devices,assembly:c.assembly});
    if(this.#key!==key){this.#rebuild(c);this.#key=key;}
    for(const [id,g]of this.#groups)g.matrix.copy(matrix(geometry.get_local_transform(id)));
    this.#axes.forEach(a=>a.visible=c.experiment_state.display.frames);this.#clear(this.#dynamic);this.#labelEntries=[];
    const crystalFrames=new Set(c.devices.devices.filter(d=>d.crystal).map(d=>d.crystal!.frame));
    for(const [id,g]of this.#groups)if(crystalFrames.has(id)?c.experiment_state.display.crystal:c.experiment_state.display.frames)this.#label(id,g,[0,0,0]);
    const beam=c.assembly.beam,pb=beam.point_mm;
    this.#line([pb[0],pb[1],pb[2]-250],[pb[0],pb[1],pb[2]+1200],colors.beam,.8);this.#label('beam +Z',this.#dynamic,[pb[0],pb[1],pb[2]+700],'beam',colors.beam,2);
    const axes=c.devices.devices.filter(d=>d.type==='rotary'||d.type==='theta').map(d=>{
      const axis=geometry.get_axis(d.id),m=geometry.get_frame_transform('LAB',axis.frame).matrix;
      return {device:d,p:point(m,axis.point_mm),v:unit(direction(m,axis.direction))};
    });
    const coaxial=(a:typeof axes[number],b:typeof axes[number])=>vector(a.v).cross(vector(b.v)).length()<1e-8&&vector(a.p).sub(vector(b.p)).cross(vector(b.v)).length()<1e-6;
    this.#rodError=0;this.#crystalOriginError=0;
    for(const s of c.assembly.supports){
      const a=point(geometry.get_frame_transform('LAB',s.base_frame).matrix,s.base_point_mm),b=point(geometry.get_frame_transform('LAB',s.moving_frame).matrix,s.moving_point_mm);
      const rod=this.#line(a,b,0xc0c8d0,3);rod.updateMatrixWorld(true);
      this.#rodError=Math.max(this.#rodError,new THREE.Vector3(0,-.5,0).applyMatrix4(rod.matrixWorld).distanceTo(vector(a)),new THREE.Vector3(0,.5,0).applyMatrix4(rod.matrixWorld).distanceTo(vector(b)));
    }
    for(const d of c.devices.devices){
      if(d.type==='hexapod')this.#marker(geometry.get_pivot(d.id).position,colors.pivot,'pivot',true);
      if(d.type==='rotary'||d.type==='theta'){
        const a=axes.find(a=>a.device.id===d.id)!,{p,v}=a;
        const start=p.map((x,i)=>x-v[i]*80) as Vec3,end=p.map((x,i)=>x+v[i]*260) as Vec3;
        if(d.type==='theta')this.#dashedLine(start,end,colors.theta,true);else this.#line(start,end,colors.phi,.8);
        const shared=axes.find(b=>b.device.type!==d.type&&coaxial(a,b));
        if(d.type==='theta'&&shared)continue;
        const label=shared?'φ / θ 共轴':d.type==='rotary'?'φ 轴':'θ 轴';
        this.#label(label,this.#dynamic,p.map((x,i)=>x+v[i]*150) as Vec3,'axis',d.type==='rotary'?colors.phi:colors.theta,4);
      }
      if(d.crystal){
        const p=geometry.get_sample_point(d.id,'center').position,target=geometry.get_sample_point(d.id).position,state=c.experiment_state.samples[d.id];
        this.#sampleFocus=p;
        this.#marker(p,colors.sample,'样品中心');
        if(p.some((x,i)=>Math.abs(x-target[i])>1e-6))this.#marker(target,colors.target,'目标点');
        else this.#label('目标点',this.#dynamic,target,'point',colors.target,5);
        const basis:Vec3[]=[[1,0,0],[0,1,0],[0,0,1]];
        if(c.experiment_state.display.crystal){
          const r=geometry.get_frame_transform('LAB',d.crystal.frame).matrix;
          const origin=point(r,[0,0,0]);
          basis.forEach((v,i)=>{
            const arrow=this.#arrow(origin,unit(direction(r,v)),colors.xyz[i],'C '+['X','Y','Z'][i],55);arrow.updateWorldMatrix(true,false);
            this.#crystalOriginError=Math.max(this.#crystalOriginError,new THREE.Vector3().setFromMatrixPosition(arrow.matrixWorld).distanceTo(vector(origin)));
          });
        }
        if(c.experiment_state.display.lattice)basis.forEach((v,i)=>this.#arrow(p,geometry.get_crystal_direction(d.id,v).vector,colors.xyz[i],['[100]','[010]','[001]'][i],85,'lattice',true));
        this.#arrow(target,geometry.get_crystal_direction(d.id,state.target_indices,state.direction_type).vector,colors.target,(state.direction_type==='direct'?'目标方向 [':'目标法向 (')+state.target_indices.join(' ')+(state.direction_type==='direct'?']':')'),110,'target');
      }
    }
    this.scene.updateMatrixWorld(true);this.#maxError=0;
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
    if(this.#revision<0)this.reset_camera();
    this.#labels.set(this.#labelEntries,geometry.revision);this.#labels.render(this.camera);
    this.#revision=geometry.revision;
  }
  diagnostics(){return {rendered_revision:this.#revision,frame_count:this.#groups.size,max_world_matrix_error:this.#maxError,max_support_endpoint_error_mm:this.#rodError,max_detector_plane_error_mm:this.#detectorError,max_crystal_origin_error_mm:this.#crystalOriginError,webgl:true};}
  dispose(){this.renderer.setAnimationLoop(null);this.#observer.disconnect();this.controls.dispose();this.#clear(this.#root);this.#clear(this.#dynamic);this.#labels.dispose();this.renderer.dispose();}
}
