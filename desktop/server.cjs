const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {randomBytes}=require('node:crypto');
const {fork}=require('node:child_process');
const D=require('../mobile/devices.cjs');
const {apps}=require('../mobile/apps.cjs');
function createServer({root=path.join(os.homedir(),'BugDrop Captures'),discover=D.discover,listApps=apps}={}){
 const token=randomBytes(32).toString('hex');let current=null,proc=null,tail='',pending=false;const captures=new Map();
 const base=path.resolve(__dirname,'..');
 const server=http.createServer(async(req,res)=>{
  const origin='http://127.0.0.1:'+server.address().port;
  const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  if(req.headers.host!==new URL(origin).host)return send(403,{error:'Invalid host'});
  if(req.headers.origin&&req.headers.origin!==origin)return send(403,{error:'Foreign origin'});
  const url=new URL(req.url,origin);
  if(req.method==='GET'&&url.pathname==='/'){
   res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none'"});return res.end(fs.readFileSync(path.join(__dirname,'index.html'),'utf8').replace('__TOKEN__',token));
  }
  const staticFiles={'/app.js':path.join(__dirname,'app.js'),'/ui.css':path.join(base,'extension/ui.css'),'/desktop.css':path.join(__dirname,'desktop.css')};
  if(req.method==='GET'&&staticFiles[url.pathname]){res.writeHead(200,{'Content-Type':url.pathname.endsWith('.js')?'text/javascript':'text/css'});return res.end(fs.readFileSync(staticFiles[url.pathname]));}
  if(req.method==='GET'&&url.pathname.startsWith('/capture/')&&url.searchParams.get('key')===token){
   const parts=url.pathname.slice('/capture/'.length).split('/');
   const capture=captures.get(parts[0]);const name=parts[1];
   if(!capture||parts.length!==2)return send(404,{error:'Capture not found'});
   if(!/^(review\.html|screenshot-\d+\.png|recording\.mp4)$/.test(name))return send(404,{error:'Not found'});
   const file=path.join(capture.dir,name);if(!fs.existsSync(file))return send(404,{error:'Not ready'});
   const type=name.endsWith('.html')?'text/html':name.endsWith('.png')?'image/png':'video/mp4';res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Frame-Options':'DENY'});
   if(name==='review.html'){let html=fs.readFileSync(file,'utf8');html=html.replace("preview.src=artifact.name;",`preview.src=artifact.name+'?key=${token}';`);return res.end(html);}return fs.createReadStream(file).pipe(res);
  }
  if(req.headers['x-bugdrop-token']!==token)return send(403,{error:'Missing session token'});
  try{
   if(req.method==='GET'&&url.pathname==='/api/devices')return send(200,await discover());
   if(req.method==='GET'&&url.pathname==='/api/apps'){
    const {devices}=await discover();const device=devices.find(d=>d.id===url.searchParams.get('device'));if(!device)throw new Error('Device disconnected. Refresh devices.');return send(200,await listApps(device));
   }
   if(req.method==='GET'&&url.pathname==='/api/state')return send(200,{...current,output:tail,pending,review:current?.report?.endedAt?'/capture/'+current.report.id+'/review.html?key='+token:null});
   if(req.method!=='POST')return send(404,{error:'Not found'});
   let raw='';for await(const part of req){raw+=part;if(raw.length>8000)throw new Error('Request too large');}const data=JSON.parse(raw||'{}');
   if(url.pathname==='/api/start'){
    if(proc||pending)throw new Error('A capture is already running.');pending=true;
    try{
     const {devices}=await discover();const device=devices.find(d=>d.id===data.device);if(!device)throw new Error('Device disconnected.');
     const app=(await listApps(device)).find(a=>a.id===data.app);if(!app)throw new Error('Choose an installed app.');
     fs.mkdirSync(root,{recursive:true,mode:0o700});const dir=path.join(root,'capture-'+Date.now()+'-'+randomBytes(3).toString('hex'));
     const args=['record','--platform',device.platform,'--device',device.id,'--out',dir,device.platform==='ios'?'--process':'--package',device.platform==='ios'?app.process:app.id];if(data.video===true)args.push('--video');
     current={dir,recording:false,starting:true};tail='';
     proc=fork(path.join(base,'bin/bugdrop.cjs'),args,{silent:true});
     const child=proc;
     const log=b=>{tail=(tail+b.toString()).slice(-4000);};child.stdout.on('data',log);child.stderr.on('data',log);
     child.on('message',m=>{if(m.type==='state'){current={dir:m.dir,report:m.report,recording:m.recording,starting:false};if(m.report.endedAt)captures.set(m.report.id,{dir:m.dir});}});
     child.on('error',e=>{tail=e.message;});
     child.on('exit',code=>{if(proc===child){proc=null;current={...current,recording:false,starting:false,exitCode:code};}});
     return send(200,{ok:true});
    }finally{pending=false;}
   }
   if(url.pathname==='/api/stop'||url.pathname==='/api/screenshot'||url.pathname==='/api/note'){
    if(!proc?.connected||!current?.recording)throw new Error('No active capture.');
    const type=url.pathname.split('/').pop();proc.send({type,text:typeof data.text==='string'?data.text.slice(0,1600):''});return send(200,{ok:true});
   }
   return send(404,{error:'Not found'});
  }catch(e){return send(400,{error:e.message});}
 });
 return {server,token,close:()=>{if(proc?.connected)proc.disconnect();server.close();}};
}
if(require.main===module){const app=createServer();app.server.listen(Number(process.env.PORT||4318),'127.0.0.1',()=>console.log('BugDrop desktop: http://127.0.0.1:'+app.server.address().port));for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>app.close());}
module.exports={createServer};
