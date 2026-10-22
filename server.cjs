const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname, port=Number(process.env.PORT||4173);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.ttf':'font/ttf','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.wav':'audio/wav','.ogg':'audio/ogg'};
http.createServer((req,res)=>{try{const url=new URL(req.url,'http://localhost');const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(file,(e,b)=>{if(e){res.writeHead(404);return res.end('找不到这个文件');}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(b);});}catch{res.writeHead(400);res.end();}}).listen(port,'127.0.0.1',()=>console.log(`蛋糕小作坊已打开：http://127.0.0.1:${port}`));
