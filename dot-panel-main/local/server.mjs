// SPDX-License-Identifier: AGPL-3.0-only
import {createServer, request} from 'node:http';
import {readFile,realpath} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {readEvents,eventPage,DEFAULT_FILE} from './events.mjs';
import {createResourceMonitor} from './resources.mjs';
const ROOT = resolve(import.meta.dirname,'..');
export function createLocalServer({file=DEFAULT_FILE,port=8787,upstreamPort=8788,dist=resolve(ROOT,'dist'),readResources=createResourceMonitor({root:ROOT})}={}) {
  const hosts = new Set([`127.0.0.1:${port}`,`localhost:${port}`]);
  return createServer(async (req,res) => {
    const fail = (status,message) => {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify({error:message}));};
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    if (!hosts.has(req.headers.host) || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) || req.headers['sec-fetch-site']==='cross-site') return fail(403,'Local same-origin requests only');
    let url; try {url = new URL(req.url,`http://${req.headers.host}`);} catch {return fail(400,'Invalid URL');}
    if (url.pathname === '/api/task-events') {
      if (req.method !== 'GET') return fail(405,'Read-only endpoint');
      try {const page = eventPage(await readEvents(file),url.searchParams.get('cursor'));res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(page));} catch (e) {return fail(503,e.message);}
      return;
    }
    if (url.pathname === '/api/resources') {
      if (req.method !== 'GET') return fail(405,'Read-only endpoint');
      try {const sample=await readResources();res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(sample));}
      catch {return fail(503,'Resource sample unavailable');}
      return;
    }
    if (url.pathname.startsWith('/api/') || url.pathname === '/mcp') {
      const headers = {...req.headers,host:`127.0.0.1:${upstreamPort}`};
      if (headers.origin) headers.origin=`http://127.0.0.1:${upstreamPort}`;
      const proxy=request({hostname:'127.0.0.1',port:upstreamPort,path:req.url,method:req.method,headers}, upstream=>{res.writeHead(upstream.statusCode??502,upstream.headers);upstream.pipe(res);});
      proxy.setTimeout(15000,()=>proxy.destroy(new Error('Upstream timeout')));
      proxy.on('error',()=>{if(!res.headersSent) fail(502,'Panel backend is starting or unavailable');else res.destroy();});
      req.pipe(proxy);return;
    }
    if (!['GET','HEAD'].includes(req.method)) return fail(405,'Read only');
    // Only the built public directory is served. Never serve source, logs, or credentials.
    try {
      const name = decodeURIComponent(url.pathname);
      if (name.includes('\0') || name.split('/').some(p=>p==='..'||p.startsWith('.'))) return fail(404,'Not found');
      let path = name === '/' || name === '/dashboard' ? resolve(dist,'index.html') : resolve(dist,'.'+name);
      if (!path.startsWith(resolve(dist)+'/')) return fail(404,'Not found');
      let data; try {const actual=await realpath(path),root=await realpath(dist); if(!actual.startsWith(root+'/'))return fail(404,'Not found');data=await readFile(actual);}catch{return fail(404,'Not found');}
      const type = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'}[extname(path)] || 'application/octet-stream';
      res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'"});
      res.end(req.method==='HEAD'?undefined:data);
    } catch {fail(500,'Local file unavailable');}
  });
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const worker=spawn(resolve(ROOT,'node_modules/.bin/wrangler'),['dev','--local','--ip','127.0.0.1','--port','8788','--inspector-port','9229'],{cwd:ROOT,stdio:'inherit'});
  const server=createLocalServer();server.listen(8787,'127.0.0.1',()=>console.log('Private task window: http://127.0.0.1:8787/'));
  let stopping=false;
  const stop=()=>{if(stopping)return;stopping=true;worker.kill('SIGTERM');server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3000).unref();};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
  worker.on('error',e=>console.error('Panel backend error:',e.message));
  worker.on('exit',code=>{if(!stopping)console.error(`Panel backend exited (${code}); task feed remains available`);});
  server.on('error',e=>{console.error(e.message);worker.kill();process.exitCode=1;});
}
