import { load_scene, SceneError, type Scene } from './core';
import { example_config, lab_height_config } from './example';
import { GeometryViewer } from './viewer/viewer';
import { DeviceControls } from './ui/device-controls';
import './style.css';

document.querySelector('#app')!.innerHTML=`
<header class="app-header"><div class="app-title"><h1>SSRF-BL12SW 实验几何工作台</h1><span>Lab Frame · 单晶几何</span></div><div class="header-actions"><span id="model-identity" class="badge">合成配置 · 未实物标定</span><a class="feedback-link" href="https://github.com/David-JA/lab-frame-experimental-geometry/issues/new/choose" target="_blank" rel="noreferrer">反馈</a><button id="open-config">配置</button></div></header>
<main class="workbench"><aside class="left" aria-label="装置与参数"><div class="panel-heading"><h2>装置</h2><div class="fold-actions"><button id="expand-devices" aria-label="展开装置树">展开</button><button id="collapse-devices" aria-label="收起装置树">收起</button></div></div><div id="devices"></div></aside>
<section class="viewport-wrap" aria-label="三维观察工作区"><div class="toolbar"><div class="camera-actions"><button id="camera-all">全景</button><button id="camera-apparatus">装置近景</button><button id="camera-sample">样品近景</button></div><span id="selected-caption" class="selected-caption"></span><label class="diagnostic-toggle"><input id="coordinate-diagnostics" type="checkbox">坐标诊断</label></div><div id="viewport"></div>
<div class="key-readings" aria-label="关键几何读数"><div><span>带轴误差</span><strong id="key-alignment">—</strong></div><div><span>目标点 → φ 轴</span><strong id="key-phi">—</strong></div><div><span>样品中心 → θ 轴</span><strong id="key-theta">—</strong></div><button id="open-details">读数详情</button><p id="target-summary"></p></div><div class="workspace-status"><span id="status" role="status"></span><span class="navigation-hint">拖动旋转 · 滚轮缩放 · 右键平移</span></div></section></main>
<dialog id="workspace-drawer" class="workspace-drawer" aria-labelledby="drawer-title"><div class="drawer-heading"><h2 id="drawer-title">工作区工具</h2><button id="close-drawer" aria-label="关闭工具抽屉">关闭</button></div><div class="drawer-tabs" role="tablist" aria-label="工具分类"><button role="tab" id="tab-config" aria-controls="panel-config">配置</button><button role="tab" id="tab-details" aria-controls="panel-details">读数与诊断</button><button role="tab" id="tab-coincident" aria-controls="panel-coincident">共点详情</button></div>
<p id="drawer-status" class="small" aria-live="polite"></p><section id="panel-config" role="tabpanel" aria-labelledby="tab-config"><h3>实验配置</h3><div class="actions"><button id="export">导出 JSON</button><label class="file">导入文件<input id="file" type="file" accept=".json,application/json"></label></div><textarea id="config" aria-label="场景 snapshot JSON" spellcheck="false"></textarea><div class="actions"><button id="show-current">读取当前配置</button><button id="compare">与当前状态比较</button><button id="restore">恢复 / 应用 JSON</button></div><pre id="comparison" class="readout">导入或编辑 JSON 后可先比较；比较不会移动设备。</pre><section class="reset-section"><h3>恢复示例配置</h3><p class="small">以下操作改变装配与运动状态，不是恢复相机视角。</p><button id="reset">恢复默认示例</button></section><p class="small">示例不是实物标定。视觉杆不参与机构求解，未配置行程不代表硬件运动许可。</p></section>
<section id="panel-details" role="tabpanel" aria-labelledby="tab-details" hidden><h3>空间与晶体读数</h3><pre id="readout" class="readout coords"></pre><h3>坐标诊断图层</h3><label class="check"><input id="drawer-diagnostics" type="checkbox">显示坐标诊断</label><div id="display"></div><p class="small">诊断关闭时，仅显示任务相关标注与当前选择；这些观察选项不修改物理状态。C 正交轴与晶格方向是不同的表示。</p><div id="axis-legend" class="small"><span class="phi-key">φ 轴</span> · <span class="theta-key">θ 轴</span> · <span class="beam-key">beam +Z</span></div><p id="direction-legend" class="small">XYZ 红/绿/蓝 · C 实线 / 晶格虚线 · 目标品红 · pivot 灰色空心。共点不代表同向。</p><details class="info-card"><summary>运动继承与渲染检查</summary><pre id="inheritance" class="readout"></pre><div id="diagnostics"></div></details><p class="small"><a href="https://github.com/David-JA/obsidian/issues/38" target="_blank" rel="noreferrer">需求与验收 · Obsidian #38</a></p></section>
<section id="panel-coincident" role="tabpanel" aria-labelledby="tab-coincident" hidden><h3>真实三维共点</h3><p class="small">仅合并三维位置相同的锚点，不把屏幕投影重叠视为共点，也不表示各坐标轴同向。</p><div id="coincident-details">点击场景中的共点标记查看成员与坐标方向。</div></section></dialog>`;
const byId=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
let scene:Scene=load_scene(new URLSearchParams(location.search).get('example')==='synthetic'?example_config():lab_height_config()),viewer:GeometryViewer|undefined;
let deviceControls:DeviceControls,diagnosticView=false;
try{viewer=new GeometryViewer(byId('viewport'),{onSelect:id=>deviceControls?.select(id),onInspectCoincident:position=>showCoincident(position)});}catch(error){byId('viewport').textContent='无法初始化 WebGL，数值查询仍可用。'+String(error);}
const fmt=(n:number)=>Math.abs(n)<1e-9?'0':Number(n.toFixed(6)).toString();
const xyz=(v:number[])=>v.map(fmt).join(', ');
function status(message:string,error=false){for(const id of ['status','drawer-status']){byId(id).textContent=message;byId(id).classList.toggle('error',error);}}
function fail(error:unknown){status(error instanceof SceneError?JSON.stringify(error.toJSON()):String(error),true);}
function change(action:()=>void,input?:HTMLInputElement){
  try{action();input?.removeAttribute('aria-invalid');render();status('状态已更新');}
  catch(error){input?.setAttribute('aria-invalid','true');fail(error);}
}
function buildControls(){
  const c=scene.save_state();
  deviceControls=new DeviceControls(scene,byId('devices'),change,{selectedId:deviceControls?.selectedId,onSelect:()=>render()});byId('display').replaceChildren();
  for(const [key,label]of [['frames','设备 frame 坐标轴'],['crystal','C 正交笛卡尔轴'],['lattice','直接晶格 [100]/[010]/[001]']] as const){
    const el=document.createElement('label');el.className='check';const input=document.createElement('input');input.type='checkbox';input.checked=c.experiment_state.display[key];input.setAttribute('aria-label',label);
    input.addEventListener('change',()=>change(()=>{const next=scene.save_state();next.experiment_state.display[key]=input.checked;scene.restore_state(next);}));
    el.append(input,document.createTextNode(' '+label));byId('display').append(el);
  }
}
function render(){
  const c=scene.save_state();viewer?.update(scene);viewer?.set_view({selectedDeviceId:deviceControls.selectedId,diagnostics:diagnosticView});
  deviceControls.refresh();
  byId('inheritance').textContent=c.assembly.frames.map(f=>f.parent+' → '+f.id+' · '+f.motion.kind).concat(c.devices.devices.filter(d=>d.crystal).map(d=>d.output_frame+' → '+d.crystal!.frame+' · R_SC'),'LAB → Beam').join('\n');
  byId('selected-caption').textContent='当前：'+byId('selected-device-name').textContent;
  byId('model-identity').textContent=(c.assembly.description?'粗测与示意配置':c.devices.devices.some(d=>d.provenance==='synthetic')?'合成配置':'来源配置')+' · 未实物标定';
  for(const id of ['key-alignment','key-phi','key-theta'])byId(id).textContent='—';byId('target-summary').textContent='';
  const sample=c.devices.devices.find(d=>d.crystal),rotary=c.devices.devices.find(d=>d.type==='rotary'),theta=c.devices.devices.find(d=>d.type==='theta'),hex=c.devices.devices.find(d=>d.type==='hexapod');
  const lines=['LAB：位置 mm / 角度 deg','revision: '+scene.revision];
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
byId('open-config').onclick=()=>openDrawer('config');byId('open-details').onclick=()=>openDrawer('details');byId('close-drawer').onclick=()=>drawer.close();
drawer.addEventListener('click',e=>{if(e.target===drawer){const r=drawer.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)drawer.close();}});
for(const id of ['coordinate-diagnostics','drawer-diagnostics'])byId<HTMLInputElement>(id).onchange=e=>setDiagnostics((e.target as HTMLInputElement).checked);
const editor=byId<HTMLTextAreaElement>('config');
byId('expand-devices').onclick=()=>deviceControls.setExpanded(true);
byId('collapse-devices').onclick=()=>deviceControls.setExpanded(false);
byId('show-current').onclick=()=>editor.value=JSON.stringify(scene.save_state(),null,2);
byId('compare').onclick=()=>{
  try{const r=scene.revision;byId('comparison').textContent=JSON.stringify(scene.compare_states(scene.save_state(),JSON.parse(editor.value)),null,2);status('比较完成，场景保持 revision '+r);}
  catch(error){fail(error);}
};
byId('restore').onclick=()=>change(()=>{scene.restore_state(JSON.parse(editor.value));buildControls();});
byId('reset').onclick=()=>change(()=>{scene.restore_state(lab_height_config());buildControls();editor.value=JSON.stringify(scene.save_state(),null,2);byId('comparison').textContent='已恢复实验室粗测高度配置。';});
const syntheticReset=document.createElement('button');syntheticReset.id='reset-synthetic';syntheticReset.textContent='恢复合成示例';byId('reset').textContent='恢复实验室高度配置';byId('reset').after(syntheticReset);
syntheticReset.onclick=()=>change(()=>{scene.restore_state(example_config());buildControls();editor.value=JSON.stringify(scene.save_state(),null,2);byId('comparison').textContent='已恢复合成示例。';});
byId<HTMLInputElement>('file').onchange=async e=>{
  try{const file=(e.target as HTMLInputElement).files?.[0];if(file){editor.value=await file.text();status('已读取文件，尚未应用；可比较或恢复。');}}catch(error){fail(error);}
};
byId('export').onclick=()=>{
  const blob=new Blob([JSON.stringify(scene.save_state(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='lab-frame-scene.json';a.click();URL.revokeObjectURL(url);status('已导出完整 snapshot。');
};
byId('camera-all').onclick=()=>viewer?.reset_camera();byId('camera-apparatus').onclick=()=>viewer?.focus_apparatus();byId('camera-sample').onclick=()=>viewer?.focus_sample();
window.addEventListener('pagehide',()=>viewer?.dispose());
buildControls();editor.value=JSON.stringify(scene.save_state(),null,2);render();viewer?.focus_apparatus();status('配置已加载');
