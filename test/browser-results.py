"""Optional Chromium checks for results, live streams and power levels.
Observation hooks are inserted into a temporary in-memory copy, never the deliverable.
"""
from pathlib import Path
import json, os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
checks=[]; errors=[]
def check(name,value):
    checks.append({'check':name,'passed':bool(value)})
    if not value: raise AssertionError(name)
html=(ROOT/'cspire-arena.html').read_text()
hook="""
  window.__qa={
    state:()=>state,
    show:(s,finishNow=false,local=false)=>{clearResults();mode=local?'local':'online';state=s;room=null;onlineSlot=0;paused=true;countdown=0;trails=Array.from({length:E.MAX_BOTS},()=>[]);lastEventId=-1;finishing=false;history=[];$('arena-banner').classList.add('hidden');updateUI();drawArena(s,0);if(finishNow)finish();},
    run:(s)=>{clearResults();mode='local';state=s;room=null;paused=false;countdown=0;accumulator=0;finishing=false;history=[];trails=Array.from({length:E.MAX_BOTS},()=>[]);lastEventId=-1;$('arena-banner').classList.add('hidden');applyLock();},
    draw:()=>drawArena(state,0),
    precision:healthLabels
  };
"""
html=html.replace('  initRoster();renderCatalog();newPreview();save();',hook+'  initRoster();renderCatalog();newPreview();save();',1)
# Instrument real drawing calls, not a replacement renderer.
pre="""<script>
window.__paint={strokes:[],arcs:[]};
const oldStroke=CanvasRenderingContext2D.prototype.stroke,oldArc=CanvasRenderingContext2D.prototype.arc;
CanvasRenderingContext2D.prototype.stroke=function(...args){if(this.canvas.id==='arena')__paint.strokes.push(this.strokeStyle);return oldStroke.apply(this,args);};
CanvasRenderingContext2D.prototype.arc=function(...args){if(this.canvas.id==='arena')__paint.arcs.push({r:args[2],fill:this.fillStyle});return oldArc.apply(this,args);};
</script>"""
html=html.replace('<body>','<body>'+pre,1)
fixture="""() => { const E=LineArena,p={tools:[],rules:[{when:'always',do:'brake'}]};const s=E.createBattle(['VECTOR-01','EMBER-04','MANTIS-02','ORBIT-07'].map(name=>({...p,name})),53);s.hazards=[];s.pickups=[];return s;}"""
with sync_playwright() as p:
    opts={'headless':True,'args':['--no-sandbox']}
    if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
    elif Path('/usr/bin/chromium').exists():opts['executable_path']='/usr/bin/chromium'
    browser=p.chromium.launch(**opts)
    page=browser.new_page(viewport={'width':1500,'height':1100},device_scale_factor=1)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html);page.wait_for_timeout(150)
    check('Initial timer shows 02:00',page.locator('#clock').inner_text()=='02:00')
    check('Hazard condition explicitly says active',page.locator('#rules').inner_text().find('An active hazard is nearby')>=0)
    check('Help describes active traps, exact HP and two minutes',page.evaluate("['active traps','exact remaining chassis HP','120 seconds'].every(t=>document.querySelector('#help-dialog').textContent.includes(t))"))
    page.locator('#loadout').select_option('ranged');page.locator('#tool-slots .tool-slot').nth(2).click()
    check('Selected flame tool includes numeric range', '135u' in page.locator('#tool-specs').inner_text())
    page.locator('#tool-power').select_option('2');page.wait_for_timeout(100)
    check('Standard flame stats show 33 damage, 168.75 range and 4.48s cooldown',page.evaluate("['33','168.75u','4.48s'].every(t=>document.getElementById('tool-specs').textContent.includes(t))"))
    page.locator('#tool-power').select_option('3');page.wait_for_timeout(100)
    check('Heavy flame stats show 44 damage, 202.5 range and 5.76s cooldown',page.evaluate("['44','202.5u','5.76s'].every(t=>document.getElementById('tool-specs').textContent.includes(t))"))
    check('Weapon card hides matchup coefficients',page.evaluate("!document.querySelector('#tool-editor').textContent.includes('0.85')&&!document.querySelector('#tool-editor').textContent.includes('MATCHUPS')"))
    page.evaluate('window.__fixture='+fixture)
    # Let the real local frame loop cross the time limit and open its result.
    page.evaluate("const s=__fixture();[102.25,190.75,85.5,135].forEach((h,i)=>s.robots[i].health=h);s.time=119.7;__qa.run(s)")
    page.wait_for_function("!document.getElementById('results-panel').hidden")
    check('Time expiry automatically opens standings',page.locator('#results-panel').is_visible())
    check('Standings are inline, not a modal',page.evaluate("document.getElementById('results-panel').tagName==='SECTION'&&document.querySelectorAll('dialog[open]').length===0"))
    check('Winner banner is visible and the complete table never overlaps the field',page.evaluate("(()=>{const p=document.getElementById('results-panel').getBoundingClientRect(),a=document.getElementById('arena').getBoundingClientRect();return !document.getElementById('arena-banner').classList.contains('hidden')&&(p.left>=a.right||p.top>=a.bottom)&&getComputedStyle(document.getElementById('arena-banner')).pointerEvents==='none'})()"))
    check('Ranking details start collapsed',not page.locator('.results-details').get_attribute('open'))
    check('Final clock is exactly 00:00',page.locator('#clock').inner_text()=='00:00')
    check('All four bots appear in final table',page.locator('#results-rows tr').count()==4)
    check('HP ranking is correct and only highest HP row is a winner',page.evaluate("[...document.querySelectorAll('#results-rows tr')].map(r=>r.dataset.robotId).join(',')==='1,3,0,2'&&document.querySelectorAll('#results-rows .winner-row').length===1"))
    check('Winner summary is not a draw', 'wins.' in page.locator('#results-summary').inner_text())
    check('Standings include elapsed time and winning reason', '120.00s / 120s' in page.locator('#results-time').inner_text() and 'highest remaining HP' in page.locator('#results-reason').inner_text())
    (ROOT/'previews').mkdir(exist_ok=True)
    page.screenshot(path=str(ROOT/'previews/results.png'),full_page=True)
    page.locator('#results-panel [data-results-close]').first.click()
    page.locator('#results-open').click()
    check('Final table can be closed and reopened',page.locator('#results-panel').is_visible())
    check('Completed local match enables replay',page.locator('#results-replay').is_enabled())
    page.locator('#results-replay').click()
    check('Replay begins before the final state',page.evaluate('__qa.state().time<120'))
    page.wait_for_function("!document.getElementById('results-panel').hidden")
    check('Replay ends with the same HP ranking',page.evaluate("[...document.querySelectorAll('#results-rows tr')].map(r=>r.dataset.robotId).join(',')==='1,3,0,2'"))
    page.locator('#results-next').click();page.wait_for_timeout(100)
    check('Another battle closes standings and resets the timer',not page.locator('#results-panel').is_visible() and page.locator('#clock').inner_text()=='02:00')
    # Precise ties, display rounding and eliminated robots.
    page.evaluate("const s=__fixture();s.time=120;[100,100.000000001,20,0].forEach((h,i)=>s.robots[i].health=h);LineArena.finishIfNeeded(s);__qa.show(s,true)")
    check('Near-equal HP is not displayed as a false tie',page.locator('#results-rows .results-hp').nth(0).get_attribute('data-exact-hp')!=page.locator('#results-rows .results-hp').nth(1).get_attribute('data-exact-hp') and page.locator('#results-title').inner_text()=='Battle decided.')
    check('Visible HP labels distinguish near-equal values',page.locator('#results-rows .results-hp').nth(0).inner_text()!=page.locator('#results-rows .results-hp').nth(1).inner_text())
    page.evaluate("const s=__fixture();s.time=120;[123.5,123.5,95,250].forEach((h,i)=>s.robots[i].health=h);Object.assign(s.robots[3],{alive:false,reason:'Out of the arena',eliminatedAt:20});LineArena.finishIfNeeded(s);__qa.show(s,true)")
    check('Exact tie shows two winning rows and shared first place',page.locator('#results-rows .winner-row').count()==2 and 'share first place' in page.locator('#results-summary').inner_text())
    check('Ring-out with 250 HP is ranked below surviving robots',page.locator('#results-rows tr').last.get_attribute('data-robot-id')=='3' and 'RING-OUT' in page.locator('#results-rows tr').last.inner_text())
    check('Online results do not offer a local restart',page.locator('#results-next').is_hidden())
    page.evaluate("const s=__fixture();s.time=23;for(const i of [1,2,3])Object.assign(s.robots[i],{alive:false,health:0,reason:'Robot destroyed',eliminatedAt:20+i});LineArena.finishIfNeeded(s);__qa.show(s,true,true)")
    check('Early victory also opens the complete standings',page.locator('#results-rows tr').count()==4 and 'Last robot standing' in page.locator('#results-reason').inner_text())
    for width in [320,390,740,1500]:
        page.set_viewport_size({'width':width,'height':920});page.wait_for_timeout(100)
        check(f'Results stay within viewport at {width}px',page.locator('#results-panel').evaluate('(d)=>d.getBoundingClientRect().left>=0&&d.getBoundingClientRect().right<=innerWidth'))
        check(f'No page horizontal overflow at {width}px',page.evaluate('document.documentElement.scrollWidth===innerWidth'))
        if width==390:page.screenshot(path=str(ROOT/'previews/results-mobile.png'),full_page=True)
    # Live engine-controlled emissions. Only robot position and movement are fixed
    # by the fixture; actual physics functions produce damage and projectiles.
    page.locator('#results-panel [data-results-close]').first.click()
    page.set_viewport_size({'width':1500,'height':1200})
    page.evaluate("""const E=LineArena,p={tools:[],rules:[{when:'always',do:'brake'}]};
      const s=E.createBattle([{name:'FLAME / HEAVY',tools:[{type:'flamethrower',x:20,y:0,angle:0,power:3}],rules:[{when:'always',do:'weapon'}]},
        {...p,name:'TARGET / 01'}, {name:'MACHINE / GUN',tools:[{type:'machinegun',x:20,y:0,angle:0,power:2}],rules:[{when:'always',do:'weapon'}]}, {...p,name:'TARGET / 02'}],5303);
      s.hazards=[{id:0,type:'fire',x:540,y:535,r:30,phase:0,period:6,duty:.52}];s.pickups=[];
      Object.assign(s.robots[0],{x:220,y:450,angle:0,action:'weapon'});Object.assign(s.robots[1],{x:430,y:450,angle:Math.PI});
      Object.assign(s.robots[2],{x:220,y:270,angle:0,action:'weapon'});Object.assign(s.robots[3],{x:590,y:270,angle:Math.PI});
      E.resolveAttacks(s,s.robots.flatMap(r=>E.collectAttacks(s,r)));
      for(let i=0;i<14;i++){s.time+=E.STEP;E.stepFlames(s,E.STEP);E.stepProjectiles(s,E.STEP);}
      window.__fx=s;__qa.show(s);window.__paint={strokes:[],arcs:[]};__qa.draw();""")
    check('Live flame remains a timed engine stream',page.evaluate('__fx.flames.length===1&&__fx.flames[0].elapsed>0'))
    check('Flame renderer draws yellow particle lines',page.evaluate("__paint.strokes.filter(c=>c==='#ffe283'||c==='#f3bd45').length>20"))
    check('Machine gun draws small bright circular bullet heads',page.evaluate("__paint.arcs.filter(a=>a.fill==='#fff1b5'&&a.r===2).length>=2"))
    check('Streams start at the real mounted nozzle',page.evaluate("Math.abs(__fx.flames[0].x-LineArena.firingPose(__fx,__fx.robots[0],__fx.robots[0].tools[0]).x)<1e-9"))
    check('Actual flame exposure has reduced opponent health',page.evaluate('__fx.robots[1].health<250'))
    page.evaluate("scrollTo({top:0,behavior:'instant'})");page.wait_for_timeout(120)
    page.screenshot(path=str(ROOT/'previews/streams.png'))
    page.locator('#arena').screenshot(path=str(ROOT/'previews/streams-arena.png'))
    # Frame time is not used to animate gameplay effects while paused.
    before=page.locator('#arena').screenshot();page.wait_for_timeout(120);after=page.locator('#arena').screenshot()
    check('Paused effects remain visually stable',before==after)
    check('No JavaScript browser errors',not errors)
    browser.close()
(ROOT/'browser-results-panel.json').write_text(json.dumps({'checks':checks,'errors':errors},indent=2))
print(json.dumps({'passed':sum(c['passed'] for c in checks),'total':len(checks),'errors':errors}))
