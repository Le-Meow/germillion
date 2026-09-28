import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile,mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { createApp } from './app.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const dbPath=process.env.DB_PATH||resolve(root,'var/germillion.sqlite');
await mkdir(dirname(dbPath),{recursive:true});
const sqlite=new DatabaseSync(dbPath);
sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
sqlite.exec(readFileSync(new URL('./migrations/0001_initial.sql',import.meta.url),'utf8'));
const db={get:async(sql,...args)=>sqlite.prepare(sql).get(...args),all:async(sql,...args)=>sqlite.prepare(sql).all(...args),run:async(sql,...args)=>sqlite.prepare(sql).run(...args)};
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/world.js', ['world.js', 'text/javascript; charset=utf-8']],
  ['/chart.js', ['chart.js', 'text/javascript; charset=utf-8']],
  ['/assets/486.png', ['assets/486.png', 'image/png']],
  ['/assets/sprites.png', ['assets/sprites.png', 'image/png']],
  ['/assets/skins.png', ['assets/skins.png', 'image/png']],
  ['/assets/tiers.png', ['assets/tiers.png', 'image/png']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/font.ttf', ['font.ttf', 'font/ttf']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);
for (const path of ['/archive','/virus','/attacks','/settings','/help','/feedback','/privacy']) files.set(path, files.get('/'));

const app=createApp(db,{origin:process.env.PUBLIC_ORIGIN,assets:async request=>{
  const file=files.get(new URL(request.url).pathname);
  if(request.method!=='GET'||!file)return new Response('Not found',{status:404});
  return new Response(await readFile(resolve(root,'public',file[0])),{headers:{'Content-Type':file[1],'Cache-Control':'no-cache'}});
}});
const server=createServer(async(req,res)=>{
  try{
    const protocol=process.env.PUBLIC_ORIGIN?.startsWith('https:')||req.headers['x-forwarded-proto']==='https'?'https':'http';
    const request=new Request(`${protocol}://${req.headers.host}${req.url}`,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
    const response=await app(request,{ip:req.socket.remoteAddress});
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){console.error(error);res.writeHead(500);res.end('Connection interrupted.');}
});
server.requestTimeout=15000;server.headersTimeout=10000;
server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log(`Germillion listening on http://${process.env.HOST||'127.0.0.1'}:${server.address().port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{sqlite.close();process.exit(0);}));
