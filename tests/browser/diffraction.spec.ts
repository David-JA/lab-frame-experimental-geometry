import { test, expect, type Page } from '@playwright/test';

async function positionSupport(page:Page,axis:'X'|'Z',value:number){
  await page.locator('#expand-devices').click();await page.locator('.device-tree-row[data-device="detector_support"]').click();
  await page.locator('#placement-detector_support').evaluate(el=>(el as HTMLDetailsElement).open=true);
  const input=page.getByRole('spinbutton',{name:'探测器支撑架 · LAB '+axis+' / mm',exact:true});
  await input.fill(String(value));await input.press('Tab');
}

test('DP07–DP09: live diffraction, scene parameters, no illumination, restore and collapsed lifecycle',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/');
  const panel=page.locator('#diffraction-panel');await expect(panel).toBeHidden();
  await page.locator('#open-diffraction').click();await expect(panel).toBeVisible();
  await expect(page.locator('#dp-diameter')).toHaveValue('0.1');
  await expect(page.locator('#dp-cell-a')).toHaveValue('3.59033485');
  await expect(panel).toHaveAttribute('data-illumination','lit');
  await expect(page.locator('#dp-light-info')).toContainText('高度 0 mm');
  await page.locator('#dp-demo').evaluate(el=>(el.closest('details') as HTMLDetailsElement).open=true);
  await page.locator('#dp-demo').click();
  await expect(panel).toHaveAttribute('data-illumination','lit');
  await expect(page.locator('#dp-spots')).toContainText('(2 0 0)');
  const graySpot=panel.locator('.diffraction-spot[data-hkl="2,0,0"]');
  await expect(page.locator('#dp-plot > rect').first()).toHaveAttribute('fill','#000000');
  await expect(panel.locator('.diffraction-key')).toContainText('越亮');
  await expect(graySpot).toHaveAttribute('fill','#f2f2f2');const originalOpacity=await graySpot.getAttribute('fill-opacity');
  await page.locator('#dp-spots').selectOption('2,0,0');await expect(page.locator('#dp-detail')).toContainText('原始像素');
  await expect(graySpot).toHaveAttribute('fill','#f2f2f2');await expect(graySpot).toHaveAttribute('fill-opacity',originalOpacity!);await expect(panel.locator('.diffraction-selection')).toHaveCount(1);
  await page.locator('#dp-energy').fill('110');await page.locator('#dp-energy').press('Tab');
  await expect(page.locator('#dp-energy')).toHaveValue('110');
  await page.locator('#dp-energy').fill('0');await page.locator('#dp-energy').press('Tab');
  await expect(page.locator('#dp-energy')).toHaveValue('110');
  await page.locator('#dp-advanced').evaluate(el=>(el as HTMLDetailsElement).open=true);
  await page.locator('#dp-labels').uncheck();await page.locator('#dp-objects').click();
  await expect(page.locator('#dp-energy')).toHaveValue('110');await expect(page.locator('#dp-labels')).not.toBeChecked();
  await page.locator('#dp-april').click();await expect(page.locator('#dp-labels')).not.toBeChecked();
  await page.locator('#dp-demo').click();await expect(page.locator('#dp-spots')).toContainText('(2 0 0)');
  const current=()=>page.locator('#readout').evaluate(el=>JSON.parse((el as HTMLElement).dataset.state!).snapshot);
  const result=()=>panel.evaluate(el=>JSON.parse((el as HTMLElement).dataset.result!));
  const first=(await result()).spots.find((s:{hkl:number[]})=>s.hkl.join()==='2,0,0');
  await positionSupport(page,'Z',1600);
  await expect.poll(async()=>(await result()).spots.find((s:{hkl:number[]})=>s.hkl.join()==='2,0,0').u).not.toBeCloseTo(first.u,2);
  expect((await current()).assembly.frames.find((f:{id:string})=>f.id==='D_support').mount.position_mm[2]).toBe(1600);
  await page.locator('#dp-advanced').evaluate(el=>(el as HTMLDetailsElement).open=true);
  await page.locator('#dp-cell-a').fill('4');await page.locator('#dp-cell-a').press('Enter');
  const cubic=(await current()).devices.devices.find((d:{id:string})=>d.id==='sample').crystal.cell;
  expect([cubic.a,cubic.b,cubic.c]).toEqual([4,4,4]);await expect(page.locator('#dp-spacing')).toHaveText(String(Number((4/Math.sqrt(3)).toFixed(8))));
  const valid=await current();await page.locator('#dp-cell-a').fill('0');await page.locator('#dp-cell-a').press('Tab');
  await expect(page.locator('#dp-cell-a')).toHaveValue('4');expect(await current()).toEqual(valid);
  await page.screenshot({path:'artifacts/lattice-editor.png'});
  const skew=structuredClone(valid);skew.devices.devices.find((d:{id:string})=>d.id==='sample').crystal.cell.b=4.2;skew.diffraction.reflection_model='primitive';
  await page.locator('#open-config').click();await page.locator('#json-settings > summary').click();await page.locator('#config').fill(JSON.stringify(skew));await page.locator('#restore').click();await page.locator('#close-drawer').click();
  await page.locator('#dp-cell-a').fill('4.1');await page.locator('#dp-cell-a').press('Tab');
  const skewEdited=await current();expect(skewEdited.devices.devices.find((d:{id:string})=>d.id==='sample').crystal.cell).toEqual({...skew.devices.devices.find((d:{id:string})=>d.id==='sample').crystal.cell,a:4.1});
  expect(skewEdited.experiment_state).toEqual(skew.experiment_state);expect(await page.locator('#dp-spacing').evaluate(el=>el.tagName)).toBe('OUTPUT');
  await page.locator('#dp-demo').click();await expect(page.locator('#dp-spots')).toContainText('(2 0 0)');
  await page.locator('#dp-diameter').fill('0.001');await page.locator('#dp-diameter').press('Tab');
  expect((await current()).diffraction.spot_diameter_invA).toBe(0.001);
  await page.locator('#expand-devices').click();await page.locator('.device-tree-row[data-device="rotary"]').click();
  const motor=page.locator('#device-rotary .motion-runner');await motor.getByRole('combobox').selectOption('rotary.phi');await motor.getByRole('textbox').fill('+20');await motor.locator('button').click();
  await expect.poll(async()=>(await current()).experiment_state.joints['rotary.phi']).toBeGreaterThan(6);await motor.locator('button').click();
  await expect.poll(async()=>Number(await panel.getAttribute('data-revision'))).toBe(await page.locator('#readout').evaluate(el=>JSON.parse((el as HTMLElement).dataset.state!).revision));
  await expect(page.locator('#dp-spots')).not.toContainText('(2 0 0)');
  await page.locator('#dp-demo').click();await expect(panel).toHaveAttribute('data-illumination','lit');
  // Keep the panel open while using actual left-side motor fields.
  await page.locator('#expand-devices').click();await page.locator('.device-tree-row[data-device="hexapod"]').click();
  const input=page.locator('[data-joint="hexapod.x"]');await input.fill('5');await input.press('Tab');
  await expect(panel).toHaveAttribute('data-illumination','outside');await expect(panel).toHaveAttribute('data-spot-count','0');
  await panel.evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:'artifacts/diffraction-outside.png'});
  await page.locator('#dp-demo').click();await expect(panel).toHaveAttribute('data-illumination','lit');
  await page.locator('#dp-advanced').evaluate(el=>(el as HTMLDetailsElement).open=false);await panel.evaluate(el=>el.scrollTop=0);await page.locator('#camera-apparatus').click();
  await page.screenshot({path:'artifacts/diffraction-desktop.png'});
  const ms=Number(await panel.getAttribute('data-compute-ms'));console.log('DP compute ms (cached/current browser):',ms);
  const revision=await panel.getAttribute('data-revision');await page.locator('#dp-close').click();
  await expect(panel).toBeHidden();await expect(page.locator('#open-diffraction')).toBeFocused();
  await page.locator('.device-tree-row[data-device="hexapod"]').click();await input.fill('1');await input.press('Tab');
  expect(await panel.getAttribute('data-revision')).toBe(revision);
  await page.locator('#open-diffraction').click();await expect.poll(async()=>panel.getAttribute('data-revision')).not.toBe(revision);
  const diagnostics=await page.locator('#diagnostics').getAttribute('data-diagnostics');expect(JSON.parse(diagnostics!).max_detector_plane_error_mm).toBeLessThan(1e-8);
  expect(errors).toEqual([]);
});

