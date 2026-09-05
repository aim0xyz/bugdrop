const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {adbPath,run,child,terminate}=require('./devices.cjs');
async function startVideo(device,destination){
 if(device.platform==='ios'){
  const job=child('xcrun',['simctl','io',device.id,'recordVideo','--codec=h264',destination]);
  let diagnostics='';job.proc.stderr.on('data',b=>{diagnostics=(diagnostics+b.toString()).slice(-2000);});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('iOS video did not start.')),15000);const check=()=>{if(diagnostics.includes('Recording started')){clearTimeout(timer);job.proc.stderr.off('data',check);resolve();}};job.proc.stderr.on('data',check);job.ended.then(r=>{clearTimeout(timer);reject(new Error(r.error||'Video exited before recording began.'));});}).catch(async e=>{await terminate(job,'SIGINT');throw e;});
  return {stop:async()=>{const r=await terminate(job,'SIGINT');if(r.error||!fs.existsSync(destination)||fs.statSync(destination).size<32)throw new Error('iOS video could not be finalized.');}};
 }
 // Only a generated filename enters the device shell. User strings are never shell code.
 const remote='/sdcard/bugdrop-'+randomUUID()+'.mp4';
 const job=child(adbPath(),['-s',device.id,'shell','sh','-c',`'echo $$; exec screenrecord --time-limit 180 ${remote}'`]);
 let stdout='';job.proc.stdout.on('data',b=>{stdout=(stdout+b.toString()).slice(0,200);});
 let pid;
 try{pid=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Android video did not start.')),8000);const check=()=>{const m=stdout.match(/^(\d+)\r?\n/);if(m){clearTimeout(timer);job.proc.stdout.off('data',check);resolve(m[1]);}};job.proc.stdout.on('data',check);job.ended.then(r=>{clearTimeout(timer);reject(new Error(r.error||'Android screenrecord unavailable.'));});});}
 catch(e){await terminate(job);throw e;}
 return {stop:async()=>{
  try {
   if(job.proc.exitCode===null&&!job.proc.signalCode){
    const command=await run(adbPath(),['-s',device.id,'shell','cat','/proc/'+pid+'/cmdline']).catch(()=> '');
    // Do not signal a reused PID or a screen recorder belonging to another session.
    if(command.includes('screenrecord')&&command.includes(remote))await run(adbPath(),['-s',device.id,'shell','kill','-2',pid]);
   }
   await terminateAfterGrace(job);
   await run(adbPath(),['-s',device.id,'pull',remote,destination]);
   if(!fs.existsSync(destination)||fs.statSync(destination).size<32)throw new Error('Android video could not be finalized.');
  }finally{await run(adbPath(),['-s',device.id,'shell','rm','-f',remote]).catch(()=>{});}
 }};
}
async function terminateAfterGrace(job){let timer;await Promise.race([job.ended,new Promise(r=>{timer=setTimeout(r,5000);})]);clearTimeout(timer);if(job.proc.exitCode===null&&!job.proc.signalCode)await terminate(job);}
module.exports={startVideo};
