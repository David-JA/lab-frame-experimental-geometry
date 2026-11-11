import { test, expect, type Page } from '@playwright/test';
import { Buffer } from 'node:buffer';
const state=async(page:Page)=>JSON.parse((await page.locator('#readout').getAttribute('data-state'))!);
const diagnostics=async(page:Page)=>JSON.parse((await page.locator('#diagnostics').getAttribute('data-diagnostics'))!);
async function closeTools(page:Page){if(await page.locator('#workspace-drawer').evaluate(el=>(el as HTMLDialogElement).open))await page.locator('#close-drawer').click();}
async function tools(page:Page,tab='config'){
  if(!await page.locator('#workspace-drawer').evaluate(el=>(el as HTMLDialogElement).open))await page.locator('#open-config').click();
  await page.locator('#tab-'+tab).click();
  if(tab==='config'&&!await page.locator('#json-settings').evaluate(el=>(el as HTMLDetailsElement).open))await page.locator('#json-settings > summary').click();
}
async function resetScene(page:Page){await tools(page);await page.locator('#reset-synthetic').click();await closeTools(page);}
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
  await page.goto('http://127.0.0.1:4173/?example=synthetic');await expect(page.locator('#readout')).toContainText('样品中心：0, 200, 0');
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
  await page.goto('http://127.0.0.1:4173/?example=synthetic');
  await openDevice(page,'sample');
  await page.locator('#orientation-sample > summary').click();
  await page.getByRole('spinbutton',{name:'q_x',exact:true}).fill(String(Math.sin(Math.PI/12)));
  await page.getByRole('spinbutton',{name:'q_w',exact:true}).fill(String(Math.cos(Math.PI/12)));
  await page.locator('#apply-crystal').click();
  await expect(page.locator('#readout')).toContainText('带轴误差：30°');
  await joint(page,'rotary.phi',90);await expect(page.locator('#readout')).toContainText('带轴误差：30°');await checkViewer(page);
  // Close the user workflow: compensate the crystal's +30 deg tilt with the hexapod,
  // then scan phi while its ideal target stays on the common rotation axis.
  await joint(page,'hexapod.u',-30);
  for(const phi of [0,90,180]){
    await joint(page,'rotary.phi',phi);
    await expect(page.locator('#readout')).toContainText('带轴误差：0°');
    await expect(page.locator('#readout')).toContainText('目标点：0, 200, 0');
    await expect(page.locator('#readout')).toContainText('目标点到 φ 轴：0 mm');
    await expect(page.locator('#readout')).toContainText('几何对齐：是');
    await checkViewer(page);
  }
  await page.screenshot({path:'artifacts/g0g1-aligned-scan.png',fullPage:true});
  await resetScene(page);await openDevice(page,'sample');
  await page.getByRole('spinbutton',{name:'观察方向指标 w',exact:true}).fill('-1');
  await page.locator('#apply-direction').click();
  await expect(page.locator('#readout')).toContainText('有向目标：0, -1, 0');
  await expect(page.locator('#readout')).toContainText('带轴误差：0°');await expect(page.locator('#readout')).toContainText('几何对齐：是');
  await tools(page,'details');
  await page.getByRole('checkbox',{name:'晶体坐标 X/Y/Z',exact:true}).uncheck();await checkViewer(page);
  expect(errors).toEqual([]);
});

