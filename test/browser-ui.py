"""Optional browser checks. Requires Python Playwright and Chromium, not game dependencies.
Run from any folder: python test/browser-ui.py
"""
from pathlib import Path
import json, os, tempfile
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
checks=[];errors=[]
def check(name,value):
    checks.append({'check':name,'passed':bool(value)})
    if not value: raise AssertionError(name)
HOOK='''<script>
Object.defineProperty(window,'LineArena',{configurable:true,set(api){
 for(const key of ['createBattle','createPracticeBattle']){const create=api[key];api[key]=(...args)=>{const s=create(...args);window.__match=s;return s;};}
 Object.defineProperty(window,'LineArena',{value:api,writable:true,configurable:true});
}});
window.__renderColors=new Set();
const originalStroke=CanvasRenderingContext2D.prototype.stroke;
CanvasRenderingContext2D.prototype.stroke=function(...args){if(this.canvas.id==='arena')window.__renderColors.add(this.strokeStyle);return originalStroke.apply(this,args);};
</script>'''
html=(ROOT/'cspire-arena.html').read_text().replace('<body>','<body>'+HOOK,1)
html=html.replace('  initRoster();renderCatalog();newPreview();save();', '''
  window.__testSnapshot=(snapshot,slot=0)=>{mode='online';onlineSlot=slot;state=snapshot;room=null;paused=false;countdown=0;trails=Array.from({length:E.MAX_BOTS},()=>[]);lastEventId=-1;finishing=false;$('arena-banner').classList.add('hidden');$('seed-label').textContent=state.seed;updateUI();};
  initRoster();renderCatalog();newPreview();save();''',1)
