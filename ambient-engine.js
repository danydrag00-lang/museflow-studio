'use strict';
/**
 * Museflow procedural audio composer. It uses no third-party samples.
 * This is algorithmic synthesis, not a neural music model.
 */
const fs = require('node:fs');
const { spawn, spawnSync } = require('node:child_process');
const RATE = 22050;
const TWO_PI = Math.PI * 2;
const clamp = (x,a,b)=>Math.max(a,Math.min(b,x));
const fract = x=>x-Math.floor(x);
const hash = x=>fract(Math.sin(x*127.1+311.7)*43758.5453);
const hz = midi=>440*Math.pow(2,(midi-69)/12);
const ffmpegAvailable = ()=>{
  try{return spawnSync('ffmpeg',['-version'],{stdio:'ignore',timeout:2500}).status===0;}
  catch{return false;}
};
const moods = ['sleep','spa','rain','lofi','piano','cinematic','ambient'];
function inferMood(prompt='',chosen='auto'){
  if(moods.includes(chosen))return chosen;
  const s=String(prompt).toLowerCase();
  if(/rain|storm|thunder|water|ocean/.test(s))return 'rain';
  if(/spa|flute|bansuri|zen|krishna/.test(s))return 'spa';
  if(/lo.?fi|beat|jazz|study/.test(s))return 'lofi';
  if(/piano|classical|keys/.test(s))return 'piano';
  if(/cinematic|epic|film/.test(s))return 'cinematic';
  if(/sleep|dream|relax/.test(s))return 'sleep';
  return 'ambient';
}
const progressions=[[0,5,3,4],[0,3,5,4],[0,5,4,3],[0,4,5,3],[5,3,0,4],[0,2,5,4],[0,3,4,5],[0,4,3,5]];
async function compose({outputBase,durationSec=60,prompt='',mood='auto',seed=1},onProgress=()=>{},isCanceled=()=>false){
  const seconds=Math.round(clamp(Number(durationSec)||60,10,1800));
  const frames=seconds*RATE;
  const palette=inferMood(prompt,mood);
  const hasEncoder=ffmpegAvailable();
  const filename=outputBase+(hasEncoder?'.mp3':'.wav');
  let child=null, stream=null, destination;
  if(hasEncoder){
    child=spawn('ffmpeg',['-hide_banner','-loglevel','error','-f','s16le','-ar',String(RATE),'-ac','2','-i','pipe:0','-c:a','libmp3lame','-b:a','160k','-y',filename],{stdio:['pipe','ignore','pipe']});
    destination=child.stdin;
  }else{
    stream=fs.createWriteStream(filename);
    destination=stream;
    const b=Buffer.alloc(44);
    b.write('RIFF',0);b.writeUInt32LE(36+frames*4,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);
    b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(RATE,24);
    b.writeUInt32LE(RATE*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);
    b.write('data',36);b.writeUInt32LE(frames*4,40);
    destination.write(b);
  }
  const root=[0,2,4,5,7,9,11][Math.floor(hash(seed+15)*7)];
  const baseProg=Math.floor(hash(seed*0.91)*8);
  const tempo=palette==='lofi'?76:palette==='cinematic'?86:62;
  const chordLen=palette==='lofi'?60/tempo*4:palette==='cinematic'?7.5:11.5;
  const noteLen=palette==='lofi'?60/tempo:palette==='cinematic'?1.25:2.25;
  const scale=[0,2,4,7,9,12,14,16];
  let smoothNoise=0,deepNoise=0;
  const CHUNK=8192;
  try{
    for(let pos=0;pos<frames;pos+=CHUNK){
      if(isCanceled())throw Error('Generation cancelled');
      const size=Math.min(CHUNK,frames-pos);
      const pcm=Buffer.allocUnsafe(size*4);
      for(let i=0;i<size;i++){
        const idx=pos+i,t=idx/RATE;
        const chordPos=t/chordLen,unit=Math.floor(chordPos),phase=chordPos-unit;
        // New harmonic choices every 16 bars and new motifs every 64 note steps:
        // long-form compositions change with time instead of looping one clip.
        const section=Math.floor(unit/16);
        const nsection=Math.floor((unit+1)/16);
        const seq=progressions[(baseProg+section+Math.floor(hash(seed+section*51)*3))%8];
        const seq2=progressions[(baseProg+nsection+Math.floor(hash(seed+nsection*51)*3))%8];
        const chord=seq[unit%4],chord2=seq2[(unit+1)%4];
        const fade=Math.pow(clamp((phase-.85)/.15,0,1),1.4);
        let pad=0;
        for(let v=0;v<3;v++){
          const sem=[0,4,7][v];
          const fa=hz(45+root+chord+sem),fb=hz(45+root+chord2+sem);
          const wa=Math.sin(TWO_PI*fa*t+v)+.12*Math.sin(TWO_PI*fa*2*t);
          const wb=Math.sin(TWO_PI*fb*t+v)+.12*Math.sin(TWO_PI*fb*2*t);
          pad+=(wa*(1-fade)+wb*fade)*(v===0?.26:.18);
        }
        pad*= (palette==='rain'?.29:palette==='lofi'?.43:.57)*(.82+.18*Math.sin(t/50+seed));
        const step=Math.floor(t/noteLen),local=t-step*noteLen;
        const motifSection=Math.floor(step/64);
        const motif=hash((step%16)*17.1+seed*3.7+motifSection*43);
        let lead=0;
        const density=palette==='sleep'?.31:palette==='rain'?.27:palette==='lofi'?.62:.52;
        if(motif<density){
          const pitch=scale[Math.floor(hash((step%16)*41+seed+motifSection*23)*scale.length)];
          const f=hz((palette==='spa'?72:palette==='sleep'?65:69)+root+pitch);
          const env=(1-Math.exp(-local*22))*Math.exp(-local*(palette==='sleep'?1:1.7));
          const color=Math.sin(TWO_PI*f*local)+.16*Math.sin(TWO_PI*f*2*local);
          lead=color*env*(palette==='sleep'?.055:palette==='spa'?.13:.10);
        }
        const white=hash(idx*1.331+seed*100)*2-1;
        smoothNoise=.994*smoothNoise+.006*white;
        deepNoise=.997*deepNoise+.003*white;
        let texture=0;
        if(palette==='rain')texture=white*.024+smoothNoise*.45+deepNoise*.28;
        else if(['sleep','spa','ambient'].includes(palette))texture=(smoothNoise*.18+deepNoise*.22)*.12;
        else if(palette==='lofi')texture=white*.006;
        let percussion=0;
        if(palette==='lofi'){
          const beats=t*tempo/60, b=Math.floor(beats),f=beats-b;
          if(b%4===0&&f<.25)percussion+=.2*Math.sin(TWO_PI*60*(t-b*60/tempo))*Math.exp(-f*24);
          if(b%4===2&&f<.25)percussion+=white*.065*Math.exp(-f*25);
        }
        const fadeInOut=clamp(Math.min(1,t/3,(seconds-t)/4),0,1);
        const sum=Math.tanh((pad+lead+texture+percussion)*fadeInOut*1.17)*.87;
        const side=pad*.012*Math.sin(TWO_PI*.17*t);
        pcm.writeInt16LE(Math.round(clamp(sum+side,-1,1)*32760),i*4);
        pcm.writeInt16LE(Math.round(clamp(sum-side,-1,1)*32760),i*4+2);
      }
      if(!destination.write(pcm))await new Promise((resolve,reject)=>{
        destination.once('drain',resolve);destination.once('error',reject);
      });
      if(pos%(CHUNK*12)===0)onProgress(Math.round(pos/frames*100));
      await new Promise(resolve=>setImmediate(resolve));
    }
    destination.end();
    if(child){
      const status=await new Promise((resolve,reject)=>{
        child.on('error',reject);child.on('close',resolve);
      });
      if(status!==0)throw Error('MP3 encoder failed (FFmpeg exited '+status+')');
    }else{
      await new Promise((resolve,reject)=>{stream.on('finish',resolve);stream.on('error',reject);});
    }
    onProgress(100);
    return {file:filename,format:hasEncoder?'mp3':'wav',durationSec:seconds,mood:palette,seed};
  }catch(err){
    if(child){child.stdin.destroy();child.kill();}
    if(stream)stream.destroy();
    try{fs.unlinkSync(filename);}catch{}
    throw err;
  }
}
module.exports={compose,ffmpegAvailable,inferMood,moods};
