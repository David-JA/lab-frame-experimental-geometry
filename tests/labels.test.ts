import { describe, expect, it } from 'vitest';
import { overlaps, placeLabels, type LabelAnchor } from '../src/viewer/scene-labels';

describe('screen-space label placement',()=>{
  it.each([[1062,756],[390,400]])('keeps dense labels separate and inside a %sx%s canvas',(width,height)=>{
    const anchors:LabelAnchor[]=Array.from({length:16},(_,i)=>({x:width/2+i%3,y:height/2+i%4,width:i===0?176:60,height:i===0?64:30,priority:i===0?5:1}));
    const boxes=placeLabels(anchors,width,height);
    expect(boxes.every(Boolean)).toBe(true);
    boxes.forEach((box,i)=>{
      expect(box!.x).toBeGreaterThanOrEqual(8);expect(box!.y).toBeGreaterThanOrEqual(8);
      expect(box!.x+box!.width).toBeLessThanOrEqual(width-8);expect(box!.y+box!.height).toBeLessThanOrEqual(height-8);
      for(const other of boxes.slice(i+1))expect(overlaps(box!,other!)).toBe(false);
      for(const anchor of anchors)expect(anchor.x>=box!.x-4&&anchor.x<=box!.x+box!.width+4&&anchor.y>=box!.y-4&&anchor.y<=box!.y+box!.height+4).toBe(false);
    });
    expect(placeLabels(anchors,width,height)).toEqual(boxes);
  });
  it('places high-priority labels first when space is limited',()=>{
    const anchors=[{x:2,y:2,width:60,height:30,priority:1},{x:2,y:2,width:60,height:30,priority:5}];
    const boxes=placeLabels(anchors,100,60);
    expect(boxes[0]).toBeUndefined();expect(boxes[1]).toBeDefined();
  });
  it('rejects labels that cannot fit instead of clipping them',()=>{
    expect(placeLabels([{x:20,y:20,width:100,height:30,priority:1}],80,60)).toEqual([undefined]);
  });
  it('clamps edge anchors without changing their coordinates',()=>{
    const anchors=[{x:0,y:0,width:55,height:25,priority:1},{x:200,y:100,width:55,height:25,priority:1}],before=structuredClone(anchors);
    const boxes=placeLabels(anchors,200,100);
    expect(boxes.every(Boolean)).toBe(true);expect(anchors).toEqual(before);
  });
});
