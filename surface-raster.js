(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CakeSurfaceRaster=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Project a height surface as a mesh. Depth selects the visible face when a
// raised deposit folds over itself in the oblique camera; back faces stay hidden.
function raster(f,g,quality=1.75,orientation={}){
 const top=g.view==='top',ratio=g.ry/g.rx,tilt=top?0:Math.sqrt(Math.max(0,1-ratio*ratio)),unit=8,pad=3,scale=quality,angle=orientation.angle||0,extent=orientation.extent||1,cos=Math.cos(angle),sin=Math.sin(angle);
 let maxH=0;for(const h of f.H)maxH=Math.max(maxH,h*unit);
 const x=g.x-g.rx-pad,y=g.y-g.ry-maxH*tilt-pad,width=Math.ceil((g.rx*2+pad*2)*scale),height=Math.ceil((g.ry*2+maxH*tilt+pad*2)*scale),pixels=new Uint8ClampedArray(width*height*4),depth=new Float32Array(width*height).fill(-Infinity);
 const step=2,xs=[] ,ys=[];for(let i=0;i<f.nx;i+=step)xs.push(i);if(xs.at(-1)!==f.nx-1)xs.push(f.nx-1);for(let i=0;i<f.ny;i+=step)ys.push(i);if(ys.at(-1)!==f.ny-1)ys.push(f.ny-1);
 const vertices=[];
 for(const row of ys)for(const col of xs){const i=row*f.nx+col,h=f.H[i]*unit,u=(col+.5)/f.nx*2-1,v=(row+.5)/f.ny*2-1,hl=f.H[row*f.nx+Math.max(0,col-1)],hr=f.H[row*f.nx+Math.min(f.nx-1,col+1)],hu=f.H[Math.max(0,row-1)*f.nx+col],hd=f.H[Math.min(f.ny-1,row+1)*f.nx+col];let nx=-(hr-hl)*unit/(2*f.dx),ny=-(hd-hu)*unit/(2*f.dy);const gx=nx*cos-ny*sin;ny=nx*sin+ny*cos;nx=gx;const inv=1/Math.hypot(nx,ny,1);nx*=inv;ny*=inv;const light=.86+.2*Math.max(0,-nx*.45-ny*.55+inv*.7),spec=Math.pow(Math.max(0,-nx*.25-ny*.45+inv*.858),28)*(2+40*f.G[i]);vertices.push({x:(g.x+(u*cos-v*sin)/extent*g.rx-x)*scale,y:(g.y+(u*sin+v*cos)/extent*g.ry-h*tilt-y)*scale,z:(u*sin+v*cos)/extent*g.rx*tilt+h*ratio,a:f.mask[i]?Math.min(1,f.H[i]/.035):0,r:clamp(f.R[i]*light+spec,0,255),g:clamp(f.C[i]*light+spec,0,255),b:clamp(f.B[i]*light+spec*.94,0,255)});}
 function triangle(a,b,c){const cross=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);if(cross<=1e-7||a.a+b.a+c.a<.001)return;const left=Math.max(0,Math.ceil(Math.min(a.x,b.x,c.x)-.5)),right=Math.min(width-1,Math.floor(Math.max(a.x,b.x,c.x)-.5)),up=Math.max(0,Math.ceil(Math.min(a.y,b.y,c.y)-.5)),down=Math.min(height-1,Math.floor(Math.max(a.y,b.y,c.y)-.5));for(let py=up;py<=down;py++)for(let px=left;px<=right;px++){const xx=px+.5-a.x,yy=py+.5-a.y,wb=(xx*(c.y-a.y)-yy*(c.x-a.x))/cross,wc=((b.x-a.x)*yy-(b.y-a.y)*xx)/cross,wa=1-wb-wc;if(wa<-.00001||wb<-.00001||wc<-.00001)continue;const alpha=wa*a.a+wb*b.a+wc*c.a;if(alpha<.005)continue;const z=wa*a.z+wb*b.z+wc*c.z,index=py*width+px;if(z<depth[index])continue;depth[index]=z;const p=index*4,aa=wa*a.a,ab=wb*b.a,ac=wc*c.a;pixels[p]=(aa*a.r+ab*b.r+ac*c.r)/alpha;pixels[p+1]=(aa*a.g+ab*b.g+ac*c.g)/alpha;pixels[p+2]=(aa*a.b+ab*b.b+ac*c.b)/alpha;pixels[p+3]=alpha*255;}}
 const stride=xs.length;for(let row=0;row<ys.length-1;row++)for(let col=0;col<stride-1;col++){const i=row*stride+col;triangle(vertices[i],vertices[i+1],vertices[i+stride]);triangle(vertices[i+1],vertices[i+stride+1],vertices[i+stride]);}
 return {pixels,width,height,x,y,scale,depth};
}
return {raster};
});