test('Diffraction inputs: unit steps preserve fractional values and small-unit fields avoid min offsets',async({page})=>{
  await page.goto('http://127.0.0.1:4173/');await page.locator('#open-diffraction').click();
  for(const id of ['energy']){
    const input=page.locator('#dp-'+id),initial=Number(await input.inputValue());
    await input.press('ArrowUp');await input.press('Tab');
    expect(Number(await input.inputValue())).toBeCloseTo(initial+1,7);
    await input.press('ArrowDown');await input.press('Tab');
    expect(Number(await input.inputValue())).toBeCloseTo(initial,7);
  }
  const diameter=page.locator('#dp-diameter');await diameter.press('ArrowUp');await diameter.press('Tab');await expect(diameter).toHaveValue('0.11');
  await diameter.press('ArrowDown');await diameter.press('Tab');await expect(diameter).toHaveValue('0.1');
  await diameter.fill('0');await diameter.press('Tab');await expect(diameter).toHaveValue('0.1');
  await page.locator('#dp-advanced').evaluate(el=>(el as HTMLDetailsElement).open=true);
  await page.locator('#dp-shape').selectOption('box');
  for(const id of ['size-x','size-y','size-z','beam-x','beam-y']){
    const input=page.locator('#dp-'+id),initial=Number(await input.inputValue());
    await input.press('ArrowUp');expect(Number(await input.inputValue())).toBeCloseTo(initial+1,8);
    await input.press('ArrowDown');expect(Number(await input.inputValue())).toBeCloseTo(initial,8);
  }
  await page.locator('#dp-apply-shape').click();
  const snapshot=await page.locator('#readout').evaluate(el=>JSON.parse((el as HTMLElement).dataset.state!).snapshot);
  expect(snapshot.diffraction.sample_shape).toEqual({kind:'box',size_mm:[1.92,1.92,3]});expect(snapshot.diffraction.beam_size_mm).toEqual([0.2,0.2]);
  const spacing=page.locator('#dp-spacing');expect(await spacing.evaluate(el=>el.tagName)).toBe('OUTPUT');
  await page.locator('#dp-h').fill('2');await page.locator('#dp-h').press('Tab');
  expect(Number(await spacing.textContent())).toBeCloseTo(3.59033485/Math.sqrt(6),8);
  expect(await page.locator('#readout').evaluate(el=>JSON.parse((el as HTMLElement).dataset.state!).snapshot)).toEqual(snapshot);
  await expect(page.locator('#dp-apply-spacing')).toHaveCount(0);
  await page.screenshot({path:'artifacts/diffraction-input-steps.png',fullPage:true});
});

