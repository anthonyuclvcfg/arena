"""Portable Chromium regression for real wreck components and the final three-second reveal.
All observation hooks are inserted into an in-memory HTML copy, never production.
Run after node build.js; optional CHROMIUM_PATH selects the browser executable.
"""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
DIR=ROOT/'artifacts/finale-browser'
DIR.mkdir(parents=True,exist_ok=True)
checks,errors,timing=[],[],{}
needle='  initRoster();renderCatalog();newPreview();save();'
hook=r'''// Test-only observation in a temporary HTML copy, never shipped.
  window.__fqa={
    samples:[],phase:'',
    state:()=>state,
    gate:()=>finishPresentation&&({...finishPresentation,elapsed:performance.now()-finishPresentation.at}),
    inspect:()=>({now:performance.now(),gate:finishPresentation&&({...finishPresentation,elapsed:performance.now()-finishPresentation.at}),
      status:state.status,time:state.time,tick:state.tick,match:$('match-state').textContent,
      bannerHidden:$('arena-banner').classList.contains('hidden'),bannerText:$('arena-banner').innerText,
      resultHidden:$('results-panel').hidden,shortcutHidden:$('results-shortcut').hidden,
      startDisabled:$('start').disabled,replayDisabled:$('replay').disabled}),
    show:(s,local=true,queue=true)=>{
      clearResults();room=null;mode=local?'local':'online';state=s;onlineSlot=0;paused=true;countdown=0;
      accumulator=0;history=[];trails=Array.from({length:E.MAX_BOTS},()=>[]);lastEventId=-1;
      $('arena-banner').classList.add('hidden');if(s.status==='running')$('start').innerHTML='<span>□</span> Stop';applyLock();updateUI();if(queue)finish();
    },
    run:s=>{
      clearResults();room=null;mode='local';state=s;onlineSlot=0;paused=false;countdown=0;
      accumulator=0;history=[];trails=Array.from({length:E.MAX_BOTS},()=>[]);lastEventId=-1;
      $('arena-banner').classList.add('hidden');applyLock();
    },
    phaseStart:name=>{__fqa.phase=name;__fqa.samples=[];},
    repeat:()=>finish(),
    preview:()=>{room=null;mode='idle';paused=false;newPreview();applyLock();},
    leave:()=>resetOnline('QA left the room'),
    focus:()=>setPanels({builder:true,logic:true,...(typeof closedPanels.online==='boolean'?{online:true}:{})}),
    fragments:r=>chassisFragments(r.config.body,r.stats.radius),
    paint:()=>{
      __fqa.entries=[];__fqa.outside=[];__fqa.capture=true;
      try{drawArena(state,performance.now());}finally{__fqa.capture=false;}
      const oldStroke=ctx.strokeStyle;const colors=new Set(COLORS.map(c=>{ctx.strokeStyle=c+'88';return ctx.strokeStyle;}));ctx.strokeStyle=oldStroke;
      return {entries:__fqa.entries,debris:__fqa.outside.filter(p=>p.kind==='stroke'&&colors.has(p.color))};
    },
    benchmark:()=>{
      const times=[];for(let i=0;i<50;i++){const begin=performance.now();drawArena(state,begin);times.push(performance.now()-begin);}
      return times.sort((a,b)=>a-b);
    },
  };
  setInterval(()=>{if(__fqa.phase){__fqa.samples.push(__fqa.inspect());if(__fqa.samples.length>1000)__fqa.samples.shift();}},20);
  const qaMeasure=(name,r,fn)=>{
    if(!__fqa.capture)return fn();
    const before=__fqa.active,entry={name,id:r?.id,health:r?.health,broken:r?.broken,paints:[]};
    __fqa.entries.push(entry);__fqa.active=entry;
    try{return fn();}finally{__fqa.active=before;}
  };
  for(const key of ['stroke','fill','strokeRect','fillRect']){
    const original=CanvasRenderingContext2D.prototype[key];
    CanvasRenderingContext2D.prototype[key]=function(...args){
      if(__fqa.capture&&this.canvas.id==='arena'){
        const m=this.getTransform();
        (__fqa.active?__fqa.active.paints:__fqa.outside).push({args,kind:key,alpha:this.globalAlpha,color:key.startsWith('fill')?this.fillStyle:this.strokeStyle,lineWidth:this.lineWidth,matrix:[m.a,m.b,m.c,m.d,m.e,m.f]});
      }
      return original.apply(this,args);
    };
  }
  const qaRobotDrawing=robotDrawing,qaDestruction=drawDestruction,qaWreck=drawWreckTools,qaTool=drawTool;
  robotDrawing=(c,r,t,p)=>qaMeasure('body',r,()=>qaRobotDrawing(c,r,t,p));
  drawDestruction=(c,r,t)=>qaMeasure('destruction',r,()=>qaDestruction(c,r,t));
  drawWreckTools=(c,r,t)=>qaMeasure('wreck',r,()=>qaWreck(c,r,t));
  drawTool=(c,t,time,p)=>qaMeasure('tool',t,()=>qaTool(c,t,time,p));

  const qaExplosion=drawExplosion,qaChassis=drawChassisFragment;
  drawExplosion=(c,x,y,radius,born,age)=>qaMeasure('explosion',{id:born,health:age},()=>qaExplosion(c,x,y,radius,born,age));
  drawChassisFragment=(c,r,p,color)=>qaMeasure('chassis-piece',r,()=>qaChassis(c,r,p,color));
'''
fixtures=r'''// Deterministic browser-test fixtures. This file is never shipped with Arena.
(() => {
  const E = CSpireArena;
  const passive = {body:'capsule', motor:1, armor:1, tools:[], rules:[{when:'always', do:'brake'}]};
  const toolset = [
    {type:'saw', power:1, x:20, y:-12, angle:0},
    {type:'drill', power:1, x:20, y:12, angle:0},
    {type:'ram', power:1, x:-20, y:0, angle:180},
  ];
  function base(count=4) {
    const s = E.createBattle(Array.from({length:count}, (_,i) => ({...passive, name:['WRECK-01','SCAVENGER-02','SCAVENGER-03','OBSERVER-04'][i], tools:i===0?toolset:[]})), 60421);
    s.hazards=[]; s.pickups=[];
    [[400,360],[180,180],[620,180],[620,620]].forEach(([x,y],i) => {
      if(s.robots[i]) Object.assign(s.robots[i], {x,y,angle:0,vx:0,vy:0});
    });
    return s;
  }
  function knockOut(s, r=s.robots[0]) {
    r.health=.01;
    E.damageRobot(s,r,null,1,0,1,'QA impact');
    E.step(s);
    if(r.alive || !r.destruction) throw Error('Fixture KO did not go through the real engine');
    return s;
  }
  function wreck() {
    const s=base(),r=s.robots[0];
    r.tools[0].health=Math.min(11.75,r.tools[0].maxHealth*.2);
    r.tools[1].health=0; r.tools[1].broken=true;
    r.tools[2].health=r.tools[2].maxHealth*.625;
    knockOut(s);
    return s;
  }
  function advance(s, count) {for(let i=0;i<count;i++)E.step(s);return s;}
  function ringOut() {
    const s=base(),r=s.robots[0];
    Object.assign(r,{x:E.BOUNDS.max+.1,y:400,z:60,vx:5,vy:0});
    E.step(s);
    if(r.alive || !r.exit || r.destruction) throw Error('Fixture ring-out did not keep its original exit');
    return s;
  }
  function finalBullet(type="rocket") {
    const shooter={...passive,name:'LAST SHOT',tools:[{type,power:1,x:20,y:0}],rules:[{when:'always',do:'weapon'}]};
    const victim={...passive,name:'FINAL WRECK',tools:toolset};
    const s=E.createBattle([shooter,victim],60422);
    s.hazards=[];s.pickups=[];
    const [a,b]=s.robots;
    Object.assign(a,{x:150,y:400,angle:0,action:'weapon'});
    Object.assign(b,{x:340,y:400,angle:Math.PI,health:.01});
    b.parts.forEach(p=>{p.health=0;p.broken=true;});
    b.tools[0].health=Math.min(11.75,b.tools[0].maxHealth*.2);
    b.tools[1].health=0;b.tools[1].broken=true;
    E.resolveAttacks(s,E.collectAttacks(s,a));
    s.projectiles=s.projectiles.filter(p=>!p.queued&&!(p.delay>0)).slice(0,1);
    if(s.projectiles.length!==1)throw Error('No already-launched final bullet');
    s.time=E.MAX_SECONDS;E.damageComponent(s,b,b.tools[2],10000,'QA debris');
    b.x=620;s.tick=Math.round(E.MAX_SECONDS/E.STEP);
    E.finishIfNeeded(s);
    if(!s.pendingResult)throw Error('Final bullet did not enter settlement');
    return s;
  }
  window.__destructionFixtures={base,knockOut,wreck,advance,ringOut,finalBullet};
})();
'''

