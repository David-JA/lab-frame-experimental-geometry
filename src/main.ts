import { load_scene, SceneError, type Scene, type Vec3, type DirectionType } from './core';
import { example_config } from './example';
import { GeometryViewer } from './viewer/viewer';
import './style.css';

document.querySelector('#app')!.innerHTML=[
'<header><div><h1>Lab-Frame Experimental Geometry</h1><p>实验室坐标系下的装置几何 · 独立运动学 · 晶体方向</p></div><span class="badge">SYNTHETIC · 演示配置，非实物标定</span></header>',
'<main><aside class="left"><h2>装置运动参数</h2><div id="joints"></div><h2>Hexapod pivot · H0 / mm</h2><div id="pivot"></div><h2>晶体取向 · R_SC</h2><div id="crystal-inputs"></div><button id="apply-crystal">应用晶体参数</button><h2>显示</h2><div id="display"></div><p class="small">UVW：H0 固定轴 X→Y→Z，仅为演示约定。LAB +Y 向上，+Z 入射。</p><p><a href="https://github.com/David-JA/obsidian/issues/38" target="_blank" rel="noreferrer">需求与验收 · Obsidian #38</a></p></aside>',
'<section class="viewport-wrap"><div class="toolbar"><button id="camera-all">全景</button><button id="camera-sample">样品台近景</button><button id="reset">恢复默认示例</button><span class="small">拖动旋转 · 滚轮缩放 · 右键平移</span><span id="axis-legend" class="small"><span style="color:#ffd66b">φ 轴</span> · <span style="color:#c7b4ff">θ 轴</span> · <span style="color:#7fd4f0">beam +Z</span></span></div><div id="viewport"></div><div id="status" role="status"></div></section>',
'<aside class="right"><section><h2>空间与晶体读数</h2><pre id="readout" class="readout coords"></pre><h2>运动继承</h2><pre class="readout">LAB → φ → H0 → H1\n              → θ → XY → S → C\nLAB → Detector / Beam</pre><div id="diagnostics"></div></section>',
'<section><h2>实验状态</h2><div class="actions"><button id="export">导出 JSON</button><label class="file">导入文件 <input id="file" type="file" accept=".json,application/json"></label></div><textarea id="config" aria-label="场景 snapshot JSON" spellcheck="false"></textarea><div class="actions"><button id="show-current">读取当前配置</button><button id="compare">与当前状态比较</button><button id="restore">恢复 / 应用 JSON</button></div><pre id="comparison" class="readout">导入或编辑 JSON 后可先比较；比较不会移动设备。</pre><p class="small">mount、轴、尺寸与 cell 可在 JSON 中修改。视觉杆不参与机构求解；未配置行程不代表硬件可安全运动。</p></section></aside></main>'
].join('');
const byId=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
let scene:Scene=load_scene(example_config()),viewer:GeometryViewer|undefined;
try{viewer=new GeometryViewer(byId('viewport'));}catch(error){byId('viewport').textContent='无法初始化 WebGL，数值查询仍可用。'+String(error);}
const fields=new Map<string,HTMLInputElement>(),crystalFields:HTMLInputElement[]=[];
const fmt=(n:number)=>Math.abs(n)<1e-9?'0':Number(n.toFixed(6)).toString();
const xyz=(v:number[])=>v.map(fmt).join(', ');
function status(message:string,error=false){byId('status').textContent=message;byId('status').classList.toggle('error',error);}
function fail(error:unknown){status(error instanceof SceneError?JSON.stringify(error.toJSON()):String(error),true);}
function change(action:()=>void,input?:HTMLInputElement){
  try{action();input?.removeAttribute('aria-invalid');render();status('状态已更新 · revision '+scene.revision);}
  catch(error){input?.setAttribute('aria-invalid','true');fail(error);}
}
function numeric(label:string,value:number,parent:HTMLElement,onChange:(n:number,input:HTMLInputElement)=>void,id?:string){
  const wrap=document.createElement('label');wrap.className='joint';
  const text=document.createElement('span');text.textContent=label;
  const input=document.createElement('input');input.type='number';input.step='any';input.value=String(value);input.setAttribute('aria-label',label);
  if(id)input.dataset.joint=id;
  input.addEventListener('change',()=>onChange(input.valueAsNumber,input));wrap.append(text,input);parent.append(wrap);return input;
}
function buildControls(){
  const c=scene.save_state();fields.clear();crystalFields.length=0;
  for(const id of ['joints','pivot','crystal-inputs','display'])byId(id).replaceChildren();
  for(const j of c.assembly.joints){
    const input=numeric(j.id+' / '+j.unit,c.experiment_state.joints[j.id],byId('joints'),(n,input)=>change(()=>{scene.set_joint_value(j.id,n);},input),j.id);
    if(j.limits){input.min=String(j.limits[0]);input.max=String(j.limits[1]);}fields.set(j.id,input);
  }
  const hex=c.devices.devices.find(d=>d.type==='hexapod'),f=hex&&c.assembly.frames.find(f=>f.id===hex.output_frame);
  if(f?.motion.kind==='six_dof')f.motion.pivot_mm.forEach((v,i)=>numeric(['c_x','c_y','c_z'][i],v,byId('pivot'),(n,input)=>change(()=>{
    const next=scene.save_state(),m=next.assembly.frames.find(x=>x.id===f.id)!.motion;
    if(m.kind==='six_dof')m.pivot_mm[i]=n;scene.restore_state(next);
  },input)));
  const sample=c.devices.devices.find(d=>d.crystal);
  byId<HTMLButtonElement>('apply-crystal').disabled=!sample;
  if(sample){
    const s=c.experiment_state.samples[sample.id];
    [...s.orientation_quaternion_xyzw,...s.target_indices].forEach((v,i)=>crystalFields.push(numeric(['q_x','q_y','q_z','q_w','index_u/h','index_v/k','index_w/l'][i],v,byId('crystal-inputs'),()=>{})));
    const select=document.createElement('select');select.id='direction-type';select.setAttribute('aria-label','方向类型');
    for(const [value,label]of [['direct','直接晶向 [uvw]'],['reciprocal','晶面法向 (hkl)']])select.add(new Option(label,value));
    select.value=s.direction_type;byId('crystal-inputs').append(select);
  }
  for(const [key,label]of [['frames','设备 frame 坐标轴'],['crystal','C 正交笛卡尔轴'],['lattice','直接晶格 [100]/[010]/[001]']] as const){
    const el=document.createElement('label');el.className='check';const input=document.createElement('input');input.type='checkbox';input.checked=c.experiment_state.display[key];input.setAttribute('aria-label',label);
    input.addEventListener('change',()=>change(()=>{const next=scene.save_state();next.experiment_state.display[key]=input.checked;scene.restore_state(next);}));
    el.append(input,document.createTextNode(' '+label));byId('display').append(el);
  }
}
function render(){
  const c=scene.save_state();viewer?.update(scene);
  for(const [id,input]of fields)input.value=String(c.experiment_state.joints[id]);
  const sample=c.devices.devices.find(d=>d.crystal),rotary=c.devices.devices.find(d=>d.type==='rotary'),theta=c.devices.devices.find(d=>d.type==='theta'),hex=c.devices.devices.find(d=>d.type==='hexapod');
  const lines=['LAB：位置 mm / 角度 deg','revision: '+scene.revision];
  if(sample){
    const s=c.experiment_state.samples[sample.id],center=scene.get_sample_point(sample.id,'center'),target=scene.get_sample_point(sample.id,'target'),d=scene.get_crystal_direction(sample.id,s.target_indices,s.direction_type).vector;
    lines.push('样品中心：'+xyz(center.position),'目标点：'+xyz(target.position),'有向目标：'+xyz(d));
    if(rotary){
      const a=scene.get_zone_axis_alignment(sample.id,s.target_indices,rotary.id);
      lines.push('目标点到 φ 轴：'+fmt(a.point_distance_mm)+' mm');
      if(s.direction_type==='direct')lines.push('带轴误差：'+fmt(a.axis_error_deg)+'°','几何对齐：'+(a.aligned?'是':'否'));
      else lines.push('当前显示倒易法向；带轴对齐仅用于 direct。');
    }
    if(theta)lines.push('样品中心到 θ 轴：'+fmt(scene.get_point_to_axis_distance({frame:'LAB',position_mm:center.position},scene.get_axis(theta.id)).distance_mm)+' mm');
    if(hex){const pivot=scene.get_pivot(hex.id).position;lines.push('当前 pivot：'+xyz(pivot),'样品中心到 pivot：'+fmt(Math.hypot(...center.position.map((v,i)=>v-pivot[i])))+' mm','目标点到 pivot：'+fmt(Math.hypot(...target.position.map((v,i)=>v-pivot[i])))+' mm');}
  }
  byId('readout').textContent=lines.join('\n');
  const diag=viewer?.diagnostics()??{webgl:false,rendered_revision:-1};
  byId('diagnostics').textContent=JSON.stringify(diag);byId('diagnostics').dataset.diagnostics=JSON.stringify(diag);
  byId('readout').dataset.state=JSON.stringify({revision:scene.revision,snapshot:scene.save_state()});
}
const editor=byId<HTMLTextAreaElement>('config');
byId('apply-crystal').onclick=()=>change(()=>{
  const c=scene.save_state(),sample=c.devices.devices.find(d=>d.crystal);if(!sample)return;
  const v=crystalFields.map(f=>f.valueAsNumber);
  c.experiment_state.samples[sample.id]={orientation_quaternion_xyzw:v.slice(0,4) as [number,number,number,number],target_indices:v.slice(4,7) as Vec3,direction_type:byId<HTMLSelectElement>('direction-type').value as DirectionType};
  scene.restore_state(c);
});
byId('show-current').onclick=()=>editor.value=JSON.stringify(scene.save_state(),null,2);
byId('compare').onclick=()=>{
  try{const r=scene.revision;byId('comparison').textContent=JSON.stringify(scene.compare_states(scene.save_state(),JSON.parse(editor.value)),null,2);status('比较完成，场景保持 revision '+r);}
  catch(error){fail(error);}
};
byId('restore').onclick=()=>change(()=>{scene.restore_state(JSON.parse(editor.value));buildControls();});
byId('reset').onclick=()=>change(()=>{scene.restore_state(example_config());buildControls();editor.value=JSON.stringify(scene.save_state(),null,2);byId('comparison').textContent='已恢复默认合成示例。';});
byId<HTMLInputElement>('file').onchange=async e=>{
  try{const file=(e.target as HTMLInputElement).files?.[0];if(file){editor.value=await file.text();status('已读取文件，尚未应用；可比较或恢复。');}}catch(error){fail(error);}
};
byId('export').onclick=()=>{
  const blob=new Blob([JSON.stringify(scene.save_state(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='lab-frame-scene.json';a.click();URL.revokeObjectURL(url);status('已导出完整 snapshot。');
};
byId('camera-all').onclick=()=>viewer?.reset_camera();byId('camera-sample').onclick=()=>viewer?.focus_sample();
window.addEventListener('pagehide',()=>viewer?.dispose());
buildControls();editor.value=JSON.stringify(scene.save_state(),null,2);render();status('已加载合成示例，所有装配参数均未经实物标定。');
