import { it, expect } from 'vitest';
import { PreviewRefresh } from '../src/ui/preview-refresh';

function setup(){
  let time=0,revision=0,nextId=0;const jobs=new Map<number,{at:number;fn:()=>void}>(),samples:{time:number;revision:number}[]=[];
  const refresh=new PreviewRefresh(()=>revision,()=>samples.push({time,revision}),{
    now:()=>time,
    schedule:(fn,delay)=>{const id=++nextId;jobs.set(id,{at:time+delay,fn});return id as unknown as ReturnType<typeof setTimeout>;},
    cancel:id=>{jobs.delete(id as unknown as number);},
  });
  const advance=(ms:number)=>{
    const until=time+ms;
    while(true){const first=[...jobs.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(!first||first[1].at>until)break;time=first[1].at;jobs.delete(first[0]);first[1].fn();}time=until;
  };
  return {refresh,samples,advance,change:(moving=true)=>{revision++;refresh.update(moving);}};
}
it('samples the latest revision every second while changes keep arriving, without waiting for a pause',()=>{
  const t=setup();t.refresh.setOpen(true);
  for(let i=0;i<99;i++){t.advance(10);t.change();}
  expect(t.samples).toEqual([{time:0,revision:0}]);t.advance(10);
  expect(t.samples[1]).toEqual({time:1000,revision:99});
  for(let i=0;i<100;i++){t.change();t.advance(10);}
  expect(t.samples[2]).toEqual({time:2000,revision:199});expect(t.samples.length).toBe(3);
});
it('flushes the final motion pose immediately and updates manual edits without an idle polling loop',()=>{
  const t=setup();t.refresh.setOpen(true);t.advance(250);t.change();t.refresh.update(false);
  expect(t.samples[1]).toEqual({time:250,revision:1});t.advance(2000);expect(t.samples.length).toBe(2);
  t.change(false);expect(t.samples[2]).toEqual({time:2250,revision:2});t.refresh.update(false);expect(t.samples.length).toBe(3);
});
it('cancels pending work while closed or disposed and samples current state on reopening',()=>{
  const t=setup();t.refresh.setOpen(true);t.change();t.refresh.setOpen(false);t.advance(1500);t.change();expect(t.samples.length).toBe(1);
  t.refresh.setOpen(true);expect(t.samples[1]).toEqual({time:1500,revision:2});t.change();t.refresh.dispose();t.advance(2000);expect(t.samples.length).toBe(2);
});
