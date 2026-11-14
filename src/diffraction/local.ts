import type { PixelTile,RawRectangle } from './forward';
import { validateRawRectangle } from './forward';

export const LOCAL_SIZE=256;
export function localRectangle(u:number,v:number):RawRectangle {
  return {u0:Math.floor(u)-LOCAL_SIZE/2,v0:Math.floor(v)-LOCAL_SIZE/2,width:LOCAL_SIZE,height:LOCAL_SIZE};
}
/** Global raw coordinates are retained; masked detector exterior is not a zero observation. */
export function rawWindow(tiles:PixelTile[],pixels:[number,number],roi:RawRectangle){
  validateRawRectangle(roi);
  const data=new Float64Array(roi.width*roi.height),mask=new Uint8Array(data.length);
  for(let j=0;j<roi.height;j++)for(let i=0;i<roi.width;i++){
    const u=roi.u0+i,v=roi.v0+j;if(u>=0&&v>=0&&u<pixels[0]&&v<pixels[1])mask[j*roi.width+i]=1;
  }
  for(const t of tiles){
    if((t.stride??1)!==1)throw new Error('Local raw window cannot use grouped tiles');
    for(let j=0;j<t.height;j++)for(let i=0;i<t.width;i++){
      const x=t.u0+i-roi.u0,y=t.v0+j-roi.v0;
      if(x>=0&&y>=0&&x<roi.width&&y<roi.height&&mask[y*roi.width+x])data[y*roi.width+x]+=t.data[j*t.width+i];
    }
  }
  return {data,mask};
}