test('Derived crystal values: scattering angle follows energy while q follows d, including unreachable and invalid inputs',async({page})=>{
  await page.goto('http://127.0.0.1:4173/');await page.locator('#open-diffraction').click();
  await page.locator('#dp-cell-a').fill('4');await page.locator('#dp-cell-a').press('Enter');
  await page.locator('#dp-energy').fill('12.3984198433');await page.locator('#dp-energy').press('Tab');
  await page.locator('#dp-advanced').evaluate(el=>(el as HTMLDetailsElement).open=true);
  for(const [id,value]of [['h','2'],['k','0'],['l','0']]){await page.locator('#dp-'+id).fill(value);await page.locator('#dp-'+id).press('Tab');}
  await expect(page.locator('#dp-spacing')).toHaveText('2');
  expect(Number(await page.locator('#dp-q').textContent())).toBeCloseTo(Math.PI,6);
  expect(Number(await page.locator('#dp-two-theta').textContent())).toBeCloseTo(28.9550243719,6);
  await page.locator('#dp-energy').fill('24.7968396866');await page.locator('#dp-energy').press('Tab');
  expect(Number(await page.locator('#dp-two-theta').textContent())).toBeCloseTo(14.3615115629,6);await expect(page.locator('#dp-spacing')).toHaveText('2');
  expect(Number(await page.locator('#dp-q').textContent())).toBeCloseTo(Math.PI,6);
  await page.locator('#dp-energy').fill('1');await page.locator('#dp-energy').press('Tab');
  await expect(page.locator('#dp-two-theta')).toHaveText('—');await expect(page.locator('#dp-cell-note')).toContainText('没有可达');
  await expect(page.locator('#dp-spacing')).toHaveText('2');expect(Number(await page.locator('#dp-q').textContent())).toBeCloseTo(Math.PI,6);
  await page.locator('#dp-h').fill('0');await page.locator('#dp-h').press('Tab');
  for(const id of ['spacing','two-theta','q'])await expect(page.locator('#dp-'+id)).toHaveText('—');
  await page.locator('#dp-reset').click();await page.locator('.diffraction-derived').scrollIntoViewIfNeeded();
  await page.screenshot({path:'artifacts/diffraction-derived-conversions.png'});
});

