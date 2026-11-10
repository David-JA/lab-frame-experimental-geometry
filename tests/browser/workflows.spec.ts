import { test, expect, type Page } from '@playwright/test';
import { Buffer } from 'node:buffer';
const state=async(page:Page)=>JSON.parse((await page.locator('#readout').getAttribute('data-state'))!);
const diagnostics=async(page:Page)=>JSON.parse((await page.locator('#diagnostics').getAttribute('data-diagnostics'))!);
async function closeTools(page:Page){if(await page.locator('#workspace-drawer').evaluate(el=>(el as HTMLDialogElement).open))await page.locator('#close-drawer').click();}
async function tools(page:Page,tab='config'){
  if(!await page.locator('#workspace-drawer').evaluate(el=>(el as HTMLDialogElement).open))await page.locator('#open-config').click();
  await page.locator('#tab-'+tab).click();
}
async function resetScene(page:Page){await tools(page);await page.locator('#reset').click();await closeTools(page);}
async function applyConfig(page:Page,config:unknown){await tools(page);await page.locator('#config').fill(JSON.stringify(config));await page.locator('#restore').click();await closeTools(page);}
async function openDevice(page:Page,id:string){
  await closeTools(page);
  const cards=await page.locator('.device-card').evaluateAll(els=>els.map(el=>({id:(el as HTMLElement).dataset.device!,members:JSON.parse((el as HTMLElement).dataset.devices!)})));
  const card=cards.find(c=>c.members.includes(id))!;
  await page.locator('#expand-devices').click();await page.locator('.device-tree-row[data-device="'+card.id+'"]').click();
}
async function openInstallation(page:Page,id:string){await openDevice(page,id);const box=page.locator('#placement-'+id);if(!await box.evaluate(el=>(el as HTMLDetailsElement).open))await box.locator(':scope > summary').click();}
async function joint(page:Page,id:string,value:number){
  await openDevice(page,id.split('.')[0]);
  const input=page.locator('[data-joint="'+id+'"]');await input.fill(String(value));await input.press('Tab');
  await expect.poll(async()=> (await state(page)).snapshot.experiment_state.joints[id]).toBe(value);
}
async function checkViewer(page:Page){
  const d=await diagnostics(page),s=await state(page);
  expect(d.webgl).toBe(true);expect(d.rendered_revision).toBe(s.revision);
  expect(d.max_world_matrix_error).toBeLessThan(1e-8);
  expect(d.max_support_endpoint_error_mm).toBeLessThan(1e-8);
  expect(d.max_detector_plane_error_mm).toBeLessThan(1e-8);
  expect(d.max_crystal_origin_error_mm).toBeLessThan(1e-8);
  await expect(page.locator('canvas[aria-label="实验装置三维场景"]')).toBeVisible();
  const canvas=await page.locator('#viewport canvas').boundingBox();expect(canvas!.height).toBeGreaterThan(200);expect(canvas!.height).toBeLessThan(1600);
}
async function checkLabels(page:Page){
  const layer=page.locator('.scene-label-layer');
  await expect(layer).toHaveAttribute('data-hidden-count','0');
  const layout=()=>page.locator('.scene-label:not([hidden])').evaluateAll(els=>{
    const canvas=document.querySelector('#viewport')!.getBoundingClientRect();
    return els.map(el=>{const r=el.getBoundingClientRect();return {text:el.textContent,left:r.left-canvas.left,top:r.top-canvas.top,right:r.right-canvas.left,bottom:r.bottom-canvas.top,font:parseFloat(getComputedStyle(el).fontSize),width:canvas.width,height:canvas.height};});
  });
  await expect.poll(async()=>{
    const boxes=await layout();
    return boxes.length>0&&boxes.every((a,i)=>a.left>=0&&a.top>=0&&a.right<=a.width&&a.bottom<=a.height&&boxes.slice(i+1).every(b=>a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top));
  }).toBe(true);
  for(const box of await layout())expect(box.font).toBeGreaterThanOrEqual(12);
  // Visible-only layout checks cannot detect a scientific caption outside the frustum.
  const keyLabels=[page.locator('.scene-label').filter({has:page.locator('[data-role="target"]')}),page.locator('.scene-label').filter({hasText:'目标点'})];
  for(const label of keyLabels){
    await expect(label).toBeVisible();
    await expect.poll(async()=>{
      const box=await label.boundingBox(),canvas=await page.locator('#viewport').boundingBox();
      return !!box&&!!canvas&&box.x>=canvas.x&&box.y>=canvas.y&&box.x+box.width<=canvas.x+canvas.width&&box.y+box.height<=canvas.y+canvas.height;
    }).toBe(true);
  }
}
test('V04/V05/V12: eccentricity → centering → nested theta, actual render matrices',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:4173');await expect(page.locator('#readout')).toContainText('样品中心：0, 200, 0');
  await checkViewer(page);await page.screenshot({path:'artifacts/overview.png',fullPage:true});
  await joint(page,'xy.x',1);await expect(page.locator('#readout')).toContainText('到 θ 轴：1 mm');
  await joint(page,'xy.x',0);await joint(page,'theta.angle',90);
  await expect(page.locator('#readout')).toContainText('到 θ 轴：0 mm');
  await joint(page,'hexapod.u',20);await joint(page,'hexapod.v',-12);await joint(page,'rotary.phi',35);
  await expect(page.locator('#readout')).toContainText('样品中心：0, 200, 0');await checkViewer(page);
  await page.getByRole('button',{name:'样品近景'}).click();
  await page.screenshot({path:'artifacts/initial-preview.png',fullPage:true});
  await resetScene(page);
  const separated=(await state(page)).snapshot;
  const crystal=separated.devices.devices.find((d:{id:string})=>d.id==='sample').crystal;
  crystal.center_s_mm=[0,0,2];crystal.target_point_s_mm=[10,0,0];
  await applyConfig(page,separated);
  await expect(page.locator('#readout')).toContainText('样品中心：0, 202, 0');
  await expect(page.locator('#readout')).toContainText('目标点：10, 200, 0');
  await expect(page.locator('#readout')).toContainText('样品中心到 θ 轴：0 mm');
  await expect(page.locator('#readout')).toContainText('目标点到 φ 轴：10 mm');
  await expect(page.locator('#readout')).toContainText('样品中心到 pivot：2 mm');
  await expect(page.locator('#readout')).toContainText('目标点到 pivot：10 mm');await checkViewer(page);
  separated.assembly.frames.find((f:{id:string})=>f.id==='P0').mount.position_mm[0]=30;
  await applyConfig(page,separated);
  await expect(page.locator('#readout')).toContainText('样品中心：30, 202, 0');
  await expect(page.locator('#readout')).toContainText('目标点到 φ 轴：40 mm');
  await expect(page.locator('#readout')).toContainText('样品中心到 θ 轴：0 mm');
  await expect(page.locator('#axis-legend')).toHaveText('φ 轴 · θ 轴 · beam +Z');await checkViewer(page);
  await page.screenshot({path:'artifacts/separated-geometry.png',fullPage:true});
  expect(errors).toEqual([]);
});
test('V08/V12: crystal tilt → phi scan and antiparallel alignment',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173');
  await openDevice(page,'sample');
  await page.getByRole('spinbutton',{name:'q_x',exact:true}).fill(String(Math.sin(Math.PI/12)));
  await page.getByRole('spinbutton',{name:'q_w',exact:true}).fill(String(Math.cos(Math.PI/12)));
  await page.getByRole('button',{name:'应用晶体参数'}).click();
  await expect(page.locator('#readout')).toContainText('带轴误差：30°');
  await joint(page,'rotary.phi',90);await expect(page.locator('#readout')).toContainText('带轴误差：30°');await checkViewer(page);
  await resetScene(page);await openDevice(page,'sample');
  await page.getByRole('spinbutton',{name:'index_w/l',exact:true}).fill('-1');
  await page.getByRole('button',{name:'应用晶体参数'}).click();
  await expect(page.locator('#readout')).toContainText('有向目标：0, -1, 0');
  await expect(page.locator('#readout')).toContainText('带轴误差：0°');await expect(page.locator('#readout')).toContainText('几何对齐：是');
  await tools(page,'details');
  await page.getByRole('checkbox',{name:'C 正交笛卡尔轴',exact:true}).uncheck();await checkViewer(page);
  expect(errors).toEqual([]);
});

