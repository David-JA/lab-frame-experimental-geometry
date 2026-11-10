import { Vector3, type Camera, type Object3D } from 'three';

export type LabelRole='frame'|'crystal'|'lattice'|'axis'|'point'|'beam'|'target';
export interface SceneLabel {text:string;parent:Object3D;position:Vector3;role:LabelRole;color:string;priority:number}
interface Box {x:number;y:number;width:number;height:number}
export interface LabelAnchor {x:number;y:number;width:number;height:number;priority:number}
export function overlaps(a:Box,b:Box,gap=5){return a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;}
export function placeLabels(anchors:LabelAnchor[],width:number,height:number):(Box|undefined)[]{
  const result:(Box|undefined)[]=Array(anchors.length).fill(undefined),placed:Box[]=[];
  const order=anchors.map((a,i)=>({a,i})).sort((a,b)=>b.a.priority-a.a.priority||a.i-b.i);
  for(const {a,i}of order){
    if(a.width>width-16||a.height>height-16)continue;
    const candidates:Box[]=[],seen=new Set<string>();
    const add=(x:number,y:number)=>{
      x=Math.round(Math.max(8,Math.min(width-a.width-8,x)));y=Math.round(Math.max(8,Math.min(height-a.height-8,y)));
      const key=x+','+y;if(!seen.has(key)){seen.add(key);candidates.push({x,y,width:a.width,height:a.height});}
    };
    for(const x of [a.x+18,a.x-a.width-18,a.x-a.width/2])for(const y of [a.y-a.height/2,a.y-a.height-18,a.y+18])add(x,y);
    for(let y=8;y<=height-a.height-8;y+=16)for(let x=8;x<=width-a.width-8;x+=24)add(x,y);
    const score=(b:Box)=>Math.hypot(b.x+b.width/2-a.x,b.y+b.height/2-a.y);
    candidates.sort((a,b)=>score(a)-score(b));
    const box=candidates.find(b=>!placed.some(p=>overlaps(b,p))&&!anchors.some(p=>p.x>=b.x-4&&p.x<=b.x+b.width+4&&p.y>=b.y-4&&p.y<=b.y+b.height+4));
    if(box){result[i]=box;placed.push(box);}
  }
  return result;
}
interface LabelGroup {world:Vector3;entries:SceneLabel[];element:HTMLDivElement;line:SVGLineElement;dot:SVGCircleElement;width:number;height:number}
export class SceneLabels {
  readonly layer=document.createElement('div');
  #svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  #groups:LabelGroup[]=[];#lastView='';
  constructor(private host:HTMLElement){
    this.layer.className='scene-label-layer';this.layer.setAttribute('role','list');this.layer.setAttribute('aria-label','场景坐标与方向标注');
    this.#svg.classList.add('scene-label-leaders');this.#svg.setAttribute('aria-hidden','true');this.layer.append(this.#svg);host.append(this.layer);
  }
  set(entries:SceneLabel[],revision:number){
    this.layer.querySelectorAll('.scene-label').forEach(el=>el.remove());this.#svg.replaceChildren();this.#groups=[];
    for(const entry of entries){
      const world=entry.parent.localToWorld(entry.position.clone());
      let group=this.#groups.find(g=>g.world.distanceTo(world)<1e-6);
      if(!group){
        const element=document.createElement('div');element.className='scene-label';element.setAttribute('role','listitem');
        const line=document.createElementNS(this.#svg.namespaceURI,'line') as SVGLineElement;
        const dot=document.createElementNS(this.#svg.namespaceURI,'circle') as SVGCircleElement;dot.setAttribute('r','2.5');
        this.#svg.append(line,dot);this.layer.append(element);
        group={world,entries:[],element,line,dot,width:0,height:0};this.#groups.push(group);
      }
      group.entries.push(entry);
    }
    for(const g of this.#groups){
      const frames=g.entries.filter(e=>e.role==='frame'),others=g.entries.filter(e=>e.role!=='frame');
      if(g.entries.length>1){const badge=document.createElement('span');badge.className='scene-label-note';badge.textContent='共点';badge.title='仅锚点位置重合，不代表坐标轴方向相同';g.element.append(badge);}
      const row=(items:SceneLabel[])=>{
        if(!items.length)return;
        const el=document.createElement('div');el.className='scene-label-row';
        for(const entry of items){const span=document.createElement('span');span.className='scene-label-entry';span.dataset.role=entry.role;span.textContent=entry.text;span.style.setProperty('--label-color',entry.color);el.append(span);}
        g.element.append(el);
      };
      row(others);row(frames);
      g.element.setAttribute('aria-label',g.entries.map(e=>e.text).join('、')+(g.entries.length>1?'；锚点共点，不代表坐标轴同向':''));
      g.element.dataset.members=JSON.stringify(g.entries.map(e=>({text:e.text,role:e.role,color:e.color})));
      g.element.dataset.world=JSON.stringify(g.world.toArray());
      const color=g.entries.reduce((a,b)=>a.priority>=b.priority?a:b).color;
      g.element.style.setProperty('--label-color',color);g.line.setAttribute('stroke',color);g.dot.setAttribute('fill',color);
    }
    this.layer.dataset.revision=String(revision);this.#lastView='';
  }
  render(camera:Camera){
    const width=this.host.clientWidth,height=this.host.clientHeight;
    camera.updateMatrixWorld();
    const view=[width,height,...camera.matrixWorldInverse.elements,...camera.projectionMatrix.elements].join(',');
    if(view===this.#lastView)return;this.#lastView=view;
    const active:{group:LabelGroup;anchor:LabelAnchor}[]=[];
    for(const g of this.#groups){
      const p=g.world.clone().project(camera),visible=p.z>=-1&&p.z<=1&&Math.abs(p.x)<=1&&Math.abs(p.y)<=1;
      g.element.hidden=!visible;g.line.toggleAttribute('hidden',!visible);g.dot.toggleAttribute('hidden',!visible);
      if(!visible)continue;
      g.width=g.element.offsetWidth;g.height=g.element.offsetHeight;
      active.push({group:g,anchor:{x:(p.x+1)*width/2,y:(1-p.y)*height/2,width:g.width,height:g.height,priority:Math.max(...g.entries.map(e=>e.priority))}});
    }
    const boxes=placeLabels(active.map(a=>a.anchor),width,height);
    let hidden=0;
    active.forEach(({group:g,anchor:a},i)=>{
      const box=boxes[i];g.element.hidden=!box;g.line.toggleAttribute('hidden',!box);g.dot.toggleAttribute('hidden',!box);
      if(!box){hidden++;return;}
      g.element.style.transform=`translate(${box.x}px,${box.y}px)`;
      g.line.setAttribute('x1',String(a.x));g.line.setAttribute('y1',String(a.y));
      g.line.setAttribute('x2',String(Math.max(box.x,Math.min(box.x+box.width,a.x))));g.line.setAttribute('y2',String(Math.max(box.y,Math.min(box.y+box.height,a.y))));
      g.dot.setAttribute('cx',String(a.x));g.dot.setAttribute('cy',String(a.y));
    });
    this.layer.dataset.hiddenCount=String(hidden);this.layer.dataset.visibleCount=String(active.length-hidden);
  }
  dispose(){this.layer.remove();}
}
