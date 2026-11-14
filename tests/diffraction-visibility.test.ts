import { it,expect } from 'vitest';
import { downsample,type PixelTile } from '../src/diffraction/forward';
import { displayGray,labelVisible,HKL_LABEL_MIN_GRAY } from '../src/ui/diffraction-visibility';

it('uses current contrast and display threshold, rather than each reflection own peak or total',()=>{
  expect(HKL_LABEL_MIN_GRAY).toBe(16);expect(labelVisible(.06,1)).toBe(false);expect(labelVisible(.07,1)).toBe(true);
  expect(labelVisible(.07,10)).toBe(false);expect(labelVisible(.07,1,.08)).toBe(false);expect(labelVisible(10,1)).toBe(true);
  expect(displayGray(.07,1)).toBe(18);
});
it('collects each reflection peak in the exact display bins without changing the sum or borrowing overlapping light',()=>{
  const a:PixelTile={u0:0,v0:0,width:2,height:2,data:Float64Array.from([1,2,3,4])},b:PixelTile={...a,data:Float64Array.from([.0001,0,0,0])};
  const peaks=new Map<PixelTile,number>(),withStats=downsample([a,b],[16,16],[2,2],(t,p)=>peaks.set(t,p));
  expect(withStats).toEqual(downsample([a,b],[16,16],[2,2]));expect(peaks.get(a)).toBe(10);expect(peaks.get(b)).toBe(.0001);
  expect(labelVisible(peaks.get(a)!,10)).toBe(true);expect(labelVisible(peaks.get(b)!,10)).toBe(false);
});
it('handles coarse cells and clipped non-divisible panel boundaries using the same reduction',()=>{
  for(const tile of [{u0:0,v0:0,width:1,height:1,stride:16,data:Float64Array.of(8)},{u0:16,v0:16,width:1,height:1,stride:4,data:Float64Array.of(3)}]){
    let peak=-1;const preview=downsample([tile],[17,17],[3,3],(_,p)=>peak=p);
    expect(peak).toBe(Math.max(...preview));expect(preview.reduce((a,b)=>a+b,0)).toBeCloseTo(tile.data[0],12);
  }
});
