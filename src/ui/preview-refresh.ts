interface RefreshClock {
  now:()=>number;
  schedule:(callback:()=>void,delayMs:number)=>ReturnType<typeof setTimeout>;
  cancel:(id:ReturnType<typeof setTimeout>)=>void;
}

// Sample current state during motion; never debounce until the motor becomes quiet.
export class PreviewRefresh {
  #open=false;#moving=false;#disposed=false;#timer?:ReturnType<typeof setTimeout>;#last=-Infinity;#revision=-1;
  constructor(private revision:()=>number,private refresh:()=>void,private clock:RefreshClock={
    now:()=>performance.now(),schedule:(fn,delay)=>setTimeout(fn,delay),cancel:id=>clearTimeout(id),
  }){}
  setOpen(open:boolean){
    if(this.#disposed)return;this.#open=open;this.cancel();
    if(open)this.run();
  }
  update(moving=this.#moving){
    const stopped=this.#moving&&!moving;this.#moving=moving;
    if(!this.#open||this.#disposed||this.revision()===this.#revision)return;
    if(stopped||!moving){this.cancel();this.run();return;}
    if(this.#timer!==undefined)return;
    this.#timer=this.clock.schedule(()=>{
      this.#timer=undefined;
      if(this.#open&&!this.#disposed&&this.revision()!==this.#revision)this.run();
    },Math.max(0,1000-(this.clock.now()-this.#last)));
  }
  private run(){this.refresh();this.#revision=this.revision();this.#last=this.clock.now();}
  private cancel(){if(this.#timer!==undefined)this.clock.cancel(this.#timer);this.#timer=undefined;}
  dispose(){this.#disposed=true;this.cancel();}
}
