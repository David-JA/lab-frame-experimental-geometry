import { load_scene, SceneError, type Scene } from './core';
import { example_config, lab_height_config } from './example';
import { GeometryViewer } from './viewer/viewer';
import { DeviceControls } from './ui/device-controls';
import { DiffractionPanel } from './ui/diffraction-panel';
import type { DiagnosticPreset } from './viewer/view-policy';
import './style.css';

document.querySelector('#app')!.innerHTML=`
<header class="app-header"><div class="app-title"><h1>SSRF-BL12SW 实验几何工作台</h1><span>Lab Frame · 单晶几何</span></div><div class="header-actions"><span id="model-identity" class="badge">合成配置 · 未实物标定</span><a class="feedback-link" href="https://github.com/David-JA/lab-frame-experimental-geometry/issues/new/choose" target="_blank" rel="noreferrer">反馈</a><button id="open-config">配置</button></div></header>
<main class="workbench"><aside class="left" aria-label="装置与参数"><div class="panel-heading"><h2>装置</h2><div class="fold-actions"><button id="expand-devices" aria-label="展开装置树">展开</button><button id="collapse-devices" aria-label="收起装置树">收起</button></div></div><div id="devices"></div></aside>
<section class="viewport-wrap" aria-label="三维观察工作区"><div class="toolbar"><div class="camera-actions"><button id="camera-all">全景</button><button id="camera-apparatus">装置近景</button><button id="camera-sample">样品近景</button></div><span id="selected-caption" class="selected-caption"></span><label class="diagnostic-toggle"><input id="coordinate-diagnostics" type="checkbox">坐标与方向</label></div><div id="diagnostic-guide" class="diagnostic-guide" hidden><label>查看 <select id="diagnostic-preset" aria-label="要看的坐标或方向"><option value="crystal">晶体坐标</option><option value="lattice">晶格方向</option><option value="devices">装置坐标</option><option value="all">全部对照</option></select></label><span id="diagnostic-explanation"></span><button id="open-display-settings">图层设置</button></div><div id="viewport"></div>
<div class="key-readings" aria-label="关键几何读数"><div><span>带轴误差</span><strong id="key-alignment">—</strong></div><div><span>目标点 → φ 轴</span><strong id="key-phi">—</strong></div><div><span>样品中心 → θ 轴</span><strong id="key-theta">—</strong></div><button id="open-details">读数详情</button><p id="target-summary"></p></div><div class="workspace-status"><span id="status" role="status"></span><span class="navigation-hint">左键拖动旋转 · 中键拖动平移 · 滚轮缩放</span></div></section></main>
<dialog id="workspace-drawer" class="workspace-drawer" aria-labelledby="drawer-title"><div class="drawer-heading"><h2 id="drawer-title">配置与显示</h2><button id="close-drawer" aria-label="关闭工具抽屉">关闭</button></div><div class="drawer-tabs" role="tablist" aria-label="工具分类"><button role="tab" id="tab-config" aria-controls="panel-config">配置</button><button role="tab" id="tab-details" aria-controls="panel-details">读数与显示</button><button role="tab" id="tab-coincident" aria-controls="panel-coincident">重合位置</button></div>
<p id="drawer-status" class="small" aria-live="polite"></p><section id="panel-config" role="tabpanel" aria-labelledby="tab-config"><h3>保存或载入配置</h3><div class="actions"><button id="export">保存配置文件</button><label class="file">选择配置文件<input id="file" type="file" accept=".json,application/json"></label><button id="apply-file" disabled>载入配置</button></div><details id="json-settings" class="info-card"><summary>查看或编辑 JSON（高级）</summary><textarea id="config" aria-label="配置文件 JSON（高级）" spellcheck="false"></textarea><div class="actions"><button id="show-current">填入当前配置</button><button id="compare">查看差异</button><button id="restore">应用编辑后的配置</button></div><pre id="comparison" class="readout">导入或编辑 JSON 后可先比较；比较不会移动设备。</pre></details><section class="reset-section"><h3>恢复示例配置</h3><p class="small">以下操作改变装配与运动状态，不是恢复相机视角。</p><button id="reset">恢复默认示例</button></section><p class="small">示例不是实物标定。视觉杆不参与机构求解，未配置行程不代表硬件运动许可。</p></section>
<section id="panel-details" role="tabpanel" aria-labelledby="tab-details" hidden><h3>空间与晶体读数</h3><pre id="readout" class="readout coords"></pre><h3>可显示的坐标与方向</h3><label class="check"><input id="drawer-diagnostics" type="checkbox">显示坐标与方向</label><div id="display"></div><p class="small">先在主视图选择要看的类型。以下开关决定各类箭头是否可见，并随配置保存；查看类型和总开关只影响当前画面。</p><div id="axis-legend" class="small"><span class="phi-key">φ 轴</span> · <span class="theta-key">θ 轴</span> · <span class="beam-key">beam +Z</span></div><p id="direction-legend" class="small">X/Y/Z 分别为红/绿/蓝；晶体坐标用实线，晶格方向用虚线，观察目标用品红。箭头长度仅供示意。</p><details class="info-card"><summary>运动继承与渲染检查</summary><pre id="inheritance" class="readout"></pre><div id="diagnostics"></div></details><p class="small"><a href="https://github.com/David-JA/obsidian/issues/38" target="_blank" rel="noreferrer">需求与验收 · Obsidian #38</a></p></section>
<section id="panel-coincident" role="tabpanel" aria-labelledby="tab-coincident" hidden><h3>同一位置的对象</h3><p class="small">这里列出三维位置相同的对象；画面上看起来重叠，不一定处在同一位置。位置相同也不代表方向相同。</p><div id="coincident-details">点击场景中的重合位置标记，查看对应对象。</div></section></dialog>`;
const byId=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
let scene:Scene=load_scene(new URLSearchParams(location.search).get('example')==='synthetic'?example_config():lab_height_config()),viewer:GeometryViewer|undefined;
let deviceControls:DeviceControls,diagnosticView=false;
let diagnosticPreset:DiagnosticPreset='crystal';
let diffractionPanel:DiffractionPanel|undefined;
try{viewer=new GeometryViewer(byId('viewport'),{onSelect:id=>deviceControls?.select(id),onInspectCoincident:position=>showCoincident(position)});}catch(error){byId('viewport').textContent='无法初始化 WebGL，数值查询仍可用。'+String(error);}
const fmt=(n:number)=>Math.abs(n)<1e-9?'0':Number(n.toFixed(6)).toString();
const xyz=(v:number[])=>v.map(fmt).join(', ');
function status(message:string,error=false){for(const id of ['status','drawer-status']){byId(id).textContent=message;byId(id).classList.toggle('error',error);}}
function fail(error:unknown){
  const message=error instanceof SceneError?(error.code==='INVALID_QUATERNION'?'晶体取向未应用：四个分量的平方和需要等于 1。':error.message.includes('Target indices cannot be zero')?'观察方向未应用：三个指标不能同时为 0。':JSON.stringify(error.toJSON())):error instanceof SyntaxError?'配置尚未载入：文件内容不是有效的 JSON。':String(error);
  status(message,true);
}
function change(action:()=>void,input?:HTMLInputElement,automatic=false):boolean{
  if(!automatic)deviceControls?.pauseMotion('已手动修改参数，已暂停。');
  try{action();input?.removeAttribute('aria-invalid');render();status('状态已更新');return true;}
  catch(error){input?.setAttribute('aria-invalid','true');fail(error);return false;}
}
function buildControls(){
  const c=scene.save_state();
  const selectedId=deviceControls?.selectedId;deviceControls?.dispose();
  deviceControls=new DeviceControls(scene,byId('devices'),change,{selectedId,onSelect:()=>render(),motionEdit:action=>change(action,undefined,true),onMotionChange:running=>diffractionPanel?.update(running)});byId('display').replaceChildren();
  for(const [key,label]of [['frames','装置坐标（含实验室）'],['crystal','晶体坐标 X/Y/Z'],['lattice','晶格方向 [100]/[010]/[001]']] as const){
    const el=document.createElement('label');el.className='check';const input=document.createElement('input');input.type='checkbox';input.checked=c.experiment_state.display[key];input.setAttribute('aria-label',label);
    input.addEventListener('change',()=>change(()=>{const next=scene.save_state();next.experiment_state.display[key]=input.checked;scene.restore_state(next);}));
    el.append(input,document.createTextNode(' '+label));byId('display').append(el);
  }
}
function render(){
  const c=scene.save_state();viewer?.update(scene);viewer?.set_view({selectedDeviceId:deviceControls.selectedId,diagnostics:diagnosticView,diagnosticPreset});
  diffractionPanel?.update(deviceControls.motionRunning);
  byId('diagnostic-guide').hidden=!diagnosticView;
  const descriptions:Record<DiagnosticPreset,string>={crystal:'晶体坐标：三条相互垂直的 X/Y/Z 轴。箭头长度仅供示意。',lattice:'晶格方向：[100]/[010]/[001] 不一定相互垂直，箭头长度不代表晶格常数。',devices:'实验室与当前装置的坐标；φ/θ 表示转轴。',all:'全部图层叠加，适合逐项核对；日常观察建议只看一类。'};
  const enabled=diagnosticPreset==='all'?Object.values(c.experiment_state.display).some(Boolean):c.experiment_state.display[diagnosticPreset==='devices'?'frames':diagnosticPreset];
  byId('diagnostic-explanation').textContent=descriptions[diagnosticPreset]+(enabled?'':' 此类图层已在配置中关闭，可在“图层设置”中开启。');
  deviceControls.refresh();
  byId('inheritance').textContent=c.assembly.frames.map(f=>f.parent+' → '+f.id+' · '+f.motion.kind).concat(c.devices.devices.filter(d=>d.crystal).map(d=>d.output_frame+' → '+d.crystal!.frame+' · R_SC'),'LAB → Beam').join('\n');
  byId('selected-caption').textContent='当前：'+byId('selected-device-name').textContent;
  byId('model-identity').textContent=(c.assembly.description?'粗测与示意配置':c.devices.devices.some(d=>d.provenance==='synthetic')?'合成配置':'来源配置')+' · 未实物标定';
  for(const id of ['key-alignment','key-phi','key-theta'])byId(id).textContent='—';byId('target-summary').textContent='';
  const sample=c.devices.devices.find(d=>d.crystal),rotary=c.devices.devices.find(d=>d.type==='rotary'),theta=c.devices.devices.find(d=>d.type==='theta'),hex=c.devices.devices.find(d=>d.type==='hexapod');
  const lines=['LAB：位置 mm / 角度 °','revision: '+scene.revision];
  if(c.assembly.description)lines.push(c.assembly.description);
  if(sample){
    const s=c.experiment_state.samples[sample.id],center=scene.get_sample_point(sample.id,'center'),target=scene.get_sample_point(sample.id,'target'),d=scene.get_crystal_direction(sample.id,s.target_indices,s.direction_type).vector;
    lines.push('样品中心：'+xyz(center.position),'目标点：'+xyz(target.position),'有向目标：'+xyz(d));
    lines.push('目标点相对光束高度：'+fmt(target.position[1]-c.assembly.beam.point_mm[1])+' mm');
    byId('target-summary').textContent=(s.direction_type==='direct'?'目标晶向 ['+s.target_indices.join(' ')+']':'目标法向 ('+s.target_indices.join(' ')+')')+' → LAB 单位方向 ('+xyz(d)+')'+(c.assembly.description?' · 目标点相对光束高度 '+fmt(target.position[1]-c.assembly.beam.point_mm[1])+' mm':'');
    if(rotary){
      const distance=scene.get_point_to_axis_distance({frame:'LAB',position_mm:target.position},scene.get_axis(rotary.id)).distance_mm;
      lines.push('目标点到 φ 轴：'+fmt(distance)+' mm');byId('key-phi').textContent=fmt(distance)+' mm';
      if(s.direction_type==='direct'){
        const a=scene.get_zone_axis_alignment(sample.id,s.target_indices,rotary.id);
        lines.push('带轴误差：'+fmt(a.axis_error_deg)+'°','模型内几何对齐：'+(a.aligned?'是':'否'));byId('key-alignment').textContent=fmt(a.axis_error_deg)+'°';
      }else{lines.push('当前显示倒易法向；带轴对齐仅用于 direct。');byId('key-alignment').textContent='—（法向）';}
    }
    if(theta){const distance=scene.get_point_to_axis_distance({frame:'LAB',position_mm:center.position},scene.get_axis(theta.id)).distance_mm;lines.push('样品中心到 θ 轴：'+fmt(distance)+' mm');byId('key-theta').textContent=fmt(distance)+' mm';}
    if(hex){const pivot=scene.get_pivot(hex.id).position;lines.push('当前 pivot：'+xyz(pivot),'样品中心到 pivot：'+fmt(Math.hypot(...center.position.map((v,i)=>v-pivot[i])))+' mm','目标点到 pivot：'+fmt(Math.hypot(...target.position.map((v,i)=>v-pivot[i])))+' mm');}
  }
  byId('readout').textContent=lines.join('\n');
  const diag=viewer?.diagnostics()??{webgl:false,rendered_revision:-1};
  byId('diagnostics').textContent=JSON.stringify(diag);byId('diagnostics').dataset.diagnostics=JSON.stringify(diag);
  byId('readout').dataset.state=JSON.stringify({revision:scene.revision,snapshot:scene.save_state()});
}
const drawer=byId<HTMLDialogElement>('workspace-drawer');
function openDrawer(tab:'config'|'details'|'coincident'){
  if(tab==='config')deviceControls?.pauseMotion('已打开配置，已暂停。');
  for(const name of ['config','details','coincident']){byId('panel-'+name).hidden=name!==tab;byId('tab-'+name).setAttribute('aria-selected',String(name===tab));byId('tab-'+name).tabIndex=name===tab?0:-1;}
  if(!drawer.open)drawer.showModal();byId('tab-'+tab).focus();
}
function showCoincident(position:number[]){
  const c=scene.save_state(),host=byId('coincident-details');host.replaceChildren();host.dataset.world=JSON.stringify(position);
  const heading=document.createElement('p');heading.textContent='LAB 位置 ('+xyz(position)+') mm';host.append(heading);
  const list=document.createElement('ul');list.className='coincident-list';host.append(list);
  const same=(p:number[])=>Math.hypot(...p.map((v,i)=>v-position[i]))<=1e-6;
  const add=(name:string,description:string)=>{const row=document.createElement('li'),title=document.createElement('strong'),body=document.createElement('p');title.textContent=name;body.textContent=description;row.append(title,body);list.append(row);};
  const frames=['LAB',...c.assembly.frames.map(f=>f.id),...c.devices.devices.filter(d=>d.crystal).map(d=>d.crystal!.frame)];
  for(const id of frames){const m=scene.get_frame_transform('LAB',id).matrix;if(same([m[3],m[7],m[11]]))add(id+' 原点','LAB 方向：X ('+xyz([m[0],m[4],m[8]])+') · Y ('+xyz([m[1],m[5],m[9]])+') · Z ('+xyz([m[2],m[6],m[10]])+')');}
  for(const d of c.devices.devices){
    if(d.crystal){for(const [kind,label]of [['center','样品中心'],['target','目标点']] as const)if(same(scene.get_sample_point(d.id,kind).position))add(label+' · '+d.id,'定义于 '+d.output_frame+'，与上述原点/点仅共享位置。');}
    if(d.type==='hexapod'&&same(scene.get_pivot(d.id).position))add('pivot · '+d.id,'当前旋转参考点，包含六轴平移，不等于移动安装基座。');
  }
  host.dataset.memberCount=String(list.children.length);openDrawer('coincident');
}
function setDiagnostics(value:boolean){diagnosticView=value;for(const id of ['coordinate-diagnostics','drawer-diagnostics'])byId<HTMLInputElement>(id).checked=value;render();}
for(const tab of ['config','details','coincident'] as const)byId('tab-'+tab).onclick=()=>openDrawer(tab);
byId('open-config').onclick=()=>openDrawer('config');byId('open-display-settings').onclick=()=>openDrawer('details');byId('open-details').onclick=()=>openDrawer('details');byId('close-drawer').onclick=()=>drawer.close();
drawer.addEventListener('click',e=>{if(e.target===drawer){const r=drawer.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)drawer.close();}});
for(const id of ['coordinate-diagnostics','drawer-diagnostics'])byId<HTMLInputElement>(id).onchange=e=>setDiagnostics((e.target as HTMLInputElement).checked);
byId<HTMLSelectElement>('diagnostic-preset').onchange=e=>{diagnosticPreset=(e.target as HTMLSelectElement).value as DiagnosticPreset;render();};
const editor=byId<HTMLTextAreaElement>('config');
let pendingFileText:string|undefined;
byId('expand-devices').onclick=()=>deviceControls.setExpanded(true);
byId('collapse-devices').onclick=()=>deviceControls.setExpanded(false);
byId('show-current').onclick=()=>editor.value=JSON.stringify(scene.save_state(),null,2);
byId('compare').onclick=()=>{
  try{const r=scene.revision;byId('comparison').textContent=JSON.stringify(scene.compare_states(scene.save_state(),JSON.parse(editor.value)),null,2);status('比较完成，场景保持 revision '+r);}
  catch(error){fail(error);}
};
byId('restore').onclick=()=>change(()=>{scene.restore_state(JSON.parse(editor.value));buildControls();});
byId('apply-file').textContent='载入所选文件';
byId('apply-file').onclick=()=>{if(pendingFileText!==undefined)change(()=>{scene.restore_state(JSON.parse(pendingFileText!));buildControls();});};
byId('reset').onclick=()=>change(()=>{scene.restore_state(lab_height_config());buildControls();editor.value=JSON.stringify(scene.save_state(),null,2);byId('comparison').textContent='已恢复实验室粗测高度配置。';});
const syntheticReset=document.createElement('button');syntheticReset.id='reset-synthetic';syntheticReset.textContent='恢复合成示例';byId('reset').textContent='恢复实验室高度配置';byId('reset').after(syntheticReset);
syntheticReset.onclick=()=>change(()=>{scene.restore_state(example_config());buildControls();editor.value=JSON.stringify(scene.save_state(),null,2);byId('comparison').textContent='已恢复合成示例。';});
byId<HTMLInputElement>('file').onchange=async e=>{
  const input=e.target as HTMLInputElement,file=input.files?.[0],button=byId<HTMLButtonElement>('apply-file');
  pendingFileText=undefined;button.disabled=true;
  if(!file){status('请选择要载入的配置文件。');return;}
  try{const contents=await file.text();if(input.files?.[0]!==file)return;pendingFileText=contents;editor.value=contents;button.disabled=false;status('文件已读取，点击“载入所选文件”后应用。');}
  catch(error){if(input.files?.[0]===file)fail(error);}
};
byId('export').onclick=()=>{
  const blob=new Blob([JSON.stringify(scene.save_state(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='lab-frame-scene.json';a.click();URL.revokeObjectURL(url);status('已导出完整 snapshot。');
};
byId('camera-all').onclick=()=>viewer?.reset_camera();byId('camera-apparatus').onclick=()=>viewer?.focus_apparatus();byId('camera-sample').onclick=()=>viewer?.focus_sample();
window.addEventListener('pagehide',event=>{
  deviceControls?.pauseMotion('已离开页面，已暂停。');
  if(!event.persisted){deviceControls?.dispose();viewer?.dispose();diffractionPanel?.dispose();}
});
const diffractionEntry=document.createElement('button');diffractionEntry.id='open-diffraction';diffractionEntry.textContent='衍射预览';byId('open-config').before(diffractionEntry);
const diffractionHost=document.createElement('aside');diffractionHost.id='diffraction-panel';document.querySelector('.workbench')!.append(diffractionHost);
diffractionPanel=new DiffractionPanel(diffractionHost,diffractionEntry,()=>scene,next=>change(()=>{scene.restore_state(next);buildControls();}));
buildControls();editor.value=JSON.stringify(scene.save_state(),null,2);render();viewer?.focus_apparatus();status('配置已加载');
