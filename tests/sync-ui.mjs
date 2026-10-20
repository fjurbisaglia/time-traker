import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import worker,{LeoState} from '../cloudflare/worker.mjs';
const data=new Map();const storage={async get(k){return structuredClone(data.get(k))},async put(k,v){data.set(k,structuredClone(v))},async transaction(fn){return fn(this)}};
const object=new LeoState({storage});
const key='test-'.repeat(8);const origin='https://fjurbisaglia.github.io';
const env={SYNC_KEY:key,ALLOWED_ORIGIN:origin,LEO_STATE:{idFromName:n=>n,get:()=>object}};
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8').match(/<script>([\s\S]*)<\/script>/)[1].replace('settle();render();\n})();','settle();render();\nglobalThis.api={mutate,updateLimit,start,cloud,getDB:()=>db};\n})();');
function client(){
 const elements=new Map();let offline=false;
 const get=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',style:{},dataset:{},addEventListener(){}});return elements.get(id)};
 const ctx={document:{getElementById:get,querySelectorAll:()=>[],addEventListener(){},visibilityState:'visible'},window:{addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},setInterval(){},setTimeout,clearTimeout,AbortController,console,confirm:()=>true,alert(){},fetch:async(url,options)=>{if(offline)throw Error('Sin conexión');return worker.fetch(new Request(url,{...options,headers:{...options.headers,Origin:origin}}),env)}};
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
