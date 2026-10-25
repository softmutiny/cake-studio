/* The exact same glaze renderer runs off the input/UI thread. No network or saves. */
self.window=self;
self.document={createElement:()=>new OffscreenCanvas(1,1)};
importScripts('catalog.js?v=0.25.0','flavors.js?v=0.25.0','vendor/spectral.js','pigment.js','cloud-model.js','materials.js?v=0.25.0','piping.js?v=0.25.0','spatula.js?v=0.25.0','turntable.js?v=0.25.0','icing.js?v=0.25.0','core.js?v=0.25.0','pour.js','pour-art.js?v=0.25.0');
let lastShape=null;
self.onmessage=({data})=>{
 try{if(data.g.polygon){if(lastShape&&lastShape!==data.g.shape)delete CakeCore.shapePoints[lastShape];CakeCore.shapePoints[data.g.shape]=data.g.polygon;lastShape=data.g.shape;}const result=CakePourArt.bake(data.p,data.g,data.scale),transfer=[];
 for(const key of ['top','side'])if(result[key]){const r=result[key];r.canvas=r.canvas.transferToImageBitmap();transfer.push(r.canvas);}
 self.postMessage({id:data.id,revision:data.p.revision||0,result},transfer);
 }catch(error){self.postMessage({id:data.id,error:String(error)});}
};
