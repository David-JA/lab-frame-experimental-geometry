import type { Scene } from '../core/scene';
import type { DiffractionSettings } from '../core/types';
import { detectorPanel,DiffractionModel } from '../diffraction/model';
import { LOCAL_SIZE,localRectangle,rawWindow } from '../diffraction/local';
import type { RawRectangle } from '../diffraction/forward';

type Context={scene:Scene;p:DiffractionSettings};
const NS='http://www.w3.org/2000/svg';
/** Viewing state only: a raw ROI never mutates Scene or refreshes the full frame. */
export class LocalDiffraction {
  #model=new DiffractionModel();#open=false;#active=false;#moving=false;#drag?:{pointer:number;before:RawRectangle;du:number;dv:number};
  #rect=localRectangle(2144,2144);#token=0;#timer?:ReturnType<typeof setTimeout>;#key='';#scene?:Scene;
  #state='closed';#gray=100;#adapted=false;#image?:ReturnType<typeof rawWindow>;#overlay?:SVGRectElement;
  constructor(private host:HTMLElement,private plot:SVGSVGElement,private context:()=>Context|undefined){
    host.className='local-diffraction';
    host.innerHTML=`<button id="dp-local-toggle" aria-expanded="false">打开局部原始像素窗口</button><div id="dp-local-content" hidden>
<p class="small">${LOCAL_SIZE}×${LOCAL_SIZE} raw · 每格一个原始像素。点击全局图或选择 HKL 定位；拖动框，松手后计算。运动中暂停局部精算。</p>
<p id="dp-local-status" class="small" role="status"></p><canvas id="dp-local-image" width="${LOCAL_SIZE}" height="${LOCAL_SIZE}" aria-label="${LOCAL_SIZE}乘${LOCAL_SIZE}原始像素局部积分图"></canvas>
<p id="dp-local-coordinates" class="small"></p><div class="diffraction-fields"><label>局部灰度上限 / 每原始像素相对信号<input id="dp-local-gray" type="number" min="0" step="any" value="100"></label><div><button id="dp-local-fit">适配局部亮度一次</button><button id="dp-local-retry">重算当前窗口</button></div></div>
<p id="dp-local-scale" class="small"></p><p class="small">灰度独立于全局每显示格标尺；移动窗口不自动归一化。斜纹区域在探测器外，不是零信号像素。</p></div>`;
    this.el<HTMLButtonElement>('toggle').onclick=()=>this.setOpen(!this.#open);
    this.el('retry').onclick=()=>this.submit();
    this.el('fit').onclick=()=>{
      if(this.#state!=='resolved'||!this.#image){this.status('当前局部结果无效或未完成，不能适配亮度。');return;}
      const peak=this.#image.data.reduce((a,b)=>Math.max(a,b),0);
      if(!(peak>0)){this.status('窗口内无信号，无法适配亮度；保留原标尺。');return;}
      this.#gray=peak;this.#adapted=true;this.paint();
    };
    this.el<HTMLInputElement>('gray').onchange=()=>{
      const value=Number(this.el<HTMLInputElement>('gray').value);
      if(Number.isFinite(value)&&value>0){this.#gray=value;this.#adapted=false;}
      this.paint();
    };
    plot.addEventListener('pointerdown',this.down);plot.addEventListener('pointermove',this.move);
    plot.addEventListener('pointerup',this.up);plot.addEventListener('pointercancel',this.cancelDrag);
    this.paint();
  }
  private el<T extends HTMLElement=HTMLElement>(id:string){return this.host.querySelector<T>('#dp-local-'+id)!;}
  private status(text:string){this.el('status').textContent=text;}
  private cancel(){if(this.#timer!==undefined)clearTimeout(this.#timer);this.#timer=undefined;this.#token++;}
  private state(value:string,text:string){const changed=this.#state!==value;this.#state=value;this.host.dataset.state=value;if(changed&&this.host.dataset.result){const r=JSON.parse(this.host.dataset.result);r.current=value==='resolved';r.view_state=value;this.host.dataset.result=JSON.stringify(r);}this.el('image').classList.toggle('stale',value!=='resolved');this.status(text);}
  setActive(active:boolean){this.#active=active;if(!active){this.cancel();this.#drag=undefined;this.state('closed','局部窗口已暂停。');}else this.update(this.#moving);this.overlay();}
  private setOpen(open:boolean){
    if(open&&!this.context()?.p.intensity_model)return;
    this.#open=open;this.el('content').hidden=!open;this.el('toggle').setAttribute('aria-expanded',String(open));
    this.el('toggle').textContent=open?'关闭局部原始像素窗口':'打开局部原始像素窗口';
    if(open){const c=this.context();if(c){this.#rect=localRectangle(...this.center(c));}this.submit();}
    else{this.cancel();this.#drag=undefined;this.state('closed','局部窗口已关闭。');}
    this.overlay();
    this.el<HTMLButtonElement>('toggle').disabled=!this.context()?.p.intensity_model&&!this.#open;
  }
  private center(c:Context):[number,number]{const p=detectorPanel(c.scene,c.p.detector_id);return [(p.pixels[0]-1)/2,(p.pixels[1]-1)/2];}
  update(moving:boolean){
    const stopped=this.#moving&&!moving;this.#moving=moving;const c=this.context();
    this.el<HTMLButtonElement>('toggle').disabled=!c?.p.intensity_model&&!this.#open;
    if(!this.#open||!this.#active)return;
    if(!c?.p.intensity_model){this.cancel();this.state('disabled','请切换三维积分模型；旧圆斑没有原始像素结果。');this.overlay();return;}
    const key=JSON.stringify([c.scene.revision,c.p]),changed=key!==this.#key||c.scene!==this.#scene;
    if(changed||moving){this.cancel();this.#key=key;this.#scene=c.scene;this.state(this.#drag?'dragging':'stale',moving?'样品运动中，旧图已过期；停止后重算。':'参数已变化，旧图已过期。');}
    if(!moving&&!this.#drag&&(changed||stopped||this.#state==='closed'))this.submit();
  }
  locate(u:number,v:number){if(!this.#open||!this.#active)return;this.#rect=localRectangle(u,v);this.overlay();this.submit();}
  private point(e:PointerEvent):[number,number]|undefined {
    const c=this.context(),matrix=this.plot.getScreenCTM();if(!c||!matrix)return;
    const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());if(p.x<42||p.x>480||p.y<18||p.y>456)return;
    const [w,h]=detectorPanel(c.scene,c.p.detector_id).pixels;
    return [(p.x-42)/438*w-.5,(p.y-18)/438*h-.5];
  }
  private down=(e:PointerEvent)=>{
    if(!this.#open||!this.#active||e.button!==0||!this.context()?.p.intensity_model)return;
    const p=this.point(e);if(!p)return;const r=this.#rect,inside=p[0]>=r.u0-.5&&p[0]<r.u0+r.width-.5&&p[1]>=r.v0-.5&&p[1]<r.v0+r.height-.5;
    this.cancel();this.#drag={pointer:e.pointerId,before:{...r},du:inside?p[0]-(r.u0+(r.width-1)/2):0,dv:inside?p[1]-(r.v0+(r.height-1)/2):0};
    if(!inside)this.#rect=localRectangle(...p);this.plot.setPointerCapture(e.pointerId);
    this.state('dragging','定位中，旧图待更新；松手后计算。');this.overlay();
  };
  private move=(e:PointerEvent)=>{if(this.#drag?.pointer!==e.pointerId)return;const p=this.point(e);if(p){this.#rect=localRectangle(p[0]-this.#drag.du+.5,p[1]-this.#drag.dv+.5);this.overlay();}};
  private up=(e:PointerEvent)=>{if(this.#drag?.pointer!==e.pointerId)return;this.#drag=undefined;if(this.plot.hasPointerCapture(e.pointerId))this.plot.releasePointerCapture(e.pointerId);this.submit();};
  private cancelDrag=(e:PointerEvent)=>{if(this.#drag?.pointer!==e.pointerId)return;this.#rect=this.#drag.before;this.#drag=undefined;this.cancel();this.state('stale','已取消拖动；旧结果待更新。');this.overlay();};
  /** Reattach after the parent redraws its SVG. */
  overlay(){
    this.#overlay?.remove();this.#overlay=undefined;
    if(!this.#open||!this.#active||!this.context()?.p.intensity_model)return;
    const c=this.context()!,[w,h]=detectorPanel(c.scene,c.p.detector_id).pixels,r=this.#rect;
    const left=Math.max(0,r.u0),top=Math.max(0,r.v0),right=Math.min(w,r.u0+r.width),bottom=Math.min(h,r.v0+r.height);
    const rect=document.createElementNS(NS,'rect');for(const [key,value]of Object.entries({id:'dp-local-box',x:42+left/w*438,y:18+top/h*438,width:Math.max(0,right-left)/w*438,height:Math.max(0,bottom-top)/h*438,fill:'#4ecbff18',stroke:'#4ecbff','stroke-width':1.5,'pointer-events':'none'}))rect.setAttribute(key,String(value));
    this.plot.append(rect);this.#overlay=rect;this.el('coordinates').textContent=`raw u=${r.u0}…${r.u0+r.width-1}，v=${r.v0}…${r.v0+r.height-1}；板外位置单独掩膜。`;
    this.host.dataset.rectangle=JSON.stringify(r);
  }
  private submit(){
    this.cancel();const c=this.context();if(!this.#open||!this.#active||!c?.p.intensity_model)return;
    if(this.#moving||this.#drag){this.state('stale','当前运动或定位尚未结束，旧图已过期。');return;}
    const token=this.#token,scene=c.scene,revision=scene.revision,p=structuredClone(c.p),rect={...this.#rect};
    this.#key=JSON.stringify([revision,p]);this.#scene=scene;this.state('computing',`正在计算${LOCAL_SIZE}×${LOCAL_SIZE}原始像素窗口…`);this.overlay();
    this.#timer=setTimeout(()=>{
      this.#timer=undefined;if(token!==this.#token||this.context()?.scene!==scene||scene.revision!==revision)return;
      try{
        const r=this.#model.compute(scene,p,{rawROI:rect,adaptiveBinning:false,pixelStride:1,gaussianQuadrature:'plane'});
        if(token!==this.#token||this.context()?.scene!==scene||scene.revision!==revision)return;
        const images=r.images??[],evaluations=images.reduce((s,i)=>s+i.evaluations,0),cells=images.reduce((s,i)=>s+i.tile.data.length,0),involved=images.filter(i=>i.raw_roi_pixels>0),visited=images.reduce((s,i)=>s+i.visited_cells,0),completed=images.reduce((s,i)=>s+i.completed_cells,0);
        const image=rawWindow(images.map(i=>i.tile),r.panel.pixels,rect),sum=image.data.reduce((a,b)=>a+b,0),valid=r.integration_status==='resolved';
        this.#image=image;
        this.host.dataset.result=JSON.stringify({scope:'roi',rectangle:rect,revision,status:r.integration_status,stride:1,algorithm:p.intensity_model?.kind==='gaussian_3d'?'gaussian-plane-with-ring-fallback':'rings',sum:valid?sum:null,partial_sum:valid?null:sum,pixels:Array.from(image.data),mask:Array.from(image.mask),hkls:involved.map(i=>i.hkl),allocated_cells:cells,visited_cells:visited,completed_cells:completed,evaluations,ms:r.duration_ms,gray_max:this.#gray,reflections:involved.map(i=>({hkl:i.hkl,status:i.status,reason:i.reason,pixel_sum:i.pixel_sum,sphere_integral:i.sphere_integral,tail_bound:i.tail_bound,error_scale:i.error_scale,scale_kind:i.scale_kind,estimated_quadrature_error:i.estimated_quadrature_error,visited_cells:i.visited_cells,completed_cells:i.completed_cells,plane_cells:i.plane_cells,fallback_cells:i.fallback_cells,plane_evaluations:i.plane_evaluations,evaluations:i.evaluations}))});
        const stats=`${involved.length} 个参与HKL；分配 ${cells} / 已完成 ${completed} 个反射-像素单元，${evaluations} 次求值，${r.duration_ms.toFixed(1)} ms。`;
        this.state(valid?'resolved':'unresolved',valid?`当前结果有效${sum===0?' · 窗口内无信号':''}；窗口积分和 ${sum.toPrecision(7)}。${stats}`:`局部积分未完成，当前图不能作为有效数值结果。${images.find(i=>i.status==='unresolved')?.reason??'照明尚未解析'}；${stats}`);
        this.paint();
      }catch(error){this.state('unresolved',`局部积分未完成：${error instanceof Error?error.message:String(error)}`);}
    },30);
  }
  private paint(){
    const canvas=this.el<HTMLCanvasElement>('image'),ctx=canvas.getContext('2d')!,out=ctx.createImageData(LOCAL_SIZE,LOCAL_SIZE);
    for(let i=0;i<LOCAL_SIZE*LOCAL_SIZE;i++){
      const outside=this.#image&&!this.#image.mask[i],gray=outside?(((i%LOCAL_SIZE+Math.floor(i/LOCAL_SIZE))%12<6)?85:125):Math.round(255*Math.min(1,(this.#image?.data[i]??0)/this.#gray));
      out.data[4*i]=out.data[4*i+1]=out.data[4*i+2]=gray;out.data[4*i+3]=255;
    }
    ctx.putImageData(out,0,0);this.el<HTMLInputElement>('gray').value=String(this.#gray);
    if(this.host.dataset.result){const r=JSON.parse(this.host.dataset.result);r.gray_max=this.#gray;r.gray_adapted=this.#adapted;this.host.dataset.result=JSON.stringify(r);}
    this.el('scale').textContent=`每原始像素积分信号；灰度上限 ${this.#gray.toPrecision(6)}；${this.#adapted?'已人工适配一次':'初值/手动标尺'}。`;
  }
  dispose(){this.cancel();this.plot.removeEventListener('pointerdown',this.down);this.plot.removeEventListener('pointermove',this.move);this.plot.removeEventListener('pointerup',this.up);this.plot.removeEventListener('pointercancel',this.cancelDrag);}
}
