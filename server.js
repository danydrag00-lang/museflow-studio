'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {compose,ffmpegAvailable,moods}=require('./ambient-engine');
const root=__dirname,pub=path.join(root,'public'),data=path.join(root,'data'),trackDir=path.join(data,'tracks');
const catalogDir=path.join(pub,'catalog-audio');
for(const dir of [trackDir,catalogDir])fs.mkdirSync(dir,{recursive:true});
const fileIndex=path.join(data,'library.json');
let library=[];
try{library=JSON.parse(fs.readFileSync(fileIndex,'utf8'));if(!Array.isArray(library))library=[];}catch{}
const jobs=new Map(),pendingCatalog=new Map();
const groups=[
 ['sleep','Deep sleep','Sleep & Calm','Warm cloud-like pads and sparse nighttime melodies',['Velvet Midnight','Moonlit Breathing','Slow Aurora','Quiet Horizon','Silken Night']],
 ['spa','Spa','Spa & Meditation','Gentle bell-like tones and tranquil harmonic motion',['Bamboo Light','Jade Water Garden','Stillness Ritual','Dawn Sanctuary','Lotus Mist']],
 ['rain','Rain textures','Nature Inspired','Soft synthesized rainfall textures and distant pads',['Window Rain','Soft Coastal Storm','Midnight Drizzle','Rain on Glass','Distant Clouds']],
 ['lofi','Lo-fi','Focus & Lo-fi','Mellow keys and a lightly pulsing beat',['After Hours Study','Sunday Notebook','Coffee and Clouds','Loft Lights','Warm Tape']],
 ['piano','Piano-inspired','Piano-inspired','Intimate keyboard-like melodies and soft electronic harmony',['Letters at Dawn','Golden Keys','Early Spring','Quiet Reflections','Falling Starlight']],
 ['cinematic','Cinematic','Cinematic','Spacious hopeful chords and evolving melodic themes',['First Light Rising','Northern Skies','A Moment Beyond','Open Roads','Silver Horizon']],
 ['ambient','Ambient','Ambient Soundscapes','Weightless atmospheric synthesized soundscapes',['Deep Blue Space','Floating Islands','The Haze Between','Soft Orbit','Ethereal Fields']]
];
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const catalog=groups.flatMap(([mood,label,genre,description,names],g)=>names.map((title,i)=>({
 id:mood+'-'+slug(title),mood,label,genre,description,title,seed:400001+g*122081+i*19991,
 prompt:description+'. '+title+'. Create an instrumental original composition.',durationSec:45+i*5,
 audioUrl:'/api/catalog/'+mood+'-'+slug(title)+'/audio'
})));
const lookup=new Map(catalog.map(x=>[x.id,x]));
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(res,status,value)=>{res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
const fail=(res,status,error)=>json(res,status,{error});
const save=()=>fs.promises.writeFile(fileIndex,JSON.stringify(library,null,2));
async function bodyJSON(req){
 let size=0,raw='';
 for await(const chunk of req){size+=chunk.length;if(size>80000)throw Error('Request too large');raw+=chunk.toString('utf8');}
 return JSON.parse(raw||'{}');
}
function audioResponse(req,res,file){
 fs.stat(file,(e,stat)=>{
  if(e||!stat.isFile())return fail(res,404,'Audio not found');
  const ext=path.extname(file),type=ext==='.mp3'?'audio/mpeg':'audio/wav';
  const range=req.headers.range;
  let start=0,end=stat.size-1,status=200;
  if(range){
   const m=/^bytes=(\d*)-(\d*)$/.exec(range);
   if(!m)return res.writeHead(416,{'Content-Range':'bytes */'+stat.size}).end();
   start=m[1]?Number(m[1]):0;end=m[2]?Number(m[2]):end;
   if(start> end||start>=stat.size)return res.writeHead(416,{'Content-Range':'bytes */'+stat.size}).end();
   end=Math.min(end,stat.size-1);status=206;
  }
  const h={'Content-Type':type,'Accept-Ranges':'bytes','Content-Length':end-start+1};
  if(status===206)h['Content-Range']='bytes '+start+'-'+end+'/'+stat.size;
  res.writeHead(status,h);
  if(req.method==='HEAD')return res.end();
  fs.createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
 });
}
function pickFile(base){for(const ext of ['mp3','wav'])if(fs.existsSync(base+'.'+ext))return base+'.'+ext;return null;}
function catalogFile(t){return pickFile(path.join(catalogDir,t.id));}
async function ensureCatalog(t){
 if(catalogFile(t))return catalogFile(t);
 if(pendingCatalog.has(t.id))return pendingCatalog.get(t.id);
 const task=compose({outputBase:path.join(catalogDir,t.id),durationSec:t.durationSec,prompt:t.prompt,mood:t.mood,seed:t.seed});
 pendingCatalog.set(t.id,task);
 try{await task;return catalogFile(t);}finally{pendingCatalog.delete(t.id);}
}
let queue=Promise.resolve();
function enqueue(task){const q=queue.then(task);queue=q.catch(()=>{});return q;}
function createJob(input){
 const id=crypto.randomUUID(),date=new Date().toISOString();
 const durationSec=Number(input.durationSec||60),takes=Number(input.versions||1);
 if(!Number.isInteger(durationSec)||durationSec<10||durationSec>1800)throw Error('Choose a duration from 10 seconds to 30 minutes.');
 if(!Number.isInteger(takes)||takes<1||takes>4)throw Error('Choose 1 to 4 versions.');
 const mood=moods.includes(input.mood)?input.mood:'ambient';
 const prompt=String(input.prompt||'Peaceful original instrumental music').trim().slice(0,1500);
 if(prompt.length<4)throw Error('Enter a music description.');
 const title=String(input.title||'Untitled composition').trim().slice(0,120);
 const job={id,createdAt:date,updatedAt:date,status:'queued',progress:0,stage:'In queue',tracks:[],durationSec,versions:takes,mood,prompt,title};
 jobs.set(id,job);
 enqueue(async()=>{
  job.status='running';job.stage='Preparing unique compositions';job.updatedAt=new Date().toISOString();
  try{
   for(let i=0;i<takes;i++){
    const uid=crypto.randomUUID();
    // Secure random seeds with checks against saved composition seeds.
    let seed=crypto.randomInt(1,2147483647);
    while(library.some(x=>x.seed===seed))seed=crypto.randomInt(1,2147483647);
    const name=(title||'New composition')+(takes>1?' · Take '+(i+1):'');
    const composed=await compose({
     outputBase:path.join(trackDir,uid),durationSec,prompt,mood,seed
    },p=>{
     job.progress=Math.min(99,Math.round(((i+p/100)/takes)*100));
     job.stage='Composing take '+(i+1)+' of '+takes;
     job.updatedAt=new Date().toISOString();
    });
    const bytes=fs.readFileSync(composed.file);
    const track={id:uid,title:name,prompt,mood,durationSec,seed,format:composed.format,
     sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
     fileName:path.basename(composed.file),createdAt:new Date().toISOString()};
    if(library.some(x=>x.sha256===track.sha256))throw Error('Exact audio duplicate detected; please regenerate.');
    library.unshift(track);await save();job.tracks.push(track);
   }
   job.status='completed';job.progress=100;job.stage='Tracks ready';
  }catch(e){job.status='failed';job.error=String(e.message||e).slice(0,300);job.stage='Generation failed';}
  job.updatedAt=new Date().toISOString();
 });
 return job;
}
const typeMap={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
function serveStatic(req,res,pathname){
 const relative=pathname==='/'?'index.html':decodeURIComponent(pathname.slice(1));
 const target=path.resolve(pub,relative);
 if(!target.startsWith(pub+path.sep))return fail(res,403,'Forbidden');
 fs.stat(target,(e,s)=>{
  if(e||!s.isFile())return fail(res,404,'Not found');
  const ext=path.extname(target).toLowerCase();
  res.writeHead(200,{'Content-Type':typeMap[ext]||'application/octet-stream','Content-Length':s.size});
  if(req.method==='HEAD')return res.end();
  fs.createReadStream(target).pipe(res);
 });
}
const handler=async(req,res)=>{
 try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(req.method==='GET'&&pathname==='/api/status')return json(res,200,{name:'Museflow Studio',engine:'Original procedural synthesis',ffmpeg:ffmpegAvailable(),durations:[30,60,120,300,600,900,1800],catalogSize:catalog.length});
  if(req.method==='GET'&&pathname==='/api/catalog')return json(res,200,{tracks:catalog,licence:'/MUSIC_LICENSE.txt'});
  if(req.method==='GET'&&pathname==='/api/library')return json(res,200,{tracks:library});
  if(req.method==='POST'&&pathname==='/api/generate'){
   const payload=await bodyJSON(req);
   const job=createJob(payload);return json(res,202,{jobId:job.id,status:job.status});
  }
  const jobMatch=/^\/api\/jobs\/([0-9a-f-]{36})$/.exec(pathname);
  if(req.method==='GET'&&jobMatch){
   const job=jobs.get(jobMatch[1]);return job?json(res,200,job):fail(res,404,'Job not found');
  }
  const trackMatch=/^\/api\/tracks\/([0-9a-f-]{36})\/audio$/.exec(pathname);
  if(['GET','HEAD'].includes(req.method)&&trackMatch){
   const t=library.find(x=>x.id===trackMatch[1]);
   return t?audioResponse(req,res,path.join(trackDir,t.fileName)):fail(res,404,'Track not found');
  }
  const catalogMatch=/^\/api\/catalog\/([a-z0-9-]+)\/audio$/.exec(pathname);
  if(['GET','HEAD'].includes(req.method)&&catalogMatch){
   const t=lookup.get(catalogMatch[1]);if(!t)return fail(res,404,'Catalog track not found');
   const file=await ensureCatalog(t);return audioResponse(req,res,file);
  }
  if(req.method==='GET'||req.method==='HEAD')return serveStatic(req,res,pathname);
  return fail(res,404,'Not found');
 }catch(e){return fail(res,400,String(e.message||e).slice(0,300));}
};
const server=http.createServer((req,res)=>{handler(req,res).catch(e=>fail(res,500,String(e.message||e)));});
if(require.main===module){
 const PORT=Number(process.env.PORT)||4173,HOST=process.env.HOST||'127.0.0.1';
 server.listen(PORT,HOST,()=>console.log('Museflow Studio: http://'+HOST+':'+PORT));
}
module.exports={server,handler,catalog,createJob};