test('Zone skeleton reference separates energy excitation thresholds from detector coverage',async({page})=>{
  await page.goto('http://127.0.0.1:4173/');await page.locator('#open-diffraction').click();
  await page.locator('#dp-reference').evaluate(el=>(el as HTMLDetailsElement).open=true);
  const row=(zone:string,family:string)=>page.locator(`#dp-skeleton-rows tr[data-zone="${zone}"][data-family="${family}"]`);
  const thresholds=()=>page.locator('#dp-skeleton-rows tr').evaluateAll(rows=>rows.map(el=>Number((el as HTMLElement).dataset.threshold)));
  await expect(page.locator('#dp-skeleton-rows tr')).toHaveCount(5);
  const initial=await thresholds();
  // Independent scalar Ewald calculation at lambda=0.1265 A, a=3.59033485 A.
  [0.03920509190854033,0.0783134455577209,0.02941291617213493,0.03920509190854033,0.0783134455577209].forEach((value,i)=>expect(initial[i]).toBeCloseTo(value,12));
  await expect(row('100','{200}').locator('td').nth(2)).toHaveText('4/4');await expect(row('110','{111}').locator('td').nth(2)).toHaveText('4/4');
  await expect(page.locator('#dp-skeleton-result')).toContainText('面板可容纳 8/8');
  await positionSupport(page,'Z',3000);
  expect(await thresholds()).toEqual(initial);
  await expect(row('100','{200}').locator('td').nth(2)).toHaveText('2/4');
  await expect(row('110','{220}').locator('td').nth(2)).toHaveText('0/2');
  await expect(page.locator('#dp-skeleton-result')).toContainText('面板可容纳 5/8');
  await page.locator('#dp-energy').fill('200');await page.locator('#dp-energy').press('Tab');
  expect((await thresholds())[1]).toBeCloseTo(0.03845012015496463,12);
  await page.locator('#dp-reset').click();await page.locator('#dp-reference').scrollIntoViewIfNeeded();
  await page.screenshot({path:'artifacts/diffraction-skeleton-reference.png'});
});

test('Online KaTeX renders formulas, units and reflection details without changing numeric inputs',async({page})=>{
  const external:string[]=[],failed:string[]=[];
  page.on('request',request=>{if(request.url().startsWith('https://cdn.jsdelivr.net/npm/katex@0.19.1/'))external.push(request.url());});
  page.on('requestfailed',request=>{if(request.url().includes('/katex@'))failed.push(request.url());});
  await page.goto('http://127.0.0.1:4173/');await page.locator('#open-diffraction').click();
  const panel=page.locator('#diffraction-panel');await expect(panel).toHaveAttribute('data-math-status','ready',{timeout:30000});
  await page.locator('#dp-advanced').evaluate(el=>(el as HTMLDetailsElement).open=true);
  await expect(page.locator('#dp-cell-note .katex')).toHaveCount(1);
  await expect(page.locator('#dp-cell-note annotation')).toHaveText(String.raw`d=\dfrac{a}{\sqrt{h^2+k^2+l^2}}`);
  await expect(page.locator('#dp-cell-a')).toHaveValue('3.59033485');
  await expect(page.locator('#dp-spacing')).toHaveText('2.07288079');
  await page.locator('#dp-cell-a').fill('4');await page.locator('#dp-cell-a').press('Enter');
  await expect(page.locator('#dp-cell-note .katex')).toHaveCount(1);expect(Number(await page.locator('#dp-spacing').textContent())).toBeCloseTo(4/Math.sqrt(3),8);
  await page.locator('#dp-reset').click();await page.locator('#dp-spots').selectOption('0,0,-2');
  await expect(page.locator('#dp-detail .katex-mathml').first()).toBeAttached();
  await expect(page.locator('#dp-detail')).toContainText('原始像素');
  await page.locator('.diffraction-derived').scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:'artifacts/diffraction-katex-desktop.png'});
  await page.locator('#dp-reference').evaluate(el=>(el as HTMLDetailsElement).open=true);
  await expect(page.locator('#dp-skeleton-rows .katex').first()).toBeAttached();
  await expect(panel.locator('.katex-error')).toHaveCount(0);
  expect(external.filter(url=>url.endsWith('/katex.mjs'))).toHaveLength(1);expect(external.filter(url=>url.endsWith('/katex.min.css'))).toHaveLength(1);expect(failed).toEqual([]);
  await page.setViewportSize({width:390,height:844});await page.locator('.diffraction-derived').scrollIntoViewIfNeeded();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'artifacts/diffraction-katex-mobile.png',fullPage:true});
});