test('Device blocks: installation inheritance, separate joint values, hints and daylight layout',async({page})=>{
  await page.setViewportSize({width:1062,height:956});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/?example=synthetic');
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
  await page.goto('http://127.0.0.1:4173/?example=synthetic');
  await tools(page);const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'保存配置文件'}).click();
  const download=await downloadPromise,stream=await download.createReadStream(),chunks:Buffer[]=[];
  for await(const chunk of stream!)chunks.push(Buffer.from(chunk));
  const text=Buffer.concat(chunks).toString('utf8'),saved=JSON.parse(text);
  await joint(page,'xy.x',1);const before=(await state(page)).revision;await tools(page);
  await page.locator('#file').setInputFiles({name:'saved.json',mimeType:'application/json',buffer:Buffer.from(text)});
  await expect(page.locator('#status')).toContainText('点击“载入所选文件”后应用');
  await page.getByRole('button',{name:'查看差异'}).click();
  const comparison=JSON.parse((await page.locator('#comparison').textContent())!);
  expect(comparison.joint_delta['xy.x'].delta).toBe(-1);expect((await state(page)).revision).toBe(before);
  await page.getByRole('button',{name:'应用编辑后的配置'}).click();
  await expect(page.locator('[data-joint="xy.x"]')).toHaveValue('0');await checkViewer(page);
  const spin=structuredClone(saved);spin.experiment_state.samples.sample.orientation_quaternion_xyzw=[0,0,Math.SQRT1_2,Math.SQRT1_2];
  await page.locator('#config').fill(JSON.stringify(spin));await page.getByRole('button',{name:'查看差异'}).click();
  const result=JSON.parse((await page.locator('#comparison').textContent())!);
  expect(result.sample_delta.sample.crystal_rotation_delta_deg).toBeCloseTo(90,8);expect(result.sample_delta.sample.direction_delta_deg).toBeLessThan(1e-8);
  const labBound=structuredClone(saved);labBound.devices.devices.find((d:{id:string})=>d.id==='detector').output_frame='LAB';
  await applyConfig(page,labBound);
  await expect(page.locator('#status')).toContainText('状态已更新');await openDevice(page,'detector');
  await expect(page.locator('#device-detector')).toContainText('直接使用 LAB 坐标系，安装位置只读');
  await expect(page.locator('#device-detector .position-info')).toHaveText('绑定原点 · LAB (0, 0, 0) mm');
  expect(await page.locator('#device-detector input').count()).toBe(0);await checkViewer(page);
  const crystalBound=structuredClone(saved);
  crystalBound.devices.devices.unshift({id:'crystal_fixture',type:'fixture',output_frame:'C',visual:{shape:'box',size_mm:[1,1,1],color:'#ffffff'},provenance:'synthetic'});
  await applyConfig(page,crystalBound);
  await expect(page.locator('#status')).toContainText('状态已更新');await openDevice(page,'crystal_fixture');
  await expect(page.locator('#device-crystal_fixture')).toContainText('直接使用 C 坐标系，安装位置只读');
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
  await page.goto('http://127.0.0.1:4173/?example=synthetic');await checkLabels(page);await checkViewer(page);
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
  await page.locator('#coordinate-diagnostics').check();await page.locator('#diagnostic-preset').selectOption('all');expect(await state(page)).toEqual(before);
  await page.getByRole('button',{name:'全景',exact:true}).click();await checkLabels(page);
  expect(await page.locator('.scene-label-entry[data-role=crystal]').count()).toBe(3);expect(await page.locator('.scene-label-entry[data-role=lattice]').count()).toBe(3);
  await tools(page,'details');
  await page.getByRole('checkbox',{name:'装置坐标（含实验室）',exact:true}).uncheck();
  await page.getByRole('checkbox',{name:'晶体坐标 X/Y/Z',exact:true}).uncheck();expect(await page.locator('.scene-label-entry[data-role=crystal]').count()).toBe(0);
  await page.getByRole('checkbox',{name:'晶格方向 [100]/[010]/[001]',exact:true}).uncheck();expect(await page.locator('.scene-label-entry[data-role=lattice]').count()).toBe(0);
  await openDevice(page,'sample');await page.getByRole('combobox',{name:'方向类型',exact:true}).selectOption('reciprocal');await page.locator('#apply-direction').click();
  await expect(page.locator('.scene-label-entry[data-role=target]')).toHaveText('目标法向 (0 0 1)');await expect(page.locator('#key-alignment')).toHaveText('—（法向）');
  await page.locator('#coordinate-diagnostics').uncheck();await resetScene(page);
  await joint(page,'rotary.phi',35);await joint(page,'hexapod.u',20);await joint(page,'hexapod.v',-12);await joint(page,'theta.angle',25);
  await page.getByRole('button',{name:'样品近景'}).click();await checkLabels(page);await checkViewer(page);await page.screenshot({path:'artifacts/labels-tilted.png',fullPage:true});
  await resetScene(page);await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'样品近景'}).click();await page.evaluate(()=>window.scrollTo(0,0));
  await checkLabels(page);await checkViewer(page);await page.screenshot({path:'artifacts/labels-mobile.png'});
  const overlap=(await state(page)).snapshot;overlap.devices.devices.find((d:{id:string})=>d.id==='sample').crystal.center_s_mm=[-30,0,0];
  await page.setViewportSize({width:1062,height:956});await applyConfig(page,overlap);await page.locator('#coordinate-diagnostics').check();await page.locator('#diagnostic-preset').selectOption('all');await page.locator('#camera-sample').click();
  const cX=page.locator('.scene-label').filter({hasText:/^晶体 X$/}),a=page.locator('.scene-label').filter({hasText:/^晶向 \[100\]$/});
  await expect(cX).toBeVisible();await expect(a).toBeVisible();
  expect(JSON.parse((await cX.getAttribute('data-world'))!)).toEqual([55,200,0]);expect(await cX.getAttribute('data-world')).toBe(await a.getAttribute('data-world'));
  expect(await cX.locator('[data-action="inspect-coincident"]').count()).toBe(0);expect(await a.locator('[data-action="inspect-coincident"]').count()).toBe(0);
  await checkLabels(page);await checkViewer(page);await page.screenshot({path:'artifacts/final-direction-overlap.png',fullPage:true});expect(errors).toEqual([]);
});
test('Integrated XYtheta: one shared installation, a locked centered base and three internal joints',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1062,height:956});await page.goto('http://127.0.0.1:4173/?example=synthetic');
  await page.locator('#collapse-devices').click();await openDevice(page,'theta');
  const card=page.locator('#device-theta'),base=card.locator('[data-integrated-base="theta"]');
  await expect(card.locator(':scope > summary')).toContainText('XYθ 一体位移台');
  await expect(card).toHaveAttribute('data-devices','["theta","xy"]');expect(await page.locator('#device-xy').count()).toBe(0);
  await expect(card.locator('#placement-theta')).not.toHaveAttribute('open','');
  expect(await card.locator('input').count()).toBe(7);expect(await card.locator('[data-joint]').count()).toBe(3);
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
  await page.goto('http://127.0.0.1:4173/?example=synthetic');const original=await state(page);
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
  await page.locator('#coordinate-diagnostics').check();await page.locator('#diagnostic-preset').selectOption('all');expect(await state(page)).toEqual(original);expect((await diagnostics(page)).diagnostic_layers.enabled).toBe(true);
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
  await page.mouse.move(canvas.x+canvas.width*.8,canvas.y+canvas.height*.7);await page.mouse.down({button:'middle'});
  for(let i=1;i<=12;i++){
    await page.mouse.move(canvas.x+canvas.width*.8+i*.75,canvas.y+canvas.height*.7);
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));sides.push(await labelSide());
  }
  await page.mouse.up({button:'middle'});expect(new Set(sides).size).toBe(1);expect(await state(page)).toEqual(original);
  const panMetrics=()=>page.locator('.scene-label-layer').evaluate(layer=>{
    const labels=Array.from(layer.querySelectorAll<HTMLElement>('.scene-label')),dots=layer.querySelectorAll('circle');
    const selected=labels.findIndex(el=>el.dataset.selected==='true');
    return {x:Number(dots[selected].getAttribute('cx')),y:Number(dots[selected].getAttribute('cy'))};
  });
  const beforePan=await panMetrics(),panX=canvas.x+canvas.width*.8,panY=canvas.y+canvas.height*.7;
  await page.mouse.move(panX,panY);await page.mouse.down({button:'middle'});
  await page.mouse.move(panX+80,panY-50,{steps:8});await page.mouse.up({button:'middle'});
  await expect.poll(async()=> (await panMetrics()).x-beforePan.x).toBeGreaterThan(60);
  await expect.poll(async()=>{
    const a=await panMetrics();await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const b=await panMetrics();return Math.hypot(a.x-b.x,a.y-b.y);
  }).toBeLessThan(.05);
  const afterPan=await panMetrics();
  expect(afterPan.x-beforePan.x).toBeLessThan(95);expect(afterPan.y-beforePan.y).toBeLessThan(-35);expect(afterPan.y-beforePan.y).toBeGreaterThan(-65);
  await page.mouse.move(panX,panY);await page.mouse.down({button:'right'});
  await page.mouse.move(panX+80,panY-50,{steps:8});await page.mouse.up({button:'right'});
  const afterRight=await panMetrics();expect(Math.hypot(afterRight.x-afterPan.x,afterRight.y-afterPan.y)).toBeLessThan(1);
  expect(await state(page)).toEqual(original);await checkViewer(page);
  await expect(page.locator('.navigation-hint')).toContainText('中键拖动平移');
  expect((await diagnostics(page)).selected_device_id).toBe('hexapod');
  await openDevice(page,'theta');await joint(page,'xy.x',1);await expect(page.locator('#key-theta')).toHaveText('1 mm');
  await page.getByRole('button',{name:'样品近景'}).click();await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));await checkLabels(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'artifacts/workbench-mobile.png'});
  await page.locator('[data-joint="xy.y"]').scrollIntoViewIfNeeded();await expect(page.locator('#viewport canvas')).toBeInViewport();
  await checkViewer(page);expect(errors).toEqual([]);
});

