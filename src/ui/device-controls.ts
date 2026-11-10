import type { Scene, Device, Frame, Vec3, DirectionType } from '../core';
import { point } from '../core/math';

const names:Record<Device['type'],string>={rotary:'大样品台 · φ',hexapod:'六轴位移台',theta:'θ 旋转台',xy:'XY 位移台',sample:'样品与晶体',detector:'探测器',fixture:'固定支架'};
const fmt=(n:number)=>Math.abs(n)<1e-9?'0':String(Number(n.toFixed(6)));
const xyz=(p:Vec3)=>p.map(fmt).join(', ');
export class DeviceControls {
  #refresh:(()=>void)[]=[];
  #cards=new Map<string,HTMLDetailsElement>();#rows=new Map<string,HTMLButtonElement>();#aliases=new Map<string,string>();
  #selectedId='';#onSelect?: (id:string)=>void;#title:HTMLElement;
  constructor(private scene:Scene,private host:HTMLElement,private edit:(action:()=>void,input?:HTMLInputElement)=>void,options:{selectedId?:string;onSelect?:(id:string)=>void}={}){
    const oldOpen=new Map(Array.from(host.querySelectorAll<HTMLDetailsElement>('details')).map(el=>[el.id,el.open]));
    const oldExpanded=new Map(Array.from(host.querySelectorAll<HTMLButtonElement>('.device-tree-row')).map(el=>[el.dataset.device!,el.getAttribute('aria-expanded')]));
    this.#onSelect=options.onSelect;host.replaceChildren();
    const tree=document.createElement('ul');tree.className='device-tree';tree.setAttribute('role','tree');tree.setAttribute('aria-label','装置树');
    const inspector=document.createElement('section');inspector.className='device-inspector';inspector.setAttribute('aria-label','当前设备参数');
    this.#title=document.createElement('h2');this.#title.id='selected-device-name';inspector.append(this.#title);host.append(tree,inspector);
    const branches=new Map<string,HTMLUListElement>();
    const c=scene.save_state(),frames=new Map(c.assembly.frames.map(f=>[f.id,f]));
    const devices=c.devices.devices,byOutput=new Map(devices.map(d=>[d.output_frame,d]));
    const frameParent=(id:string)=>frames.get(id)?.parent??devices.find(d=>d.crystal?.frame===id)?.output_frame;
    const parentDevice=(d:Device)=>{
      let parent=frameParent(d.output_frame);
      while(parent&&parent!=='LAB'){const owner=byOutput.get(parent);if(owner)return owner;parent=frameParent(parent);}
      return undefined;
    };
    const integrated=(d:Device)=>devices.filter(x=>x.integrated_into===d.id);
    const visibleParent=(d:Device)=>{const parent=parentDevice(d);return parent?.integrated_into?devices.find(x=>x.id===parent.integrated_into):parent;};
    const depth=(d:Device):number=>{const parent=visibleParent(d);return parent?depth(parent)+1:0;};
    const descendants=(frame:string)=>devices.filter(candidate=>{
      let id:string|undefined=candidate.output_frame;
      while(id&&id!=='LAB'){if(id===frame)return true;id=frameParent(id);}
      return false;
    });
    const deviceName=(d:Device):string=>d.integrated_into?deviceName(devices.find(x=>x.id===d.integrated_into)!):(integrated(d).length?'XYθ 一体位移台':names[d.type])+(devices.filter(x=>x.type===d.type).length>1?' ('+d.id+')':'');
    const impact=(frame:string)=>{
      const affected=descendants(frame);
      return affected.filter(d=>!d.integrated_into||!affected.some(x=>x.id===d.integrated_into)).map(d=>deviceName(d)+(d.integrated_into?' · XY 滑台':'')).join('、')+(affected.some(x=>x.crystal)?'、C 晶体坐标系':'');
    };
    const tip=document.getElementById('parameter-help')!;
    const hide=()=>{tip.hidden=true;};
    const explain=(button:HTMLButtonElement,message:string)=>{
      const show=()=>{
        tip.textContent=message;tip.hidden=false;
        const r=button.getBoundingClientRect(),width=Math.min(320,window.innerWidth-24);
        tip.style.width=width+'px';tip.style.left=Math.max(12,Math.min(r.left,window.innerWidth-width-12))+'px';
        tip.style.top=Math.max(12,Math.min(r.bottom+8,window.innerHeight-tip.offsetHeight-12))+'px';
      };
      button.setAttribute('aria-describedby','parameter-help');
      button.addEventListener('mouseenter',show);button.addEventListener('mouseleave',hide);
      button.addEventListener('focus',show);button.addEventListener('blur',hide);
      button.addEventListener('click',show);button.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
    };
    host.closest<HTMLElement>('aside')!.onscroll=hide;window.onscroll=hide;window.onresize=hide;hide();
    const text=(tag:string,value:string,parent:HTMLElement,className='')=>{
      const el=document.createElement(tag);el.textContent=value;el.className=className;parent.append(el);return el;
    };
    const detail=(id:string,title:string,parent:HTMLElement,open:boolean,className:string)=>{
      const box=document.createElement('details');box.id=id;box.className=className;box.open=oldOpen.get(id)??open;
      const summary=document.createElement('summary');summary.textContent=title;box.append(summary);parent.append(box);return box;
    };
    const number=(label:string,aria:string,get:()=>number,parent:HTMLElement,message:string,write:(value:number)=>void,joint?:string,draft=false)=>{
      const row=document.createElement('div');row.className='parameter';
      const name=document.createElement('button');name.type='button';name.className='parameter-name';name.textContent=label;name.setAttribute('aria-label','说明：'+aria);explain(name,message);
      const input=document.createElement('input');input.type='number';input.step='any';input.setAttribute('aria-label',aria);
      if(joint)input.dataset.joint=joint;
      const refresh=()=>input.value=String(get());refresh();if(!draft)this.#refresh.push(refresh);
      if(!draft)input.addEventListener('change',()=>this.edit(()=>write(input.valueAsNumber),input));row.append(name,input);parent.append(row);return input;
    };
    const ordered:Device[]=[];
    const visit=(parent:Device|undefined)=>{for(const d of devices.filter(d=>parentDevice(d)===parent)){ordered.push(d);visit(d);}};visit(undefined);
    for(const d of ordered){
      if(d.integrated_into)continue;
      const parent=visibleParent(d),f=frames.get(d.output_frame),members=[d,...integrated(d)];
      const item=document.createElement('li');item.setAttribute('role','none');
      const row=document.createElement('button');row.type='button';row.className='device-tree-row';row.dataset.device=d.id;
      row.setAttribute('role','treeitem');row.setAttribute('aria-level',String(depth(d)+1));row.setAttribute('aria-selected','false');row.tabIndex=-1;
      const toggle=document.createElement('span');toggle.className='tree-toggle';toggle.setAttribute('aria-hidden','true');
      const label=document.createElement('span');label.textContent=deviceName(d);row.append(toggle,label);item.append(row);
      (parent?branches.get(parent.id)!:tree).append(item);
      const children=devices.filter(x=>!x.integrated_into&&visibleParent(x)?.id===d.id);
      if(children.length){
        const list=document.createElement('ul');list.setAttribute('role','group');item.append(list);branches.set(d.id,list);
        row.setAttribute('aria-expanded',oldExpanded.get(d.id)??'true');list.hidden=row.getAttribute('aria-expanded')==='false';
        toggle.textContent=list.hidden?'▸':'▾';
        toggle.onclick=e=>{e.stopPropagation();list.hidden=!list.hidden;row.setAttribute('aria-expanded',String(!list.hidden));toggle.textContent=list.hidden?'▸':'▾';if(list.hidden&&list.contains(this.#rows.get(this.#selectedId)??null))this.select(d.id);};
      }else toggle.textContent='·';
      row.onclick=()=>this.select(d.id);
      row.onkeydown=e=>{
        const visible=Array.from(tree.querySelectorAll<HTMLButtonElement>('.device-tree-row')).filter(el=>el.getClientRects().length),index=visible.indexOf(row);
        if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();visible[Math.max(0,Math.min(visible.length-1,index+(e.key==='ArrowDown'?1:-1)))]?.focus();}
        if(e.key==='ArrowRight'&&branches.has(d.id)){e.preventDefault();if(row.getAttribute('aria-expanded')==='false')toggle.click();else branches.get(d.id)!.querySelector<HTMLButtonElement>('.device-tree-row')?.focus();}
        if(e.key==='ArrowLeft'){e.preventDefault();if(row.getAttribute('aria-expanded')==='true')toggle.click();else if(parent)this.#rows.get(parent.id)?.focus();}
      };
      this.#rows.set(d.id,row);
      const box=detail('device-'+d.id,deviceName(d),inspector,true,'device-card');box.open=true;
      this.#cards.set(d.id,box);members.forEach(x=>this.#aliases.set(x.id,d.id));
      box.dataset.device=d.id;box.dataset.devices=JSON.stringify(members.map(x=>x.id));box.dataset.title=deviceName(d);box.style.setProperty('--depth',String(depth(d)));
      const summary=box.querySelector('summary')!;
      const relation=document.createElement('span');relation.className='relation';relation.textContent=(parent?deviceName(parent):'LAB 固定基准')+' → '+d.output_frame+(members.length>1?' → '+members.slice(1).map(x=>x.output_frame).join(' / '):'');summary.append(relation);
      const body=document.createElement('div');body.className='device-body';box.append(body);
      if(!f){
        const placement=detail('placement-'+d.id,'安装与几何 · 绑定参考 '+d.output_frame,body,false,'parameter-block');
        text('p','直接绑定 '+d.output_frame+'，没有独立安装 mount；此处为只读参考。',placement,'small');
        const info=text('p','',placement,'position-info');
        this.#refresh.push(()=>info.textContent='绑定原点 · LAB ('+xyz(scene.get_world_position(d.id).position)+') mm');
        const motion=detail('motion-'+d.id,'自身自由度 · 无独立关节',body,true,'parameter-block');
        text('p','位姿由绑定坐标系提供；请调整其父级装置或晶体取向。',motion,'small');body.prepend(motion);
        continue;
      }
      const impactInfo=text('p','影响对象：'+impact(d.output_frame),body,'impact');
      // A fixed, unowned parent represents the physical installation base (H0 / P0 in the example).
      const parentFrame=frames.get(f.parent);
      const anchor=(d.type==='hexapod'||d.type==='theta')&&parentFrame?.motion.kind==='fixed'&&!byOutput.has(parentFrame.id)?parentFrame:f;
      const readFrame=()=>scene.save_state().assembly.frames.find(x=>x.id===anchor.id)!;
      const reference=(frame:Frame):Vec3=>frame.motion.kind==='revolute'?frame.motion.center_mm:frame.motion.kind==='six_dof'?frame.motion.pivot_mm:frame.mount.position_mm;
      const placement=detail('placement-'+d.id,'安装与几何 · '+anchor.parent+' / mm',body,false,'parameter-block');placement.append(impactInfo);
      text('p',anchor.motion.kind==='revolute'?'旋转轴参考点；随底座一起移动。':anchor.motion.kind==='six_dof'?'零位 pivot 安装参考点，不含本级平移。':anchor.motion.kind==='xy_translation'?'零位安装参考点 '+anchor.id+'，不含本级 XY 行程。':'安装基座 '+anchor.id+' 的原点，坐标相对 '+anchor.parent+'。',placement,'small');
      const positionInfo=text('p','',placement,'position-info');
      this.#refresh.push(()=>{const a=readFrame();positionInfo.textContent='安装参考点 · LAB ('+xyz(point(scene.get_frame_transform('LAB',a.parent).matrix,reference(a)))+') mm';});
      const installHint='在 '+anchor.parent+' 坐标系中设置安装参考点。整体平移 '+impact(anchor.id)+'；保留关节读数与内部相对装配。其他独立分支和入射光束不会跟随。';
      for(let i=0;i<3;i++)number(['X','Y','Z'][i],deviceName(d)+' · 安装 '+['X','Y','Z'][i]+' / mm',()=>reference(readFrame())[i],placement,installHint,value=>{
        const next=scene.save_state(),a=next.assembly.frames.find(x=>x.id===anchor.id)!,delta=value-reference(a)[i];
        a.mount.position_mm[i]+=delta;
        if(a.motion.kind==='revolute')a.motion.center_mm[i]+=delta;
        if(a.motion.kind==='six_dof')a.motion.pivot_mm[i]+=delta;
        scene.restore_state(next);
      });
      if(members.length>1){
        text('p','XY 基座固定在 θ 旋转中心，无独立安装位移或安装转角；下方 X/Y 是一体台内部行程。',placement,'small');
        const baseInfo=text('p','',placement,'position-info');baseInfo.dataset.integratedBase=d.id;
        this.#refresh.push(()=>{const axis=scene.get_axis(d.id);baseInfo.textContent='XY 固定基座 · θ 中心 · LAB ('+xyz(point(scene.get_frame_transform('LAB',axis.frame).matrix,axis.point_mm))+') mm';});
      }
      const motion=detail('motion-'+d.id,members.length>1?'一体台运动 · θ / X / Y':'自身自由度'+(f.motion.kind==='fixed'?' · 固定安装':''),body,true,'parameter-block');
      for(const member of members){
        const mf=frames.get(member.output_frame)!;
        const group=members.length>1?detail('part-'+member.id,member.type==='theta'?'θ 旋转':'XY 平移 · 内部行程',motion,true,'sub-block'):motion;
        group.dataset.devicePart=member.id;
        const joints=mf.motion.kind==='six_dof'?mf.motion.joints:mf.motion.kind==='revolute'?[mf.motion.joint]:mf.motion.kind==='xy_translation'?mf.motion.joints:[];
        if(!joints.length)text('p','无独立机械关节；跟随父级参考系。',group,'small');
        for(const id of joints){
          const j=c.assembly.joints.find(j=>j.id===id)!;
          const label=id.split('.').at(-1)!+' / '+j.unit;
          const hint='这是 '+names[member.type]+' 的关节运动量，作用于 '+mf.parent+' 中定义的轴。联动：'+impact(member.output_frame)+'。不改写安装位置。'+(member.integrated_into?'XY 基座固定于 θ 中心，X/Y 只移动上方滑台和样品。':'')+(mf.motion.kind==='six_dof'?'UVW 使用 '+mf.parent+' 固定轴 X→Y→Z 的演示约定。':'');
          const input=number(label,id+' / '+j.unit,()=>scene.save_state().experiment_state.joints[id],group,hint,value=>scene.set_joint_value(id,value),id);
          if(j.limits){input.min=String(j.limits[0]);input.max=String(j.limits[1]);}
        }
      }
      if(f.motion.kind==='six_dof'){
        const pivot=detail('pivot-'+d.id,'旋转参考 · pivot / '+f.parent+' / mm',motion,false,'sub-block');
        text('p','pivot 是旋转参考点，修改它不会平移整个底座。',pivot,'small');
        for(let i=0;i<3;i++)number(['c_x','c_y','c_z'][i],['c_x','c_y','c_z'][i],()=>{
          const m=scene.save_state().assembly.frames.find(x=>x.id===f.id)!.motion;return m.kind==='six_dof'?m.pivot_mm[i]:0;
        },pivot,'定义在 '+f.parent+' 中的旋转参考点；非零倾转时会改变下游位置。当前 pivot 的 LAB 坐标还包含六轴平移。',value=>{
          const next=scene.save_state(),m=next.assembly.frames.find(x=>x.id===f.id)!.motion;if(m.kind==='six_dof')m.pivot_mm[i]=value;scene.restore_state(next);
        });
      }
      if(d.crystal){
        text('p','C 原点与 '+d.output_frame+' 原点重合，随父级继承；R_SC 只改变晶体取向。',motion,'small');
        const crystal=detail('crystal-'+d.id,'晶体取向与目标 · R_SC',motion,true,'sub-block');
        const s=c.experiment_state.samples[d.id],inputs:HTMLInputElement[]=[];
        const labels=['q_x','q_y','q_z','q_w','index_u/h','index_v/k','index_w/l'];
        [...s.orientation_quaternion_xyzw,...s.target_indices].forEach((v,i)=>{
          inputs.push(number(labels[i],labels[i],()=>v,crystal,i<4?'单位四元数 xyzw，表示 C 相对 S 的取向。只改变晶体方向，不移动 C 原点或机械装置。':'direct 使用 [uvw]，reciprocal 使用 (hkl)；指标需非零。',()=>{},undefined,true));
        });
        const select=document.createElement('select');select.id='direction-type';select.setAttribute('aria-label','方向类型');
        for(const [value,label]of [['direct','直接晶向 [uvw]'],['reciprocal','晶面法向 (hkl)']])select.add(new Option(label,value));
        select.value=s.direction_type;crystal.append(select);
        const apply=document.createElement('button');apply.id='apply-crystal';apply.textContent='应用晶体参数';apply.className='primary';
        apply.onclick=()=>this.edit(()=>{
          const next=scene.save_state(),v=inputs.map(input=>input.valueAsNumber);
          next.experiment_state.samples[d.id]={orientation_quaternion_xyzw:v.slice(0,4) as [number,number,number,number],target_indices:v.slice(4,7) as Vec3,direction_type:select.value as DirectionType};
          scene.restore_state(next);
        });crystal.append(apply);
      }
      body.prepend(motion);
    }
    const preferred=options.selectedId&&this.#aliases.has(options.selectedId)?options.selectedId:devices.find(d=>integrated(d).length)?.id??devices.find(d=>d.type==='rotary')?.id??ordered[0]?.id;
    if(preferred)this.select(preferred,false);
    this.refresh();
  }
  get selectedId(){return this.#selectedId;}
  select(id:string,notify=true){
    const selected=this.#aliases.get(id);if(!selected)return;
    this.#selectedId=selected;
    for(const [key,card]of this.#cards){card.hidden=key!==selected;card.open=true;}
    for(const [key,row]of this.#rows){row.setAttribute('aria-selected',String(key===selected));row.tabIndex=key===selected?0:-1;}
    const row=this.#rows.get(selected)!;
    for(let list=row.parentElement?.parentElement;list&&list.classList.contains('device-tree')===false;list=list.parentElement?.parentElement){
      if(list instanceof HTMLUListElement){list.hidden=false;const parent=list.previousElementSibling;if(parent instanceof HTMLButtonElement){parent.setAttribute('aria-expanded','true');parent.querySelector('.tree-toggle')!.textContent='▾';}}
    }
    this.#title.textContent=this.#cards.get(selected)!.dataset.title!;this.host.dataset.selectedDevice=selected;
    if(notify)this.#onSelect?.(selected);
  }
  setExpanded(expanded:boolean){
    for(const row of this.#rows.values())if(row.hasAttribute('aria-expanded')){row.setAttribute('aria-expanded',String(expanded));(row.nextElementSibling as HTMLElement).hidden=!expanded;row.querySelector('.tree-toggle')!.textContent=expanded?'▾':'▸';}
    if(!expanded){let row=this.#rows.get(this.#selectedId);while(row?.closest('ul[role=group]'))row=row.closest('ul[role=group]')!.previousElementSibling as HTMLButtonElement;if(row)this.select(row.dataset.device!);}
  }
  refresh(){this.#refresh.forEach(fn=>fn());}
}