test('Diffraction reset restores defaults while preserving apparatus motion and crystal orientation',async({page})=>{
  await page.goto('http://127.0.0.1:4173/');await page.locator('#open-diffraction').click();
  const current=()=>page.locator('#readout').evaluate(el=>JSON.parse((el as HTMLElement).dataset.state!).snapshot);
  const baseline=await current(),custom=structuredClone(baseline);
  custom.experiment_state.joints['rotary.phi']=-90;custom.experiment_state.samples.sample.orientation_quaternion_xyzw=[0,0,Math.sin(0.1),Math.cos(0.1)];
  custom.devices.devices.find((d:{id:string})=>d.id==='sample').crystal.cell={a:4,b:4.2,c:4.3,alpha_deg:90,beta_deg:90,gamma_deg:90};
  Object.assign(custom.diffraction,{energy_keV:110,spot_diameter_invA:0.02,reflection_model:'primitive',show_hkl:false,hkl_limit:5,beam_size_mm:[0.5,0.7],sample_shape:{kind:'box',size_mm:[2,3,4]}});
  await page.locator('#open-config').click();await page.locator('#json-settings > summary').click();await page.locator('#config').fill(JSON.stringify(custom));await page.locator('#restore').click();await page.locator('#close-drawer').click();
  await positionSupport(page,'Z',1600);
  await page.locator('#dp-advanced').evaluate(el=>(el as HTMLDetailsElement).open=true);await page.locator('#dp-h').fill('2');await page.locator('#dp-h').press('Tab');
  const beforeReset=await current();await page.locator('#dp-reset').click();const reset=await current();
  expect(reset.diffraction).toEqual(baseline.diffraction);expect(reset.experiment_state).toEqual(custom.experiment_state);
  expect(reset.devices).toEqual(baseline.devices);expect(reset.assembly).toEqual(beforeReset.assembly);
  await expect(page.locator('#dp-h')).toHaveValue('1');await expect(page.locator('#dp-labels')).toBeChecked();
  await expect(page.locator('#dp-cell-a')).toHaveValue('3.59033485');await expect(page.locator('#dp-diameter')).toHaveValue('0.1');
  expect(Number(await page.locator('#dp-spacing').textContent())).toBeCloseTo(3.59033485/Math.sqrt(3),8);
  await page.locator('#dp-h').fill('0');await page.locator('#dp-k').fill('0');await page.locator('#dp-l').fill('0');await page.locator('#dp-l').press('Tab');
  await expect(page.locator('#dp-spacing')).toHaveText('—');await expect(page.locator('#dp-cell-note')).toContainText('不能全为零');
  await page.locator('#dp-reset').click();await expect(page.locator('#dp-cell-note')).toContainText('计算');
  await page.locator('#diffraction-panel').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'artifacts/diffraction-reset-desktop.png'});
  const ambiguous=structuredClone(reset);delete ambiguous.diffraction;
  const detector=structuredClone(ambiguous.devices.devices.find((d:{id:string})=>d.id==='detector'));detector.id='detector2';detector.output_frame='D2';ambiguous.devices.devices.push(detector);
  const frame=structuredClone(ambiguous.assembly.frames.find((f:{id:string})=>f.id==='D'));frame.id='D2';ambiguous.assembly.frames.push(frame);
  await page.locator('#open-config').click();await page.locator('#json-settings').evaluate(el=>(el as HTMLDetailsElement).open=true);await page.locator('#config').fill(JSON.stringify(ambiguous));await page.locator('#restore').click();await page.locator('#close-drawer').click();
  await expect(page.locator('#dp-spacing')).toHaveText('—');await expect(page.locator('#dp-cell-note')).toContainText('请先选择');await expect(page.locator('#dp-reset')).toBeDisabled();
  await expect(page.locator('#dp-two-theta')).toHaveText('—');await expect(page.locator('#dp-q')).toHaveText('—');
  await expect(page.locator('#dp-skeleton-rows tr')).toHaveCount(0);await expect(page.locator('#dp-skeleton-context')).toContainText('请先选择');
  await page.locator('#dp-h').fill('2');await page.locator('#dp-h').press('Tab');await expect(page.locator('#dp-spacing')).toHaveText('—');
});