test('Device blocks: installation inheritance, separate joint values, hints and daylight layout',async({page})=>{
  await page.setViewportSize({width:1062,height:956});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173');
  expect(await page.locator('.device-card').evaluateAll(els=>els.map(el=>(el as HTMLElement).dataset.device))).toEqual(['rotary','hexapod','theta','sample','detector']);
  await page.locator('#collapse-devices').click();
  expect(await page.locator('.device-tree-row[aria-expanded=true]').count()).toBe(0);await openDevice(page,'rotary');
  await joint(page,'rotary.phi',90);
  const install=async(name:string,value:number)=>{const box=page.locator('.device-card:not([hidden]) [id^="placement-"]');if(!await box.evaluate(el=>(el as HTMLDetailsElement).open))await box.locator(':scope > summary').click();const input=page.getByRole('spinbutton',{name,exact:true});await input.fill(String(value));await input.press('Tab');};
  await install('大样品台 · φ · 安装 X / mm',25);
  await expect(page.locator('#readout')).toContainText('样品中心：25, 200, 0');
  await expect(page.locator('#readout')).toContainText('目标点到 φ 轴：0 mm');
  let config=(await state(page)).snapshot;
  expect(config.experiment_state.joints['rotary.phi']).toBe(90);
  expect(config.assembly.frames.find((f:{id:string})=>f.id==='D').mount.position_mm).toEqual([0,200,1000]);
  expect(config.assembly.beam.point_mm).toEqual([0,200,0]);
  await openDevice(page,'hexapod');await install('六轴位移台 · 安装 Y / mm',20);
  await expect(page.locator('#readout')).toContainText('样品中心：25, 220, 0');
  await expect(page.locator('#readout')).toContainText('当前 pivot：25, 220, 0');
  await openDevice(page,'theta');await install('XYθ 一体位移台 · 安装 X / mm',10);
  await expect(page.locator('#readout')).toContainText('样品中心：25, 220, -10');
  await joint(page,'xy.x',3);
  await expect(page.locator('#readout')).toContainText('样品中心到 θ 轴：3 mm');
  await openDevice(page,'sample');await install('样品与晶体 · 安装 Z / mm',4);
  await expect(page.locator('#readout')).toContainText('样品中心：25, 224, -13');
  await openDevice(page,'detector');await install('探测器 · 安装 X / mm',7);
  await expect(page.locator('#readout')).toContainText('样品中心：25, 224, -13');
  config=(await state(page)).snapshot;
  for(const [id,value]of Object.entries(config.experiment_state.joints))expect(value).toBe(id==='rotary.phi'?90:id==='xy.x'?3:0);
  expect(config.assembly.frames.find((f:{id:string})=>f.id==='P2').mount.position_mm).toEqual([0,0,0]);
  await checkViewer(page);
  const revision=(await state(page)).revision;
  await page.getByRole('spinbutton',{name:'探测器 · 安装 X / mm',exact:true}).fill('');
  await page.getByRole('spinbutton',{name:'探测器 · 安装 X / mm',exact:true}).press('Tab');
  expect((await state(page)).revision).toBe(revision);await expect(page.locator('#status')).toHaveClass('error');
  await resetScene(page);
  const reordered=(await state(page)).snapshot;reordered.devices.devices.reverse();
  await applyConfig(page,reordered);
  await page.locator('#collapse-devices').click();await openDevice(page,'rotary');
  await page.getByRole('button',{name:'样品近景'}).click();
  const description=page.locator('#device-rotary .device-description');
  await expect(description).toContainText('六轴位移台');await expect(description).toContainText('C 晶体坐标系');
  expect(await page.getByRole('tooltip').count()).toBe(0);expect(await page.locator('.parameter-name:is(button)').count()).toBe(0);
  expect(await description.evaluate(el=>el.parentElement!.lastElementChild===el)).toBe(true);
  await page.screenshot({path:'artifacts/daylight-1062.png',fullPage:true});
  await openDevice(page,'hexapod');const hexDescription=page.locator('#device-hexapod .device-description');
  await expect(hexDescription).toContainText('UVW');await hexDescription.scrollIntoViewIfNeeded();
  await page.screenshot({path:'artifacts/device-description-hexapod.png',fullPage:true});
  await page.locator('#pivot-hexapod > summary').click();await expect(page.locator('#pivot-hexapod')).toContainText('不平移底座');
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await expect(page.locator('canvas[aria-label="实验装置三维场景"]')).toBeInViewport();
  await page.screenshot({path:'artifacts/daylight-mobile.png'});expect(errors).toEqual([]);
});
test('V09/V10/V12/V13: export → modify → compare → import/restore; invalid restore stays atomic',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173');
  await tools(page);const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出 JSON'}).click();
  const download=await downloadPromise,stream=await download.createReadStream(),chunks:Buffer[]=[];
  for await(const chunk of stream!)chunks.push(Buffer.from(chunk));
  const text=Buffer.concat(chunks).toString('utf8'),saved=JSON.parse(text);
  await joint(page,'xy.x',1);const before=(await state(page)).revision;await tools(page);
  await page.locator('#file').setInputFiles({name:'saved.json',mimeType:'application/json',buffer:Buffer.from(text)});
  await expect(page.locator('#status')).toContainText('尚未应用');
  await page.getByRole('button',{name:'与当前状态比较'}).click();
  const comparison=JSON.parse((await page.locator('#comparison').textContent())!);
  expect(comparison.joint_delta['xy.x'].delta).toBe(-1);expect((await state(page)).revision).toBe(before);
  await page.getByRole('button',{name:'恢复 / 应用 JSON'}).click();
  await expect(page.locator('[data-joint="xy.x"]')).toHaveValue('0');await checkViewer(page);
  const spin=structuredClone(saved);spin.experiment_state.samples.sample.orientation_quaternion_xyzw=[0,0,Math.SQRT1_2,Math.SQRT1_2];
  await page.locator('#config').fill(JSON.stringify(spin));await page.getByRole('button',{name:'与当前状态比较'}).click();
  const result=JSON.parse((await page.locator('#comparison').textContent())!);
  expect(result.sample_delta.sample.crystal_rotation_delta_deg).toBeCloseTo(90,8);expect(result.sample_delta.sample.direction_delta_deg).toBeLessThan(1e-8);
  const labBound=structuredClone(saved);labBound.devices.devices.find((d:{id:string})=>d.id==='detector').output_frame='LAB';
  await applyConfig(page,labBound);
  await expect(page.locator('#status')).toContainText('状态已更新');await openDevice(page,'detector');
  await expect(page.locator('#device-detector')).toContainText('直接绑定 LAB，没有独立安装 mount');
  await expect(page.locator('#device-detector .position-info')).toHaveText('绑定原点 · LAB (0, 0, 0) mm');
  expect(await page.locator('#device-detector input').count()).toBe(0);await checkViewer(page);
  const crystalBound=structuredClone(saved);
  crystalBound.devices.devices.unshift({id:'crystal_fixture',type:'fixture',output_frame:'C',visual:{shape:'box',size_mm:[1,1,1],color:'#ffffff'},provenance:'synthetic'});
  await applyConfig(page,crystalBound);
  await expect(page.locator('#status')).toContainText('状态已更新');await openDevice(page,'crystal_fixture');
  await expect(page.locator('#device-crystal_fixture')).toContainText('直接绑定 C，没有独立安装 mount');
  await expect(page.locator('#device-crystal_fixture .position-info')).toHaveText('绑定原点 · LAB (0, 200, 0) mm');
  expect(await page.locator('#device-crystal_fixture input').count()).toBe(0);
  await joint(page,'rotary.phi',35);await checkViewer(page);
  const invalid=structuredClone(saved);invalid.assembly.frames.find((f:{id:string})=>f.id==='D').parent='H1';
  const revision=(await state(page)).revision;
  await applyConfig(page,invalid);
  await expect(page.locator('#status')).toContainText('Detector must be fixed to LAB');
  expect((await state(page)).revision).toBe(revision);await checkViewer(page);expect(errors).toEqual([]);
});
test('Screen labels: sparse routine view, true coincidence details and explicit scientific diagnostics',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173');await checkLabels(page);await checkViewer(page);
  const before=await state(page);
  expect(await page.locator('.scene-label:not([hidden])').count()).toBeLessThanOrEqual(6);
  expect(await page.locator('.scene-label-entry[data-role=crystal],.scene-label-entry[data-role=lattice]').count()).toBe(0);
  await expect(page.locator('.scene-label-entry[data-role=target]')).toHaveText('目标方向 [0 0 1]');
  const origin=page.locator('.scene-label[data-world="[0,200,0]"]');
  await expect(origin).toContainText('目标点');await expect(origin).toContainText('共点');await expect(origin).not.toContainText('P0 P1 P2 S C');
  await origin.locator('[data-action="inspect-coincident"]').click();
  await expect(page.locator('#panel-coincident')).toBeVisible();
  for(const name of ['P0 原点','P1 原点','P2 原点','S 原点','C 原点','样品中心','目标点','pivot'])await expect(page.locator('#coincident-details')).toContainText(name);
  expect(JSON.parse((await page.locator('#coincident-details').getAttribute('data-world'))!)).toEqual([0,200,0]);
  await closeTools(page);expect(await state(page)).toEqual(before);
  await page.screenshot({path:'artifacts/labels-overview.png',fullPage:true});
  await page.setViewportSize({width:1062,height:956});await page.getByRole('button',{name:'样品近景'}).click();await checkLabels(page);
  await page.screenshot({path:'artifacts/labels-closeup-1062.png',fullPage:true});
  const canvas=(await page.locator('#viewport canvas').boundingBox())!;
  const selectedBeforeDrag=(await diagnostics(page)).selected_device_id;
  await page.mouse.move(canvas.x+canvas.width*.75,canvas.y+canvas.height*.65);await page.mouse.down();
  await page.mouse.move(canvas.x+canvas.width*.55,canvas.y+canvas.height*.75,{steps:8});await page.mouse.up();await page.mouse.wheel(0,200);await checkLabels(page);
  expect((await diagnostics(page)).selected_device_id).toBe(selectedBeforeDrag);
  expect(await state(page)).toEqual(before);await checkViewer(page);
  await page.locator('#coordinate-diagnostics').check();expect(await state(page)).toEqual(before);
  await page.getByRole('button',{name:'全景',exact:true}).click();await checkLabels(page);
  expect(await page.locator('.scene-label-entry[data-role=crystal]').count()).toBe(3);expect(await page.locator('.scene-label-entry[data-role=lattice]').count()).toBe(3);
  await tools(page,'details');
  await page.getByRole('checkbox',{name:'设备 frame 坐标轴',exact:true}).uncheck();
  await page.getByRole('checkbox',{name:'C 正交笛卡尔轴',exact:true}).uncheck();expect(await page.locator('.scene-label-entry[data-role=crystal]').count()).toBe(0);
  await page.getByRole('checkbox',{name:'直接晶格 [100]/[010]/[001]',exact:true}).uncheck();expect(await page.locator('.scene-label-entry[data-role=lattice]').count()).toBe(0);
  await openDevice(page,'sample');await page.getByRole('combobox',{name:'方向类型',exact:true}).selectOption('reciprocal');await page.getByRole('button',{name:'应用晶体参数'}).click();
  await expect(page.locator('.scene-label-entry[data-role=target]')).toHaveText('目标法向 (0 0 1)');await expect(page.locator('#key-alignment')).toHaveText('—（法向）');
  await page.locator('#coordinate-diagnostics').uncheck();await resetScene(page);
  await joint(page,'rotary.phi',35);await joint(page,'hexapod.u',20);await joint(page,'hexapod.v',-12);await joint(page,'theta.angle',25);
  await page.getByRole('button',{name:'样品近景'}).click();await checkLabels(page);await checkViewer(page);await page.screenshot({path:'artifacts/labels-tilted.png',fullPage:true});
  await resetScene(page);await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'样品近景'}).click();await page.evaluate(()=>window.scrollTo(0,0));
  await checkLabels(page);await checkViewer(page);await page.screenshot({path:'artifacts/labels-mobile.png'});
  const overlap=(await state(page)).snapshot;overlap.devices.devices.find((d:{id:string})=>d.id==='sample').crystal.center_s_mm=[-30,0,0];
  await page.setViewportSize({width:1062,height:956});await applyConfig(page,overlap);await page.locator('#coordinate-diagnostics').check();await page.locator('#camera-sample').click();
  const cX=page.locator('.scene-label').filter({hasText:/^C X$/}),a=page.locator('.scene-label').filter({hasText:/^\[100\]$/});
  await expect(cX).toBeVisible();await expect(a).toBeVisible();
  expect(JSON.parse((await cX.getAttribute('data-world'))!)).toEqual([55,200,0]);expect(await cX.getAttribute('data-world')).toBe(await a.getAttribute('data-world'));
  expect(await cX.locator('[data-action="inspect-coincident"]').count()).toBe(0);expect(await a.locator('[data-action="inspect-coincident"]').count()).toBe(0);
  await checkLabels(page);await checkViewer(page);await page.screenshot({path:'artifacts/final-direction-overlap.png',fullPage:true});expect(errors).toEqual([]);
});
test('Integrated XYtheta: one shared installation, a locked centered base and three internal joints',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1062,height:956});await page.goto('http://127.0.0.1:4173');
  await page.locator('#collapse-devices').click();await openDevice(page,'theta');
  const card=page.locator('#device-theta'),base=card.locator('[data-integrated-base="theta"]');
  await expect(card.locator(':scope > summary')).toContainText('XYθ 一体位移台');
  await expect(card).toHaveAttribute('data-devices','["theta","xy"]');expect(await page.locator('#device-xy').count()).toBe(0);
  await expect(card.locator('#placement-theta')).not.toHaveAttribute('open','');
  expect(await card.locator('input').count()).toBe(6);expect(await card.locator('[data-joint]').count()).toBe(3);
  expect(await page.getByRole('spinbutton',{name:'XY 位移台 · 安装 X / mm',exact:true}).count()).toBe(0);
  await expect(base).toContainText('LAB (0, 200, 0)');
  await expect(card.locator('#part-xy')).toContainText('不移动一体台的固定基座');
  await expect(card.locator('.device-description')).toContainText('X/Y 是一体台内部平移行程');
  await joint(page,'xy.x',3);await joint(page,'xy.y',2);await joint(page,'theta.angle',90);
  await expect(page.locator('#readout')).toContainText('样品中心：-2, 200, -3');await expect(base).toContainText('LAB (0, 200, 0)');
  await openInstallation(page,'theta');const installation=page.getByRole('spinbutton',{name:'XYθ 一体位移台 · 安装 X / mm',exact:true});
  await installation.fill('5');await installation.press('Tab');
  await expect(page.locator('#readout')).toContainText('样品中心：3, 200, -3');await expect(base).toContainText('LAB (5, 200, 0)');
  const current=await state(page),saved=current.snapshot;
  expect(saved.assembly.frames.find((f:{id:string})=>f.id==='P2').mount.position_mm).toEqual([0,0,0]);
  await checkViewer(page);await checkLabels(page);
  await page.locator('.left').evaluate(el=>el.scrollTop=(el.querySelector('#device-theta') as HTMLElement).offsetTop-(el as HTMLElement).offsetTop);
  await page.screenshot({path:'artifacts/xytheta-integrated.png',fullPage:true});
  const invalid=structuredClone(saved);invalid.assembly.frames.find((f:{id:string})=>f.id==='P2').mount.position_mm[0]=1;
  await applyConfig(page,invalid);
  await expect(page.locator('#status')).toContainText('Integrated XY base must remain at theta rotation center');
  expect(await state(page)).toEqual(current);
  const legacy=structuredClone(invalid);delete legacy.devices.devices.find((d:{id:string})=>d.id==='xy').integrated_into;
  await applyConfig(page,legacy);
  await openInstallation(page,'xy');await expect(page.getByRole('spinbutton',{name:'XY 位移台 · 安装 X / mm',exact:true})).toHaveValue('1');
  const reordered=structuredClone(saved);reordered.devices.devices.reverse();
  await applyConfig(page,reordered);await openDevice(page,'theta');
  expect(await page.locator('.device-card').count()).toBe(5);expect(await page.locator('#device-xy').count()).toBe(0);
  for(const [id,value]of [['theta.angle','90'],['xy.x','3'],['xy.y','2']])await expect(page.locator('[data-joint="'+id+'"]')).toHaveValue(value);
  await page.setViewportSize({width:390,height:844});await card.scrollIntoViewIfNeeded();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'artifacts/xytheta-mobile.png'});await checkViewer(page);expect(errors).toEqual([]);
});
test('Workbench: scene-first layout, motion-first tree inspector and presentation-only selection',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1062,height:956});
  await page.goto('http://127.0.0.1:4173');const original=await state(page);
  await expect(page.locator('#workspace-drawer')).not.toBeVisible();await expect(page.locator('#config')).not.toBeVisible();
  await expect(page.locator('#devices')).toHaveAttribute('data-selected-device','theta');expect(await page.locator('.device-card:not([hidden])').count()).toBe(1);
  await expect(page.locator('#placement-theta')).not.toHaveAttribute('open','');await expect(page.locator('[data-joint="theta.angle"]')).toBeVisible();
  const sidebar=(await page.locator('.left').boundingBox())!,canvas=(await page.locator('#viewport canvas').boundingBox())!;
  expect(sidebar.width).toBeGreaterThanOrEqual(240);expect(sidebar.width).toBeLessThanOrEqual(280);expect(canvas.width).toBeGreaterThan(700);expect(canvas.height).toBeGreaterThan(600);
  expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);
  await expect(page.locator('#key-alignment')).toHaveText('0°');await expect(page.locator('#key-phi')).toHaveText('0 mm');await expect(page.locator('#key-theta')).toHaveText('0 mm');
  await expect(page.locator('#target-summary')).toContainText('LAB 单位方向 (0, 1, 0)');expect(await page.locator('.toolbar #reset').count()).toBe(0);
  await page.screenshot({path:'artifacts/workbench-1062.png',fullPage:true});
  await openDevice(page,'hexapod');await expect(page.locator('.device-tree-row[data-device="hexapod"]')).toHaveAttribute('aria-selected','true');
  expect((await diagnostics(page)).selected_device_id).toBe('hexapod');expect(await state(page)).toEqual(original);
  await expect(page.locator('[data-joint="hexapod.x"]')).toBeVisible();await expect(page.locator('#placement-hexapod')).not.toHaveAttribute('open','');
  await page.locator('#coordinate-diagnostics').check();expect(await state(page)).toEqual(original);expect((await diagnostics(page)).diagnostic_layers.enabled).toBe(true);
  await page.locator('#coordinate-diagnostics').uncheck();expect(await state(page)).toEqual(original);
  await tools(page);await expect(page.locator('#config')).toBeVisible();await expect(page.locator('#reset')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#workspace-drawer')).not.toBeVisible();
  await page.getByRole('button',{name:'全景',exact:true}).click();expect(await state(page)).toEqual(original);await page.screenshot({path:'artifacts/workbench-overview.png',fullPage:true});
  // Small real pans used to alternate the selected label between equally near left/right candidates.
  const selectedLabel=page.locator('.scene-label[data-selected="true"]');await expect(selectedLabel).toBeVisible();
  const labelSide=()=>selectedLabel.evaluate(el=>{
    const layer=el.parentElement!,labels=Array.from(layer.querySelectorAll('.scene-label')),index=labels.indexOf(el),dot=layer.querySelectorAll('circle')[index];
    const box=el.getBoundingClientRect(),canvas=document.querySelector('#viewport')!.getBoundingClientRect();
    return Math.sign(box.x-canvas.x+box.width/2-Number(dot.getAttribute('cx')));
  });
  const sides=[await labelSide()];
  await page.mouse.move(canvas.x+canvas.width*.8,canvas.y+canvas.height*.7);await page.mouse.down({button:'right'});
  for(let i=1;i<=12;i++){
    await page.mouse.move(canvas.x+canvas.width*.8+i*.75,canvas.y+canvas.height*.7);
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));sides.push(await labelSide());
  }
  await page.mouse.up({button:'right'});expect(new Set(sides).size).toBe(1);expect(await state(page)).toEqual(original);
  expect((await diagnostics(page)).selected_device_id).toBe('hexapod');
  await openDevice(page,'theta');await joint(page,'xy.x',1);await expect(page.locator('#key-theta')).toHaveText('1 mm');
  await page.getByRole('button',{name:'样品近景'}).click();await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));await checkLabels(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'artifacts/workbench-mobile.png'});
  await page.locator('[data-joint="xy.y"]').scrollIntoViewIfNeeded();await expect(page.locator('#viewport canvas')).toBeInViewport();
  await checkViewer(page);expect(errors).toEqual([]);
});