def check(name,value):
    assert value,name
    checks.append(name)


def html(path):
    source=path.read_text()
    assert source.count(needle)==1
    assert 'function pendingFinish()' in source and "kind:'wheel'" in source
    return source.replace(needle,hook+'\n'+needle,1)


def setup(browser,path,width=1560,height=1100):
    page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.set_content(html(path));page.wait_for_function('typeof __fqa === "object"')
    page.evaluate(fixtures);page.evaluate('__fqa.focus()');page.wait_for_timeout(650)
    return page


def scroll_field(page):
    page.evaluate('scrollTo({top:Math.max(0,document.getElementById("arena-panel").offsetTop-document.querySelector(".match-hud").getBoundingClientRect().height-8),behavior:"instant"})')


def wait_reveal(page,label):
    page.wait_for_function('!document.getElementById("results-panel").hidden',timeout=6000)
    page.wait_for_timeout(100)
    samples=page.evaluate('__fqa.samples')
    before=[s for s in samples if s['gate'] and s['gate']['elapsed']<3000]
    shown=[s for s in samples if s['gate'] and not s['resultHidden']]
    check(label+': no winner, table, shortcut or restart/replay access during the full three seconds', bool(before) and all(s['bannerHidden'] and s['resultHidden'] and s['shortcutHidden'] and s['startDisabled'] and s['replayDisabled'] for s in before))
    check(label+': result appears once after three seconds', bool(shown) and 3000<=shown[0]['gate']['elapsed']<3900 and all(not s['resultHidden'] for s in shown))
    timing[label]=round(shown[0]['gate']['elapsed'],1)


