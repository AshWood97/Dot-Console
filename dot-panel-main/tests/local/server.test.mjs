// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {mkdtemp, writeFile, mkdir, symlink, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLocalServer} from '../../local/server.mjs';

async function fixture(t,options={}) {
  const directory = await mkdtemp(join(tmpdir(),'dot-server-review-'));
  const dist = join(directory,'dist');
  const file = join(directory,'events.jsonl');
  await mkdir(dist);
  await writeFile(join(dist,'index.html'),'<html><body>Local</body></html>');
  await writeFile(join(directory,'outside-secret.txt'),'NEVER EXPOSE OUTSIDE DIST');
  // Host validation deliberately uses a fixed configured Host while the socket gets an ephemeral port.
  const host='127.0.0.1:18787';
  const server = createLocalServer({file,dist,port:18787,upstreamPort:1,...options});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});});
  return {directory,dist,file,host,port:server.address().port};
}
function get(context,path='/',options={}) {
  return new Promise((resolve,reject)=>{
    const req=request({hostname:'127.0.0.1',port:context.port,path,method:options.method??'GET',headers:{host:context.host,...options.headers}},res=>{
      let body='';res.setEncoding('utf8');res.on('data',part=>body+=part);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
    });req.on('error',reject);req.end();
  });
}

test('localhost feed is read-only, no-store, and does not enable CORS',async t=>{
  const context=await fixture(t);
  const read=await get(context,'/api/task-events');
  assert.equal(read.status,200);assert.deepEqual(JSON.parse(read.body).events,[]);
  assert.equal(read.headers['cache-control'],'no-store');
  assert.equal(read.headers['access-control-allow-origin'],undefined);
  for(const method of ['POST','PUT','DELETE','OPTIONS']) assert.equal((await get(context,'/api/task-events',{method})).status,405);
});

test('rejects DNS rebinding hosts, foreign origins, and cross-site requests',async t=>{
  const context=await fixture(t);
  for(const headers of [{host:'evil.example:18787'},{host:'127.0.0.1.evil.example:18787'},{host:'localhost:9999'},{origin:'https://evil.example'},{origin:'null'},{origin:'http://127.0.0.1:9999'},{'sec-fetch-site':'cross-site'}]) assert.equal((await get(context,'/api/task-events',{headers})).status,403,JSON.stringify(headers));
  assert.equal((await get(context,'/api/task-events',{headers:{origin:`http://${context.host}`}})).status,200);
});

test('static assets have strict headers, HEAD has no body, unknown resources are 404',async t=>{
  const context=await fixture(t);
  const root=await get(context);
  assert.equal(root.status,200);assert.match(root.headers['content-security-policy'],/frame-ancestors 'none'/);
  assert.equal(root.headers['x-content-type-options'],'nosniff');
  assert.equal(root.headers['cross-origin-resource-policy'],'same-origin');
  assert.equal((await get(context,'/',{method:'HEAD'})).body,'');
  assert.equal((await get(context,'/unknown')).status,404);
  assert.equal((await get(context,'/',{method:'POST'})).status,405);
});

test('encoded traversal and dotfiles cannot expose files outside the public build',async t=>{
  const context=await fixture(t);
  for(const path of ['/../outside-secret.txt','/%2e%2e/outside-secret.txt','/..%2foutside-secret.txt','/%2e%2e%2foutside-secret.txt','/.env','/%2eenv','/%00']) {
    const result=await get(context,path);assert.equal(result.status,404,path);assert.doesNotMatch(result.body,/NEVER EXPOSE/);
  }
});

test('a symlink inside the build directory cannot escape its serving boundary',async t=>{
  const context=await fixture(t);
  await symlink(join(context.directory,'outside-secret.txt'),join(context.dist,'external.txt'));
  const result=await get(context,'/external.txt');
  assert.equal(result.status,404,'Resolve and check the real path, not only its lexical prefix');
  assert.doesNotMatch(result.body,/NEVER EXPOSE/);
});

test('an unavailable panel upstream fails explicitly rather than proxying elsewhere',async t=>{
  const context=await fixture(t);
  const result=await get(context,'/api/overview');
  assert.equal(result.status,502);assert.match(result.body,/unavailable/);
});


test('resource endpoint is read-only, same-origin and never proxies or leaks errors',async t=>{
  const snapshot={sampledAt:'2026-10-11T00:00:00Z',memory:null,disk:null,cpu:null};
  const context=await fixture(t,{readResources:async()=>snapshot});
  const result=await get(context,'/api/resources');assert.equal(result.status,200);assert.deepEqual(JSON.parse(result.body),snapshot);assert.equal(result.headers['cache-control'],'no-store');assert.equal(result.headers['access-control-allow-origin'],undefined);
  for(const method of ['HEAD','POST','PUT','DELETE','OPTIONS'])assert.equal((await get(context,'/api/resources',{method})).status,405);
  for(const headers of [{host:'evil.example'},{origin:'https://evil.example'},{'sec-fetch-site':'cross-site'}])assert.equal((await get(context,'/api/resources',{headers})).status,403);
  const broken=await fixture(t,{readResources:async()=>{throw new Error('/private/path secret');}});
  const failure=await get(broken,'/api/resources');assert.equal(failure.status,503);assert.doesNotMatch(failure.body,/secret|private/);
});