test('Appearance: column height is geometry-only, compact assembly and review views remain usable',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1062,height:956});await page.goto('http://127.0.0.1:4173/?example=synthetic');
  const before=(await state(page)).snapshot;
  await page.locator('#camera-apparatus').click();await checkLabels(page);await checkViewer(page);
  await page.screenshot({path:'artifacts/appearance-apparatus.png',fullPage:true});
  await openInstallation(page,'rotary');
  const height=page.getByRole('spinbutton',{name:'大样品台 · φ · 柱体高度 / mm',exact:true});await expect(height).toHaveValue('180');
  await height.fill('250');await height.press('Tab');
  const after=(await state(page)).snapshot,visual=after.devices.devices.find((d:{id:string})=>d.id==='rotary').visual;
  expect(visual.size_mm).toEqual([190,250,190]);expect(visual.offset_mm).toEqual([0,-143,0]);expect(visual.color).toBe('#F8E68A');
  expect(after.assembly).toEqual(before.assembly);expect(after.experiment_state).toEqual(before.experiment_state);
  await expect(page.locator('#readout')).toContainText('样品中心：0, 200, 0');await checkViewer(page);
  await page.locator('#camera-apparatus').click();await page.screenshot({path:'artifacts/appearance-height-250.png',fullPage:true});
  const savedRevision=(await state(page)).revision;await height.fill('0');await height.press('Tab');
  expect((await state(page)).revision).toBe(savedRevision);await expect(height).toHaveAttribute('aria-invalid','true');
  await applyConfig(page,before);await openInstallation(page,'rotary');await expect(page.getByRole('spinbutton',{name:'大样品台 · φ · 柱体高度 / mm',exact:true})).toHaveValue('180');
  await page.locator('#camera-all').click();await checkLabels(page);await page.screenshot({path:'artifacts/appearance-overview.png',fullPage:true});
  await openDevice(page,'theta');await page.locator('#camera-sample').click();await checkLabels(page);
  await page.screenshot({path:'artifacts/appearance-sample.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.locator('#camera-apparatus').click();await page.evaluate(()=>window.scrollTo(0,0));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await checkLabels(page);await checkViewer(page);
  await page.screenshot({path:'artifacts/appearance-mobile.png'});expect(errors).toEqual([]);
});

