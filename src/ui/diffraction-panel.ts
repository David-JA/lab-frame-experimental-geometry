import type { Scene } from '../core/scene';
import type { DiffractionSettings, SceneConfig, Vec3 } from '../core/types';
import { lattice, inverseTranspose, mat3Vector, norm } from '../core/math';
import { defaultDiffraction, DiffractionModel, isCubic, type Preview, type Spot } from '../diffraction/model';
import { withAprilParameters, detectorDistance, withDetectorDistance } from '../diffraction/presets';
import { diffraction_demo_config } from '../example';
import { PreviewRefresh } from './preview-refresh';

const NS='http://www.w3.org/2000/svg';
const numberText=(v:number,digits=4)=>Number(v.toFixed(digits)).toString();
const hklText=(s:Spot)=>'('+s.hkl.join(' ')+')';
export class DiffractionPanel {
  #model=new DiffractionModel();#open=false;#formKey='';#selected='';#result?:Preview;#refresh:PreviewRefresh;
  constructor(private host:HTMLElement,private entry:HTMLButtonElement,private getScene:()=>Scene,private apply:(next:SceneConfig)=>boolean){
    this.#refresh=new PreviewRefresh(()=>this.getScene().revision,()=>this.refresh());
    host.className='diffraction-panel';host.hidden=true;host.setAttribute('aria-label','衍射预览');
    host.innerHTML=`<div class="diffraction-heading"><div><h2>衍射预览</h2><span class="small">理想单晶 · 当前姿态</span></div><button id="dp-close" aria-label="收起衍射预览">收起</button></div>
<p id="dp-status" class="diffraction-status" role="status"></p><p class="small">运动中每秒更新一次，暂停后更新最终姿态。</p><p id="dp-light-info" class="small"></p>
<svg id="dp-plot" viewBox="0 0 500 500" role="img" aria-label="预测衍射图，raw 左上像素坐标"></svg>
<p class="small diffraction-key"><span class="spot-key">●</span> 预测反射：越深表示几何响应越强 <span class="direct-key">⊕</span> 直射束位置 · raw 左上原点</p>
<div class="diffraction-fields"><label>能量 / keV<input id="dp-energy" type="number" min="1" max="500" step="0.1"></label><label>探测器距离 / mm<input id="dp-distance" type="number" min="0.001" max="100000" step="1"></label><label>晶格常数 a / Å<input id="dp-cell-a" type="number" min="0" step="0.0001"></label><label>倒易斑点直径 / Å⁻¹<input id="dp-diameter" type="number" min="0.000001" max="0.2" step="0.001"></label><label class="check"><input id="dp-labels" type="checkbox">显示 HKL</label></div><p id="dp-lattice-note" class="small"></p>
<p class="small">距离从参考光束原点沿面板法线量取。倒易斑点越宽，信号在旋转时保持可见的角度范围越大。</p>
<label class="diffraction-pick">查看反射 <select id="dp-spots" aria-label="查看预测反射"></select></label><div id="dp-detail" class="diffraction-detail">点击图中斑点或选择反射，查看详情。</div>
<details class="info-card" id="dp-advanced"><summary>晶体、照明模型与计算范围</summary>
<div class="diffraction-fields"><label>样品<select id="dp-sample"></select></label><label>探测器<select id="dp-detector"></select></label></div><button id="dp-objects">应用预览对象</button>
<label class="parameter">点阵模型<select id="dp-model"><option value="fcc">理想 FCC（面心立方）</option><option value="primitive">简单点阵（不加消光）</option></select></label>
<p class="small">HKL 是已知模型的预测指标。这里只比较几何亮度，不预测真实计数。</p>
<p class="small">参考晶面 (h k l)</p><div class="diffraction-indices"><input id="dp-h" aria-label="参考晶面 h" type="number" step="1" value="1"><input id="dp-k" aria-label="参考晶面 k" type="number" step="1" value="1"><input id="dp-l" aria-label="参考晶面 l" type="number" step="1" value="1"></div>
<label class="parameter">晶面间距 d / Å<input id="dp-spacing" type="number" min="0.000001" step="0.001"></label><button id="dp-apply-spacing">应用间距到立方晶格</button><p id="dp-cell-note" class="small"></p>
<h3>照明模型尺寸</h3><p class="small">与放大显示的样品外形分开。圆柱轴为样品 S 的 Z 轴，中心跟随样品中心。</p>
<label class="parameter">样品形状<select id="dp-shape"><option value="cylinder">圆柱</option><option value="box">长方体</option></select></label>
<div class="diffraction-fields"><label id="dp-size-x-label">直径 / mm<input id="dp-size-x" type="number" min="0.0001" max="10000" step="0.1"></label><label id="dp-size-y-label">Y 尺寸 / mm<input id="dp-size-y" type="number" min="0.0001" max="10000" step="0.1"></label><label>Z 高度 / mm<input id="dp-size-z" type="number" min="0.0001" max="10000" step="0.1"></label><label>光束宽 / mm<input id="dp-beam-x" type="number" min="0.0001" max="100" step="0.01"></label><label>光束高 / mm<input id="dp-beam-y" type="number" min="0.0001" max="100" step="0.01"></label><label>每轴最大 |hkl|<input id="dp-limit" type="number" min="1" max="12" step="1"></label></div><button id="dp-apply-shape">应用照明与范围</button>
<p id="dp-source" class="small"></p></details>
<details class="info-card"><summary>参照参数与示例</summary><p class="small">四月参照：λ=0.1265 Å，约 98.0112 keV；4288² / 0.1 mm 像素，含标定倾角。a=3.59033485 Å 是借用的晶格参考；样品高3 mm、倒易直径0.006 Å⁻¹为可调演示值。取向沿用当前设置。</p><button id="dp-april">采用四月参照参数</button><p class="small">保留当前装置运动与样品安装，更新晶格、探测器及照明参数。</p><button id="dp-demo">载入理想对中示例（替换当前配置）</button><p class="small">示例采用合成装配与取向，可看到 (200) 反射；不是四月实测姿态。</p></details>
<p class="small diffraction-caveat">近似模型：均匀光束、单点发射、有限倒易球局部截面。用途是检查几何变化，不替代标定或实测信号。</p>`;
    entry.setAttribute('aria-controls',host.id);entry.setAttribute('aria-expanded','false');entry.onclick=()=>this.setOpen(!this.#open);
    this.el('close').onclick=()=>this.setOpen(false);
    this.el<HTMLInputElement>('energy').onchange=()=>this.settingsEdit(p=>p.energy_keV=this.num('energy'));
    this.el<HTMLInputElement>('cell-a').onchange=()=>this.edit(c=>{
      const p=this.parameters(c);if(!p)throw new Error('请先选择样品与探测器。');
      const cell=c.devices.devices.find(d=>d.id===p.sample_id)!.crystal!.cell,a=this.num('cell-a');
      if(!Number.isFinite(a)||a<=0)throw new Error('晶格常数 a 需要是大于 0 的有限数值。');
      if(isCubic(cell))cell.b=cell.c=a;cell.a=a;c.diffraction=p;return c;
    });
    this.el<HTMLInputElement>('cell-a').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();this.el<HTMLInputElement>('cell-a').blur();}};
    this.el<HTMLInputElement>('diameter').onchange=()=>this.settingsEdit(p=>p.spot_diameter_invA=this.num('diameter'));
    this.el<HTMLInputElement>('labels').onchange=()=>this.settingsEdit(p=>p.show_hkl=this.el<HTMLInputElement>('labels').checked);
    this.el<HTMLSelectElement>('model').onchange=()=>this.settingsEdit(p=>p.reflection_model=this.el<HTMLSelectElement>('model').value as 'fcc'|'primitive');
    this.el<HTMLInputElement>('distance').onchange=()=>this.edit(c=>{const p=this.parameters(c);if(!p)throw new Error('请先选择样品与探测器。');return withDetectorDistance(c,p.detector_id,this.num('distance'));});
    this.el('april').onclick=()=>this.edit(c=>withAprilParameters(c,this.el<HTMLSelectElement>('sample').value,this.el<HTMLSelectElement>('detector').value));
    this.el('demo').onclick=()=>this.edit(()=>diffraction_demo_config());
    this.el('objects').onclick=()=>this.edit(c=>{
      const selected=defaultDiffraction(c,this.el<HTMLSelectElement>('sample').value,this.el<HTMLSelectElement>('detector').value);if(!selected)throw new Error('请选择可用的样品和探测器。');
      const p=c.diffraction??selected;p.sample_id=selected.sample_id;p.detector_id=selected.detector_id;
      if(p.reflection_model==='fcc'&&selected.reflection_model==='primitive')p.reflection_model='primitive';c.diffraction=p;return c;
    });
    for(const id of ['h','k','l'])this.el<HTMLInputElement>(id).onchange=()=>this.spacing();
    this.el('apply-spacing').onclick=()=>this.edit(c=>{
      const p=this.parameters(c);if(!p)throw new Error('请先选择样品与探测器。');
      const cell=c.devices.devices.find(d=>d.id===p.sample_id)!.crystal!.cell;if(!isCubic(cell))throw new Error('非立方晶胞请在样品设置中修改。');
      const hkl=this.reference(),d=this.num('spacing');if(!Number.isFinite(d)||d<=0)throw new Error('晶面间距需要大于 0。');
      const a=d*Math.hypot(...hkl);cell.a=cell.b=cell.c=a;c.diffraction=p;return c;
    });
    this.el('apply-shape').onclick=()=>this.settingsEdit(p=>{
      const kind=this.el<HTMLSelectElement>('shape').value as 'cylinder'|'box',x=this.num('size-x');
      p.sample_shape={kind,size_mm:[x,kind==='cylinder'?x:this.num('size-y'),this.num('size-z')]};p.beam_size_mm=[this.num('beam-x'),this.num('beam-y')];p.hkl_limit=this.num('limit');
    });
    this.el<HTMLSelectElement>('shape').onchange=()=>this.shapeFields();
    this.el<HTMLSelectElement>('spots').onchange=()=>{this.#selected=this.el<HTMLSelectElement>('spots').value;this.draw();};
  }
  private el<T extends HTMLElement=HTMLElement>(id:string){return this.host.querySelector<T>('#dp-'+id)!;}
  private num(id:string){const el=this.el<HTMLInputElement>(id);return el.value.trim()===''?NaN:Number(el.value);}
  private parameters(c:SceneConfig){return c.diffraction??defaultDiffraction(c);}
  private reference():Vec3 {const v=['h','k','l'].map(id=>this.num(id)) as Vec3;if(v.some(n=>!Number.isInteger(n)||Math.abs(n)>100)||v.every(n=>n===0))throw new Error('参考 HKL 需要是整数、不能全为零，绝对值不超过 100。');return v;}
  private edit(action:(c:SceneConfig)=>SceneConfig){
    const rejected=(message:string)=>{const c=this.getScene().save_state();this.refreshFields(c,this.parameters(c),true);this.message(message,true);};
    try{const next=action(this.getScene().save_state());if(this.apply(next)){this.#formKey='';this.update();}else rejected('参数未应用，已恢复有效值；请检查页面的错误提示。');}
    catch(error){rejected(String(error instanceof Error?error.message:error));}
  }
  private settingsEdit(action:(p:DiffractionSettings)=>void){this.edit(c=>{const p=this.parameters(c);if(!p)throw new Error('请先在高级区选择样品和探测器。');action(p);c.diffraction=p;return c;});}
  private message(text:string,error=false){this.el('status').textContent=text;this.el('status').classList.toggle('error',error);}
  setOpen(open:boolean){
    this.#open=open;this.host.hidden=!open;this.entry.setAttribute('aria-expanded',String(open));document.querySelector('.workbench')!.classList.toggle('diffraction-open',open);
    if(open)this.#formKey='';this.#refresh.setOpen(open);
    if(open)this.el('close').focus();else this.entry.focus();
  }
  update(moving?:boolean){this.#refresh.update(moving);}
  private refresh(){
    const scene=this.getScene(),c=scene.save_state(),p=this.parameters(c);
    const formKey=JSON.stringify([p,c.devices,c.assembly.frames]);
    if(formKey!==this.#formKey){this.refreshFields(c,p);this.#formKey=formKey;}
    if(!p){this.#result=undefined;this.draw();this.message('请在高级区选择一个样品和探测器；缺少设备时无法预览。');return;}
    try{this.#result=this.#model.compute(scene,p);this.draw();}
    catch(error){this.#result=undefined;this.draw();this.message(String(error instanceof Error?error.message:error),true);}
  }
  private refreshFields(c:SceneConfig,p?:DiffractionSettings,force=false){
    for(const [id,filter,selected]of [['sample',(d:SceneConfig['devices']['devices'][number])=>!!d.crystal,p?.sample_id],['detector',(d:SceneConfig['devices']['devices'][number])=>!!d.detector,p?.detector_id]] as const){
      const select=this.el<HTMLSelectElement>(id),previous=select.value;select.replaceChildren(new Option('请选择',''),...c.devices.devices.filter(filter).map(d=>new Option(d.id,d.id)));
      select.value=selected??previous;
    }
    for(const id of ['energy','distance','cell-a','diameter','labels','model','apply-spacing','apply-shape'])this.el<HTMLInputElement|HTMLButtonElement>(id).disabled=!p;
    if(!p){this.el<HTMLDetailsElement>('advanced').open=true;return;}
    const cell=c.devices.devices.find(d=>d.id===p.sample_id)!.crystal!.cell;
    const values:Record<string,string|number>={energy:p.energy_keV,distance:detectorDistance(c,p.detector_id),'cell-a':cell.a,diameter:p.spot_diameter_invA,model:p.reflection_model,shape:p.sample_shape.kind,'size-x':p.sample_shape.size_mm[0],'size-y':p.sample_shape.size_mm[1],'size-z':p.sample_shape.size_mm[2],'beam-x':p.beam_size_mm[0],'beam-y':p.beam_size_mm[1],limit:p.hkl_limit};
    this.el('lattice-note').textContent=isCubic(cell)?'立方晶格：修改 a 会同步更新 a=b=c 和参考晶面间距 d；失去焦点或按 Enter 后应用。':'当前为非立方晶胞：这里只修改 a，保留 b、c 和夹角；其他晶胞参数可在配置 JSON 中编辑。';
    for(const [id,value]of Object.entries(values)){const el=this.el<HTMLInputElement|HTMLSelectElement>(id);if(force||document.activeElement!==el)el.value=typeof value==='number'?numberText(value,8):value;}
    this.el<HTMLInputElement>('labels').checked=p.show_hkl;this.spacing();this.shapeFields();
  }
  private spacing(){
    try{
      const c=this.getScene().save_state(),p=this.parameters(c);if(!p)return;const cell=c.devices.devices.find(d=>d.id===p.sample_id)!.crystal!.cell;
      const d=1/norm(mat3Vector(inverseTranspose(lattice(cell)),this.reference())),cubic=isCubic(cell);
      this.el<HTMLInputElement>('spacing').value=numberText(d,8);this.el<HTMLInputElement>('spacing').readOnly=!cubic;this.el<HTMLButtonElement>('apply-spacing').disabled=!cubic;
      this.el('cell-note').textContent=cubic?'应用 d 会同步修改样品的 a=b=c，所有预测反射随之更新。':'当前为非立方晶胞，d 只读；可修改上方 a，或在配置 JSON 中编辑其他晶胞参数。';
    }catch(error){this.message(String(error instanceof Error?error.message:error),true);}
  }
  private shapeFields(){const cylinder=this.el<HTMLSelectElement>('shape').value==='cylinder';this.el('size-y-label').hidden=cylinder;this.el('size-x-label').firstChild!.textContent=cylinder?'直径 / mm':'X 尺寸 / mm';}
  private svg(tag:string,attributes:Record<string,string|number>,text?:string){const el=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attributes))el.setAttribute(key,String(value));if(text!==undefined)el.textContent=text;return el;}
  private draw(){
    const svg=this.el<SVGElement & HTMLElement>('plot'),r=this.#result,p=this.parameters(this.getScene().save_state());svg.replaceChildren();
    svg.append(this.svg('rect',{x:42,y:18,width:438,height:438,fill:'#fafafa',stroke:'#b8c3cd','stroke-width':1}));
    const select=this.el<HTMLSelectElement>('spots');select.replaceChildren(new Option('请选择反射',''));
    this.el('detail').textContent='点击图中斑点或选择反射，查看详情。';this.el('source').textContent='';this.el('light-info').textContent='';this.host.dataset.revision=String(r?.revision??-1);
    this.host.dataset.result=JSON.stringify({revision:-1,spots:[]});this.host.dataset.spotCount='0';this.host.dataset.illumination='unavailable';
    if(!r)return;
    if(p){
      const scene=this.getScene(),c=scene.save_state(),center=scene.get_sample_point(p.sample_id,'center').position,beam=c.assembly.beam.point_mm;
      const size=p.sample_shape.size_mm,shape=p.sample_shape.kind==='cylinder'?`圆柱 Ø${numberText(size[0])}×${numberText(size[2])} mm`:`长方体 ${size.map(v=>numberText(v)).join('×')} mm`;
      this.el('light-info').textContent=`样品中心相对光束：水平 ${numberText(center[0]-beam[0])} mm，高度 ${numberText(center[1]-beam[1])} mm。照明模型：${shape}。画面外形为独立示意，不用于判断是否照到。`;
    }
    const width=r.panel.pixels[0],height=r.panel.pixels[1],x=(u:number)=>42+(u+0.5)/width*438,y=(v:number)=>18+(v+0.5)/height*438;
    for(const t of [0,0.5,1]){
      const u=t*width-0.5,v=t*height-0.5;
      svg.append(this.svg('text',{x:x(u),y:478,'text-anchor':t===0?'start':t===1?'end':'middle','font-size':13,fill:'#52616e'},String(Math.round(Math.max(0,u)))));
      svg.append(this.svg('text',{x:35,y:y(v)+4,'text-anchor':'end','font-size':13,fill:'#52616e'},String(Math.round(Math.max(0,v)))));
    }
    svg.append(this.svg('text',{x:260,y:497,'text-anchor':'middle','font-size':13,fill:'#52616e'},'列 u / px →'));
    if(r.direct?.on_panel){const cx=x(r.direct.u),cy=y(r.direct.v);svg.append(this.svg('circle',{cx,cy,r:5,fill:'none',stroke:'#707a84','stroke-width':1.5}),this.svg('path',{d:`M${cx-8} ${cy}h16 M${cx} ${cy-8}v16`,stroke:'#707a84','stroke-width':1}));}
    const labelBoxes:{x:number;y:number;w:number;h:number}[]=[];let labels=0;
    for(const spot of r.spots){
      const key=spot.hkl.join(','),cx=x(spot.u),cy=y(spot.v),selected=key===this.#selected;
      // Minimum visible marker is independent of physical spot support and excitation threshold.
      const radius=Math.max(3,spot.radius_mm/r.panel.pixel_size_mm[0]/width*438),color=selected?'#b1226b':'#303030';
      svg.append(this.svg('circle',{cx,cy,r:radius,fill:'#202020','fill-opacity':spot.weight,class:'diffraction-spot','data-hkl':key}));
      // Selection is a separate annotation; it does not recolor or brighten the signal.
      if(selected)svg.append(this.svg('circle',{cx,cy,r:radius+3,fill:'none',stroke:'#b1226b','stroke-width':1.5,class:'diffraction-selection'}));
      const hit=this.svg('circle',{cx,cy,r:Math.max(9,radius),fill:'transparent',class:'diffraction-hit'});hit.addEventListener('click',()=>{this.#selected=key;this.draw();});svg.append(hit);
      select.add(new Option(hklText(spot),key));
      if(p?.show_hkl&&labels<24){
        const text=hklText(spot),w=text.length*7.5+8,h=19;
        const candidates=[[cx+10,cy-20],[cx-w-10,cy-20],[cx+10,cy+7],[cx-w-10,cy+7]];
        const pos=candidates.find(([px,py])=>px>=43&&py>=19&&px+w<479&&py+h<455&&!labelBoxes.some(b=>px<b.x+b.w&&px+w>b.x&&py<b.y+b.h&&py+h>b.y));
        if(pos){const [px,py]=pos;labelBoxes.push({x:px,y:py,w,h});svg.append(this.svg('rect',{x:px,y:py,width:w,height:h,fill:'#ffffffed',rx:2}),this.svg('text',{x:px+4,y:py+14,fill:color,'font-size':14,'font-weight':600},text));labels++;}
      }
    }
    select.value=this.#selected;if(!select.value)this.#selected='';
    const selected=r.spots.find(s=>s.hkl.join(',')===this.#selected);
    if(selected)this.el('detail').textContent=`${hklText(selected)} · d=${numberText(selected.d_A,5)} Å · 2θ=${numberText(selected.two_theta_deg,4)}°\n原始像素 (u, v)=(${numberText(selected.u,2)}, ${numberText(selected.v,2)})\n偏离衍射条件 ${numberText(selected.error_invA,6)} Å⁻¹ · 相对几何响应 ${numberText(selected.weight,3)}`;
    const light=r.illumination;this.host.dataset.spotCount=String(r.spots.length);this.host.dataset.illumination=light.status;this.host.dataset.computeMs=String(r.duration_ms);
    const annotation=p?.show_hkl&&labels<r.spots.length?`；${r.spots.length-labels} 个标签未展开，可从列表查看`:'';
    this.message(light.status==='outside'?'光束未照到样品。':light.status==='unresolved'?'交叠低于当前采样分辨率，暂不生成信号。':r.spots.length?`面板内 ${r.spots.length} 个预测反射${annotation}`:r.excited_count?'有反射满足衍射条件，但均落在面板外。':'当前姿态下没有反射满足衍射条件。');
    this.el('source').textContent=(light.centroid_lab_mm?`发射重心 LAB (${light.centroid_lab_mm.map(v=>numberText(v,4)).join(', ')}) mm；交叠体积约 ${numberText(light.volume_mm3,6)} mm³。`:'')+` 体积积分 ${light.resolution}×${light.resolution}；枚举各指标 −${p?.hkl_limit}…${p?.hkl_limit}。`;
    this.host.dataset.result=JSON.stringify({revision:r.revision,source:light.centroid_lab_mm,spots:r.spots.map(s=>({hkl:s.hkl,u:s.u,v:s.v,weight:s.weight}))});
  }
  dispose(){this.#refresh.dispose();}
}
