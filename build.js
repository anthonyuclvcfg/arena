#!/usr/bin/env node
'use strict';
// Rebuild the self-contained offline edition after editing public/.
const fs=require('node:fs');
const path=require('node:path');
const folder=path.join(__dirname,'public');
const read=name=>fs.readFileSync(path.join(folder,name),'utf8');
let html=read('index.html');
html=html.replace('<link rel="stylesheet" href="style.css">','<style>\n'+read('style.css')+'\n</style>');
html=html.replace('<script src="engine.js"></script><script src="app.js"></script>',
  ['engine.js','app.js'].map(name=>'<script>\n'+read(name).replace(/<\/script/gi,'<\\/script')+'\n</script>').join(''));
const dest=path.join(__dirname,'cspire-arena.html');
fs.writeFileSync(dest,html);console.log('Created: '+dest);