test('Lab heights: independent Z stage in cm, stage elevation, fixed beam and snapshot restore',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1062,height:956});await page.goto('http://127.0.0.1:4173/');
  await expect(page.locator('#readout')).toContainText('样品中心：0, 1209.5, 0');
  await expect(page.locator('#target-summary')).toContainText('相对光束高度 -170.5 mm');
  await checkViewer(page);await checkLabels(page);
  const initial=(await state(page)).snapshot;
  expect(initial.devices.devices.find((d:{id:string})=>d.id==='rotary').visual.size_mm).toEqual([450,670,450]);
  const hex=initial.devices.devices.find((d:{id:string})=>d.id==='hexapod').visual;
  expect(hex.size_mm).toEqual([348,30,348]);expect(hex.upper_disc_size_mm).toEqual([260,18.2,260]);expect(hex.adapter_thickness_mm).toBe(15);
  await openDevice(page,'z_stage');const height=page.getByRole('spinbutton',{name:'z_stage.z / cm',exact:true});
  await expect(height).toHaveValue('15');await expect(height).toHaveAttribute('min','10');await expect(height).toHaveAttribute('max','20');
  await expect(page.locator('#motion-z_stage')).toContainText('可调高度10–20 cm');
  expect(await page.locator('#devices').textContent()).not.toContain('当前高度未测');
  await page.screenshot({path:'artifacts/lab-height-apparatus.png',fullPage:true});
  for(const cm of [10,20]){
    await height.fill(String(cm));await height.press('Tab');
    const current=(await state(page)).snapshot;expect(current.experiment_state.joints['z_stage.z']).toBe(cm*10);
    expect(current.assembly).toEqual(initial.assembly);await expect(page.locator('#readout')).toContainText('样品中心：0, '+(1059.5+cm*10)+', 0');await checkViewer(page);
  }
  const revision=(await state(page)).revision;await height.fill('21');await height.press('Tab');
  await expect(height).toHaveAttribute('aria-invalid','true');expect((await state(page)).revision).toBe(revision);
  await height.fill('15');await height.press('Tab');
  await openDevice(page,'rotary');const elevation=page.getByRole('spinbutton',{name:'大样品台 · φ · 台面升高 / cm',exact:true});
  await elevation.fill('6');await elevation.press('Tab');
  await expect(page.locator('#target-summary')).toContainText('相对光束高度 -110.5 mm');await checkViewer(page);
  const raised=(await state(page)).snapshot,r=raised.assembly.frames.find((f:{id:string})=>f.id==='R');
  expect(r.mount.position_mm[1]).toBeCloseTo(760,8);expect(r.motion.center_mm[1]).toBeCloseTo(760,8);
  const column=raised.devices.devices.find((d:{id:string})=>d.id==='rotary').visual;
  expect(column.size_mm[1]).toBeCloseTo(730,8);expect(r.mount.position_mm[1]+column.offset_mm[1]-column.size_mm[1]/2).toBeCloseTo(0,8);
  expect(raised.assembly.beam).toEqual(initial.assembly.beam);expect(raised.assembly.frames.find((f:{id:string})=>f.id==='D')).toEqual(initial.assembly.frames.find((f:{id:string})=>f.id==='D'));
  const raisedRevision=(await state(page)).revision;await elevation.fill('11');await elevation.press('Tab');
  expect((await state(page)).revision).toBe(raisedRevision);await expect(elevation).toHaveAttribute('aria-invalid','true');
  await openInstallation(page,'rotary');const installY=page.getByRole('spinbutton',{name:'大样品台 · φ · 安装 Y / mm',exact:true});
  await installY.fill('750');await installY.press('Tab');await expect(elevation).toHaveValue('5');
  const viaInstall=(await state(page)).snapshot,installColumn=viaInstall.devices.devices.find((d:{id:string})=>d.id==='rotary').visual;
  expect(installColumn.size_mm[1]).toBeCloseTo(720,8);expect(750+installColumn.offset_mm[1]-installColumn.size_mm[1]/2).toBeCloseTo(0,8);
  await elevation.fill('10');await elevation.press('Tab');
  await joint(page,'rotary.phi',37);await expect(page.locator('#readout')).toContainText('样品中心：0, 1309.5, 0');await checkViewer(page);
  await applyConfig(page,initial);await openDevice(page,'z_stage');await expect(page.getByRole('spinbutton',{name:'z_stage.z / cm',exact:true})).toHaveValue('15');
  expect((await state(page)).snapshot).toEqual(initial);
  await page.locator('#camera-sample').click();await checkLabels(page);await page.screenshot({path:'artifacts/lab-height-sample.png',fullPage:true});
  await page.locator('#camera-all').click();await checkLabels(page);await page.screenshot({path:'artifacts/lab-height-overview.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.locator('#camera-apparatus').click();await page.evaluate(()=>window.scrollTo(0,0));await checkLabels(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await checkViewer(page);await page.screenshot({path:'artifacts/lab-height-mobile.png'});
  expect(errors).toEqual([]);
});

