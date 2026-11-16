#!/usr/bin/env node
'use strict';
/* Dependency-free prototype server. Server-authoritative simulation + SSE.
   Run: node server.js. See README.md before making it publicly accessible. */
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const E=require('./public/engine.js');
const HOST=process.env.HOST||'127.0.0.1';
const PORT=Number(process.env.PORT||3000);
const DATA_DIR=process.env.DATA_DIR||path.join(__dirname,'data');
const DATA_FILE=path.join(DATA_DIR,'pilots.json');
const MAX_ROOMS=64,MAX_PILOTS=10000,MAX_BODY=32768;
const pilots=new Map(),rooms=new Map(),membership=new Map(),rate=new Map();
const publicFiles=new Map([
  ['/', ['index.html','text/html; charset=utf-8']],
  ['/index.html',['index.html','text/html; charset=utf-8']],
  ['/style.css',['style.css','text/css; charset=utf-8']],
  ['/engine.js',['engine.js','text/javascript; charset=utf-8']],
  ['/app.js',['app.js','text/javascript; charset=utf-8']]
]);
fs.mkdirSync(DATA_DIR,{recursive:true});
try{
  const saved=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
  if(Array.isArray(saved))for(const p of saved.slice(0,MAX_PILOTS))
    if(p&&typeof p.token==='string'&&typeof p.id==='string')pilots.set(p.token,{...p,robot:E.normalizeConfig(p.robot)});
}catch(err){if(err.code!=='ENOENT')console.warn('Could not read the pilot file. Starting with no saved pilots.');}
function persist(){
  const temp=DATA_FILE+'.tmp';
  fs.writeFileSync(temp,JSON.stringify([...pilots.values()]),{mode:0o600});fs.renameSync(temp,DATA_FILE);
}
function problem(status,message){const e=new Error(message);e.status=status;return e;}
function send(res,status,data){
  if(res.writableEnded)return;
  const body=JSON.stringify(data);
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);
}
function session(req){
  const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('la_session='))?.slice(11);
  return token?pilots.get(token):null;
}
function requirePilot(req){const p=session(req);if(!p)throw problem(401,'Create your pilot identity first.');return p;}
function publicPilot(p){return {id:p.id,alias:p.alias,robot:p.robot};}
function roomMode(raw='ffa'){try{E.modeInfo(raw);return raw;}catch(_){throw problem(400,'Unknown battle mode.');}}
function capacity(r){return E.modeInfo(r.mode||'ffa').count||E.MAX_BOTS;}
function readyRoom(r){const required=E.modeInfo(r.mode||'ffa').count;return required?r.players.length===required:r.players.length>=2;}
function publicRoom(r){return {code:r.code,host:r.host,status:r.status,seed:r.seed,mode:r.mode||'ffa',capacity:capacity(r),players:r.players.map((p,i)=>({id:p.id,alias:p.alias,robot:p.robot,team:E.teamForSlot(i,r.mode||'ffa'),left:!!p.left}))};}
function requireRoom(code,p){const r=rooms.get(code);if(!r)throw problem(404,'The room does not exist or has expired.');if(!r.players.some(x=>x.id===p.id))throw problem(403,'You are not a member of this room.');return r;}
function roomFor(p){const code=membership.get(p.id);return code?rooms.get(code):null;}
function assertFree(p){if(roomFor(p))throw problem(409,'Leave your current room first.');}
function emit(res,data){if(res.destroyed||res.writableEnded)return;const ok=res.write('data: '+JSON.stringify(data)+'\n\n');if(!ok&&res.writableLength>256*1024)res.destroy();}
function broadcast(r,data){for(const c of r.clients)emit(c.res,data);}
function broadcastRoom(r){broadcast(r,{type:'room',room:publicRoom(r)});}
function snapshot(r){broadcast(r,{type:'state',room:publicRoom(r),state:r.match});}
function closeRoom(r){
  broadcast(r,{type:'closed'});
  for(const c of r.clients)c.res.end();
  for(const p of r.players)if(membership.get(p.id)===r.code)membership.delete(p.id);
  rooms.delete(r.code);
}
function roomCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(const n of crypto.randomBytes(6))s+=chars[n%chars.length];return s;}
async function readBody(req){
  if(!(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))throw problem(415,'JSON is required.');
  let bytes=0,parts=[];
  for await(const chunk of req){bytes+=chunk.length;if(bytes>MAX_BODY)throw problem(413,'The request is too large.');parts.push(chunk);}
  try{return JSON.parse(Buffer.concat(parts).toString('utf8')||'{}');}catch(_){throw problem(400,'Invalid JSON.');}
}
function checkRequest(req){
  if(req.method==='GET')return;
  if(req.method!=='POST')throw problem(405,'Method not allowed.');
  const origin=req.headers.origin;
  if(origin){let host;try{host=new URL(origin).host;}catch(_){throw problem(403,'Origin not allowed.');}
    if(host!==req.headers.host)throw problem(403,'Origin not allowed.');}
  if(req.headers['sec-fetch-site']==='cross-site')throw problem(403,'Origin not allowed.');
}
function checkRate(req){
  const ip=req.socket.remoteAddress||'unknown',now=Date.now();let limit=rate.get(ip);
  if(!limit||now-limit.start>60000){limit={start:now,count:0};rate.set(ip,limit);}
  limit.count++;if(limit.count>160)throw problem(429,'Too many requests. Try again in one minute.');
}
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('X-Frame-Options','DENY');
  try{
    const url=new URL(req.url,'http://localhost'),pathname=url.pathname;
    if(req.method==='GET'&&publicFiles.has(pathname)){
      const [file,type]=publicFiles.get(pathname);res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache',
        'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; object-src 'none'"});
      fs.createReadStream(path.join(__dirname,'public',file)).pipe(res);return;
    }
    if(req.method==='GET'&&pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
    if(!pathname.startsWith('/api/'))throw problem(404,'Resource not found.');
    checkRequest(req);checkRate(req);
    if(req.method==='GET'&&pathname==='/api/health'){send(res,200,{app:'cspire-arena',version:E.VERSION});return;}
    if(req.method==='GET'&&pathname==='/api/me'){
      const p=session(req),r=p?roomFor(p):null;send(res,200,{pilot:p?publicPilot(p):null,room:r?publicRoom(r):null});return;
    }
    if(req.method==='POST'&&pathname==='/api/session'){
      const data=await readBody(req);let p=session(req);
      if(p&&roomFor(p))throw problem(409,'You cannot change your robot while you are in a room.');
      const alias=String(data.alias||'Pilot').replace(/[<>\x00-\x1f]/g,'').trim().slice(0,24)||'Pilot';
      if(!p){if(pilots.size>=MAX_PILOTS)throw problem(503,'Pilot limit reached.');p={id:crypto.randomUUID(),token:crypto.randomBytes(32).toString('hex'),alias,robot:E.normalizeConfig(data.robot)};pilots.set(p.token,p);}
      else{p.alias=alias;p.robot=E.normalizeConfig(data.robot);}
      persist();res.setHeader('Set-Cookie',`la_session=${p.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${process.env.COOKIE_SECURE==='1'?'; Secure':''}`);
      send(res,200,{pilot:publicPilot(p)});return;
    }
    if(req.method==='POST'&&pathname==='/api/rooms'){
      const p=requirePilot(req),data=await readBody(req);assertFree(p);const battleMode=roomMode(data.mode??'ffa');
      if(rooms.size>=MAX_ROOMS)throw problem(503,'The server is full. Try again later.');
      let code;do{code=roomCode();}while(rooms.has(code));
      const r={code,mode:battleMode,host:p.id,players:[{id:p.id,alias:p.alias,robot:structuredClone(p.robot)}],status:'waiting',seed:crypto.randomInt(1,1000000),created:Date.now(),updated:Date.now(),clients:new Set(),match:null,accumulator:0};
      rooms.set(code,r);membership.set(p.id,code);send(res,201,{room:publicRoom(r)});return;
    }
    const match=/^\/api\/rooms\/([A-Z2-9]{6})\/(join|events|start|leave|settings)$/.exec(pathname);
    if(!match)throw problem(404,'Route not found.');
    const [,code,action]=match,p=requirePilot(req);
    if(action==='join'&&req.method==='POST'){
      await readBody(req);assertFree(p);const r=rooms.get(code);if(!r)throw problem(404,'No room exists with that code.');
      if(r.players.length>=capacity(r)||!['waiting','ready'].includes(r.status))throw problem(409,'The room is full or the battle has already started.');
      r.players.push({id:p.id,alias:p.alias,robot:structuredClone(p.robot)});r.status=readyRoom(r)?'ready':'waiting';r.updated=Date.now();membership.set(p.id,r.code);
      broadcastRoom(r);send(res,200,{room:publicRoom(r)});return;
    }
    const r=requireRoom(code,p);
    if(action==='settings'&&req.method==='POST'){
      const data=await readBody(req);
      if(r.host!==p.id)throw problem(403,'Only the host can change the battle mode.');
      if(!['waiting','ready'].includes(r.status))throw problem(409,'Battle settings are locked after the match starts.');
      const selected=roomMode(data.mode),m=E.modeInfo(selected);
      if(m.count&&r.players.length>m.count)throw problem(409,'This mode has fewer seats than the current roster.');
      r.mode=selected;r.status=readyRoom(r)?'ready':'waiting';r.updated=Date.now();
      broadcastRoom(r);send(res,200,{room:publicRoom(r)});return;
    }
    if(action==='events'&&req.method==='GET'){
      // One stream per identity per room. A reconnect replaces the old stream.
      for(const old of r.clients)if(old.pilotId===p.id){old.res.end();r.clients.delete(old);}
      res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
      res.write('retry: 1800\n\n');const client={res,pilotId:p.id};r.clients.add(client);
      emit(res,{type:'room',room:publicRoom(r)});if(r.match)emit(res,{type:'state',room:publicRoom(r),state:r.match});
      req.on('close',()=>r.clients.delete(client));return;
    }
    if(action==='start'&&req.method==='POST'){
      await readBody(req);if(r.host!==p.id)throw problem(403,'Only the host can start the battle.');
      if(r.status!=='ready'||!readyRoom(r)||r.players.length>capacity(r))throw problem(409,E.modeInfo(r.mode).count?'This team mode requires exactly '+capacity(r)+' ready players.':'Two to eight ready robots are required.');
      r.seed=crypto.randomInt(1,1000000);
      r.match=E.createBattle(E.uniqueRobotConfigs(r.players.map(p=>p.robot)),r.seed,r.mode);r.match.countdownTicks=Math.round(E.START_COUNTDOWN_SECONDS/E.STEP);r.status='running';r.updated=Date.now();r.accumulator=0;
      snapshot(r);send(res,200,{room:publicRoom(r)});return;
    }
    if(action==='leave'&&req.method==='POST'){
      await readBody(req);
      if(r.status==='running'){
        const index=r.players.findIndex(x=>x.id===p.id),bot=r.match.robots[index];
        if(bot.alive){bot.alive=false;bot.eliminatedAt=r.match.time;bot.reason='Forfeit';
          r.match.events.push({id:++r.match.eventCounter,t:r.match.time,type:'out',text:bot.config.name+': forfeited',x:bot.x,y:bot.y});}
        r.players[index].left=true;E.finishIfNeeded(r.match);
        if(r.match.status==='finished')r.status='finished';r.updated=Date.now();snapshot(r);
      }
      membership.delete(p.id);
      for(const c of [...r.clients])if(c.pilotId===p.id){c.res.end();r.clients.delete(c);}
      if(r.status==='waiting'||r.status==='ready'){
        r.players=r.players.filter(x=>x.id!==p.id);
        if(!r.players.length)closeRoom(r);
        else {if(r.host===p.id)r.host=r.players[0].id;r.status=readyRoom(r)?'ready':'waiting';r.updated=Date.now();broadcastRoom(r);}
      }else if(r.players.every(x=>membership.get(x.id)!==r.code))closeRoom(r);
      send(res,200,{ok:true});return;
    }
    throw problem(405,'Method not allowed.');
  }catch(err){
    if(err.status)send(res,err.status,{error:err.message});
    else{console.error(err);send(res,500,{error:'Internal server error.'});}
  }
});
server.requestTimeout=15000;server.headersTimeout=10000;
let previous=performance.now();
const ticker=setInterval(()=>{
  const now=performance.now(),delta=Math.min((now-previous)/1000,.2);previous=now;
  for(const r of rooms.values()){
    if(r.status!=='running')continue;
    r.accumulator+=delta;
    let publish=false;
    while(r.accumulator>=E.STEP&&r.match.status==='running'){
      if(r.match.countdownTicks>0){r.match.countdownTicks--;if(r.match.countdownTicks%4===0)publish=true;}
      else {E.step(r.match);if(r.match.tick%4===0)publish=true;}
      r.accumulator-=E.STEP;
    }
    if(r.match.status==='finished'){r.status='finished';r.updated=Date.now();publish=true;}
    if(publish)snapshot(r);
  }
},1000/60);
const janitor=setInterval(()=>{
  const now=Date.now();for(const [ip,v]of rate)if(now-v.start>120000)rate.delete(ip);
  for(const r of rooms.values()){
    if(r.status!=='running'&&now-r.updated>30*60000){closeRoom(r);continue;}
    for(const c of r.clients)if(!c.res.destroyed)c.res.write(': keepalive\n\n');
  }
},15000);
server.listen(PORT,HOST,()=>{
  const address=server.address();console.log(`CSPIRE//ARENA ${E.VERSION}\nOpen http://${HOST==='0.0.0.0'?'localhost':HOST}:${address.port}\nOne robot per identity. Press Ctrl+C to stop.`);
});
server.on('error',err=>{console.error('Could not start:',err.message);clearInterval(ticker);clearInterval(janitor);process.exit(1);});
function shutdown(){clearInterval(ticker);clearInterval(janitor);for(const r of [...rooms.values()])closeRoom(r);server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1500).unref();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
