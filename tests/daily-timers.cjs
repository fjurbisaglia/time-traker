const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*)<\/script>/)[1].replace('settle();render();\n})();','settle();render();\nglobalThis.testApi={start,updateLimit,getDB:()=>db};\n})();');
function setup(saved){
 let now=new Date(2026,9,20,12).getTime(),tick;
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
 const nodes=new Map();
 const get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',style:{},addEventListener(){}});return nodes.get(id)};
 const c={Date:Clock,document:{getElementById:get,querySelectorAll:()=>[],addEventListener(){},visibilityState:'hidden'},window:{addEventListener(){}},localStorage:{getItem:()=>saved?JSON.stringify(saved):null,setItem(){}},setInterval:fn=>tick=fn,setTimeout(){},alert(){},console};
 vm.runInNewContext(source,c);
 return {api:c.testApi,get,tick:()=>tick(),advance:ms=>now+=ms,setTime:time=>now=time};
}
const x=setup();x.api.start('ps');x.advance(10000);x.tick();assert.equal(x.api.getDB().days['2026-10-20'].used.ps,10);
x.get('day').value='2026-10-21';x.get('day').onchange();
const markup=x.get('activities').innerHTML;
x.get('clock-ps').textContent='00:55:00';x.get('status-ps').textContent='Programado';
x.advance(5000);x.tick();assert.equal(x.get('clock-ps').textContent,'00:55:00');assert.equal(x.get('status-ps').textContent,'Programado');assert.equal(x.get('activities').innerHTML,markup);
x.api.updateLimit('ps',80);assert.equal(x.api.getDB().days['2026-10-21'].limits.ps,80);assert.equal(x.api.getDB().days['2026-10-20'].limits.ps,55);assert.equal(x.api.getDB().running.day,'2026-10-20');
x.api.start('yt');assert.equal(x.api.getDB().running.id,'ps');
x.get('day').value='2026-10-19';x.get('day').onchange();x.get('clock-ps').textContent='00:55:00';x.advance(5000);x.tick();assert.equal(x.get('clock-ps').textContent,'00:55:00');
x.get('today').onclick();assert(x.get('activities').innerHTML.includes('platform-card running'));assert.equal(x.api.getDB().days['2026-10-20'].used.ps,20);
const y=setup();y.setTime(new Date(2026,9,20,23,59,50).getTime());y.api.start('ps');y.advance(20000);y.tick();assert.equal(y.api.getDB().running,null);assert.equal(y.api.getDB().days['2026-10-20'].used.ps,10);assert.equal(y.api.getDB().days['2026-10-21']?.used.ps||0,0);
const z=setup({platforms:[{id:'ps',name:'PlayStation',limit:55}],days:{},running:{id:'ps',updatedAt:new Date(2026,9,19,23,59,50).getTime()}});assert.equal(z.api.getDB().running,null);assert.equal(z.api.getDB().days['2026-10-19'].used.ps,10);assert.equal(z.api.getDB().days['2026-10-20'].used.ps,0);
console.log('OK: fechas futuras y pasadas, límites independientes, vuelta a hoy, cambio de medianoche y migración de sesiones anteriores.');
