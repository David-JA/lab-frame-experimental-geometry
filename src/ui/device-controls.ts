import type { Scene, Device, Frame, Vec3, DirectionType } from '../core';
import { point } from '../core/math';

const names:Record<Device['type'],string>={rotary:'大样品台 · φ',hexapod:'六轴位移台',z_stage:'Z 升降平台',theta:'θ 旋转台',xy:'XY 位移台',sample:'样品与晶体',detector:'探测器',fixture:'固定支架'};
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
    const text=(tag:string,value:string,parent:HTMLElement,className='')=>{
      const el=document.createElement(tag);el.textContent=value;el.className=className;parent.append(el);return el;
    };
    const detail=(id:string,title:string,parent:HTMLElement,open:boolean,className:string)=>{
      const box=document.createElement('details');box.id=id;box.className=className;box.open=oldOpen.get(id)??open;
      const summary=document.createElement('summary');summary.textContent=title;box.append(summary);parent.append(box);return box;
    };
    const number=(label:string,aria:string,get:()=>number,parent:HTMLElement,write:(value:number)=>void,joint?:string,draft=false)=>{
      const row=document.createElement('label');row.className='parameter';
      const name=document.createElement('span');name.className='parameter-name';name.textContent=label;
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
      const swatch=document.createElement('span');swatch.className='device-color';swatch.style.backgroundColor=d.visual.color;swatch.setAttribute('aria-hidden','true');
      const label=document.createElement('span');label.textContent=deviceName(d);row.append(toggle,swatch,label);item.append(row);
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
      const description=document.createElement('section');description.className='device-description';description.setAttribute('aria-label','装置说明：'+deviceName(d));
      text('h3','装置说明',description);
      const notes=document.createElement('dl');description.append(notes);
      const describe=(title:string,content:string)=>{text('dt',title,notes);text('dd',content,notes);};
      if(!f){
        const placement=detail('placement-'+d.id,'安装与几何 · 绑定参考 '+d.output_frame,body,false,'parameter-block');
        text('p','直接绑定 '+d.output_frame+'，没有独立安装 mount；此处为只读参考。',placement,'small');
        const info=text('p','',placement,'position-info');
        this.#refresh.push(()=>info.textContent='绑定原点 · LAB ('+xyz(scene.get_world_position(d.id).position)+') mm');
        const motion=detail('motion-'+d.id,'自身自由度 · 无独立关节',body,true,'parameter-block');
        text('p','位姿由绑定的 '+d.output_frame+' 坐标系提供。',motion,'small');body.prepend(motion);
        describe('安装关系','直接使用 '+d.output_frame+' 坐标系，没有独立安装位置或机械关节。位置随该坐标系的来源装置变化；LAB 本身固定。');body.append(description);
        continue;
      }
      // A fixed, unowned parent represents the physical installation base (H0 / P0 in the example).
      const parentFrame=frames.get(f.parent);
      const anchor=(d.type==='hexapod'||d.type==='theta'||d.type==='z_stage')&&parentFrame?.motion.kind==='fixed'&&!byOutput.has(parentFrame.id)?parentFrame:f;
      const readFrame=()=>scene.save_state().assembly.frames.find(x=>x.id===anchor.id)!;
      const writeElevation=(riseMm:number)=>{
        const next=scene.save_state(),a=next.assembly.frames.find(x=>x.id===f.id)!,v=next.devices.devices.find(x=>x.id===d.id)!.visual;
        const delta=d.elevation!.base_mount_y_mm+riseMm-a.mount.position_mm[1];a.mount.position_mm[1]+=delta;
        if(a.motion.kind==='revolute')a.motion.center_mm[1]+=delta;
        v.size_mm[1]+=delta;const offset=v.offset_mm??[0,0,0];v.offset_mm=[offset[0],offset[1]-delta/2,offset[2]];
        scene.restore_state(next);
      };
      const reference=(frame:Frame):Vec3=>frame.motion.kind==='revolute'?frame.motion.center_mm:frame.motion.kind==='six_dof'?frame.motion.pivot_mm:frame.mount.position_mm;
      const placement=detail('placement-'+d.id,'安装与几何 · '+anchor.parent+' / mm',body,false,'parameter-block');
      text('p',anchor.motion.kind==='revolute'?'旋转轴参考点；随底座一起移动。':anchor.motion.kind==='six_dof'?'零位 pivot 安装参考点，不含本级平移。':anchor.motion.kind==='xy_translation'?'零位安装参考点 '+anchor.id+'，不含本级 XY 行程。':'安装基座 '+anchor.id+' 的原点，坐标相对 '+anchor.parent+'。',placement,'small');
      const positionInfo=text('p','',placement,'position-info');
      this.#refresh.push(()=>{const a=readFrame();positionInfo.textContent='安装参考点 · LAB ('+xyz(point(scene.get_frame_transform('LAB',a.parent).matrix,reference(a)))+') mm';});
      for(let i=0;i<3;i++)number(['X','Y','Z'][i],deviceName(d)+' · 安装 '+['X','Y','Z'][i]+' / mm',()=>reference(readFrame())[i],placement,value=>{
        if(d.elevation&&i===1){writeElevation(value-reference(readFrame())[1]+readFrame().mount.position_mm[1]-d.elevation.base_mount_y_mm);return;}
        const next=scene.save_state(),a=next.assembly.frames.find(x=>x.id===anchor.id)!,delta=value-reference(a)[i];
        a.mount.position_mm[i]+=delta;
        if(a.motion.kind==='revolute')a.motion.center_mm[i]+=delta;
        if(a.motion.kind==='six_dof')a.motion.pivot_mm[i]+=delta;
        scene.restore_state(next);
      });
      if(d.type==='rotary'&&d.visual.shape==='box'){
        const appearance=detail('appearance-'+d.id,'柱体外观 · mm',placement,true,'sub-block');
        text('p','高度只改变柱体外观，柱顶安装面保持不变。整体升降请使用'+(d.elevation?'自身自由度中的台面升高':'上方安装 Y')+'；不新增运动轴。',appearance,'small');
        number('高度 / mm',deviceName(d)+' · 柱体高度 / mm',()=>scene.save_state().devices.devices.find(x=>x.id===d.id)!.visual.size_mm[1],appearance,value=>{
          const next=scene.save_state(),visual=next.devices.devices.find(x=>x.id===d.id)!.visual;
          const offset=visual.offset_mm??[0,0,0],top=offset[1]+visual.size_mm[1]/2;
          visual.size_mm[1]=value;visual.offset_mm=[offset[0],top-value/2,offset[2]];scene.restore_state(next);
        });
      }
      if(members.length>1){
        text('p','XY 基座固定在 θ 旋转中心，无独立安装位移或安装转角；X/Y 是一体台内部行程。',placement,'small');
        const baseInfo=text('p','',placement,'position-info');baseInfo.dataset.integratedBase=d.id;
        this.#refresh.push(()=>{const axis=scene.get_axis(d.id);baseInfo.textContent='XY 固定基座 · θ 中心 · LAB ('+xyz(point(scene.get_frame_transform('LAB',axis.frame).matrix,axis.point_mm))+') mm';});
      }
      const motion=detail('motion-'+d.id,members.length>1?'一体台运动 · θ / X / Y':'自身自由度'+(f.motion.kind==='fixed'?' · 固定安装':''),body,true,'parameter-block');
      if(d.elevation){
        const e=d.elevation;
        const baseTop=e.base_mount_y_mm+(d.visual.offset_mm?.[1]??0)+d.visual.size_mm[1]/2;
        text('p','台面基准约'+fmt(baseTop)+' mm，升高范围0–'+fmt(e.travel_mm/10)+' cm；升降带动上方装配，柱底保持原地。',motion,'small');
        const input=number('台面升高 / cm',deviceName(d)+' · 台面升高 / cm',()=>(scene.save_state().assembly.frames.find(x=>x.id===f.id)!.mount.position_mm[1]-e.base_mount_y_mm)/10,motion,value=>writeElevation(value*10));input.min='0';input.max=String(e.travel_mm/10);
      }
      for(const member of members){
        const mf=frames.get(member.output_frame)!;
        const group=members.length>1?detail('part-'+member.id,member.type==='theta'?'θ 旋转':'XY 平移 · 内部行程',motion,true,'sub-block'):motion;
        group.dataset.devicePart=member.id;
        const joints=mf.motion.kind==='six_dof'?mf.motion.joints:'joint' in mf.motion?[mf.motion.joint]:mf.motion.kind==='xy_translation'?mf.motion.joints:[];
        if(!joints.length)text('p','无独立机械关节；跟随父级参考系。',group,'small');
        for(const id of joints){
          const j=c.assembly.joints.find(j=>j.id===id)!;
          const centimeters=member.type==='z_stage',scale=centimeters?10:1,unit=centimeters?'cm':j.unit;
          const label=(centimeters?'Z 高度':id.split('.').at(-1)!)+' / '+unit;
          if(member.integrated_into&&id===joints[0])text('p','X/Y 沿 '+mf.parent+' 中配置的方向移动上方滑台与样品，不移动一体台的固定基座。',group,'small');
          const input=number(label,id+' / '+unit,()=>scene.save_state().experiment_state.joints[id]/scale,group,value=>scene.set_joint_value(id,value*scale),id);
          if(j.limits){input.min=String(j.limits[0]/scale);input.max=String(j.limits[1]/scale);}
          if(centimeters)text('p',(j.limits?'可调高度'+j.limits.map(v=>fmt(v/scale)).join('–')+' cm':'未配置高度范围')+'，指上下安装面间距；沿 '+mf.parent+' 的 +Z 升高。零姿态时对应实验室 +Y。',group,'small');
        }
      }
      if(f.motion.kind==='six_dof'){
        const pivot=detail('pivot-'+d.id,'旋转参考 · pivot / '+f.parent+' / mm',motion,false,'sub-block');
        text('p','pivot 在 '+f.parent+' 中定义。修改它不平移底座；非零倾转时可能改变下游位置。当前 pivot 的 LAB 坐标包含六轴平移。',pivot,'small');
        for(let i=0;i<3;i++)number(['c_x','c_y','c_z'][i],['c_x','c_y','c_z'][i],()=>{
          const m=scene.save_state().assembly.frames.find(x=>x.id===f.id)!.motion;return m.kind==='six_dof'?m.pivot_mm[i]:0;
        },pivot,value=>{
          const next=scene.save_state(),m=next.assembly.frames.find(x=>x.id===f.id)!.motion;if(m.kind==='six_dof')m.pivot_mm[i]=value;scene.restore_state(next);
        });
      }
      if(d.crystal){
        const crystal=detail('crystal-'+d.id,'晶体取向与目标 · R_SC',motion,true,'sub-block');
        text('p','R_SC 使用单位四元数 xyzw，表示 '+d.crystal.frame+' 相对 '+d.output_frame+' 的取向。修改后点击“应用晶体参数”；两者原点保持重合，样品机械位姿不变。',crystal,'small');
        text('p','direct 输入晶向 [uvw]，reciprocal 输入晶面法向 (hkl)；指标不能全为零。',crystal,'small');
        const s=c.experiment_state.samples[d.id],inputs:HTMLInputElement[]=[];
        const labels=['q_x','q_y','q_z','q_w','index_u/h','index_v/k','index_w/l'];
        [...s.orientation_quaternion_xyzw,...s.target_indices].forEach((v,i)=>{
          inputs.push(number(labels[i],labels[i],()=>v,crystal,()=>{},undefined,true));
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
      const convention=f.motion.kind==='six_dof'?'XYZ 是 '+f.parent+' 中的平移（mm）；UVW 分别绕该坐标系的固定 X、Y、Z 轴转动（deg），按 U→V→W 的演示约定组合。':
        members.length>1?'θ 绕 '+f.parent+' 中配置的轴旋转，带动 XY 滑台及样品；X/Y 是一体台内部平移行程。旋转正方向遵循右手定则。':
        f.motion.kind==='revolute'?'绕 '+f.parent+' 中配置的轴旋转，正方向遵循右手定则；下游装配随之转动。':
        f.motion.kind==='xy_translation'?'X/Y 沿 '+f.parent+' 中配置的两条轴平移；不改变安装零位。':
        f.motion.kind==='prismatic'?'Z 高度沿 '+f.parent+' 中配置的轴平移，带动上部平台与样品；下安装面跟随六轴上转接板。':
        f.parent==='LAB'?'没有独立机械关节；固定在 LAB 中，LAB 是固定基准。':'没有独立机械关节；位姿由父坐标系 '+f.parent+' 决定。';
      describe('运动约定',convention);
      const motionImpact=impact(d.output_frame),installationImpact=impact(anchor.id);
      describe('联动范围',motionImpact+'。'+(f.motion.kind==='fixed'?'':'关节运动不改写安装参数。'));
      describe('安装位置','安装坐标以 '+anchor.parent+' 为准。调整时平移'+(installationImpact===motionImpact?'上述装配':installationImpact)+'，保留关节读数及内部相对装配；其他独立分支和入射光束不变。');
      if(d.crystal)describe('样品与晶体',d.crystal.frame+' 原点与 '+d.output_frame+' 原点重合；样品中心与目标点分别定义在 '+d.output_frame+' 中，位置可通过配置修改。');
      if(d.type==='hexapod'&&d.visual.shape==='cylinder')describe('外观示意','圆盘与支杆使用主体配色，上下转接板为中灰色金属：上部随 '+d.output_frame+'，下部随 '+f.parent+'。支杆只连接配置端点，不参与机构求解。');
      if(d.description)describe('装置配置',d.description);
      body.append(description);
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