test('DP09: mobile panel is readable and keeps controls reachable',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:4173/');await page.locator('#open-diffraction').click();
  await page.locator('#dp-demo').evaluate(el=>(el.closest('details') as HTMLDetailsElement).open=true);await page.locator('#dp-demo').click();
  await expect(page.locator('#dp-spots')).toContainText('(2 0 0)');await page.locator('#diffraction-panel').scrollIntoViewIfNeeded();
  await page.locator('#dp-demo').evaluate(el=>(el.closest('details') as HTMLDetailsElement).open=false);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'artifacts/diffraction-mobile.png',fullPage:true});
  await page.locator('#dp-advanced').evaluate(el=>(el as HTMLDetailsElement).open=true);
  await page.locator('.diffraction-derived').scrollIntoViewIfNeeded();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'artifacts/diffraction-derived-mobile.png',fullPage:true});
  await page.locator('#dp-reference').evaluate(el=>(el as HTMLDetailsElement).open=true);
  await page.locator('.diffraction-reference-table').scrollIntoViewIfNeeded();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'artifacts/diffraction-skeleton-mobile.png',fullPage:true});
});

test('Raised laboratory heights: actual default assembly is illuminated and visual-body overlap is not physical illumination',async({page})=>{
  await page.goto('http://127.0.0.1:4173/');await page.locator('#open-diffraction').click();
  const panel=page.locator('#diffraction-panel');await expect(panel).toHaveAttribute('data-illumination','lit');
  await expect(page.locator('#dp-light-info')).toContainText('高度 0 mm');
  await expect(panel).toHaveAttribute('data-spot-count','8');
  await page.locator('.device-tree-row[data-device="rotary"]').click();
  const phi=page.locator('[data-joint="rotary.phi"]');await phi.fill(String(Math.asin(0.1265/3.59033485)*180/Math.PI));await phi.press('Tab');
  await expect(page.locator('#dp-spots')).toContainText('(2 0 0)');await page.locator('#camera-apparatus').click();
  await page.screenshot({path:'artifacts/height-aligned-preview.png'});
  const snapshot=await page.locator('#readout').evaluate(el=>JSON.parse((el as HTMLElement).dataset.state!).snapshot);
  expect(snapshot.assembly.frames.find((f:{id:string})=>f.id==='R').mount.position_mm[1]).toBe(800);
  expect(snapshot.experiment_state.joints['z_stage.z']).toBe(200);
  await page.locator('.device-tree-row[data-device="hexapod"]').click();
  const y=page.locator('[data-joint="hexapod.y"]');await y.fill('16');await y.press('Tab');
  await expect(panel).toHaveAttribute('data-illumination','outside');await expect(page.locator('#dp-light-info')).toContainText('高度 -4.5 mm');
  await expect(page.locator('#dp-status')).toContainText('光束未照到样品');await page.screenshot({path:'artifacts/height-physical-miss.png'});
  await y.fill('20.5');await y.press('Tab');await expect(panel).toHaveAttribute('data-illumination','lit');await expect(page.locator('#dp-spots')).toContainText('(2 0 0)');
});

