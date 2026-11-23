'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {server,catalog}=require('../server');
const {moods,inferMood}=require('../ambient-engine');
test('seven distinct instrumental categories with 35 unique tracks',()=>{
 assert.equal(catalog.length,35);
 assert.equal(new Set(catalog.map(x=>x.id)).size,35);
 assert.equal(new Set(catalog.map(x=>x.seed)).size,35);
 assert.deepEqual(new Set(catalog.map(x=>x.mood)),new Set(moods));
});
test('mood inference',()=>{
 assert.equal(inferMood('gentle rain'),'rain');
 assert.equal(inferMood('lofi beats'),'lofi');
 assert.equal(inferMood('piano solo'),'piano');
});
test('HTTP site and API endpoints',async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const status=await fetch(base+'/api/status');
  assert.equal(status.status,200);
  const s=await status.json();
  assert.equal(s.catalogSize,35);
  assert.ok(s.durations.includes(1800));
  const cat=await (await fetch(base+'/api/catalog')).json();
  assert.equal(cat.tracks.length,35);
  const page=await fetch(base+'/');
  assert.equal(page.status,200);
  assert.match(await page.text(),/Museflow Studio/);
  const bad=await fetch(base+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({durationSec:1900,prompt:'test music'})});
  assert.equal(bad.status,400);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
