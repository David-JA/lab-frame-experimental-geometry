export interface MotionAxis {
  id:string;label:string;unit:'mm'|'°';limits?:readonly [number,number];
  read:()=>number;write:(value:number)=>void;
}
interface Clock {now:()=>number;request:(callback:FrameRequestCallback)=>number;cancel:(id:number)=>void}

// One owner for the entire inspector; motion always goes through the existing scene update.
export class SingleAxisMotion {
  #active?:{axis:MotionAxis;speed:number;last:number};#frame?:number;#axisId?:string;
  constructor(private apply:(action:()=>void)=>boolean,private report:(id:string|undefined,message:string)=>void,
    private clock:Clock={now:()=>performance.now(),request:cb=>requestAnimationFrame(cb),cancel:id=>cancelAnimationFrame(id)}){}
  get running(){return this.#active!==undefined;}
  get axisId(){return this.#axisId;}
  start(axis:MotionAxis,speed:number){
    this.pause();this.#axisId=axis.id;
    if(!Number.isFinite(speed)||speed===0){this.report(axis.id,'请输入非零的有限速度，负数表示反向。');return false;}
    const value=axis.read(),limit=axis.limits;
    if(limit&&((speed>0&&value>=limit[1])||(speed<0&&value<=limit[0]))){this.report(axis.id,'已到行程端点，请反向运动。');return false;}
    this.#active={axis,speed,last:this.clock.now()};
    this.report(axis.id,'正在运动 · '+axis.label+' · '+speed+' '+axis.unit+'/s');
    this.#frame=this.clock.request(this.#tick);return true;
  }
  pause(message='已暂停，保留当前位置。'){
    if(this.#frame!==undefined)this.clock.cancel(this.#frame);this.#frame=undefined;
    const wasRunning=this.running;this.#active=undefined;
    if(wasRunning)this.report(this.#axisId,message);
  }
  #tick=()=>{
    const now=this.clock.now(); // rAF's cached frame timestamp can precede the start click.
    this.#frame=undefined;const active=this.#active;if(!active)return;
    const dt=(now-active.last)/1000;active.last=now;
    // Never catch up a stalled/background interval with a large unexpected jump.
    if(dt<0||dt>1){this.pause('页面停顿，已暂停；点击开始继续。');return;}
    try{
      const current=active.axis.read(),requested=current+active.speed*dt,limit=active.axis.limits;
      if(!Number.isFinite(requested))throw Error('Non-finite motion');
      const value=limit?Math.max(limit[0],Math.min(limit[1],requested)):requested;
      if(value!==current&&!this.apply(()=>active.axis.write(value))){this.pause('参数更新被拒绝，已暂停。');return;}
      if(limit&&(active.speed>0?value>=limit[1]:value<=limit[0])){this.pause('已到行程端点，自动暂停。');return;}
    }catch{this.pause('参数更新失败，已暂停。');return;}
    if(this.#active===active)this.#frame=this.clock.request(this.#tick);
  };
}
