type MathEngine=Pick<typeof import('katex'),'render'>;
const CDN='https://cdn.jsdelivr.net/npm/katex@0.19.1/dist/';
let engine:MathEngine|undefined,loading:Promise<MathEngine>|undefined;

const escape=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export const math=(tex:string,text:string)=>`<span class="inline-math" data-tex="${escape(tex)}">${escape(text)}</span>`;

function load():Promise<MathEngine>{
  if(!loading){
    const styles=new Promise<void>((resolve,reject)=>{
      const link=document.createElement('link');link.rel='stylesheet';link.href=CDN+'katex.min.css';
      link.onload=()=>resolve();link.onerror=()=>reject(new Error('KaTeX stylesheet could not load'));document.head.append(link);
    });
    const moduleUrl=CDN+'katex.mjs';
    loading=Promise.all([import(/* @vite-ignore */ moduleUrl) as Promise<MathEngine>,styles]).then(([module])=>engine=module);
  }
  return loading;
}

export function typesetMath(root:HTMLElement):void{
  const render=(katex:MathEngine)=>{
    for(const el of root.querySelectorAll<HTMLElement>('[data-tex]')){
      const tex=el.dataset.tex!;if(el.dataset.typeset===tex)continue;
      katex.render(tex,el,{throwOnError:false,trust:false,output:'htmlAndMathml'});el.dataset.typeset=tex;
    }
    root.dataset.mathStatus='ready';
  };
  if(engine)render(engine);
  else{root.dataset.mathStatus='loading';void load().then(render).catch(()=>{root.dataset.mathStatus='error';});}
}
