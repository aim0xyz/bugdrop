const D=require('./devices.cjs');
function parseApps(plist){return Object.entries(plist).map(([id,a])=>({id,name:a.CFBundleDisplayName||a.CFBundleName||id,process:a.CFBundleExecutable})).filter(a=>D.validProcess(a.process)).sort((a,b)=>a.name.localeCompare(b.name));}
async function apps(device){
 if(device.platform==='ios'){
  const plist=await D.run('xcrun',['simctl','listapps',device.id]);
  const {spawn}=require('node:child_process');
  const json=await new Promise((resolve,reject)=>{const p=spawn('plutil',['-convert','json','-o','-','-']);let out='',err='';const timer=setTimeout(()=>{p.kill();reject(new Error('App listing timed out.'));},10000);p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',e=>{clearTimeout(timer);reject(e)});p.on('close',code=>{clearTimeout(timer);code?reject(new Error(err)):resolve(out)});p.stdin.end(plist);});
  return parseApps(JSON.parse(json));
 }
 const text=await D.run(D.adbPath(),['-s',device.id,'shell','pm','list','packages','-3']);
 return text.split(/\r?\n/).map(s=>s.replace(/^package:/,'').trim()).filter(D.validPackage).sort().map(id=>({id,name:id}));
}
module.exports={apps,parseApps};
