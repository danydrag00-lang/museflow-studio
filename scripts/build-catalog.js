#!/usr/bin/env node
/* Regenerate the 35 original instrumental MP3s directly from source. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {compose,ffmpegAvailable}=require('../ambient-engine');
const base=path.resolve(__dirname,'..');
const out=path.join(base,'public','catalog-audio');
fs.mkdirSync(out,{recursive:true});
const categories=[
 ['sleep','Deep sleep','Warm restful synth pads, delicate slow nighttime melody',['Velvet Midnight','Moonlit Breathing','Slow Aurora','Quiet Horizon','Silken Night']],
 ['spa','Spa','Airy bell-like melody and peaceful spa meditation pads',['Bamboo Light','Jade Water Garden','Stillness Ritual','Dawn Sanctuary','Lotus Mist']],
 ['rain','Rain textures','Synthetic gentle rain textures with distant harmonies',['Window Rain','Soft Coastal Storm','Midnight Drizzle','Rain on Glass','Distant Clouds']],
 ['lofi','Lo-fi','Mellow lo-fi drums, warm keys, soft late night beat',['After Hours Study','Sunday Notebook','Coffee and Clouds','Loft Lights','Warm Tape']],
 ['piano','Piano-inspired','Gentle keyboard-inspired melodic phrases and emotional chords',['Letters at Dawn','Golden Keys','Early Spring','Quiet Reflections','Falling Starlight']],
 ['cinematic','Cinematic','Hopeful cinematic ambient harmony and spacious pulses',['First Light Rising','Northern Skies','A Moment Beyond','Open Roads','Silver Horizon']],
 ['ambient','Ambient','Atmospheric evolving floating chords, spacious and restful',['Deep Blue Space','Floating Islands','The Haze Between','Soft Orbit','Ethereal Fields']]
];
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
async function main(){
 if(!ffmpegAvailable())throw Error('Install FFmpeg before building the bundled MP3 library');
 let count=0;
 for(const [g,[mood,label,description,names]] of categories.entries()){
  for(const [i,title] of names.entries()){
   count++;
   const id=mood+'-'+slug(title);
   const baseFile=path.join(out,id),mp3=baseFile+'.mp3';
   if(fs.existsSync(mp3)){console.log('Already built '+id);continue;}
   const durationSec=45+i*5,seed=400001+g*122081+i*19991;
   console.log('Rendering '+count+'/35 '+title+' ('+durationSec+'s)');
   await compose({outputBase:baseFile,durationSec,mood,prompt:description+'. '+title+'. Create an instrumental original composition.',seed});
  }
 }
 console.log('Finished: '+count+' royalty-free project instrumentals.');
}
main().catch(err=>{console.error(err);process.exitCode=1;});
