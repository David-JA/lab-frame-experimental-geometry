import { Vector3, type Camera, type Object3D } from 'three';

export type LabelRole='frame'|'crystal'|'lattice'|'axis'|'point'|'beam'|'target';
export interface SceneLabel {text:string;parent:Object3D;position:Vector3;role:LabelRole;color:string;priority:number;visible?:boolean;emphasis?:'plain'|'selected';targetPoint?:boolean;caption?:string}
export interface WorldLabelGroup {world:Vector3;entries:SceneLabel[]}
const isPointAnchor=(entry:SceneLabel)=>entry.role==='frame'||entry.role==='point';
export function groupSceneLabels(entries:SceneLabel[]):WorldLabelGroup[]{
  const groups:WorldLabelGroup[]=[];
  for(const entry of entries){
    const world=entry.parent.localToWorld(entry.position.clone());
    // Arrow tips and axis captions use arbitrary display lengths, not physical point identities.
    let group=isPointAnchor(entry)?groups.find(g=>g.entries.every(isPointAnchor)&&g.world.distanceTo(world)<1e-6):undefined;
    if(!group){group={world,entries:[]};groups.push(group);}
    group.entries.push(entry);
  }
  // Hidden entries retain coincidence metadata without creating routine captions of their own.
  return groups.filter(g=>g.entries.some(e=>e.visible!==false));
}
export function labelPresentation(entries:SceneLabel[],diagnostics=false){
  const visible=entries.filter(e=>e.visible!==false);
  const selected=visible.find(e=>e.emphasis==='selected'),target=visible.find(e=>e.targetPoint);
  const coincident=entries.length>1&&entries.every(isPointAnchor);
  const primary=target??selected??[...visible].sort((a,b)=>b.priority-a.priority)[0];
  const summary=[primary,selected===primary?undefined:selected].filter((e):e is SceneLabel=>!!e).map(e=>e.caption??e.text).join(' · ');
  const details=diagnostics?visible.filter(e=>e!==primary&&e!==selected).slice(0,3):[];
  return {emphasis:coincident?'coincident':selected?'selected':'plain',summary,primary,details,coincident};
}
interface Box {x:number;y:number;width:number;height:number}
export interface LabelAnchor {x:number;y:number;width:number;height:number;priority:number;preferSide?:boolean}
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
    const dx=a.preferSide?28:18,dy=a.preferSide?48:18;
    for(const x of [a.x+dx,a.x-a.width-dx,a.x-a.width/2])for(const y of [a.y-a.height/2,a.y-a.height-dy,a.y+dy])add(x,y);
    for(let y=8;y<=height-a.height-8;y+=16)for(let x=8;x<=width-a.width-8;x+=24)add(x,y);
    const score=(b:Box)=>Math.hypot(b.x+b.width/2-a.x,b.y+b.height/2-a.y);
    const sidePenalty=(b:Box)=>a.preferSide&&!(b.x>=a.x+24||b.x+b.width<=a.x-24)?1:0;
    candidates.sort((a,b)=>sidePenalty(a)-sidePenalty(b)||score(a)-score(b));
    const box=candidates.find(b=>!placed.some(p=>overlaps(b,p))&&!anchors.some(p=>{
      // Point badges protect the sample silhouette, not just its zero-area anchor.
      const cx=p.preferSide?24:4,cy=p.preferSide?44:4;
      return p.x>=b.x-cx&&p.x<=b.x+b.width+cx&&p.y>=b.y-cy&&p.y<=b.y+b.height+cy;
    }));
    if(box){result[i]=box;placed.push(box);}
  }
  return result;
}
interface LabelGroup extends WorldLabelGroup {element:HTMLDivElement;line:SVGLineElement;dot:SVGCircleElement;width:number;height:number}
export class SceneLabels {
  readonly layer=document.createElement('div');
  #svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  #groups:LabelGroup[]=[];#lastView='';
  constructor(private host:HTMLElement,private onInspectCoincident?:(position:[number,number,number])=>void){
    this.layer.className='scene-label-layer';this.layer.setAttribute('role','list');this.layer.setAttribute('aria-label','场景坐标与方向标注');
    this.layer.style.pointerEvents='none';
    this.#svg.classList.add('scene-label-leaders');this.#svg.setAttribute('aria-hidden','true');this.layer.append(this.#svg);host.append(this.layer);
  }
  set(entries:SceneLabel[],revision:number,options:{diagnostics?:boolean}={}){
    this.layer.querySelectorAll('.scene-label').forEach(el=>el.remove());this.#svg.replaceChildren();this.#groups=[];
    for(const group of groupSceneLabels(entries)){
      const element=document.createElement('div');element.className='scene-label';element.setAttribute('role','listitem');
      element.style.fontSize='12px';element.style.pointerEvents='none';
      const line=document.createElementNS(this.#svg.namespaceURI,'line') as SVGLineElement;
      const dot=document.createElementNS(this.#svg.namespaceURI,'circle') as SVGCircleElement;dot.setAttribute('r','2.5');
      this.#svg.append(line,dot);this.layer.append(element);
      this.#groups.push({...group,element,line,dot,width:0,height:0});
    }
    for(const g of this.#groups){
      const presentation=labelPresentation(g.entries,options.diagnostics);
      g.element.dataset.emphasis=presentation.emphasis;
      g.element.dataset.selected=String(g.entries.some(e=>e.emphasis==='selected'&&e.visible!==false));
      const caption=document.createElement(presentation.coincident?'button':'span');
      caption.className=presentation.coincident?'scene-label-inspect':'scene-label-entry';
      caption.textContent=presentation.summary+(presentation.coincident?' · 共点':'');
      if(presentation.primary)caption.dataset.role=presentation.primary.role;
      if(caption instanceof HTMLButtonElement){
        caption.type='button';caption.dataset.action='inspect-coincident';caption.style.pointerEvents='auto';
        caption.title='查看共点详情；仅锚点位置重合，不代表坐标轴方向相同';
        caption.setAttribute('aria-label',presentation.summary+'；查看共点详情');
        caption.addEventListener('click',event=>{event.stopPropagation();this.onInspectCoincident?.(g.world.toArray());});
      }
      g.element.append(caption);
      if(presentation.details.length){
        const row=document.createElement('div');row.className='scene-label-row';
        for(const entry of presentation.details){
          const span=document.createElement('span');span.className='scene-label-entry';span.dataset.role=entry.role;
          span.textContent=entry.text;span.style.setProperty('--label-color',entry.color);row.append(span);
        }
        g.element.append(row);
      }
      g.element.dataset.members=JSON.stringify(g.entries.map(e=>({text:e.text,role:e.role,color:e.color})));
      g.element.dataset.world=JSON.stringify(g.world.toArray());
      const visible=g.entries.filter(e=>e.visible!==false);
      const color=(visible.find(e=>e.targetPoint)??visible.reduce((a,b)=>a.priority>=b.priority?a:b)).color;
      g.element.style.setProperty('--label-color',color);g.line.setAttribute('stroke',color);g.dot.setAttribute('fill',color);
    }
    this.layer.dataset.revision=String(revision);this.layer.dataset.diagnostics=String(options.diagnostics??false);this.#lastView='';
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
      const preferSide=g.entries.length>1||g.entries.some(e=>e.visible!==false&&(e.targetPoint||e.emphasis==='selected'));
      active.push({group:g,anchor:{x:(p.x+1)*width/2,y:(1-p.y)*height/2,width:g.width,height:g.height,priority:Math.max(...g.entries.map(e=>e.priority)),preferSide}});
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
