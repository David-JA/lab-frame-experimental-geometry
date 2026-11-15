import * as THREE from 'three';

// Display-only finishes. Input colors remain in the saved configuration.
export type Finish = 'alloy' | 'coated' | 'graphite' | 'specimen';
const finishes = {
  alloy: {metalness:.85, roughness:.48, envMapIntensity:1.1, neutralMix:.12},
  coated: {metalness:0, roughness:.58, envMapIntensity:.45, neutralMix:.28},
  graphite: {metalness:0, roughness:.72, envMapIntensity:.4, neutralMix:.06},
  specimen: {metalness:0, roughness:.62, envMapIntensity:.45, neutralMix:0},
} satisfies Record<Finish, {metalness:number;roughness:number;envMapIntensity:number;neutralMix:number}>;

/** One small, deterministic packed texture: R=height, G=roughness. No displacement. */
export function brushedTexture(){
  const size=128,data=new Uint8Array(size*size*4);
  const noise=(x:number,y:number)=>((Math.imul(x+1,73856093)^Math.imul(y+1,19349663))>>>0)/4294967295;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*4,grain=noise(x,0)*.7+noise(x,y)*.3;
    data[i]=Math.round(128+20*(grain-.5));data[i+1]=Math.round(229+16*(grain-.5));data[i+2]=255;data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size);
  texture.name='subtle-brushed-finish';texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;
  return texture;
}

/** Small procedural studio reflection field; no external HDR assets or new geometry. */
export function studioEnvironment(){
  const width=128,height=64,data=new Float32Array(width*height*4);
  const key=new THREE.Vector3(-1,.8,1).normalize(),rim=new THREE.Vector3(1,.4,-1).normalize();
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const phi=(x+.5)/width*2*Math.PI,theta=(y+.5)/height*Math.PI;
    const direction=new THREE.Vector3(-Math.sin(theta)*Math.cos(phi),Math.cos(theta),Math.sin(theta)*Math.sin(phi));
    const value=.35+.55*Math.max(direction.y,0)+1.6*Math.pow(Math.max(direction.dot(key),0),28)+.7*Math.pow(Math.max(direction.dot(rim),0),22);
    const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=value;data[i+3]=1;
  }
  const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.FloatType);
  texture.name='neutral-studio-reflections';texture.mapping=THREE.EquirectangularReflectionMapping;
  texture.colorSpace=THREE.LinearSRGBColorSpace;texture.magFilter=texture.minFilter=THREE.LinearFilter;
  texture.needsUpdate=true;return texture;
}

export function surfaceMaterial(finish:Finish,color:THREE.ColorRepresentation,brush:THREE.Texture){
  const {neutralMix,...parameters}=finishes[finish];
  const material=new THREE.MeshStandardMaterial({
    ...parameters,color:new THREE.Color(color).lerp(new THREE.Color('#aeb4b8'),neutralMix),
    ...(finish==='alloy'?{roughnessMap:brush,bumpMap:brush,bumpScale:.06}:{}),
  });
  material.name=finish;return material;
}
