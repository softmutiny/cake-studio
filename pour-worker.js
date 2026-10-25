/* The exact same glaze renderer runs off the input/UI thread. No network or saves. */
self.window=self;
self.document={createElement:()=>new OffscreenCanvas(1,1)};
importScripts('catalog.js','flavors.js','vendor/spectral.js','pigment.js','piping.js','core.js','pour.js','pour-art.js');
self.onmessage=({data})=>{
 try{const result=CakePourArt.bake(data.p,data.g,data.scale),transfer=[];
 for(const key of ['top','side'])if(result[key]){const r=result[key];r.canvas=r.canvas.transferToImageBitmap();transfer.push(r.canvas);}
 self.postMessage({id:data.id,revision:data.p.revision||0,result},transfer);
 }catch(error){self.postMessage({id:data.id,error:String(error)});}
};