test('Readable diagnostics: isolated coordinate families and independent direction/orientation edits',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1062,height:956});await page.goto('http://127.0.0.1:4173/');
  await page.locator('#open-config').click();await expect(page.locator('#json-settings')).not.toHaveAttribute('open','');await expect(page.locator('#apply-file')).toBeDisabled();
  const initialImport=await state(page),fileConfig=structuredClone(initialImport.snapshot);fileConfig.experiment_state.joints['z_stage.z']=160;
  await page.locator('#file').setInputFiles({name:'readable.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fileConfig))});
  expect(await state(page)).toEqual(initialImport);
  await page.locator('#json-settings > summary').click();await page.locator('#show-current').click();
  const edited=structuredClone(initialImport.snapshot);edited.experiment_state.joints['z_stage.z']=170;await page.locator('#config').fill(JSON.stringify(edited));await page.locator('#json-settings > summary').click();
  await page.locator('#apply-file').click();expect((await state(page)).snapshot.experiment_state.joints['z_stage.z']).toBe(160);
  const beforeInvalidFile=await state(page);await page.locator('#file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{bad')});await page.locator('#apply-file').click();
  expect(await state(page)).toEqual(beforeInvalidFile);await expect(page.locator('#status')).toContainText('不是有效的 JSON');
  await page.locator('#file').setInputFiles([]);await expect(page.locator('#apply-file')).toBeDisabled();
  await closeTools(page);await openDevice(page,'sample');
  await expect(page.locator('#orientation-sample')).not.toHaveAttribute('open','');
  await expect(page.getByRole('spinbutton',{name:'q_x',exact:true})).not.toBeVisible();
  await expect(page.locator('#motion-sample')).toBeHidden();
  const type=page.locator('#direction-type');await type.selectOption('reciprocal');
  const index=(name:string)=>page.getByRole('spinbutton',{name:'观察方向指标 '+name,exact:true});
  await expect(index('h')).toBeVisible();await expect(index('k')).toBeVisible();await expect(index('l')).toBeVisible();
  await index('h').fill('1');await index('k').fill('1');await index('l').fill('0');
  await page.locator('#orientation-sample > summary').click();await page.getByRole('spinbutton',{name:'q_w',exact:true}).fill('0');await page.locator('#orientation-sample > summary').click();
  await page.locator('#apply-direction').click();
  const afterDirection=await state(page);expect(afterDirection.snapshot.experiment_state.samples.sample).toEqual({orientation_quaternion_xyzw:[0,0,0,1],target_indices:[1,1,0],direction_type:'reciprocal'});
  await page.locator('#orientation-sample > summary').click();await page.locator('#apply-crystal').click();
  expect(await state(page)).toEqual(afterDirection);await expect(page.locator('#status')).toContainText('平方和');
  await page.getByRole('spinbutton',{name:'q_w',exact:true}).fill('1');
  await index('h').fill('0');await index('k').fill('0');
  await page.locator('#apply-crystal').click();expect((await state(page)).snapshot.experiment_state.samples.sample.target_indices).toEqual([1,1,0]);
  const beforeInvalid=await state(page);await page.locator('#apply-direction').click();expect(await state(page)).toEqual(beforeInvalid);await expect(page.locator('#status')).toContainText('不能同时为 0');
  await index('h').fill('1');await index('k').fill('1');await page.locator('#apply-direction').click();
  await page.locator('#orientation-sample > summary').click();await page.screenshot({path:'artifacts/readable-sample-controls.png',fullPage:true});

  const noncubic=(await state(page)).snapshot;noncubic.devices.devices.find((d:{id:string})=>d.id==='sample').crystal.cell={a:3,b:4,c:5,alpha_deg:70,beta_deg:80,gamma_deg:75};
  noncubic.experiment_state.joints['hexapod.u']=18;noncubic.experiment_state.joints['hexapod.v']=-12;
  await applyConfig(page,noncubic);await page.locator('#camera-sample').click();
  const beforeView=await state(page);await page.locator('#coordinate-diagnostics').check();
  const preset=page.locator('#diagnostic-preset');await expect(preset).toHaveValue('crystal');
  await expect(page.locator('.scene-label-entry[data-role=crystal]')).toHaveCount(3);await expect(page.locator('.scene-label-entry[data-role=lattice]')).toHaveCount(0);await expect(page.locator('.scene-label-entry[data-role=axis]')).toHaveCount(0);
  await expect(page.locator('#diagnostic-explanation')).toContainText('长度仅供示意');await checkLabels(page);
  await page.screenshot({path:'artifacts/readable-crystal-closeup.png',fullPage:true});
  await preset.selectOption('lattice');await expect(page.locator('.scene-label-entry[data-role=crystal]')).toHaveCount(0);await expect(page.locator('.scene-label-entry[data-role=lattice]')).toHaveCount(3);await checkLabels(page);
  await page.screenshot({path:'artifacts/readable-lattice-closeup.png',fullPage:true});
  await preset.selectOption('devices');await expect(page.locator('.scene-label-entry[data-role=crystal],.scene-label-entry[data-role=lattice]')).toHaveCount(0);
  await preset.selectOption('all');await expect(page.locator('.scene-label-entry[data-role=crystal]')).toHaveCount(3);await expect(page.locator('.scene-label-entry[data-role=lattice]')).toHaveCount(3);
  const tips=await page.locator('.scene-label').evaluateAll(els=>els.map(el=>({world:JSON.parse((el as HTMLElement).dataset.world!),members:JSON.parse((el as HTMLElement).dataset.members!)})));
  const tip=(text:string)=>tips.find(e=>e.members.some((m:{text:string})=>m.text===text))!.world;
  expect(Math.hypot(...tip('晶体 Y').map((v:number,i:number)=>v-tip('晶向 [010]')[i]))).toBeGreaterThan(10);
  expect(await state(page)).toEqual(beforeView);await checkViewer(page);
  const hidden=(await state(page)).snapshot;hidden.experiment_state.display.crystal=false;await applyConfig(page,hidden);await preset.selectOption('crystal');
  await expect(page.locator('#diagnostic-explanation')).toContainText('已在配置中关闭');await expect(page.locator('.scene-label-entry[data-role=crystal]')).toHaveCount(0);
  await applyConfig(page,noncubic);await openDevice(page,'sample');
  await page.setViewportSize({width:390,height:844});await page.locator('#camera-sample').click();await page.evaluate(()=>window.scrollTo(0,0));await checkLabels(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'artifacts/readable-mobile.png'});
  await checkViewer(page);expect(errors).toEqual([]);
});

