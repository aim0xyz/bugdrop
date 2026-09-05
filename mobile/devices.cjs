const {execFile,spawn}=require('node:child_process');
const {promisify}=require('node:util');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const runFile=promisify(execFile);
function adbPath(){
 const candidates=[process.env.BUGDROP_ADB,process.env.ANDROID_HOME&&path.join(process.env.ANDROID_HOME,'platform-tools',process.platform==='win32'?'adb.exe':'adb'),process.env.ANDROID_SDK_ROOT&&path.join(process.env.ANDROID_SDK_ROOT,'platform-tools',process.platform==='win32'?'adb.exe':'adb'),path.join(os.homedir(),'Library/Android/sdk/platform-tools/adb'),path.join(os.homedir(),'Android/Sdk/platform-tools/adb')].filter(Boolean);
 return candidates.find(p=>fs.existsSync(p))||'adb';
}
async function run(exe,args,options={}) {return (await runFile(exe,args,{timeout:15000,maxBuffer:16*1024*1024,...options})).stdout;}
function parseAndroid(text){return text.split('\n').slice(1).map(line=>line.trim().split(/\s+/)).filter(parts=>parts[1]==='device'&&parts[0].startsWith('emulator-')).map(parts=>({platform:'android',id:parts[0],name:(parts.find(x=>x.startsWith('model:'))||parts[0]).replace('model:','').replaceAll('_',' '),state:'Booted'}));}
function parseIOS(text){return Object.entries(JSON.parse(text).devices||{}).filter(([runtime])=>runtime.includes('.iOS-')).flatMap(([runtime,devices])=>devices.filter(d=>d.state==='Booted'&&d.isAvailable).map(d=>({platform:'ios',id:d.udid,name:d.name,state:d.state,runtime:runtime.split('SimRuntime.')[1]})));}
async function discover(){
 const devices=[],warnings=[];
 if(process.platform==='darwin'){try{devices.push(...parseIOS(await run('xcrun',['simctl','list','devices','booted','--json'])));}catch{warnings.push('iOS unavailable: install/select Xcode and start an iOS Simulator.');}}
 try{devices.push(...parseAndroid(await run(adbPath(),['devices','-l'])));}catch{warnings.push('Android unavailable: install Android platform-tools, or set BUGDROP_ADB to adb.');}
 return {devices,warnings};
}
function selectDevice(devices,platform,id){const matches=devices.filter(d=>d.platform===platform&&(!id||d.id===id));if(matches.length!==1)throw new Error(matches.length?'Multiple devices are running; specify --device with an exact ID.':'No matching booted simulator/emulator. Run bugdrop devices.');return matches[0];}
const validProcess=value=>typeof value==='string'&&/^[a-zA-Z0-9_. -]{1,100}$/.test(value);
const validPackage=value=>typeof value==='string'&&/^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)+$/.test(value);
async function logSpec(device,options){
 if(device.platform==='ios'){
  if(!validProcess(options.process))throw new Error('iOS requires --process with the running app executable name (not its bundle ID).');
  return {exe:'xcrun',args:['simctl','spawn',device.id,'log','stream','--style','compact','--timeout','3m','--level','debug','--predicate',`process == "${options.process}"`],scope:options.process};
 }
 if(!validPackage(options.package))throw new Error('Android requires --package with the running application ID.');
 const pid=(await run(adbPath(),['-s',device.id,'shell','pidof','-s',options.package])).trim();
 if(!/^\d+$/.test(pid))throw new Error('The Android app is not running. Launch it before recording.');
 return {exe:adbPath(),args:['-s',device.id,'logcat','--pid='+pid,'-v','threadtime','-T','1'],scope:options.package,pid};
}
async function screenshot(device,destination){
 if(device.platform==='ios')await run('xcrun',['simctl','io',device.id,'screenshot','--type=png',destination]);
 else {const png=await run(adbPath(),['-s',device.id,'exec-out','screencap','-p'],{encoding:'buffer'});if(!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Emulator did not return a PNG screenshot.');fs.writeFileSync(destination,png,{mode:0o600});}
}
function child(exe,args){const proc=spawn(exe,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});let error=null;const ended=new Promise(resolve=>{proc.once('error',e=>{error=e;resolve({code:null,error:e.message});});proc.once('close',(code,signal)=>resolve({code,signal,error:error?.message}));});return {proc,ended};}
async function terminate(job,signal='SIGTERM'){
 if(job.proc.exitCode===null&&!job.proc.signalCode)job.proc.kill(signal);
 let timer;const result=await Promise.race([job.ended,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),6000);})]);clearTimeout(timer);
 if(result)return result;job.proc.kill('SIGKILL');job.proc.stdout?.destroy();job.proc.stderr?.destroy();return {code:null,error:'Process did not finish within the shutdown timeout.'};
}
module.exports={adbPath,run,parseAndroid,parseIOS,discover,selectDevice,validProcess,validPackage,logSpec,screenshot,child,terminate};
