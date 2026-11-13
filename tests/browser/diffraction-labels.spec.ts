import { test,expect } from '@playwright/test';

test('HKL auto labels follow displayed contrast while intensities and the full reflection list stay intact',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/');await page.locator('#open-diffraction').click();
  await page.locator('#dp-intensity').selectOption('gaussian_3d');await page.locator('#dp-sigma').fill('.03');await page.locator('#dp-sigma').press('Tab');await page.locator('#dp-fit-gray').click();
  const panel=page.locator('#diffraction-panel'),labels=page.locator('.diffraction-hkl-label'),result=()=>panel.evaluate(el=>JSON.parse((el as HTMLElement).dataset.result!));
  const baseline=await result(),count=await labels.count(),options=await page.locator('#dp-spots option').count();
  expect(count).toBeGreaterThan(0);expect(count).toBeLessThan(baseline.spots.length);expect(JSON.parse((await panel.getAttribute('data-labels'))!).hidden_by_brightness).toBeGreaterThan(0);
  await page.locator('#dp-gray-max').fill('1000000');await page.locator('#dp-gray-max').press('Tab');await expect(labels).toHaveCount(0);
  expect((await result()).integrated_sum).toBe(baseline.integrated_sum);expect((await result()).preview_sum).toBe(baseline.preview_sum);expect(await page.locator('#dp-spots option').count()).toBe(options);
  await page.locator('#dp-spots').selectOption('2,0,0');await expect(labels).toHaveCount(1);await expect(labels).toHaveAttribute('data-hkl','2,0,0');
  await expect(labels).toHaveAttribute('fill','#ff91c5');await expect(page.locator('#dp-detail')).toContainText('原始像素');await expect(page.locator('.diffraction-selection')).toHaveCount(0);
  await expect(page.locator('#dp-local-box')).toHaveCount(0);await page.locator('#dp-local-toggle').click();await page.locator('#dp-spots').selectOption('2,0,0');
  await expect(page.locator('#dp-local-box')).toHaveCount(1);await expect(page.locator('#dp-local-box')).toHaveAttribute('stroke','#4ecbff');await expect(page.locator('.diffraction-selection')).toHaveCount(0);
  await page.locator('#dp-local-toggle').click();await expect(page.locator('#dp-local-box')).toHaveCount(0);await expect(labels).toHaveAttribute('fill','#ff91c5');
  await page.locator('#dp-labels').uncheck();await expect(labels).toHaveCount(0);await page.locator('#dp-labels').check();await expect(labels).toHaveCount(1);
  await page.locator('#dp-spots').selectOption('');await page.locator('#dp-gray-max').fill(String(baseline.gray_max));await page.locator('#dp-gray-max').press('Tab');await expect(labels).toHaveCount(count);
  await page.locator('#dp-display-threshold').fill('1000000');await page.locator('#dp-display-threshold').press('Tab');await expect(labels).toHaveCount(0);expect((await result()).integrated_sum).toBe(baseline.integrated_sum);
  await page.locator('#dp-display-threshold').fill('0');await page.locator('#dp-display-threshold').press('Tab');await expect(labels).toHaveCount(count);
  await page.locator('#dp-plot').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/gaussian-preview/hkl-visible-desktop.png'});
  expect(errors).toEqual([]);
});
