import { test,expect } from '@playwright/test';
import type { SceneConfig } from '../../src/core/types';

test('Local raw window: independent of failed global frame, release-only requests, masking and fixed scale',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/');await page.locator('#open-diffraction').click();
  await page.locator('#dp-reference').evaluate(el=>(el as HTMLDetailsElement).open=true);await page.locator('#dp-demo').click();
  await page.locator('#dp-intensity').selectOption('gaussian_3d');await page.locator('#dp-sigma').fill('.003');await page.locator('#dp-sigma').press('Tab');
  const full=page.locator('#diffraction-panel'),local=page.locator('#dp-local');
  await expect(full).toHaveAttribute('data-preview-grid','[536,536]');
  const global=JSON.parse((await full.getAttribute('data-result'))!);const spot=global.spots.find((s:{hkl:number[]})=>s.hkl.join(',')==='2,0,0');expect(spot).toBeTruthy();
  await page.locator('#dp-local-toggle').click();await page.locator('#dp-spots').selectOption('2,0,0');
  await expect(local).toHaveAttribute('data-state','resolved',{timeout:20000});
  const get=()=>local.evaluate(el=>JSON.parse((el as HTMLElement).dataset.result!));
  const first=await get();expect(first.stride).toBe(1);expect(first.rectangle.width).toBe(256);expect(first.rectangle.height).toBe(256);expect(first.pixels).toHaveLength(65536);expect(first.current).toBe(true);expect(first.sum).toBeGreaterThan(0);
  await expect(page.locator('#dp-local-image')).toHaveAttribute('width','256');await expect(page.locator('#dp-local-image')).toHaveAttribute('height','256');
  expect(first.pixels.reduce((a:number,b:number)=>a+b,0)).toBeCloseTo(first.sum,7);expect(first.hkls).toContainEqual([2,0,0]);
  await page.locator('#dp-local-fit').click();const gray=Number(await page.locator('#dp-local-gray').inputValue());expect(gray).toBeGreaterThan(0);expect(gray).toBeLessThan(100);
  // Gaussian candidate completes this broad local ROI even while the global raw ring frame fails.
  await page.locator('#dp-sigma').fill('.01');await page.locator('#dp-sigma').press('Tab');await page.locator('#dp-sampling').selectOption('raw');await expect(full).toHaveAttribute('data-integration','unresolved');
  await expect(local).toHaveAttribute('data-state','resolved',{timeout:20000});expect((await get()).sum).toBeGreaterThan(0);expect((await get()).revision).toBe(JSON.parse((await full.getAttribute('data-result'))!).revision);
  // Real integration with a deliberately reduced local budget, without changing production defaults.
  await page.evaluate(async()=>{
    const path='/src/diffraction/model.ts',{DiffractionModel}=await import(path),original=DiffractionModel.prototype.compute;
    (globalThis as any).__originalLocalCompute=original;
    DiffractionModel.prototype.compute=function(scene:any,p:any,options:any={}){return original.call(this,scene,p,options.rawROI?{...options,maxEvaluations:12}:options);};
  });
  await page.locator('#dp-local-retry').click();await expect(local).toHaveAttribute('data-state','unresolved');expect((await get()).sum).toBeNull();expect((await get()).current).toBe(false);
  expect((await get()).completed_cells).toBeLessThan((await get()).allocated_cells);
  await page.locator('#dp-local-fit').click();expect(Number(await page.locator('#dp-local-gray').inputValue())).toBe(gray);
  await page.evaluate(async()=>{const path='/src/diffraction/model.ts',{DiffractionModel}=await import(path);DiffractionModel.prototype.compute=(globalThis as any).__originalLocalCompute;delete (globalThis as any).__originalLocalCompute;});
  await page.locator('#dp-local-retry').click();await expect(local).toHaveAttribute('data-state','resolved',{timeout:20000});
  await page.locator('#dp-sigma').fill('.003');await page.locator('#dp-sigma').press('Tab');
  await expect(local).toHaveAttribute('data-state','resolved',{timeout:20000});expect(Number(await page.locator('#dp-local-gray').inputValue())).toBe(gray);
  await page.locator('#dp-sampling').selectOption('adaptive');await expect(local).toHaveAttribute('data-state','resolved',{timeout:20000});
  await page.locator('#dp-plot').scrollIntoViewIfNeeded();
  const box=await page.locator('#dp-plot').boundingBox();if(!box)throw new Error('Missing plot');
  const pos=(x:number,y:number)=>({x:box.x+x/500*box.width,y:box.y+y/500*box.height});
  // Grab off-centre inside the 256-raw box: moving must preserve the grab offset.
  const beforeRect=(await get()).rectangle,start=pos(42+(beforeRect.u0+40.5)/4288*438,18+(beforeRect.v0+40.5)/4288*438),end=pos(42+(beforeRect.u0+56.5)/4288*438,18+(beforeRect.v0+40.5)/4288*438);
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y);await expect(local).toHaveAttribute('data-state','dragging');
  const moved=JSON.parse((await local.getAttribute('data-rectangle'))!);expect(Math.abs(moved.u0-beforeRect.u0-16)).toBeLessThanOrEqual(1);expect(Math.abs(moved.v0-beforeRect.v0)).toBeLessThanOrEqual(1);
  await page.mouse.up();await expect(local).toHaveAttribute('data-state','resolved',{timeout:20000});
  const a=pos(60,30),b=pos(43,19),beforeCompute=await full.getAttribute('data-compute-ms');
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:4});
  await expect(local).toHaveAttribute('data-state','dragging');expect((await get()).current).toBe(false);expect(await full.getAttribute('data-compute-ms')).toBe(beforeCompute);
  await page.mouse.up();await expect(local).toHaveAttribute('data-state','resolved',{timeout:20000});const edge=await get();
  expect(edge.mask.some((v:number)=>v===0)).toBe(true);expect(edge.rectangle.u0).toBeLessThan(0);expect(edge.sum).toBe(0);
  await page.locator('#dp-local-fit').click();await expect(page.locator('#dp-local-status')).toContainText('无信号');expect(Number(await page.locator('#dp-local-gray').inputValue())).toBe(gray);
  // Same revision: the global strict frame fails, while an independently submitted edge ROI succeeds.
  await page.locator('#dp-sigma').fill('.01');await page.locator('#dp-sigma').press('Tab');await page.locator('#dp-sampling').selectOption('raw');
  await expect(full).toHaveAttribute('data-integration','unresolved');await expect(local).toHaveAttribute('data-state','resolved',{timeout:20000});
  expect((await get()).revision).toBe(JSON.parse((await full.getAttribute('data-result'))!).revision);
  await page.locator('#dp-sampling').selectOption('adaptive');await page.locator('#dp-sigma').fill('.003');await page.locator('#dp-sigma').press('Tab');
  // Restore a visible spot and prove width mode selection and a narrow layout retain real raw data.
  await page.locator('#dp-spots').selectOption('2,0,0');await expect(local).toHaveAttribute('data-state','resolved',{timeout:20000});
  await page.locator('#dp-energy').fill('101');await page.locator('#dp-energy').press('Tab');await page.locator('#dp-energy').fill('100');await page.locator('#dp-energy').press('Tab');
  await expect(local).toHaveAttribute('data-state','resolved',{timeout:20000});expect((await get()).revision).toBe(JSON.parse((await full.getAttribute('data-result'))!).revision);
  await page.locator('#dp-intensity').selectOption('uniform_sphere_3d');await page.locator('#dp-diameter').fill('.01');await page.locator('#dp-diameter').press('Tab');await expect(local).toHaveAttribute('data-state','resolved',{timeout:20000});
  await page.locator('#expand-devices').click();await page.locator('.device-tree-row[data-device="rotary"]').click();
  const motor=page.locator('#device-rotary .motion-runner');await motor.getByRole('combobox').selectOption('rotary.phi');await motor.getByRole('textbox').fill('+1');await motor.locator('button').click();
  await expect(local).toHaveAttribute('data-state','stale');await expect.poll(()=>page.locator('#readout').evaluate(el=>JSON.parse((el as HTMLElement).dataset.state!).snapshot.experiment_state.joints['rotary.phi'])).toBeGreaterThan(2.06);
  await motor.locator('button').click();await expect(local).toHaveAttribute('data-state','resolved',{timeout:20000});expect((await get()).revision).toBe(JSON.parse((await full.getAttribute('data-result'))!).revision);
  // Capture and inspect a real broad Gaussian in the expanded window, not an empty post-motion frame.
  await page.locator('#dp-demo').click();await page.locator('#dp-intensity').selectOption('gaussian_3d');await page.locator('#dp-sigma').fill('.03');await page.locator('#dp-sigma').press('Tab');await page.locator('#dp-spots').selectOption('2,0,0');
  await expect(local).toHaveAttribute('data-state','resolved',{timeout:20000});await page.locator('#dp-local-fit').click();
  const wide=await get();expect(wide.sum).toBeGreaterThan(0);expect(wide.completed_cells).toBe(65536);expect(wide.evaluations).toBeLessThanOrEqual(2000000);
  await page.locator('#dp-local').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/gaussian-preview/local-desktop.png'});
  const fillsPanel=()=>page.locator('#dp-local-image').evaluate(el=>{const p=el.parentElement!,style=getComputedStyle(p);return Math.abs(el.getBoundingClientRect().width-(p.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)))<2;});expect(await fillsPanel()).toBe(true);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/gaussian-preview/local-mobile.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await fillsPanel()).toBe(true);
  await page.locator('#dp-intensity').selectOption('legacy');await expect(local).toHaveAttribute('data-state','disabled');await expect(page.locator('#dp-local-toggle')).toBeEnabled();
  await page.locator('#dp-local-toggle').click();await expect(page.locator('#dp-local-content')).toBeHidden();await expect(page.locator('#dp-local-toggle')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('Local UI includes distinct overlapping reflections rather than selected HKL alone',async({page})=>{
  await page.goto('http://127.0.0.1:4173/');await page.locator('#open-diffraction').click();await page.locator('#dp-reference').evaluate(el=>(el as HTMLDetailsElement).open=true);await page.locator('#dp-demo').click();
  const c:SceneConfig=await page.locator('#readout').evaluate(el=>JSON.parse((el as HTMLElement).dataset.state!).snapshot),p=c.diffraction!,sample=c.devices.devices.find(d=>d.id===p.sample_id)!;
  sample.crystal!.cell.a=sample.crystal!.cell.b=sample.crystal!.cell.c=1000;p.reflection_model='primitive';p.hkl_limit=1;p.intensity_model={kind:'gaussian_3d',sigma_g_invA:.0004};
  await page.locator('#open-config').click();await page.locator('#json-settings > summary').click();await page.locator('#config').fill(JSON.stringify(c));await page.locator('#restore').click();await page.locator('#close-drawer').click();
  await page.locator('#dp-local-toggle').click();await page.locator('#dp-spots').selectOption('1,0,0');
  const local=page.locator('#dp-local');await expect(local).toHaveAttribute('data-state','resolved',{timeout:20000});
  const r=JSON.parse((await local.getAttribute('data-result'))!);
  const reference=await page.evaluate(async({snapshot,rectangle})=>{
    const scenePath='/src/core/scene.ts',modelPath='/src/diffraction/model.ts',localPath='/src/diffraction/local.ts';
    const {load_scene}=await import(scenePath),{DiffractionModel}=await import(modelPath),{rawWindow}=await import(localPath);
    const model=new DiffractionModel(),scene=load_scene(snapshot),all=model.compute(scene,snapshot.diffraction,{rawROI:rectangle}),selected=model.compute(scene,snapshot.diffraction,{rawROI:rectangle,hkls:[[1,0,0]]});
    return {status:all.integration_status,expected:Array.from(rawWindow(all.images.map((i:any)=>i.tile),all.panel.pixels,rectangle).data),single:Array.from(rawWindow(selected.images.map((i:any)=>i.tile),selected.panel.pixels,rectangle).data)};
  },{snapshot:c,rectangle:r.rectangle});
  expect(reference.status).toBe('resolved');
  expect(r.hkls.length).toBeGreaterThan(1);expect(r.reflections.every((i:{tail_bound:number;estimated_quadrature_error:number})=>Number.isFinite(i.tail_bound)&&Number.isFinite(i.estimated_quadrature_error))).toBe(true);
  expect(r.pixels.some((v:number,i:number)=>v>Number(reference.single[i])+1e-6)).toBe(true);
  expect(r.pixels.length).toBe(65536);expect(Math.max(...r.pixels.map((v:number,i:number)=>Math.abs(v-Number(reference.expected[i]))))).toBeLessThan(1e-8);
});