with sync_playwright() as p:
    options={'headless':True}
    if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
    browser=p.chromium.launch(**options)
    pages=[]
    try:
        page=setup(browser,ROOT/'cspire-arena.html');pages.append(page)
        # Real components, with original silhouette, artwork and wheels.
        page.evaluate('window.__wreck=__destructionFixtures.wreck();__destructionFixtures.advance(__wreck,18);__fqa.show(__wreck,true,false)')
        parts=page.evaluate('__fqa.fragments(__wreck.robots[0])')
        check('A KO breaks into four clipped chassis sections and the two original wheels',len(parts)==6 and sum(x['kind']=='chassis' for x in parts)==4 and sum(x['kind']=='wheel' for x in parts)==2 and {x['part'] for x in parts if x['kind']=='wheel'}=={'driveL','driveR'})
        paint=page.evaluate('__fqa.paint()')
        wheel_rects=[p for e in paint['entries'] if e['name']=='destruction' for p in e['paints'] if p['kind']=='strokeRect' and p['args']==[-9.5,-3.8,19,7.6]]
        check('The detached wheels draw their real dimensions and chassis uses its original artwork',len(wheel_rects)==2 and len([e for e in paint['entries'] if e['name']=='chassis-piece'])==4)
        check('Robot KO calls the same visible explosion renderer as rockets',any(e['name']=='explosion' and len(e['paints'])>=30 for e in paint['entries']))
        scroll_field(page);page.screenshot(path=str(DIR/'desktop-real-pieces.png'),full_page=False)

        # Actual local settlement ending in a rocket KO.
        page.evaluate('__fqa.phaseStart("local");window.__final=__destructionFixtures.finalBullet();__fqa.run(__final)')
        page.wait_for_function('__fqa.gate() && __fqa.state().status==="finished"',timeout=6000)
        final_state=page.evaluate('JSON.parse(JSON.stringify(__fqa.state()))')
        gate=page.evaluate('__fqa.gate()')
        early=page.evaluate('__fqa.paint()')
        check('Final rocket and robot explosion share rendering while the score clock remains at120s',final_state['time']==120 and final_state['robots'][1].get('destruction') and len([e for e in early['entries'] if e['name']=='explosion' and e['paints']])>=2)
        check('Settlement produces drawable component debris',bool(early['debris']))
        scroll_field(page);page.screenshot(path=str(DIR/'desktop-final-animation.png'),full_page=False)
        page.evaluate('["start","replay","results-open","results-next","results-replay"].forEach(id=>document.getElementById(id).click())')
        check('Hidden or disabled result controls cannot bypass the reveal gate',page.evaluate('__fqa.gate().at')==gate['at'] and page.evaluate('__fqa.inspect().resultHidden'))
        page.wait_for_function('__fqa.gate().elapsed>=1100')
        middle=page.evaluate('__fqa.paint()')
        check('The final animation clock advances debris position and fade without simulation steps',early['debris']!=middle['debris'] and page.evaluate('JSON.parse(JSON.stringify(__fqa.state()))')==final_state)
        wait_reveal(page,'local')
        late=page.evaluate('__fqa.paint()')
        check('Fragments, rocket flash and component debris are gone before the winner is displayed',not late['debris'] and not any(e['name'] in ['destruction','chassis-piece','explosion'] and e['paints'] for e in late['entries']))
        check('Results preserve the exact finished state and show the correct winner',page.evaluate('JSON.parse(JSON.stringify(__fqa.state()))')==final_state and 'LAST SHOT wins.' in page.locator('#arena-banner').inner_text())
        page.screenshot(path=str(DIR/'desktop-after-reveal.png'),full_page=False)

        # The real replay control must wait again, rather than reuse a revealed state.
        page.evaluate('__fqa.phaseStart("replay")');page.locator('#replay').click()
        page.wait_for_function('__fqa.gate() && !__fqa.gate().shown',timeout=6000)
        wait_reveal(page,'replay')
        check('Replay retains the identical final ranking and destruction time',page.evaluate('__fqa.state().result')==final_state['result'] and page.evaluate('__fqa.state().robots[1].destruction.born')==final_state['robots'][1]['destruction']['born'])

        # A new preview during the pending presentation cancels its old result.
        page.evaluate('(s)=>{__fqa.show(s);__fqa.phaseStart("reset");}',final_state)
        page.wait_for_timeout(200);page.evaluate('__fqa.preview()')
        page.wait_for_timeout(3200)
        check('New-preview reset cancels the old winner permanently',page.evaluate('__fqa.gate()===null&&__fqa.state().status==="running"&&document.getElementById("results-panel").hidden&&document.getElementById("results-shortcut").hidden&&!document.getElementById("arena-banner").classList.contains("result-banner")'))

        check('No JavaScript browser errors',not errors)
        result={'ok':True,'passed':len(checks),'checks':checks,'revealMs':timing,'errors':errors}
        (DIR/'result.json').write_text(json.dumps(result,indent=2))
        print(json.dumps(result,indent=2),flush=True)
    except Exception:
        for i,pg in enumerate(pages):
            try:pg.screenshot(path=str(DIR/('failure-'+str(i)+'.png')),full_page=False)
            except Exception:pass
        print(json.dumps({'passed':checks,'errors':errors}),flush=True)
        raise
    finally:
        browser.close()
