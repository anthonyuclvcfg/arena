"""Interactive regression coverage for 0.5.6 (temporary hooks; never shipped in the game)."""
from pathlib import Path
import json, os
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1]
checks=[]; errors=[]
def check(label,ok):
    checks.append({'check':label,'passed':bool(ok)})
    if not ok: raise AssertionError(label)
html=(R/'cspire-arena.html').read_text()
needle='  initRoster();renderCatalog();newPreview();save();'
assert html.count(needle)==1
hook='''
 window.__editQA={
  cfg:()=>JSON.parse(JSON.stringify(config)),sel:()=>selectedTool,state:()=>state,
  load:(raw)=>{mode='idle';room=null;paused=true;countdown=0;finishing=false;drawing=false;cancelBuilderGesture();clearResults();config=E.normalizeConfig(raw);selectedTool=config.tools.length?0:-1;syncBuilder();renderRules();newPreview();updateUI();drawBuilder();},
  point:(i,x=0,y=0)=>{const t=config.tools[i],a=t.angle*Math.PI/180,rect=builder.getBoundingClientRect(),scale=builderScale();return {x:rect.left+(builder.width/2+scale*(t.x+x*Math.cos(a)-y*Math.sin(a)))*rect.width/builder.width,y:rect.top+(builder.height/2-12+scale*(t.y+x*Math.sin(a)+y*Math.cos(a)))*rect.height/builder.height,k:scale*rect.width/builder.width};},
  show:(s,end=false)=>{room=null;mode='online';state=s;onlineSlot=0;paused=true;countdown=0;finishing=false;trails=Array.from({length:E.MAX_BOTS},()=>[]);lastEventId=-1;clearResults();$('arena-banner').classList.add('hidden');updateUI();drawArena(s,0);if(end){enterBattleView();finish();}},
  refresh:()=>{updateUI();drawArena(state,0);}
 };
'''
html=html.replace(needle,hook+needle)
base={'name':'MY CUSTOM BOT','body':'box','motor':3,'armor':3,'rules':[{'when':'always','do':'brake'}], 'tools':[{'type':'ram','x':16,'y':-16,'angle':0,'power':1},{'type':'hammer','x':16,'y':16,'angle':90,'power':1},{'type':'saw','x':-18,'y':0,'angle':180,'power':1}]}
with sync_playwright() as pw:
    opts = {'headless': True, 'args': ['--no-sandbox']}
    if os.environ.get('CHROMIUM_PATH'):
        opts['executable_path'] = os.environ['CHROMIUM_PATH']
    elif Path('/usr/bin/chromium').is_file():
        opts['executable_path'] = '/usr/bin/chromium'
    # Otherwise use Playwright's managed browser (portable to macOS/Windows).
    browser = pw.chromium.launch(**opts)
    page=browser.new_page(viewport={'width':1560,'height':1080})
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html);page.wait_for_timeout(150)
    page.evaluate('(c)=>__editQA.load(c)',base)
    def point(i,x=0,y=0):
        page.locator('#builder').scroll_into_view_if_needed()
        return page.evaluate('v=>__editQA.point(...v)',[i,x,y])
    def clicktool(i,x=0,y=0):
        pt=point(i,x,y);page.mouse.click(pt['x'],pt['y']);return pt
    def config(): return page.evaluate('__editQA.cfg()')
    original=config()
    clicktool(1,26,0)
    check('Clicking hammer head selects that tool, not the previous selection',page.evaluate('__editQA.sel()')==1)
    check('Clicking a head does not move the mounting point',config()==original)
    pt=clicktool(0,26,0)
    check('Clicking the ram face selects the exact visible tool',page.evaluate('__editQA.sel()')==0)
    page.mouse.move(pt['x'],pt['y']);page.mouse.down();page.mouse.move(pt['x']-pt['k']*6,pt['y']+pt['k']*6,steps=6);page.mouse.up()
    c=config();check('Drag preserves grab offset instead of snapping mount to the pointer',abs(c['tools'][0]['x']-10)<.2 and abs(c['tools'][0]['y']+10)<.2)
    check('Dragging one tool leaves other tools unmoved',c['tools'][1:]==original['tools'][1:])
    rect=page.locator('#builder').bounding_box();before=config();page.mouse.click(rect['x']+8,rect['y']+8);page.mouse.down();page.mouse.move(rect['x']+18,rect['y']+18,steps=3);page.mouse.up()
    check('Dragging empty canvas never drags the previous tool',config()==before)
    page.evaluate('(c)=>__editQA.load(c)',base)
    clicktool(0,26,0);pt=point(1,26,0);page.mouse.move(pt['x'],pt['y']);page.mouse.wheel(0,100);page.wait_for_timeout(80)
    check('Wheel rotates the hovered tool instead of the previously selected tool',config()['tools'][1]['angle']==105 and config()['tools'][0]['angle']==0 and page.evaluate('__editQA.sel()')==1)
    page.mouse.move(rect['x']+8,rect['y']+8);page.keyboard.down('Shift');page.mouse.wheel(0,-100);page.keyboard.up('Shift');page.wait_for_timeout(80)
    check('Wheel over empty builder rotates selected tool with fine Shift steps',config()['tools'][1]['angle']==100)
    before=config();page.keyboard.down('Control');page.mouse.wheel(0,100);page.keyboard.up('Control');page.wait_for_timeout(80)
    check('Ctrl+wheel remains browser zoom rather than tool editing',config()==before)
    page.evaluate('(c)=>__editQA.load(c)',base);pt=point(1,26,0);page.mouse.dblclick(pt['x'],pt['y']);page.wait_for_timeout(70)
    check('Double-clicking hammer head removes only that tool',len(config()['tools'])==2 and [t['type'] for t in config()['tools']]==['ram','saw'])
    check('Deleting a tool restores its exact build cost',int(page.locator('#budget-value').inner_text())==page.evaluate('CSpireArena.cost(__editQA.cfg())'))
    before=config();rect=page.locator('#builder').bounding_box();page.mouse.dblclick(rect['x']+8,rect['y']+8)
    check('Double-clicking empty builder never deletes the selected tool',config()==before)
    page.locator('#tool-slots .tool-slot').first.dblclick();check('Numbered tool slots also remove the correct tool on double-click',len(config()['tools'])==1 and config()['tools'][0]['type']=='saw')
    # Overlap hit testing: last drawn silhouette is on top.
    overlap={**base,'tools':[{'type':'saw','x':0,'y':0,'angle':0},{'type':'saw','x':0,'y':0,'angle':0}]}
    page.evaluate('(c)=>__editQA.load(c)',overlap);clicktool(0,16,0)
    check('Overlapping silhouettes select the frontmost tool',page.evaluate('__editQA.sel()')==1)
    page.locator('#tool-slots .tool-slot').first.click();check('Numbered slot can select the obscured tool',page.evaluate('__editQA.sel()')==0)
    # Drawing mode remains separate from component editing.
    page.evaluate('(c)=>__editQA.load(c)',base);page.locator('#draw-toggle').click();pt=point(0,26,0);before=config();page.mouse.dblclick(pt['x'],pt['y']);page.mouse.wheel(0,100)
    check('Drawing mode does not delete or rotate mounted tools',config()['tools']==before['tools'])
    page.locator('#draw-toggle').click();page.evaluate('(c)=>__editQA.load(c)',base)
    # All nine tools can be selected at their actual far end, not only the mount.
    tips={'ram':(26,0),'flipper':(26,2),'plow':(22,14),'hammer':(28,6),'saw':(23,2),'drill':(29,0),'flamethrower':(29,0),'machinegun':(31,2),'rocket':(31,0)}
    for name,tip in tips.items():
        c={**base,'tools':[{'type':name,'x':12,'y':-14,'angle':30},{'type':'saw','x':-18,'y':16,'angle':180}]}
        page.evaluate('(c)=>__editQA.load(c)',c);page.locator('#tool-slots .tool-slot').nth(1).click();clicktool(0,*tip)
        check(f'{name} rotated tip selects the correct mounted tool',page.evaluate('__editQA.sel()')==0)
    page.evaluate('(c)=>__editQA.load(c)',base)
    check('Eight distinct chassis choices are offered',page.locator('#body-options button').count()==8)
    for name in ['diamond','octagon','capsule','cross']:
        page.locator(f'[data-body="{name}"]').click()
        check(f'{name} can be selected without changing HP or tool inventory',config()['body']==name and page.evaluate('__editQA.state().robots[0].health')==250 and len(config()['tools'])==3)
    # Six-seat rendering and density / controls.
    for count,traps in [(5,4),(6,4)]:
        page.locator('#bot-count').select_option(str(count));page.wait_for_timeout(80)
        check(f'{count} robots yield {traps} traps with a full matching HUD',page.evaluate(f'__editQA.state().robots.length=={count}&&__editQA.state().hazards.length=={traps}&&[...document.querySelectorAll(".fighter")].filter(x=>!x.hidden).length=={count}'))
    check('All six bodies and HUDs have distinct colors',page.evaluate("new Set(['a','b','c','d','e','f'].map(t=>getComputedStyle(document.getElementById('health-'+t)).color)).size===6"))
    saved=config();page.locator('#start').click();page.wait_for_timeout(650);page.locator('#restore-builder').click();page.wait_for_timeout(650)
    pt=point(0,26,0);page.mouse.dblclick(pt['x'],pt['y']);page.mouse.wheel(0,100)
    check('Battle lock prevents double-click delete and wheel rotation',config()==saved)
    page.locator('#start').click();page.wait_for_timeout(650)
    # Latest pickup cooldown is shared, visible, and follows authoritative state.
    page.evaluate('''()=>{const E=CSpireArena,s=E.createPracticeBattle(__editQA.cfg(),6,555);s.hazards=[];s.pickups=[];const r=s.robots[0];r.health=90;s.pickups.push({id:0,kind:'repair',x:r.x,y:r.y,r:12,spawnAt:0,expiresAt:120,collectedBy:null,announced:true});E.collectPickups(s);__editQA.show(s);}''')
    check('HUD shows the new 10-second cooldown on the collecting robot only',page.locator('#pickup-status-a').inner_text()=='BONUS IN 10s' and page.locator('#pickup-status-b').inner_text()=='BONUS READY')
    check('Telemetry reports the shared pickup lock',page.locator('#pickup-cooldown').inner_text()=='10.0s / 10s')
    page.evaluate('''()=>{const s=__editQA.state();for(let i=0;i<180;i++)CSpireArena.step(s);__editQA.refresh();}''')
    check('HUD countdown follows simulation time, not wall-clock waits','7s' in page.locator('#pickup-status-a').inner_text())
    # Screenshots and responsive checks of all six cards.
    page.evaluate("document.getElementById('arena-size-toggle').click()")
    for width,height in [(320,760),(390,844),(740,1000),(900,1000),(1280,900),(1560,1080)]:
        page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(250)
        check(f'Six-seat layout fits {width}px without horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        check(f'Six-seat HUD cards never overlap at {width}px',page.evaluate("(()=>{const a=[...document.querySelectorAll('.fighter')].filter(e=>!e.hidden).map(e=>e.getBoundingClientRect());return a.every((r,i)=>a.every((q,j)=>i===j||r.right<=q.left||q.right<=r.left||r.bottom<=q.top||q.bottom<=r.top))})()"))
        check(f'Energy remains less than half HP size at {width}px',page.evaluate("parseFloat(getComputedStyle(document.getElementById('energy-a')).fontSize)<.5*parseFloat(getComputedStyle(document.getElementById('health-a')).fontSize)"))
        if width==390:page.screenshot(path=str(R/'previews/six-mobile.png'))
    # Final standings show all six rows, with winner back over the field.
    page.evaluate('''()=>{const s=CSpireArena.createPracticeBattle(__editQA.cfg(),6,775);s.time=120;[201,113,130,77,184,196].forEach((v,i)=>s.robots[i].health=v);CSpireArena.finishIfNeeded(s);__editQA.show(s,true);}''');page.wait_for_timeout(800)
    check('Full six-row standings appear to the right on desktop',page.evaluate("document.querySelectorAll('#results-rows tr').length===6&&document.getElementById('results-panel').getBoundingClientRect().left>=document.getElementById('arena').getBoundingClientRect().right"))
    check('Winner name is visible over the board and never intercepts pointer events',page.evaluate("!document.getElementById('arena-banner').classList.contains('hidden')&&document.querySelector('#arena-banner strong').textContent.includes(__editQA.cfg().name)&&getComputedStyle(document.getElementById('arena-banner')).pointerEvents==='none'"))
    page.screenshot(path=str(R/'previews/six-results.png'))
    for width in [320,390,740]:
        page.set_viewport_size({'width':width,'height':1000});page.wait_for_timeout(200)
        check(f'Final six-player standings stay readable and outside field at {width}px',page.evaluate("document.documentElement.scrollWidth<=innerWidth&&document.getElementById('results-panel').getBoundingClientRect().top>=document.getElementById('arena').getBoundingClientRect().bottom"))
    check('No JavaScript runtime errors in editor/six-seat/pickup checks',not errors)
    browser.close()
(R/'browser-editor-six-results.json').write_text(json.dumps({'checks':checks,'errors':errors},indent=2))
print(f'{len(checks)} editor, six-seat and pickup browser checks passed.')