test('Moving preview: samples once per second before pausing, then flushes the final pose',async({page})=>{
  await page.clock.install({time:new Date('2026-11-11T00:00:00Z')});await page.clock.pauseAt(new Date('2026-11-11T00:00:01Z'));
  await page.goto('http://127.0.0.1:4173/');await page.locator('#open-diffraction').click();
  await page.locator('.device-tree-row[data-device="rotary"]').click();
  const panel=page.locator('#diffraction-panel'),bar=page.locator('#device-rotary .motion-runner');
  const previewRevision=async()=>Number(await panel.getAttribute('data-revision'));
  const sceneRevision=()=>page.locator('#readout').evaluate(el=>JSON.parse((el as HTMLElement).dataset.state!).revision);
  await bar.getByRole('combobox').selectOption('rotary.phi');await bar.getByRole('textbox').fill('+1');
  const initial=await previewRevision();await bar.locator('button').click();await page.clock.runFor(900);
  expect(await sceneRevision()).toBeGreaterThan(initial);expect(await previewRevision()).toBe(initial);
  await page.clock.runFor(200);await expect(bar.locator('button')).toHaveText('暂停');
  const first=await previewRevision();expect(first).toBeGreaterThan(initial);
  await page.clock.runFor(1000);await expect(bar.locator('button')).toHaveText('暂停');
  const second=await previewRevision();expect(second).toBeGreaterThan(first);
  // At ~2 degrees the known 200 reflection is already visible while the motor is still running.
  await expect(page.locator('#dp-spots')).toContainText('(2 0 0)');
  await page.clock.runFor(200);expect(await previewRevision()).toBe(second);
  await bar.locator('button').click();expect(await previewRevision()).toBe(await sceneRevision());
  await expect(bar.locator('button')).toHaveText('开始');
  const stopped=await previewRevision();await page.clock.runFor(1500);expect(await previewRevision()).toBe(stopped);
  await page.locator('#dp-close').click();await bar.locator('button').click();await page.clock.runFor(2000);
  expect(await sceneRevision()).toBeGreaterThan(stopped);expect(await previewRevision()).toBe(stopped);
  await bar.locator('button').click();await page.locator('#open-diffraction').click();expect(await previewRevision()).toBe(await sceneRevision());
});


test('Detector support X/Z positioning preserves calibration and reports normal distance independently',async({page})=>{
  await page.goto('http://127.0.0.1:4173/');await page.locator('#open-diffraction').click();
  const current=()=>page.locator('#readout').evaluate(el=>JSON.parse((el as HTMLElement).dataset.state!).snapshot);
  const apply=async(config:unknown)=>{
    await page.locator('#open-config').click();await page.locator('#json-settings').evaluate(el=>(el as HTMLDetailsElement).open=true);
    await page.locator('#config').fill(JSON.stringify(config));await page.locator('#restore').click();await page.locator('#close-drawer').click();
  };
  const custom=await current(),panelFrame=custom.assembly.frames.find((f:{id:string})=>f.id==='D');
  panelFrame.mount={position_mm:[12,-6,25],quaternion_xyzw:[0,0.6,0,0.8]};await apply(custom);
  const distance=page.locator('#dp-normal-distance'),initial=Number(await distance.textContent());
  expect(await distance.evaluate(el=>el.tagName)).toBe('OUTPUT');await expect(page.locator('#dp-distance')).toHaveCount(0);
  const support=custom.assembly.frames.find((f:{id:string})=>f.id==='D_support');
  await positionSupport(page,'X',support.mount.position_mm[0]+40);await positionSupport(page,'Z',support.mount.position_mm[2]+100);
  expect(Number(await distance.textContent())-initial).toBeCloseTo(66.4,5);
  const moved=await current();expect(moved.assembly.frames.find((f:{id:string})=>f.id==='D').mount).toEqual(panelFrame.mount);
  expect(moved.experiment_state).toEqual(custom.experiment_state);expect(moved.devices).toEqual(custom.devices);
  const x=page.getByRole('spinbutton',{name:'探测器支撑架 · LAB X / mm',exact:true});
  await x.press('ArrowUp');await x.press('Tab');expect(Number(await x.inputValue())).toBe(41);
  await x.press('ArrowDown');await x.press('Tab');expect(Number(await x.inputValue())).toBe(40);
  await page.locator('#camera-all').click();await page.screenshot({path:'artifacts/detector-support-position.png'});
  await apply(moved);expect(await current()).toEqual(moved);
  const beamShift=structuredClone(moved);beamShift.assembly.beam.point_mm[0]+=10;await apply(beamShift);
  await expect(distance).toHaveText('—');
  expect(Number(await page.locator('#dp-calibration-distance').textContent())-initial).toBeCloseTo(56.8,5);
  const diagnostics=JSON.parse((await page.locator('#diagnostics').getAttribute('data-diagnostics'))!);
  expect(diagnostics.max_detector_plane_error_mm).toBeLessThan(1e-8);expect(diagnostics.max_world_matrix_error).toBeLessThan(1e-8);
  await page.locator('.device-tree-row[data-device="detector"]').click();
  await page.locator('#placement-detector').evaluate(el=>(el as HTMLDetailsElement).open=true);
  await expect(page.locator('#placement-detector input[type="number"]')).toHaveCount(0);
  await page.locator('#camera-all').click();await page.screenshot({path:'artifacts/detector-support-calibration.png'});
  const shimmed=structuredClone(moved),dFrame=shimmed.assembly.frames.find((f:{id:string})=>f.id==='D');
  shimmed.assembly.frames.push({id:'panel_shim',parent:dFrame.parent,mount:{position_mm:[20,30,40],quaternion_xyzw:[0,0,Math.SQRT1_2,Math.SQRT1_2]},motion:{kind:'fixed'}});dFrame.parent='panel_shim';await apply(shimmed);
  await page.locator('.device-tree-row[data-device="detector"]').click();await page.locator('#placement-detector').evaluate(el=>(el as HTMLDetailsElement).open=true);
  await expect(page.locator('#placement-detector')).toContainText('架内偏移 (26, 42, 65)');
  await expect(page.locator('#placement-detector')).toContainText('安装四元数 (-0.424264, 0.424264, 0.565685, 0.565685)');
});


