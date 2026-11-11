import { describe,expect,it } from 'vitest';
import { SingleAxisMotion,type MotionAxis } from '../src/ui/single-axis-motion';

function fixture(limits?:[number,number]){
  let now=0,id=0,value=0;const pending=new Map<number,FrameRequestCallback>(),writes:number[]=[],messages:string[]=[];
  let accept=true;
  const motion=new SingleAxisMotion(action=>{if(!accept)return false;action();return true;},(_,message)=>messages.push(message),{
    now:()=>now,request:cb=>{pending.set(++id,cb);return id;},cancel:key=>{pending.delete(key);},
  });
  const axis:MotionAxis={id:'x',label:'X',unit:'mm',limits,read:()=>value,write:next=>{value=next;writes.push(next);}};
  const advance=(ms:number,timestamp?:number)=>{now+=ms;const callbacks=[...pending.values()];pending.clear();callbacks.forEach(cb=>cb(timestamp??now));};
  return {motion,axis,advance,writes,messages,pending,get value(){return value;},reject:()=>{accept=false;}};
}

describe('single-axis continuous motion',()=>{
  it('uses one monotonic clock even if the first cached rAF timestamp precedes the click',()=>{
    const f=fixture();f.advance(100);f.motion.start(f.axis,1);f.advance(8,99);
    expect(f.motion.running).toBe(true);expect(f.value).toBeCloseTo(.008,12);
    f.advance(12,100);expect(f.value).toBeCloseTo(.02,12);
  });
  it('integrates signed velocity over irregular frames and resumes from the paused position',()=>{
    const f=fixture();f.motion.start(f.axis,2);
    f.advance(100);f.advance(350);f.advance(550);expect(f.value).toBeCloseTo(2,12);
    f.motion.pause();f.advance(5000);expect(f.value).toBeCloseTo(2,12);expect(f.pending.size).toBe(0);
    f.motion.start(f.axis,-1);f.advance(500);expect(f.value).toBeCloseTo(1.5,12);
  });
  it('replaces the active axis rather than running two axes',()=>{
    const f=fixture();let other=0;f.motion.start(f.axis,1);f.advance(100);
    f.motion.start({...f.axis,id:'u',label:'U',unit:'°',read:()=>other,write:value=>{other=value;}},-2);
    expect(f.pending.size).toBe(1);f.advance(500);expect(f.value).toBeCloseTo(.1,12);expect(other).toBe(-1);
  });
  it('lands exactly on either configured endpoint, pauses and permits reversing',()=>{
    const f=fixture([-1,1]);f.motion.start(f.axis,10);f.advance(250);
    expect(f.value).toBe(1);expect(f.motion.running).toBe(false);expect(f.pending.size).toBe(0);
    expect(f.motion.start(f.axis,1)).toBe(false);f.motion.start(f.axis,-10);f.advance(300);
    expect(f.value).toBe(-1);expect(f.motion.running).toBe(false);
  });
  it('rejects invalid speeds and stops on a refused update without changing the last position',()=>{
    const f=fixture();for(const speed of [0,NaN,Infinity,-Infinity])expect(f.motion.start(f.axis,speed)).toBe(false);
    expect(f.writes).toEqual([]);f.motion.start(f.axis,1);f.reject();f.advance(100);
    expect(f.value).toBe(0);expect(f.motion.running).toBe(false);expect(f.pending.size).toBe(0);
    expect(f.messages.at(-1)).toContain('拒绝');
  });
  it('pauses on a stalled frame instead of catching up hidden time',()=>{
    const f=fixture();f.motion.start(f.axis,1);f.advance(2000);
    expect(f.value).toBe(0);expect(f.motion.running).toBe(false);expect(f.messages.at(-1)).toContain('停顿');
  });
});
