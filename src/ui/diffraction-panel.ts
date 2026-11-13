import type { Scene } from '../core/scene';
import type { DiffractionSettings, IntensityModel, SceneConfig, Vec3 } from '../core/types';
import { lattice, inverseTranspose, mat3Vector, norm } from '../core/math';
import { defaultDiffraction, detectorPanel, DiffractionModel, HC_KEV_A, isCubic, projectRay, type Preview, type Spot } from '../diffraction/model';
import { withAprilParameters, withDefaultDiffractionParameters, detectorNormalDistance } from '../diffraction/presets';
import { detectorSupport, withDetectorSupport } from '../core/detector-support';
import { diffraction_demo_config } from '../example';
import { PreviewRefresh } from './preview-refresh';
import { math, typesetMath } from './math-typesetting';
import { downsample } from '../diffraction/forward';

const NS='http://www.w3.org/2000/svg';
const numberText=(v:number,digits=4)=>Number(v.toFixed(digits)).toString();
const hklText=(s:Spot)=>'('+s.hkl.join(' ')+')';
export class DiffractionPanel {
  #model=new DiffractionModel();#open=false;#formKey='';#selected='';#result?:Preview;#refresh:PreviewRefresh;
  #lastIntensity?:IntensityModel;
  constructor(private host:HTMLElement,private entry:HTMLButtonElement,private getScene:()=>Scene,private apply:(next:SceneConfig)=>boolean){
    this.#refresh=new PreviewRefresh(()=>this.getScene().revision,()=>this.refresh());
    host.className='diffraction-panel';host.hidden=true;host.setAttribute('aria-label','衍射预览');
    host.innerHTML=`<div class="diffraction-heading"><div><h2>衍射预览</h2><span class="small">理想单晶 · 当前姿态</span></div><div class="diffraction-heading-actions"><button id="dp-reset" title="复位衍射参数，保留装置位置与晶体取向">复位</button><button id="dp-close" aria-label="收起衍射预览">收起</button></div></div>
<p id="dp-status" class="diffraction-status" role="status"></p><p class="small">运动中每秒更新一次，暂停后更新最终姿态。</p><p id="dp-light-info" class="small"></p>
<svg id="dp-plot" viewBox="0 0 500 500" role="img" aria-label="预测衍射图，raw 左上像素坐标"></svg>
<p class="small diffraction-key"><span class="spot-key">●</span> 预测反射：越亮表示几何响应越强 <span class="direct-key">⊕</span> 直射束位置 · raw 左上原点</p>
<label class="parameter">斑形与信号模型<select id="dp-intensity"><option value="legacy">圆斑示意（旧）</option><option value="gaussian_3d">三维高斯（像素积分）</option><option value="uniform_sphere_3d">三维均匀球（像素积分）</option></select></label>
<div id="dp-intensity-fields" class="diffraction-fields" hidden><label>高斯 σ_g / Å⁻¹<input id="dp-sigma" type="number" min="0" step="0.0001"></label><label>固定灰度上限 / 相对单位<input id="dp-gray-max" type="number" min="0" step="any"></label><label>显示阈值 / 相对单位<input id="dp-display-threshold" type="number" min="0" step="any"></label></div><p id="dp-intensity-note" class="small"></p>
<div class="diffraction-fields"><label>能量 / keV<input id="dp-energy" type="number" min="1" max="500" step="any"></label><div class="diffraction-readout"><span>受照体积重心到平板的<br>垂直距离 / mm</span><output id="dp-normal-distance" aria-label="受照体积重心到平板的垂直距离">—</output></div><label><span>晶格常数 ${math('a','a')} / ${math(String.raw`\text{\AA}`,'Å')}</span><input id="dp-cell-a" type="number" min="0" step="0.0001"></label><label><span>倒易斑点直径 / ${math(String.raw`\text{\AA}^{-1}`,'Å⁻¹')}</span><input id="dp-diameter" type="number" min="0" max="0.2" step="0.01"></label><label class="check"><input id="dp-labels" type="checkbox">显示 HKL</label></div><p id="dp-lattice-note" class="small"></p>
<p class="small">能量和照明尺寸的增减箭头每次调整 1 个对应单位；也可直接输入小数。</p>
<p class="small">换距或横移请调整左侧探测器支撑架的固定位置（LAB X/Z）。该读数从当前受照体积重心垂直量到平板，与衍射图使用同一发射点；没有可用重心时显示“—”。</p>
<label class="diffraction-pick">查看反射 <select id="dp-spots" aria-label="查看预测反射"></select></label><div id="dp-detail" class="diffraction-detail">点击图中斑点或选择反射，查看详情。</div>
<details class="info-card" id="dp-advanced"><summary>晶体、照明模型与计算范围</summary>
<div class="diffraction-fields"><label>样品<select id="dp-sample"></select></label><label>探测器<select id="dp-detector"></select></label></div><button id="dp-objects">应用预览对象</button><button id="dp-enable-support" hidden>按当前安装建立支撑架</button>
<label class="parameter">点阵模型<select id="dp-model"><option value="fcc">理想 FCC（面心立方）</option><option value="primitive">简单点阵（不加消光）</option></select></label>
<p class="small">HKL 是已知模型的预测指标。这里只比较几何亮度，不预测真实计数。</p>
<section class="diffraction-derived" aria-label="晶面计算读数"><p class="small">查看晶面 ${math(String.raw`(h\,k\,l)`,'(h k l)')}</p><div class="diffraction-indices"><input id="dp-h" aria-label="查看晶面 h" type="number" step="1" value="1"><input id="dp-k" aria-label="查看晶面 k" type="number" step="1" value="1"><input id="dp-l" aria-label="查看晶面 l" type="number" step="1" value="1"></div>
<div class="diffraction-derived-value"><span>晶面间距 ${math('d','d')} <span class="small">· 计算值</span></span><strong><output id="dp-spacing" aria-label="晶面间距计算值">—</output> <span class="small">${math(String.raw`\text{\AA}`,'Å')}</span></strong></div>
<div class="diffraction-derived-value"><span>理论散射角 ${math(String.raw`2\theta`,'2θ')}</span><strong><output id="dp-two-theta" aria-label="理论散射角计算值">—</output> <span class="small">${math(String.raw`{}^\circ`,'°')}</span></strong></div>
<div class="diffraction-derived-value"><span>散射矢量大小 ${math('q','q')}</span><strong><output id="dp-q" aria-label="散射矢量大小计算值">—</output> <span class="small">${math(String.raw`\text{\AA}^{-1}`,'Å⁻¹')}</span></strong></div><p id="dp-cell-note" class="small"></p><p class="small">${math(String.raw`2\theta`,'2θ')} 按当前能量计算，不代表当前姿态已发生衍射；${math(String.raw`q=\dfrac{2\pi}{d}`,'q = 2π/d')}。选择晶面只更新本卡片读数，不筛选预测反射。</p></section>
<h3>照明模型尺寸</h3><p class="small">与放大显示的样品外形分开。圆柱轴为样品 S 的 Z 轴，中心跟随样品中心。</p>
<label class="parameter">样品形状<select id="dp-shape"><option value="cylinder">圆柱</option><option value="box">长方体</option></select></label>
<div class="diffraction-fields"><label id="dp-size-x-label">直径 / mm<input id="dp-size-x" type="number" min="0.0001" max="10000" step="any"></label><label id="dp-size-y-label">Y 尺寸 / mm<input id="dp-size-y" type="number" min="0.0001" max="10000" step="any"></label><label>Z 高度 / mm<input id="dp-size-z" type="number" min="0.0001" max="10000" step="any"></label><label>光束宽 / mm<input id="dp-beam-x" type="number" min="0.0001" max="100" step="any"></label><label>光束高 / mm<input id="dp-beam-y" type="number" min="0.0001" max="100" step="any"></label><label>每轴最大 |hkl|<input id="dp-limit" type="number" min="1" max="12" step="1"></label></div><button id="dp-apply-shape">应用照明与范围</button>
<p id="dp-source" class="small"></p></details>
<details class="info-card" id="dp-reference"><summary>参照参数与示例</summary><p class="small">四月参照：${math(String.raw`\lambda=0.1265\,\text{\AA}`,'λ=0.1265 Å')}，约 98.0112 keV；${math('4288^2','4288²')} / 0.1 mm 像素，含标定倾角。${math(String.raw`a=3.59033485\,\text{\AA}`,'a=3.59033485 Å')} 是借用的晶格参考；样品高3 mm、倒易直径默认 ${math(String.raw`0.1\,\text{\AA}^{-1}`,'0.1 Å⁻¹')} 为可调演示值。取向沿用当前设置。</p><p class="small">标定参考点到平板的垂直距离：<output id="dp-calibration-distance" aria-label="标定参考点到平板的垂直距离">—</output> mm，对应 pyFAI 的 dist。标定参考点固定，不随样品移动。</p><button id="dp-april">采用四月参照参数</button><p class="small">保留支撑架位置、装置运动与样品安装，更新平板标定、像素配置、晶格及照明参数。</p>
<h3>低阶带轴骨架参考</h3><p id="dp-skeleton-context" class="small"></p><p class="small">按理想 FCC、样品位于固定标定参考点、${math('[100]','[100]')} 或 ${math('[110]','[110]')} 正对光束且 ${math('[001]','[001]')} 向上计算，不改变当前姿态。临界直径只表示模型允许反射出现，不是实测峰宽；表中仅检查斑点中心是否落在面板内。</p>
<table class="diffraction-reference-table"><thead><tr><th>带轴 / 反射组</th><th>临界直径<br>${math(String.raw`\text{\AA}^{-1}`,'Å⁻¹')}</th><th>面板内<br>中心数</th></tr></thead><tbody id="dp-skeleton-rows"></tbody></table><p id="dp-skeleton-result" class="small"></p>
<button id="dp-demo">载入理想对中示例（替换当前配置）</button><p class="small">示例采用合成装配与取向，可看到 (200) 反射；不是四月实测姿态。</p></details>
<p id="dp-caveat" class="small diffraction-caveat">近似模型：均匀光束、单点发射、有限倒易球局部截面。用途是检查几何变化，不替代标定或实测信号。</p>`;
    entry.setAttribute('aria-controls',host.id);entry.setAttribute('aria-expanded','false');entry.onclick=()=>this.setOpen(!this.#open);
    this.el('close').onclick=()=>this.setOpen(false);
    this.el('reset').onclick=()=>this.edit(c=>{
      const p=this.parameters(c);if(!p)throw new Error('请先选择样品与探测器。');
      const next=withDefaultDiffractionParameters(c,p.sample_id,p.detector_id);
      for(const id of ['h','k','l'])this.el<HTMLInputElement>(id).value='1';
      this.#selected='';return next;
    });
    this.el<HTMLInputElement>('energy').onchange=()=>this.settingsEdit(p=>p.energy_keV=this.num('energy'));
    this.el<HTMLInputElement>('cell-a').onchange=()=>this.edit(c=>{
      const p=this.parameters(c);if(!p)throw new Error('请先选择样品与探测器。');
      const cell=c.devices.devices.find(d=>d.id===p.sample_id)!.crystal!.cell,a=this.num('cell-a');
      if(!Number.isFinite(a)||a<=0)throw new Error('晶格常数 a 需要是大于 0 的有限数值。');
      if(isCubic(cell))cell.b=cell.c=a;cell.a=a;c.diffraction=p;return c;
    });
    this.el<HTMLInputElement>('cell-a').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();this.el<HTMLInputElement>('cell-a').blur();}};
    this.el<HTMLInputElement>('diameter').onchange=()=>this.settingsEdit(p=>p.spot_diameter_invA=this.num('diameter'));
    this.el<HTMLSelectElement>('intensity').onchange=()=>this.settingsEdit(p=>{
      const kind=this.el<HTMLSelectElement>('intensity').value;
      if(p.intensity_model)this.#lastIntensity=structuredClone(p.intensity_model);
      if(kind==='legacy')delete p.intensity_model;
      else p.intensity_model={...(p.intensity_model??this.#lastIntensity??{}),kind:kind as IntensityModel['kind'],sigma_g_invA:p.intensity_model?.sigma_g_invA??this.#lastIntensity?.sigma_g_invA??.001};
    });
    this.el<HTMLInputElement>('sigma').onchange=()=>this.settingsEdit(p=>{if(p.intensity_model)p.intensity_model.sigma_g_invA=this.num('sigma');});
    this.el<HTMLInputElement>('gray-max').onchange=()=>this.settingsEdit(p=>{if(p.intensity_model)p.intensity_model.gray_max=this.num('gray-max');});
    this.el<HTMLInputElement>('display-threshold').onchange=()=>this.settingsEdit(p=>{if(p.intensity_model)p.intensity_model.display_threshold=this.num('display-threshold');});
    this.el<HTMLInputElement>('labels').onchange=()=>this.settingsEdit(p=>p.show_hkl=this.el<HTMLInputElement>('labels').checked);
    this.el<HTMLSelectElement>('model').onchange=()=>this.settingsEdit(p=>p.reflection_model=this.el<HTMLSelectElement>('model').value as 'fcc'|'primitive');
    this.el('enable-support').onclick=()=>this.edit(c=>{const p=this.parameters(c);if(!p)throw new Error('请先选择样品与探测器。');return withDetectorSupport(c,p.detector_id);});
    this.el('april').onclick=()=>this.edit(c=>withAprilParameters(c,this.el<HTMLSelectElement>('sample').value,this.el<HTMLSelectElement>('detector').value));
    this.el('demo').onclick=()=>this.edit(()=>diffraction_demo_config());
    this.el('objects').onclick=()=>this.edit(c=>{
      const selected=defaultDiffraction(c,this.el<HTMLSelectElement>('sample').value,this.el<HTMLSelectElement>('detector').value);if(!selected)throw new Error('请选择可用的样品和探测器。');
      const p=c.diffraction??selected;p.sample_id=selected.sample_id;p.detector_id=selected.detector_id;
      if(p.reflection_model==='fcc'&&selected.reflection_model==='primitive')p.reflection_model='primitive';c.diffraction=p;return c;
    });
    for(const id of ['h','k','l'])this.el<HTMLInputElement>(id).onchange=()=>this.spacing();
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
  private reference():Vec3 {const v=['h','k','l'].map(id=>this.num(id)) as Vec3;if(v.some(n=>!Number.isInteger(n)||Math.abs(n)>100)||v.every(n=>n===0))throw new Error('晶面指标需为整数、不能全为零，绝对值不超过 100。');return v;}
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
    this.skeletonReference(scene,c,p);
    const formKey=JSON.stringify([p,c.devices,c.assembly.frames,c.assembly.beam.point_mm,p&&scene.get_world_transform(p.detector_id).matrix]);
    if(formKey!==this.#formKey){this.refreshFields(c,p);this.#formKey=formKey;}
    if(!p){this.#result=undefined;this.draw();typesetMath(this.host);this.message('请在高级区选择一个样品和探测器；缺少设备时无法预览。');return;}
    try{this.#result=this.#model.compute(scene,p);this.draw();}
    catch(error){this.#result=undefined;this.draw();this.message(String(error instanceof Error?error.message:error),true);}
    typesetMath(this.host);
  }
  private refreshFields(c:SceneConfig,p?:DiffractionSettings,force=false){
    for(const [id,filter,selected]of [['sample',(d:SceneConfig['devices']['devices'][number])=>!!d.crystal,p?.sample_id],['detector',(d:SceneConfig['devices']['devices'][number])=>!!d.detector,p?.detector_id]] as const){
      const select=this.el<HTMLSelectElement>(id),previous=select.value;select.replaceChildren(new Option('请选择',''),...c.devices.devices.filter(filter).map(d=>new Option(d.id,d.id)));
      select.value=selected??previous;
    }
    for(const id of ['energy','cell-a','diameter','labels','model','reset','apply-shape','intensity'])this.el<HTMLInputElement|HTMLButtonElement>(id).disabled=!p;
    this.el('calibration-distance').textContent=p?numberText(Math.abs(detectorNormalDistance(c,p.detector_id)),8):'—';
    this.el('enable-support').hidden=!p||!!detectorSupport(c,p.detector_id);
    if(!p){this.el<HTMLDetailsElement>('advanced').open=true;this.spacing();return;}
    this.el<HTMLSelectElement>('intensity').disabled=!p;
    this.el<HTMLSelectElement>('intensity').value=p.intensity_model?.kind??'legacy';
    this.el('intensity-fields').hidden=!p.intensity_model;
    this.el<HTMLInputElement>('sigma').disabled=p.intensity_model?.kind!=='gaussian_3d';
    this.el<HTMLInputElement>('diameter').disabled=p.intensity_model?.kind==='gaussian_3d';
    const intensityValues={'sigma':p.intensity_model?.sigma_g_invA??.001,'gray-max':p.intensity_model?.gray_max??100,'display-threshold':p.intensity_model?.display_threshold??0};
    for(const [id,v]of Object.entries(intensityValues))if(force||document.activeElement!==this.el(id))this.el<HTMLInputElement>(id).value=String(v);
    this.el('intensity-note').textContent=p.intensity_model?'固定姿态、单位曝光的相对像素积分。σ_g 是倒易空间标准差，均匀球使用倒易直径；均未按实测峰宽标定。512² 预览格按原始像素信号求和，缩图前后总量保持；灰度上限跨帧固定，显示阈值不删除原始信号。':'旧圆斑为几何示意，不是积分强度图。选择三维模型后，强度和落点由同一次 Ewald 球面截取给出。';
    this.el('caveat').textContent=p.intensity_model?'理想模型：均匀光束、受照重心单点发射、三维倒易斑的 Ewald 球面与像素边界积分。每帧为固定姿态单位曝光的相对信号，不替代标定、材料强度或实测计数。':'近似模型：均匀光束、单点发射、有限倒易球局部截面。用途是检查几何变化，不替代标定或实测信号。';
    const cell=c.devices.devices.find(d=>d.id===p.sample_id)!.crystal!.cell;
    const values:Record<string,string|number>={energy:p.energy_keV,'cell-a':cell.a,diameter:p.spot_diameter_invA,model:p.reflection_model,shape:p.sample_shape.kind,'size-x':p.sample_shape.size_mm[0],'size-y':p.sample_shape.size_mm[1],'size-z':p.sample_shape.size_mm[2],'beam-x':p.beam_size_mm[0],'beam-y':p.beam_size_mm[1],limit:p.hkl_limit};
    this.el('lattice-note').innerHTML=isCubic(cell)?`立方晶格：修改 ${math('a','a')} 会同步更新 ${math('a=b=c','a=b=c')} 和参考晶面间距 ${math('d','d')}；失去焦点或按 Enter 后应用。`:`当前为非立方晶胞：这里只修改 ${math('a','a')}，保留 ${math('b,c','b、c')} 和夹角；其他晶胞参数可在配置 JSON 中编辑。`;
    for(const [id,value]of Object.entries(values)){const el=this.el<HTMLInputElement|HTMLSelectElement>(id);if(force||document.activeElement!==el)el.value=typeof value==='number'?numberText(value,8):value;}
    this.el<HTMLInputElement>('labels').checked=p.show_hkl;this.spacing();this.shapeFields();
  }
  private spacing(){
    for(const id of ['spacing','two-theta','q'])this.el(id).textContent='—';
    try{
      const c=this.getScene().save_state(),p=this.parameters(c);
      if(!p){this.el('spacing').textContent='—';this.el('cell-note').textContent='请先选择样品与探测器并应用，再查看晶面间距。';return;}
      const cell=c.devices.devices.find(d=>d.id===p.sample_id)!.crystal!.cell;
      const d=1/norm(mat3Vector(inverseTranspose(lattice(cell)),this.reference())),cubic=isCubic(cell);
      this.el('spacing').textContent=numberText(d,8);
      this.el('q').textContent=numberText(2*Math.PI/d,6);
      const sine=HC_KEV_A/p.energy_keV/(2*d);
      if(sine<=1)this.el('two-theta').textContent=numberText(2*Math.asin(sine)*180/Math.PI,6);
      this.el('cell-note').innerHTML=(cubic?`由当前晶格常数与所选晶面计算：${math(String.raw`d=\dfrac{a}{\sqrt{h^2+k^2+l^2}}`,'d = a / √(h²+k²+l²)')}。`:'由当前晶胞参数与所选晶面计算。')+(sine>1?' 当前能量过低，该晶面没有可达的散射角。':'');
    }catch(error){this.el('spacing').textContent='—';this.el('cell-note').textContent=String(error instanceof Error?error.message:error);}
    finally{typesetMath(this.el('cell-note'));}
  }
  private skeletonReference(scene:Scene,c:SceneConfig,p?:DiffractionSettings){
    const rows=this.el('skeleton-rows');rows.replaceChildren();this.el('skeleton-result').textContent='';
    const cell=c.devices.devices.find(d=>d.id===p?.sample_id)?.crystal?.cell;
    if(!p||!cell||!isCubic(cell)||p.reflection_model!=='fcc'){
      this.el('skeleton-context').textContent='此参考适用于理想 FCC 立方晶格；请先选择预览对象并采用相应点阵模型。';return;
    }
    const k=p.energy_keV/HC_KEV_A,panel=detectorPanel(scene,p.detector_id),a=cell.a;
    this.el('skeleton-context').innerHTML=`随当前设置更新：能量 ${numberText(p.energy_keV,4)} keV，${math(String.raw`a=${numberText(a,8)}\,\text{\AA}`,`a=${numberText(a,8)} Å`)}；倒易直径 ${math(String.raw`D=${numberText(p.spot_diameter_invA,6)}\,\text{\AA}^{-1}`,`D=${numberText(p.spot_diameter_invA,6)} Å⁻¹`)}。`;
    const groups:{zone:'100'|'110';name:string;indices:Vec3[]}[]=[
      {zone:'100',name:'{200}',indices:[[0,2,0],[0,-2,0],[0,0,2],[0,0,-2]]},
      {zone:'100',name:'{220}',indices:[[0,2,2],[0,2,-2],[0,-2,2],[0,-2,-2]]},
      {zone:'110',name:'{111}',indices:[[1,-1,1],[1,-1,-1],[-1,1,1],[-1,1,-1]]},
      {zone:'110',name:'{200}',indices:[[0,0,2],[0,0,-2]]},
      {zone:'110',name:'{220}',indices:[[2,-2,0],[-2,2,0]]},
    ];
    const totals={'100':{threshold:0,onPanel:0},'110':{threshold:0,onPanel:0}};
    for(const group of groups){
      const g2=group.indices[0].reduce((sum,v)=>sum+v*v,0)/(a*a);
      // 2*(sqrt(k^2+g^2)-k), evaluated without subtraction cancellation.
      const threshold=2*g2/(Math.hypot(k,Math.sqrt(g2))+k);
      const onPanel=group.indices.filter(([h,lateral,l])=>{
        const x=group.zone==='100'?lateral/a:(lateral-h)/(Math.SQRT2*a),y=l/a;
        return projectRay(panel,c.assembly.beam.point_mm,[x,y,k])?.on_panel;
      }).length;
      const total=totals[group.zone];total.threshold=Math.max(total.threshold,threshold);total.onPanel+=onPanel;
      const row=document.createElement('tr');row.dataset.zone=group.zone;row.dataset.family=group.name;row.dataset.threshold=String(threshold);
      const family=String.raw`\{${group.name.slice(1,-1)}\}`;
      const caption=document.createElement('td');caption.innerHTML=math(String.raw`\langle${group.zone}\rangle\ ${family}`,`⟨${group.zone}⟩ ${group.name}`)+` · ${group.indices.length}点`;row.append(caption);
      const limit=document.createElement('td');limit.innerHTML=math(String.raw`\approx ${numberText(threshold,6)}`,`≈${numberText(threshold,6)}`);row.append(limit);
      const coverage=document.createElement('td');coverage.textContent=`${onPanel}/${group.indices.length}`;row.append(coverage);rows.append(row);
    }
    this.el('skeleton-result').innerHTML=Object.entries(totals).map(([zone,t])=>`${math(String.raw`\langle${zone}\rangle`,`⟨${zone}⟩`)}完整8点需 ${math(String.raw`D>${numberText(t.threshold,6)}\,\text{\AA}^{-1}`,`D > ${numberText(t.threshold,6)} Å⁻¹`)}；当前 ${math('D','D')}${p.spot_diameter_invA>t.threshold?'已跨过':'未跨过'}阈值，面板可容纳 ${t.onPanel}/8 个中心。`).join(' ')+(p.hkl_limit<2?` 当前每轴最大 ${math('|hkl|','|hkl|')} 小于2，需调大才能枚举这些反射。`:'');
  }
  private shapeFields(){const cylinder=this.el<HTMLSelectElement>('shape').value==='cylinder';this.el('size-y-label').hidden=cylinder;this.el('size-x-label').firstChild!.textContent=cylinder?'直径 / mm':'X 尺寸 / mm';}
  private svg(tag:string,attributes:Record<string,string|number>,text?:string){const el=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attributes))el.setAttribute(key,String(value));if(text!==undefined)el.textContent=text;return el;}
  private draw(){
    const svg=this.el<SVGElement & HTMLElement>('plot'),r=this.#result,p=this.parameters(this.getScene().save_state());svg.replaceChildren();
    delete this.host.dataset.integration;delete this.host.dataset.rawSum;delete this.host.dataset.previewSum;
    svg.append(this.svg('rect',{x:42,y:18,width:438,height:438,fill:'#000000',stroke:'#59636c','stroke-width':1}));
    const select=this.el<HTMLSelectElement>('spots');select.replaceChildren(new Option('请选择反射',''));
    this.el('detail').textContent='点击图中斑点或选择反射，查看详情。';this.el('source').textContent='';this.el('light-info').textContent='';this.host.dataset.revision=String(r?.revision??-1);
    this.host.dataset.result=JSON.stringify({revision:-1,spots:[]});this.host.dataset.spotCount='0';this.host.dataset.illumination='unavailable';
    this.el('normal-distance').textContent=r?.source_normal_distance_mm!==undefined?numberText(r.source_normal_distance_mm,8):'—';
    if(!r)return;
    let rawSum=0,previewSum=0;
    if(r.images){
      const pixels=downsample(r.images.map(i=>i.tile),r.panel.pixels,[512,512]);
      rawSum=r.images.reduce((s,i)=>s+i.pixel_sum,0);previewSum=pixels.reduce((s,v)=>s+v,0);
      const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
      const context=canvas.getContext('2d')!,data=context.createImageData(512,512),upper=p?.intensity_model?.gray_max??100,threshold=p?.intensity_model?.display_threshold??0;
      pixels.forEach((v,i)=>{const gray=v<threshold?0:Math.round(255*Math.min(1,v/upper));data.data[4*i]=data.data[4*i+1]=data.data[4*i+2]=gray;data.data[4*i+3]=255;});
      context.putImageData(data,0,0);svg.append(this.svg('image',{x:42,y:18,width:438,height:438,href:canvas.toDataURL(),'image-rendering':'pixelated',class:'diffraction-intensity'}));
    }
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
    if(r.direct?.on_panel){const cx=x(r.direct.u),cy=y(r.direct.v);svg.append(this.svg('circle',{cx,cy,r:5,fill:'none',stroke:'#929292','stroke-width':1.5}),this.svg('path',{d:`M${cx-8} ${cy}h16 M${cx} ${cy-8}v16`,stroke:'#929292','stroke-width':1}));}
    const labelBoxes:{x:number;y:number;w:number;h:number}[]=[];let labels=0;
    for(const spot of r.spots){
      const key=spot.hkl.join(','),cx=x(spot.u),cy=y(spot.v),selected=key===this.#selected;
      // Minimum visible marker is independent of physical spot support and excitation threshold.
      const radius=Math.max(3,spot.radius_mm/r.panel.pixel_size_mm[0]/width*438),color=selected?'#ff91c5':'#e1e1e1';
      if(!r.images)svg.append(this.svg('circle',{cx,cy,r:radius,fill:'#f2f2f2','fill-opacity':spot.weight,class:'diffraction-spot','data-hkl':key}));
      // Selection is a separate annotation; it does not recolor or brighten the signal.
      if(selected)svg.append(this.svg('circle',{cx,cy,r:radius+3,fill:'none',stroke:'#ff91c5','stroke-width':1.5,class:'diffraction-selection'}));
      const hit=this.svg('circle',{cx,cy,r:Math.max(9,radius),fill:'transparent',class:'diffraction-hit'});hit.addEventListener('click',()=>{this.#selected=key;this.draw();});svg.append(hit);
      select.add(new Option(hklText(spot),key));
      if(p?.show_hkl&&labels<24){
        const text=hklText(spot),w=text.length*7.5+8,h=19;
        const candidates=[[cx+10,cy-20],[cx-w-10,cy-20],[cx+10,cy+7],[cx-w-10,cy+7]];
        const pos=candidates.find(([px,py])=>px>=43&&py>=19&&px+w<479&&py+h<455&&!labelBoxes.some(b=>px<b.x+b.w&&px+w>b.x&&py<b.y+b.h&&py+h>b.y));
        if(pos){const [px,py]=pos;labelBoxes.push({x:px,y:py,w,h});svg.append(this.svg('rect',{x:px,y:py,width:w,height:h,fill:'#171717ed',rx:2}),this.svg('text',{x:px+4,y:py+14,fill:color,'font-size':14,'font-weight':600},text));labels++;}
      }
    }
    select.value=this.#selected;if(!select.value)this.#selected='';
    const selected=r.spots.find(s=>s.hkl.join(',')===this.#selected);
    if(selected){
      this.el('detail').innerHTML=`${math(`(${selected.hkl.join(',')})`,hklText(selected))} · ${math(String.raw`d=${numberText(selected.d_A,5)}\,\text{\AA}`,`d=${numberText(selected.d_A,5)} Å`)} · ${math(String.raw`2\theta=${numberText(selected.two_theta_deg,4)}^\circ`,`2θ=${numberText(selected.two_theta_deg,4)}°`)}<br>原始像素 ${math(`(u,v)=(${numberText(selected.u,2)},${numberText(selected.v,2)})`,`(u, v)=(${numberText(selected.u,2)}, ${numberText(selected.v,2)})`)}<br>偏离衍射条件 ${math(String.raw`${numberText(selected.error_invA,6)}\,\text{\AA}^{-1}`,`${numberText(selected.error_invA,6)} Å⁻¹`)} · 相对几何响应 ${numberText(selected.weight,3)}`;
      typesetMath(this.el('detail'));
      const image=r.images?.find(i=>i.hkl.every((v,j)=>v===selected.hkl[j]));
      if(image){const detail=document.createElement('p');detail.textContent=`W=${numberText(image.W,5)} · 全球面积分 ${numberText(image.sphere_integral,6)} · 原始像素和 ${numberText(image.pixel_sum,6)} · 板内接收比例估计 ${image.received_fraction_estimate===null?'—':numberText(image.received_fraction_estimate,6)} · ${image.status==='resolved'?'积分已收敛':image.reason}`;this.el('detail').append(detail);}
    }
    const light=r.illumination;this.host.dataset.spotCount=String(r.spots.length);this.host.dataset.illumination=light.status;this.host.dataset.computeMs=String(r.duration_ms);
    const annotation=p?.show_hkl&&labels<r.spots.length?`；${r.spots.length-labels} 个标签未展开，可从列表查看`:'';
    this.message(light.status==='outside'?'光束未照到样品。':light.status==='unresolved'?'交叠低于当前采样分辨率，暂不生成信号。':r.spots.length?`面板内 ${r.spots.length} 个预测反射${annotation}`:r.excited_count?'有反射满足衍射条件，但均落在面板外。':'当前姿态下没有反射满足衍射条件。');
    if(r.images&&light.status==='lit'){
      const failures=r.images.filter(i=>i.status==='unresolved');
      this.message(failures.length?`积分未完成：${failures[0].reason}；当前图像不能作为合格数值结果。`:`原始像素和 ${numberText(rawSum,6)}；512² 预览总和 ${numberText(previewSum,6)}；${r.spots.length} 个入板反射（计算支持内）。`,failures.length>0);
    }
    this.el('source').textContent=(light.centroid_lab_mm?`发射重心 LAB (${light.centroid_lab_mm.map(v=>numberText(v,4)).join(', ')}) mm；交叠体积约 ${numberText(light.volume_mm3,6)} mm³。`:'')+` 体积积分 ${light.resolution}×${light.resolution}；枚举各指标 −${p?.hkl_limit}…${p?.hkl_limit}。`;
    this.host.dataset.result=JSON.stringify({revision:r.revision,source:light.centroid_lab_mm,source_normal_distance_mm:r.source_normal_distance_mm,spots:r.spots.map(s=>({hkl:s.hkl,u:s.u,v:s.v,weight:s.weight}))});
    if(r.images){this.host.dataset.integration=r.integration_status;this.host.dataset.rawSum=String(rawSum);this.host.dataset.previewSum=String(previewSum);this.host.dataset.result=JSON.stringify({revision:r.revision,mode:p?.intensity_model?.kind,source:light.centroid_lab_mm,source_normal_distance_mm:r.source_normal_distance_mm,integration:r.integration_status,raw_sum:rawSum,preview_sum:previewSum,gray_max:p?.intensity_model?.gray_max??100,spots:r.spots.map(s=>({hkl:s.hkl,u:s.u,v:s.v})),images:r.images.filter(i=>i.pixel_sum>0||i.status==='unresolved').map(i=>({hkl:i.hkl,pixel_sum:i.pixel_sum,sphere_integral:i.sphere_integral,tail_bound:i.tail_bound,estimated_quadrature_error:i.estimated_quadrature_error,status:i.status,reason:i.reason}))});}
    else{delete this.host.dataset.integration;delete this.host.dataset.rawSum;delete this.host.dataset.previewSum;}
  }
  dispose(){this.#refresh.dispose();}
}