test('Continuous motion: signed speed, pause lifecycle, configured endpoints and compact controls',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-11-11T00:00:00Z')});
  await page.clock.pauseAt(new Date('2026-11-11T00:00:01Z'));await page.goto('http://127.0.0.1:4173/');
  const bar=()=>page.locator('.device-card:not([hidden]) .motion-runner');
  const axis=()=>bar().getByRole('combobox',{name:'连续运动轴',exact:true});
  const speed=()=>bar().getByRole('textbox',{name:'连续运动速度',exact:true});
  const toggle=()=>bar().locator('[data-action=motion-toggle]');
  const note=()=>page.locator('.device-card:not([hidden]) .motion-runner-status');
  const value=async(id:string)=>(await state(page)).snapshot.experiment_state.joints[id];
  await openDevice(page,'hexapod');await expect(axis().locator('option')).toHaveText(['X','Y','Z','U','V','W']);
  await expect(page.locator('[data-joint="hexapod.u"]')).toHaveAttribute('aria-label','hexapod.u / °');
  await expect(page.locator('#readout')).toContainText('角度 °');
  await speed().fill('+1');await toggle().click();await page.clock.runFor(1000);
  expect(await value('hexapod.x')).toBeCloseTo(1,1);await checkViewer(page);
  await toggle().click();const paused=await state(page);await page.clock.runFor(2000);expect(await state(page)).toEqual(paused);
  await speed().fill('-2');await toggle().click();await page.clock.runFor(500);await toggle().click();
  expect(await value('hexapod.x')).toBeCloseTo(0,1);
  await axis().selectOption('hexapod.u');await expect(bar().locator('.motion-speed span')).toHaveText('°/s');
  await speed().fill('+2');await toggle().click();await page.clock.runFor(500);
  expect(await value('hexapod.u')).toBeCloseTo(1,1);await axis().selectOption('hexapod.y');
  await expect(toggle()).toHaveText('开始');const switched=await state(page);await page.clock.runFor(500);expect(await state(page)).toEqual(switched);
  await speed().fill('1');await toggle().click();
  const manual=page.locator('[data-joint="hexapod.x"]');await manual.fill('3');await expect(toggle()).toHaveText('开始');
  await page.clock.runFor(250);await expect(manual).toHaveValue('3');await manual.press('Tab');expect(await value('hexapod.x')).toBe(3);
  await toggle().click();await openDevice(page,'z_stage');await expect(toggle()).toHaveText('开始');
  const selected=await state(page);await page.clock.runFor(500);expect(await state(page)).toEqual(selected);
  await expect(bar().locator('.motion-speed span')).toHaveText('mm/s');
  await speed().fill('20');await toggle().click();await page.clock.runFor(500);await toggle().click();
  expect(await value('z_stage.z')).toBeCloseTo(160,0);
  expect(Number(await page.locator('[data-joint="z_stage.z"]').inputValue())).toBeCloseTo(16,1);
  await speed().fill('1000');await toggle().click();await page.clock.runFor(200);
  expect(await value('z_stage.z')).toBe(200);await expect(toggle()).toHaveText('开始');await expect(note()).toContainText('端点');
  await speed().fill('-1000');await toggle().click();await page.clock.runFor(200);expect(await value('z_stage.z')).toBe(100);
  await openDevice(page,'rotary');await axis().selectOption('rotary.elevation');await speed().fill('1000');await toggle().click();await page.clock.runFor(200);
  const raised=(await state(page)).snapshot;
  expect(raised.assembly.frames.find((f:{id:string})=>f.id==='R').mount.position_mm[1]).toBe(800);
  expect(raised.devices.devices.find((d:{id:string})=>d.id==='rotary').visual.size_mm[1]).toBe(770);
  expect(raised.assembly.beam.point_mm).toEqual([0,1380,0]);await expect(note()).toContainText('端点');
  await openDevice(page,'hexapod');await speed().fill('0');await toggle().click();await expect(toggle()).toHaveText('开始');await expect(note()).toContainText('非零');
  await speed().fill('1');await toggle().click();
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
  await expect(toggle()).toHaveText('开始');await expect(note()).toContainText('离开');
  const cached=await state(page);await page.clock.runFor(1500);expect(await state(page)).toEqual(cached);
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  await toggle().click();
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));
    delete (document as unknown as {hidden?:boolean}).hidden;
  });
  await expect(toggle()).toHaveText('开始');await expect(note()).toContainText('后台');
  const hiddenPause=await state(page);await page.clock.runFor(1500);expect(await state(page)).toEqual(hiddenPause);
  await toggle().click();await page.locator('#motion-hexapod > summary').click();await page.clock.runFor(100);
  await page.locator('#motion-hexapod > summary').click();await expect(toggle()).toHaveText('开始');
  await toggle().click();await page.locator('#open-config').click();await expect(toggle()).toHaveText('开始');
  await page.locator('#reset').click();await closeTools(page);const restored=await state(page);await page.clock.runFor(1500);expect(await state(page)).toEqual(restored);
  await openDevice(page,'hexapod');await page.screenshot({path:'artifacts/motion-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.clock.runFor(100);
  await page.evaluate(()=>{
    const bar=document.querySelector('.device-card:not([hidden]) .motion-runner')!,view=document.querySelector('.viewport-wrap')!;
    window.scrollBy(0,bar.getBoundingClientRect().top-view.getBoundingClientRect().height-12);
  });await page.clock.runFor(100);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const fields=await bar().locator('select,.motion-speed,button').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top};}));
  expect(Math.max(...fields.map(f=>f.top))-Math.min(...fields.map(f=>f.top))).toBeLessThan(2);
  expect(fields.every(f=>f.left>=0&&f.right<=390)).toBe(true);
  const barBox=(await bar().boundingBox())!,viewBox=(await page.locator('.viewport-wrap').boundingBox())!;
  expect(barBox.y).toBeGreaterThanOrEqual(viewBox.y+viewBox.height);
  await page.screenshot({path:'artifacts/motion-mobile.png'});await checkViewer(page);expect(errors).toEqual([]);
});

