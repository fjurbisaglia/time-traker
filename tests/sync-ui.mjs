import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import worker,{LeoState} from '../cloudflare/worker.mjs';
const data=new Map();const storage={async get(k){return structuredClone(data.get(k))},async put(k,v){data.set(k,structuredClone(v))},async transaction(fn){return fn(this)}};
const object=new LeoState({storage});
const key='test-'.repeat(8);const origin='https://fjurbisaglia.github.io';
const env={SYNC_KEY:key,ALLOWED_ORIGIN:origin,LEO_STATE:{idFromName:n=>n,get:()=>object}};
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8').match(/<script>([\s\S]*)<\/script>/)[1].replace('settle();render();\n})();','settle();render();\nglobalThis.api={mutate,updateLimit,start,cloud,getDB:()=>db};\n})();');
let now=new Date(2026,9,20,12).getTime();
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
function client(session=new Map(),local=new Map()){
 const elements=new Map();let offline=false;
 const get=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',style:{},dataset:{},addEventListener(){}});return elements.get(id)};
 const ctx={Date:Clock,sessionStorage:{getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)},document:{getElementById:get,querySelectorAll:()=>[],addEventListener(){},visibilityState:'visible'},window:{addEventListener(){}},localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},setInterval(){},setTimeout,clearTimeout,AbortController,console,confirm:()=>true,alert(){},fetch:async(url,options)=>{if(offline)throw Error('Sin conexión');return worker.fetch(new Request(url,{...options,headers:{...options.headers,Origin:origin}}),env)}};
 vm.runInNewContext(source,ctx);
 return{get,api:ctx.api,offline:()=>offline=true,connect:async()=>{get('syncKey').value=key;await get('syncForm').onsubmit({preventDefault(){}})}};
}
const a=client(),b=client();await a.connect();await b.connect();assert(a.api.cloud.enabled);assert(b.api.cloud.enabled);
await a.api.mutate(()=>a.api.updateLimit('ps',75));assert.equal(a.api.cloud.revision,2);
await b.api.mutate(()=>b.api.updateLimit('ps',90));assert.equal(b.api.getDB().days[b.get('day').value].limits.ps,75);assert.match(b.get('syncMessage').textContent,/Otro dispositivo/);
await b.api.mutate(()=>b.api.updateLimit('ps',90));assert.equal(b.api.cloud.revision,3);
b.offline();await b.api.mutate(()=>b.api.updateLimit('ps',100));assert.equal(b.api.getDB().days[b.get('day').value].limits.ps,90);
assert.equal(data.get('snapshot').state.days[b.get('day').value].limits.ps,90);
console.log('OK: importación inicial, conexión de dos dispositivos, conflicto sin sobrescritura, reintento y fallo de red sin cambio local.');

// A running local timer survives first-time linking and is reconstructed by another device.
data.clear();
const session=new Map(),local=new Map();const mac=client(session,local);
mac.api.start('ps');now+=15000;
await mac.connect();assert.equal(mac.api.getDB().running.id,'ps');
assert.equal(data.get('snapshot').state.running.id,'ps');
now+=20000;const phone=client();await phone.connect();
assert.equal(phone.api.getDB().running.id,'ps');
assert.equal(phone.api.getDB().days[phone.get('day').value].used.ps,35);
// Refreshing the same tab reconnects; a new tab without credentials cannot edit a cached shared copy.
const reload=client(session,local);await new Promise(setImmediate);
assert.equal(reload.api.cloud.enabled,true);assert.equal(reload.api.getDB().running.id,'ps');
const locked=client(new Map(),local);const before=locked.api.getDB().days[locked.get('day').value].limits.ps;
await locked.api.mutate(()=>locked.api.updateLimit('ps',120));
assert.equal(locked.api.getDB().days[locked.get('day').value].limits.ps,before);
assert.match(locked.get('syncMessage').textContent,/reconectar/);
console.log('OK: contador activo conservado, tiempo reconstruido al entrar desde otro dispositivo, recarga con reconexión y bloqueo sin clave.');