test('Illuminated centroid distance follows manual and continuous motion, with no stale value when dark',async({page})=>{
  await page.clock.install({time:new Date('2026-11-11T00:00:00Z')});await page.clock.pauseAt(new Date('2026-11-11T00:00:01Z'));
  await page.goto('http://127.0.0.1:4173/');await page.locator('#open-diffraction').click();
  const snapshot=()=>page.locator('#readout').evaluate(el=>JSON.parse((el as HTMLElement).dataset.state!).snapshot);
  const result=()=>page.locator('#diffraction-panel').evaluate(el=>JSON.parse((el as HTMLElement).dataset.result!));
  const config=await snapshot();config.assembly.frames.find((f:{id:string})=>f.id==='D').mount={position_mm:[12,-6,25],quaternion_xyzw:[0,.6,0,.8]};
  config.diffraction.sample_shape={kind:'box',size_mm:[2,2,2]};config.diffraction.beam_size_mm=[2,.2];
  await page.locator('#open-config').click();await page.locator('#json-settings').evaluate(el=>(el as HTMLDetailsElement).open=true);await page.locator('#config').fill(JSON.stringify(config));await page.locator('#restore').click();await page.locator('#close-drawer').click();
  const readout=page.locator('#dp-normal-distance'),calibration=page.locator('#dp-calibration-distance');
  await expect(readout).toHaveAttribute('aria-label','受照体积重心到平板的垂直距离');const initial=Number(await readout.textContent()),reference=await calibration.textContent();
  await page.locator('.device-tree-row[data-device="hexapod"]').click();
  const joint=async(id:string,value:number)=>{const input=page.locator('[data-joint="'+id+'"]');await input.fill(String(value));await input.press('Tab');};
  await joint('hexapod.z',30);expect(initial-Number(await readout.textContent())).toBeCloseTo(8.4,6);
  await joint('hexapod.x',.5);expect((await result()).source[0]).toBeCloseTo(.25,8);
  expect(initial-Number(await readout.textContent())).toBeCloseTo(8.64,6);await expect(calibration).toHaveText(reference!);
  const bar=page.locator('#device-hexapod .motion-runner');await bar.getByRole('combobox').selectOption('hexapod.z');await bar.getByRole('textbox').fill('+2');
  const before=Number(await readout.textContent());await bar.locator('button').click();await page.clock.runFor(1100);
  await expect(bar.locator('button')).toHaveText('暂停');expect(Number(await readout.textContent())).toBeLessThan(before-.4);
  expect(Number(await readout.textContent())).toBeCloseTo((await result()).source_normal_distance_mm,7);
  await bar.locator('button').click();const stopped=await snapshot();
  expect(initial-Number(await readout.textContent())).toBeCloseTo(.24+.28*stopped.experiment_state.joints['hexapod.z'],6);
  await joint('hexapod.x',5);await expect(page.locator('#diffraction-panel')).toHaveAttribute('data-illumination','outside');await expect(readout).toHaveText('—');await expect(calibration).toHaveText(reference!);
  await joint('hexapod.x',0);await expect(readout).not.toHaveText('—');
  await readout.scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/illuminated-distance-desktop.png'});
  await page.setViewportSize({width:390,height:844});await readout.scrollIntoViewIfNeeded();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'artifacts/illuminated-distance-mobile.png'});
});