test('Moving labels: retain placement during continuous translation and middle-button panning',async({page})=>{
  await page.clock.install({time:new Date('2026-11-11T00:00:00Z')});await page.clock.pauseAt(new Date('2026-11-11T00:00:01Z'));
  await page.setViewportSize({width:1062,height:956});await page.goto('http://127.0.0.1:4173/');await openDevice(page,'hexapod');
  const bar=page.locator('#device-hexapod .motion-runner');
  await bar.getByRole('combobox').selectOption('hexapod.x');await bar.getByRole('textbox').fill('+1');
  await bar.locator('button').click();await page.clock.runFor(160); // Allow the true zero-position coincidence to split once.
  const placement=()=>page.locator('.scene-label-layer').evaluate(layer=>{
    const labels=Array.from(layer.querySelectorAll<HTMLElement>('.scene-label')),dots=layer.querySelectorAll('circle');
    return [labels.findIndex(el=>el.dataset.selected==='true'),labels.findIndex(el=>JSON.parse(el.dataset.members!).some((e:{role:string})=>e.role==='target'))].map(i=>{
      const el=labels[i],box=el.getBoundingClientRect(),viewport=document.querySelector('#viewport')!.getBoundingClientRect();
      return {x:box.x-viewport.x-Number(dots[i].getAttribute('cx')),y:box.y-viewport.y-Number(dots[i].getAttribute('cy')),hidden:el.hidden};
    });
  });
  const before=await state(page),samples=[await placement()];
  for(let i=0;i<16;i++){await page.clock.runFor(80);samples.push(await placement());}
  const canvas=(await page.locator('#viewport canvas').boundingBox())!;
  await page.mouse.move(canvas.x+canvas.width*.8,canvas.y+canvas.height*.7);await page.mouse.down({button:'middle'});
  for(let i=1;i<=12;i++){
    await page.mouse.move(canvas.x+canvas.width*.8+i*.75,canvas.y+canvas.height*.7);await page.clock.runFor(32);samples.push(await placement());
  }
  await page.mouse.up({button:'middle'});await bar.locator('button').click();
  for(const sample of samples)sample.forEach((offset,i)=>{
    expect(offset.hidden).toBe(false);expect(Math.abs(offset.x-samples[0][i].x)).toBeLessThan(1);expect(Math.abs(offset.y-samples[0][i].y)).toBeLessThan(1);
  });
  expect((await state(page)).snapshot.experiment_state.joints['hexapod.x']).toBeGreaterThan(before.snapshot.experiment_state.joints['hexapod.x']);
  expect((await diagnostics(page)).selected_device_id).toBe('hexapod');await checkViewer(page);
  await page.screenshot({path:'artifacts/moving-labels-stable.png'});
});