with tempfile.TemporaryDirectory() as tmp, sync_playwright() as p:
    path=Path(tmp)/'qa.html';path.write_text(html)

    opts={'headless':True,'args':['--no-sandbox']}
    if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
    elif Path('/usr/bin/chromium').exists():opts['executable_path']='/usr/bin/chromium'
    browser=p.chromium.launch(**opts)
    page=browser.new_page(viewport={'width':1500,'height':1250},device_scale_factor=1)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html);page.wait_for_timeout(200)
    check('English edition 0.5.6 loads',page.evaluate("LineArena.VERSION==='0.5.6' && document.documentElement.lang==='en'"))
    check('Unavailable local storage is reported without crashing the game',page.locator('#save-status').inner_text()=='NOT SAVED')
    check('Default field has four robots',page.evaluate('__match.robots.length===4'))
    check('Default arena shows four hazards and four available bonuses',page.evaluate("__match.hazards.length===4&&__match.pickups.filter(p=>LineArena.pickupAvailable(__match,p)).length===4") and page.locator('#field-summary').inner_text()=='4/4 ALIVE · 4 HAZARDS / 4 BONUSES')
    check('All four robots start with exactly 300 HP',page.evaluate('__match.robots.every(r=>r.health===300&&r.stats.hp===300)'))
    check('Four visible health cards match engine values',page.evaluate("['a','b','c','d'].every((t,i)=>!document.getElementById('fighter-'+t).hidden&&+document.getElementById('health-'+t).textContent===__match.robots[i].health)"))
    check('Build budget is 200 in the engine and visible HUD',page.evaluate("LineArena.BUDGET===200&&document.getElementById('budget-limit').textContent==='200'"))
    check('Nine predefined tool cards',page.locator('.catalog-tool').count()==9)
    check('Every catalog card shows its own base damage and cooldown',page.evaluate("[...document.querySelectorAll('.catalog-tool')].every(el=>{const t=LineArena.WEAPONS[el.dataset.addTool];return el.querySelector('.catalog-damage').textContent.trim()===t.damage+' BASE DMG'&&el.textContent.includes(t.cooldown+'s CD')})"))
    check('No matchup multipliers or counter lists appear on cards',page.evaluate("![...document.querySelectorAll('.catalog-tool,#tool-specs,#weapon-hint')].some(el=>/MATCHUPS|multiplier|1\\.35x|vs\\./i.test(el.textContent))"))
    check('Four health values use distinct identity colors',page.evaluate("new Set(['a','b','c','d'].map(t=>getComputedStyle(document.getElementById('health-'+t)).color)).size===4"))
    check('Energy is less than half the health font size on desktop',page.evaluate("parseFloat(getComputedStyle(document.getElementById('energy-a')).fontSize)<.5*parseFloat(getComputedStyle(document.getElementById('health-a')).fontSize)"))
    check('Health remains large on desktop',page.locator('#health-a').evaluate('el=>parseFloat(getComputedStyle(el).fontSize)>=32'))
    check('Desktop does not overflow horizontally',page.evaluate('document.documentElement.scrollWidth===innerWidth'))
    check('HUD is above workshop and arena',page.evaluate("document.querySelector('.match-hud').getBoundingClientRect().bottom<document.querySelector('#arena-panel').getBoundingClientRect().top"))
    page.evaluate("scrollTo({top:500,behavior:'instant'})");page.wait_for_timeout(100)
    check('HUD sticks to top while scrolling',abs(page.locator('.match-hud').bounding_box()['y'])<1)
    page.evaluate("scrollTo({top:0,behavior:'instant'})")
    page.locator('#bot-count').select_option('2');page.wait_for_timeout(140)
    check('Duel selector creates two robots and hides unused HUD cards',page.evaluate("__match.robots.length===2&&document.getElementById('fighter-c').hidden&&document.getElementById('fighter-d').hidden"))
    page.locator('#bot-count').select_option('3');page.wait_for_timeout(140)
    check('Three-bot selector creates three robots and hides only the fourth card',page.evaluate("__match.robots.length===3&&!document.getElementById('fighter-c').hidden&&document.getElementById('fighter-d').hidden"))
    page.locator('#bot-count').select_option('4');page.locator('.roster-options summary').click()
    check('Practice roster displays only AI opponents',page.evaluate("[1,2,3].every(i=>document.getElementById('ai-name-'+i).textContent===__match.robots[i].config.name)&&__match.robots[0].controller==='player'&&__match.robots.slice(1).every(r=>r.controller==='bot')"))
    page.locator('.roster-options summary').click()
    check('Original RAM card shows 16 base damage',page.locator('#tool-specs').inner_text().startswith('16'))
    page.evaluate("window.__rulesBeforeVoid=JSON.stringify(__match.robots[0].config.rules)")
    original_condition=page.locator('#rule-0-when').input_value()
    original_action=page.locator('#rule-0-do').input_value()
    page.locator('#rule-0-when').select_option('void')
    check('VOID keeps its slot and saved action while disabling only its DO control',page.evaluate("__match.robots[0].config.rules.length===8&&__match.robots[0].config.rules[0].when==='void'&&document.querySelector('#rules .rule').classList.contains('rule-void')&&document.getElementById('rule-0-do').disabled&&!document.getElementById('rule-0-when').disabled") and page.locator('#rule-0-do').input_value()==original_action)
    check('VOID leaves every lower rule and its controls unchanged',page.evaluate("JSON.stringify(__match.robots[0].config.rules.slice(1))===JSON.stringify(JSON.parse(__rulesBeforeVoid).slice(1))&&[...document.querySelectorAll('#rules select')].filter(el=>!el.id.startsWith('rule-0-')).every(el=>!el.disabled)"))
    page.locator('#rule-0-when').select_option(original_condition)
    check('Restoring the condition reenables its action and preserves the complete program',not page.locator('#rule-0-do').is_disabled() and page.evaluate("JSON.stringify(__match.robots[0].config.rules)===__rulesBeforeVoid&&!document.querySelector('#rules .rule').classList.contains('rule-void')"))
    page.locator('#tool-power').select_option('3');page.wait_for_timeout(140)
    check('Power increases nominal damage and cooldown without changing base damage',page.evaluate("document.querySelector('#tool-specs').textContent.includes('16BASE DMG32POWER DMG4.86sCOOLDOWN')"))
    check('Chassis HP stays at 300 after changing tool power',page.evaluate('__match.robots[0].stats.hp===300'))
    page.locator('#tool-power').select_option('1')
    page.locator('#armor').fill('5');page.locator('#armor').dispatch_event('input');page.wait_for_timeout(120)
    check('Armor changes panel strength but not chassis HP',page.evaluate('__match.robots[0].health===300&&__match.robots[0].parts[0].maxHealth===194'))
    page.locator('#loadout').select_option('ranged');page.wait_for_timeout(120)
    check('Ranged loadout keeps gun, rocket and flame mounts',page.evaluate("__match.robots[0].tools.map(t=>t.type).join(',')==='machinegun,rocket,flamethrower'"))
    # Spend beyond the previous cap, then reach the new cap through real editor inputs.
    for slot in range(3):
        page.locator('#tool-slots .tool-slot').nth(slot).click()
        page.locator('#tool-power').select_option('3')
    page.locator('[data-body="hex"]').click()
    page.locator('#motor').fill('4');page.locator('#motor').dispatch_event('input');page.wait_for_timeout(140)
    check('Editor accepts a full 200-point build without lowering tools',page.evaluate("LineArena.cost(__match.robots[0].config)===200&&__match.robots[0].tools.every(t=>t.power===3)&&document.getElementById('budget-value').textContent==='200'"))
    check('Budget bar reaches 100 percent at 200 points',page.locator('#budget-bar').evaluate("el=>el.style.width==='100%'"))
    page.locator('#armor').fill('4');page.locator('#armor').dispatch_event('input');page.wait_for_timeout(100)
    check('Editor rejects spending above 200 with the correct message',page.evaluate("LineArena.cost(__match.robots[0].config)===200&&document.getElementById('toast').textContent.startsWith('Over 200 points.')"))
    page.locator('#loadout').select_option('ranged');page.wait_for_timeout(120)
    check('New weapon icons are valid SVG and no undefined text appears',page.evaluate("document.querySelectorAll('.catalog-tool svg path').length===9&&!document.querySelector('#tool-catalog').textContent.includes('undefined')"))
    page.evaluate("__match.robots[0].health=247;__match.robots[0].energy=43");page.wait_for_timeout(150)
    check('Life and energy update independently and retain a 300 maximum',page.evaluate("document.getElementById('health-a').textContent==='247'&&document.getElementById('max-health-a').textContent==='300'&&document.getElementById('energy-a').textContent==='43'"))
    page.evaluate("const s=__match,r=s.robots[0];s.pickups=[{id:99,kind:'tool',toolType:'rocket',power:1,x:r.x,y:r.y,r:12,spawnAt:0,expiresAt:30,collectedBy:null}];LineArena.collectPickups(s)")
    page.wait_for_timeout(160)
    check('Bonus weapons appear in component status',page.locator('.damage-card').first.locator('.bonus-tool').count()==1)
    page.wait_for_function("getComputedStyle(document.querySelector('.damage-card .bonus-tool')).color==='rgb(241, 203, 127)'")
    check('Healthy bonus remains yellow',page.locator('.damage-card .bonus-tool').first.evaluate("el=>getComputedStyle(el).color==='rgb(241, 203, 127)'"))
    page.evaluate("const t=__match.robots[0].tools.find(t=>t.bonus);t.health=t.maxHealth*.2;__renderColors.clear()");page.wait_for_timeout(160)
    check('Heavily damaged bonus gets a critical class',page.locator('.damage-card .bonus-tool.critical-tool').count()==1)
    page.wait_for_function("getComputedStyle(document.querySelector('.damage-card .bonus-tool.critical-tool')).color==='rgb(255, 92, 108)'")
    check('Critical bonus status is red',page.locator('.damage-card .bonus-tool.critical-tool').evaluate("el=>getComputedStyle(el).color==='rgb(255, 92, 108)'"))
    check('Critical bonus is also red in the actual canvas drawing',page.evaluate("__renderColors.has('#ff5c6c')"))
    check('Critical bonus has a visible warning', '!' in page.locator('.damage-card .bonus-tool.critical-tool').inner_text())
    page.evaluate("const t=__match.robots[0].tools.find(t=>t.bonus);t.health=t.maxHealth*.6");page.wait_for_timeout(160)
    check('Repaired bonus changes back to yellow',page.locator('.damage-card .bonus-tool.critical-tool').count()==0)
    page.locator('#start').click();page.wait_for_timeout(3000)
    check('Five-second countdown keeps physics frozen after three seconds',page.evaluate('LineArena.START_COUNTDOWN_SECONDS===5&&__match.tick===0&&__match.time===0&&__match.robots.every(r=>r.health===300)'))
    page.wait_for_function('__match.time>0',timeout=9000)
    check('Four-way local battle advances in real time',page.evaluate('__match.time>0 && __match.robots.length===4'))
    check('Roster controls lock during a battle',page.locator('#bot-count').is_disabled())
    check('Tool editor locks during a battle',page.locator('#tool-power').is_disabled())
    check('Battle automatically collapses both side panels',page.evaluate("document.body.classList.contains('arena-focused')&&document.querySelectorAll('.side-dock.collapsed').length===2"))
    page.locator('#arena-size-toggle').click();page.wait_for_timeout(650)
    check('Panels can reopen without unlocking editing',page.locator('#workshop').is_visible() and page.locator('#tool-power').is_disabled())
    page.locator('#pause').click();t=page.evaluate('__match.time');page.wait_for_timeout(160)
    check('Pause halts the actual simulation',page.evaluate('__match.time')==t)
    # Fixed, reproducible battle observation for previews; no fixture code ships in the game.
    page.evaluate("const s=LineArena.createBattle([LineArena.loadouts.ranged,LineArena.rivals[0],LineArena.rivals[1],LineArena.rivals[3]],28471);for(let i=0;i<480;i++)LineArena.step(s);window.__screenshotState=s;__testSnapshot(s,0)")
    page.wait_for_timeout(180)
    check('All four component decks render',page.locator('.damage-card').count()==4)
    check('Canvas draws all four body colors',page.evaluate("['#76d8cf','#f09b7e','#b6a0ed','#8ed4a0'].every(c=>__renderColors.has(c))"))
    (ROOT/'previews').mkdir(exist_ok=True)
    page.evaluate("scrollTo({top:0,behavior:'instant'})");page.screenshot(path=str(ROOT/'previews/battle.png'))
    page.evaluate("__testSnapshot(LineArena.createBattle([LineArena.loadouts.ranged,LineArena.rivals[0],LineArena.rivals[1],LineArena.rivals[3]],28471),2)")
    page.wait_for_timeout(150)
    check('Online seat three is labelled YOU, not the first robot',page.evaluate("document.getElementById('seat-c').textContent==='YOU'&&document.getElementById('seat-a').textContent==='P1'"))
    page.evaluate("__match.robots[2].alive=false");page.wait_for_timeout(140)
    check('Eliminated player is marked OUT while other robots remain',page.evaluate("document.getElementById('seat-c').textContent==='OUT'&&document.getElementById('fighter-c').classList.contains('eliminated')"))
    check('Eliminated local pilot receives spectating telemetry',page.locator('#current-action').inner_text()=='Eliminated · spectating')
    page.evaluate("__testSnapshot(LineArena.createBattle([LineArena.loadouts.ranged,LineArena.rivals[0],LineArena.rivals[1],LineArena.rivals[3]],28471),0)");page.wait_for_timeout(160)
    page.screenshot(path=str(ROOT/'previews/preview.png'))
    for width in [320,390,740,900]:
        page.set_viewport_size({'width':width,'height':1100});page.evaluate("scrollTo({top:0,behavior:'instant'})");page.wait_for_timeout(140)
        check(f'{width}px layout has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth===innerWidth'))
        check(f'{width}px energy is under half the health size',page.evaluate("parseFloat(getComputedStyle(document.getElementById('energy-a')).fontSize)<.5*parseFloat(getComputedStyle(document.getElementById('health-a')).fontSize)"))
    page.set_viewport_size({'width':390,'height':1100});page.wait_for_timeout(100)
    check('Mobile health remains at least 28px',page.locator('#health-a').evaluate('el=>parseFloat(getComputedStyle(el).fontSize)>=28'))
    check('Mobile HUD cards do not overlap',page.evaluate("(()=>{const r=['a','b','c','d'].map(t=>document.getElementById('fighter-'+t).getBoundingClientRect());return r.every((a,i)=>r.every((b,j)=>i===j||a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top))})()"))
    page.evaluate('__testSnapshot(__screenshotState,0)');page.wait_for_timeout(140);page.screenshot(path=str(ROOT/'previews/mobile.png'))
    check('All DOM IDs are unique',page.evaluate("(()=>{const a=[...document.querySelectorAll('[id]')].map(el=>el.id);return a.length===new Set(a).size})()"))
    # Version 0.5.6: wall HP, live recovery, committed ring-out and visible apron.
    page.set_viewport_size({'width':1500,'height':1250})
    page.evaluate("window.__edgeTest=LineArena.createBattle([{name:'EDGE-TEST',tools:[{type:'rocket',x:-24,y:24,angle:180,power:1}],rules:[{when:'always',do:'center'}]},...Array(3).fill({tools:[],rules:[{when:'always',do:'brake'}]})],71);const s=__edgeTest;s.hazards=[];s.pickups=[];__testSnapshot(s)")
    page.wait_for_timeout(140)
    check('Wall inspector displays the reduced 150 HP maximum', '150 / 150 HP' in page.locator('#wall-health').inner_text())
    page.evaluate("const s=__edgeTest;s.walls.filter(w=>w.side===1).forEach(w=>{w.broken=true;w.health=0});Object.assign(s.robots[0],{x:LineArena.BOUNDS.max-.5,y:373,vx:200});LineArena.step(s);__testSnapshot(s)")
    page.wait_for_timeout(140)
    check('Crossing a breach marks the robot OUT immediately',page.evaluate("document.getElementById('seat-a').textContent==='OUT'&&__edgeTest.robots[0].exit&&!__edgeTest.robots[0].exit.done"))
    check('Three survivors continue during the visible exit',page.evaluate("__edgeTest.status==='running'&&__edgeTest.robots.filter(r=>r.alive).length===3"))
    page.evaluate("const s=__edgeTest;for(let i=0;i<50;i++)LineArena.step(s);__testSnapshot(s)")
    page.wait_for_timeout(140)
    check('Exiting robot, including rear-facing tools, clears the border',page.evaluate("const r=__edgeTest.robots[0];r.exit.done&&r.x+LineArena.footprint(r).minX>=LineArena.BOUNDS.max+LineArena.EXIT_CLEARANCE-.001"))
    page.locator('#arena').screenshot(path=str(ROOT/'previews/ring-out.png'))
    # Ring-outs do not alter the world-to-canvas transform. Pointer inspection
    # must still select the same wall using the original fixed view.
    page.locator('#arena').scroll_into_view_if_needed()
    rect=page.locator('#arena').bounding_box()
    view={'min':0,'size':800}
    x=84+632/12*3.5;y=84
    page.mouse.move(rect['x']+(x-view['min'])/view['size']*rect['width'],rect['y']+(y-view['min'])/view['size']*rect['height'])
    page.wait_for_timeout(150)
    check('Wall pointer inspection remains aligned without exit zoom', 'WALL 04' in page.locator('#wall-label').inner_text())
    page.evaluate("const s=LineArena.createBattle([{tools:[{type:'machinegun'}],rules:[{when:'always',do:'weapon'}]},{tools:[],rules:[{when:'always',do:'brake'}]}],73);s.hazards=[];s.pickups=[];Object.assign(s.robots[0],{x:110,y:110,angle:Math.PI*1.25});Object.assign(s.robots[1],{x:160,y:160});s.robots[0].tools[0].cooldown=999;for(let i=0;i<90;i++)LineArena.step(s);window.__recoveryTest=s;__testSnapshot(s)")
    page.wait_for_timeout(150)
    check('Recovery telemetry is visible during reverse-and-turn maneuver','wall recovery' in page.locator('#current-action').inner_text())
    check('Automatic recovery activates without changing the user rules',page.evaluate("__recoveryTest.robots[0].recoveries>0&&__recoveryTest.robots[0].config.rules[0].do==='weapon'"))
    check('No browser JavaScript errors',not errors)
    browser.close()
(ROOT/'browser-results.json').write_text(json.dumps({'version':'0.5.6','checks':checks,'errors':errors},indent=2))
print(json.dumps({'passed':sum(c['passed']for c in checks),'total':len(checks),'errors':errors}))
