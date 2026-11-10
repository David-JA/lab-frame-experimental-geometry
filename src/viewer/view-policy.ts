import type { Device, SceneConfig, Vec3 } from '../core';

export interface ViewerView {selectedDeviceId?:string|null;diagnostics?:boolean}
export interface ViewerCallbacks {onSelect?:(deviceId:string)=>void;onInspectCoincident?:(position:Vec3)=>void}

export function viewPolicy(config:SceneConfig,view:ViewerView){
  const devices=config.devices.devices;
  const defaultHost=devices.find(d=>d.integrated_into&&devices.some(host=>host.id===d.integrated_into&&host.type==='theta'))?.integrated_into;
  const selectedId=view.selectedDeviceId===undefined?(defaultHost??devices.find(d=>d.type==='rotary')?.id):view.selectedDeviceId;
  const selected=devices.find(d=>d.id===selectedId);
  const diagnostics=view.diagnostics??false;
  const display=config.experiment_state.display;
  const layers={frames:diagnostics&&display.frames,crystal:diagnostics&&display.crystal,lattice:diagnostics&&display.lattice};
  const relevantFrames=new Set<string>();
  const includeAncestors=(device:Device)=>{
    let frame:string|undefined=device.output_frame;
    while(frame&&!relevantFrames.has(frame)){
      relevantFrames.add(frame);frame=config.assembly.frames.find(f=>f.id===frame)?.parent;
    }
  };
  devices.filter(d=>d.crystal||d.id===selected?.id).forEach(includeAncestors);
  const axisDeviceIds=new Set(devices.filter(d=>(d.type==='rotary'||d.type==='theta')&&(diagnostics||relevantFrames.has(d.output_frame))).map(d=>d.id));
  return {selected,diagnostics,layers,axisDeviceIds};
}