test('Device reset: atomically zero current motors, pause motion and respect height bounds',async({page})=>{
  await page.clock.install({time:new Date('2026-11-11T00:00:00Z')});await page.clock.pauseAt(new Date('2026-11-11T00:00:01Z'));
  await page.goto('http://127.0.0.1:4173/');const config=(await state(page)).snapshot;
  const hex=['x','y','z','u','v','w'].map(key=>'hexapod.'+key);
  hex.forEach((id,i)=>config.experiment_state.joints[id]=i+1);
  config.experiment_state.joints['rotary.phi']=12;config.experiment_state.joints['theta.angle']=17;
  config.experiment_state.joints['xy.x']=2;config.experiment_state.joints['xy.y']=-3;
  await applyConfig(page,config);await openDevice(page,'hexapod');
  const reset=()=>page.locator('.device-card:not([hidden]) [data-action=reset-motion]');
  const bar=page.locator('#device-hexapod .motion-runner');await bar.locator('button').click();await page.clock.runFor(100);
  const before=await state(page);await reset().click();const after=await state(page);
  const expected=structuredClone(before.snapshot);hex.forEach(id=>expected.experiment_state.joints[id]=0);
  expect(after.snapshot).toEqual(expected);expect(after.revision).toBe(before.revision+1);
  await expect(bar.locator('button')).toHaveText('开始');await expect(page.locator('#motion-hexapod')).toHaveAttribute('open','');
  await page.clock.runFor(1000);expect(await state(page)).toEqual(after);await checkViewer(page);
  await page.screenshot({path:'artifacts/motion-reset-desktop.png'});
  await openDevice(page,'theta');await reset().click();const centered=(await state(page)).snapshot;
  for(const id of ['theta.angle','xy.x','xy.y'])expect(centered.experiment_state.joints[id]).toBe(0);
  expect(centered.experiment_state.joints['rotary.phi']).toBe(12);expect(centered.experiment_state.joints['z_stage.z']).toBe(150);
  await openDevice(page,'z_stage');await expect(reset()).toHaveText('复位');await reset().click();
  expect((await state(page)).snapshot.experiment_state.joints['z_stage.z']).toBe(100);
  await expect(page.locator('[data-joint="z_stage.z"]')).toHaveValue('10');await expect(page.locator('#device-z_stage .motion-runner-status')).toContainText('10 cm');
  await openDevice(page,'rotary');const rise=page.locator('#device-rotary input[aria-label$="台面升高 / cm"]');await rise.fill('2');await rise.press('Tab');
  await reset().click();const lowered=(await state(page)).snapshot;
  expect(lowered.experiment_state.joints['rotary.phi']).toBe(0);expect(lowered.experiment_state.joints['z_stage.z']).toBe(100);
  expect(lowered.assembly.frames.find((f:{id:string})=>f.id==='R').mount.position_mm[1]).toBe(700);
  expect(lowered.devices.devices.find((d:{id:string})=>d.id==='rotary').visual.size_mm[1]).toBe(670);
  expect(lowered.assembly.beam).toEqual(config.assembly.beam);await checkViewer(page);
  await openDevice(page,'hexapod');await page.setViewportSize({width:390,height:844});await page.clock.runFor(100);
  await page.evaluate(()=>{
    const heading=document.querySelector('#motion-hexapod > summary')!,view=document.querySelector('.viewport-wrap')!;
    window.scrollBy(0,heading.getBoundingClientRect().top-view.getBoundingClientRect().height-12);
  });await page.clock.runFor(100);
  const button=(await reset().boundingBox())!,heading=(await page.locator('#motion-hexapod > summary').boundingBox())!;
  expect(button.x+button.width).toBeLessThanOrEqual(390);expect(button.y).toBeGreaterThanOrEqual(heading.y);
  await expect(reset()).toBeVisible();await page.screenshot({path:'artifacts/motion-reset-mobile.png'});
  await openDevice(page,'sample');expect(await reset().count()).toBe(0);
});
