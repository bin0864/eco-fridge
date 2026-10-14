/* SMART FRIDGE v16 public cloud bridge.
 * Local API compatibility adapter for the unchanged v15 visual UI.
 * Simulations never leave the visitor's browser; remote sensor is read-only.
 */
(function(){
'use strict';
const realFetch=window.fetch.bind(window);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const zone=(t,h,virtual=true)=>({temperature:t,humidity:h,predicted:t,trend:'안정',sensorReady:true,virtual,doorOpen:false,severity:'normal',status:'정상',statusClass:'good',action:'현재 상태를 유지하세요.',icon:'✓'});
const storageKey='smart-fridge-v16-sim';
const demoModes=['normal','fridgeDoor','freezerDoor','fridgeLeak','freezerLeak','fridgeWarm','freezerWarm','fridgeFreeze','freezerOvercool','humidity','both','fault','recovery'];
const modeNames={normal:'NORMAL',fridgeDoor:'FRIDGE DOOR',freezerDoor:'FREEZER DOOR',fridgeLeak:'FRIDGE LEAK',freezerLeak:'FREEZER LEAK',fridgeWarm:'FRIDGE WARM',freezerWarm:'FREEZER WARM',fridgeFreeze:'FRIDGE FREEZE',freezerOvercool:'FREEZER OVERCOOL',humidity:'HIGH HUMIDITY',both:'BOTH ABNORMAL',fault:'SENSOR FAULT',recovery:'RECOVERY'};
const initial=()=>({mode:'manual',fridge:5,freezer:-18,humidity:67,event:'none',eventAt:0,recoverAt:0,recoverValues:null,demoAt:0,demoSpeed:2,recoveryAt:0,recoveryFrom:null,baseline:null,baselineHumidity:null,remote:null,revision:1,sessionAt:Date.now()});
let state=initial();
try{
 const saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');
 if(saved&&typeof saved.fridge==='number'){state={...state,fridge:clamp(saved.fridge,-5,20),freezer:clamp(saved.freezer,-32,0),humidity:clamp(saved.humidity,20,95)}}
}catch(_e){}
function save(){try{sessionStorage.setItem(storageKey,JSON.stringify({fridge:state.fridge,freezer:state.freezer,humidity:state.humidity}))}catch(_e){}}
const cloudUrl=String(window.SMART_FRIDGE_CLOUD_URL||'').replace(/\/$/,'');
async function loadSensor(){
 if(!/^https:\/\//.test(cloudUrl)){state.remote=null;return;}
 try{
  const resp=await realFetch(cloudUrl+'/api/latest',{cache:'no-store',signal:AbortSignal.timeout(4500)});
  if(!resp.ok)throw Error('cloud http '+resp.status);
  const d=await resp.json();
  state.remote=d?.online && Number.isFinite(d.temperature) && Number.isFinite(d.humidity)?d:null;
  // Shared baseline is pinned to the FIRST received measurement in D1.
  // Every visitor sees the same virtual conversions; no public control can
  // change the submitted hardware's baseline.
  if(state.remote && Number.isFinite(d.baselineTemperature)){
   state.baseline=d.baselineTemperature;
   state.baselineHumidity=d.baselineHumidity;
   window.SMART_FRIDGE_SHARED_BASELINE=true;
  }
 }catch(e){state.remote=null;}
}
let lastRefresh=0;
async function loadSensorIfNeeded(){
 if(state.mode!=='sensorLink')return;
 if(Date.now()-lastRefresh>=10000){lastRefresh=Date.now();await loadSensor()}
}
function classify(z,freezer=false){
 const t=z.temperature;
 let severity='normal',status='정상',statusClass='good',action='현재 상태를 유지하세요.',icon='✓';
 if(freezer){
  if(t<=-24){severity='warning';status='과냉각';statusClass='cold';action='냉동실 설정 온도를 확인하세요.';icon='❄';}
  else if(t<=-21){severity='watch';status='저온 주의';statusClass='cold';action='냉동실 온도가 낮아요.';icon='❄';}
  else if(t>=-10){severity='critical';status='고온 위험';statusClass='danger';action='냉동실 문과 냉각 상태를 점검하세요.';icon='↑';}
  else if(t>=-15){severity='warning';status='온도 상승 주의';statusClass='warning';action='냉동실 문과 고무 패킹을 확인하세요.';icon='↑';}
 }else{
  if(t<=0){severity='warning';status='결빙 주의';statusClass='cold';action='냉장 온도 설정을 확인하세요.';icon='❄';}
  else if(t>=10){severity='critical';status='고온 위험';statusClass='danger';action='문과 패킹을 확인하고 냉각 기능을 점검하세요.';icon='↑';}
  else if(t>=6){severity='warning';status='온도 상승 주의';statusClass='warning';action='냉장실 문이 닫혔는지 확인하세요.';icon='↑';}
  else if(z.humidity>=76){severity='warning';status='습도 높음';statusClass='warning';action='식품 밀폐 상태를 확인하세요.';icon='≈';}
  else if(z.humidity<=35){severity='watch';status='습도 낮음';statusClass='warning';action='식품이 마르지 않도록 밀폐 상태를 확인하세요.';icon='≈';}
  else if(z.humidity<40){severity='watch';status='습도 낮음 경계';statusClass='warning';action='식품 밀폐 상태를 확인하세요.';icon='≈';}
 }
 Object.assign(z,{severity,status,statusClass,action,icon});
}
function eventValues(){
 const ev=state.event;
 const progress=clamp((Date.now()-state.eventAt)/18000,0,1);
 const r=clamp((progress-.02)/.98,0,1);
 let f=state.freezer, t=state.fridge,h=state.humidity;
 let fd=false,rd=false, ready=true;
 if(ev==='fridgeDoor'){t+=7.5*r;h+=12*r;rd=r>.02;}
 if(ev==='freezerDoor'){f+=10*r;fd=r>.02;}
 if(ev==='fridgeLeak'){t+=4.6*r;h+=7*r;}
 if(ev==='freezerLeak'){f+=6.5*r;}
 if(ev==='fault'&&r>.1)ready=false;
 if(state.recoverValues){
  const k=clamp((Date.now()-state.recoverAt)/1400,0,1);
  const eased=k*k*(3-2*k);
  f=state.recoverValues.f+(state.freezer-state.recoverValues.f)*eased;
  t=state.recoverValues.t+(state.fridge-state.recoverValues.t)*eased;
  h=state.recoverValues.h+(state.humidity-state.recoverValues.h)*eased;
  fd=false;rd=false;ready=true;
  if(k>=1)state.recoverValues=null;
 }
 return {f,t,h,fd,rd,ready,progress};
}
function result(){
 const now=new Date();
 const sensor=state.mode==='sensorLink';
 const online=Boolean(state.remote);
 const actual=state.remote;
 const calibrated=sensor&&online&&state.baseline!==null;
 const delta=calibrated?(Number.isFinite(actual.confirmedTemperature)?actual.confirmedTemperature:actual.temperature)-state.baseline:0;
 const ev=sensor?null:eventValues();
 let demoProgress=0,recoveryProgress=0;
 if(!sensor&&demoModes.includes(state.mode)){
   if(state.mode==='normal'){Object.assign(ev,{f:-18,t:5,h:67,fd:false,rd:false,ready:true});}
   else if(state.mode==='recovery'){
     recoveryProgress=clamp((Date.now()-state.recoveryAt)/18000,0,1);
     const k=recoveryProgress*recoveryProgress*(3-2*recoveryProgress);
     const from=state.recoveryFrom||{f:-18,t:5,h:67};
     Object.assign(ev,{f:from.f+(-18-from.f)*k,t:from.t+(5-from.t)*k,h:from.h+(67-from.h)*k,fd:false,rd:false,ready:true});
     if(recoveryProgress>=1){state.mode='normal';state.revision++;}
   }else{
     demoProgress=clamp((Date.now()-state.demoAt)/(36000/state.demoSpeed),0,1);
     const v=clamp((demoProgress-.1)/.9,0,1);
     Object.assign(ev,{f:-18,t:5,h:67,fd:false,rd:false,ready:true});
     const m=state.mode;
     if(m==='fridgeDoor'){ev.t=4+7.5*v;ev.h=67+12*v;ev.rd=v>.04;}
     if(m==='freezerDoor'){ev.f=-18+10*v;ev.fd=v>.04;}
     if(m==='fridgeLeak'){ev.t=4+4.6*v;ev.h=67+7*v;}
     if(m==='freezerLeak'){ev.f=-18+6.5*v;}
     if(m==='fridgeWarm')ev.t=4+9*v;
     if(m==='freezerWarm')ev.f=-18+12*v;
     if(m==='fridgeFreeze')ev.t=4-6.5*v;
     if(m==='freezerOvercool')ev.f=-18-10*v;
     if(m==='humidity')ev.h=67+24*v;
     if(m==='both'){ev.f=-18+11*v;ev.t=4+8*v;ev.h=67+17*v;}
     if(m==='fault'&&v>.1)ev.ready=false;
   }
 }
 const f=zone(sensor?-18+2*delta:ev.f,35);
 const r=zone(sensor?5+5*delta:ev.t,sensor?67:ev.h);
 if(!sensor){f.doorOpen=ev.fd;r.doorOpen=ev.rd;f.sensorReady=ev.ready;r.sensorReady=ev.ready;}
 else{f.sensorReady=online;r.sensorReady=online;}
 if(f.sensorReady)classify(f,true);
 if(r.sensorReady)classify(r,false);
 if(!sensor&&state.event!=='none'&&!state.recoverValues){
  const name={fridgeDoor:'문 열림',freezerDoor:'문 열림',fridgeLeak:'냉기 누출',freezerLeak:'냉기 누출',fault:'센서 이상'}[state.event];
  const relevant=['fridgeDoor','fridgeLeak'].includes(state.event)?r:['freezerDoor','freezerLeak'].includes(state.event)?f:null;
  if(relevant&&ev.progress>.02){Object.assign(relevant,{status:name,severity:'warning',statusClass:'warning',icon:'↗',action:name==='문 열림'?'문을 닫아 주세요.':'문과 고무 패킹을 확인하세요.'});}
  if(state.event==='fault'&&!ev.ready){for(const z of [f,r])Object.assign(z,{status:'센서 이상',severity:'sensor',statusClass:'sensor',action:'가상 센서 이상 시연입니다.',icon:'•'});}
 }
 if(!sensor&&demoModes.includes(state.mode)&&demoProgress>.13){
   const m=state.mode;
   const match={fridgeDoor:[r,'문 열림','냉장실 문을 닫아주세요.'],freezerDoor:[f,'문 열림','냉동실 문을 닫아주세요.'],fridgeLeak:[r,'냉기 누출','냉장실 고무 패킹을 확인하세요.'],freezerLeak:[f,'냉기 누출','냉동실 고무 패킹을 확인하세요.']};
   if(match[m]){const [z,status,action]=match[m];Object.assign(z,{status,action,severity:'warning',statusClass:'warning',icon:'↗'});}
   if(m==='fault'){for(const z of [f,r])Object.assign(z,{status:'센서 이상',severity:'sensor',statusClass:'sensor',sensorReady:false,icon:'•',action:'가상 센서 이상 시연입니다.'});}
 }
 if(sensor&&!online){for(const z of [f,r])Object.assign(z,{status:'센서 오프라인',severity:'sensor',statusClass:'sensor',icon:'•',action:'ESP8266의 전원·인터넷 연결을 확인하세요.'});}
 const rank={normal:0,watch:1,warning:2,critical:3,sensor:4};
 const strongest=(rank[r.severity]>=rank[f.severity])?r:f;
 const any=rank[strongest.severity]>0;
 const both=rank[r.severity]>0&&rank[f.severity]>0;
 const status=sensor&&!online?'실제 센서 오프라인':sensor&&!calibrated?'실내 기준 온도를 설정해 주세요':any?(both?'두 구역 상태를 확인하세요':strongest===r?'냉장실 '+strongest.status:'냉동실 '+strongest.status):sensor?'가상 냉장고 상태가 정상이에요':'문제 없어요';
 const why=sensor&&!online?'클라우드에 새로운 측정값이 없습니다. 가상 환경 시연은 계속 사용할 수 있어요.':sensor&&!calibrated?'DHT11 실내 온도·습도는 수신 중이에요. 기준 고정 버튼을 누르면 두 가상 구역으로 환산해요.':sensor?'실내 DHT11 측정값을 두 구역에 서로 다른 비율로 반영한 가상 시연입니다.':any?'가상 조절 또는 이벤트에 따른 온도·습도 변화가 감지되었어요.':'현재 가상 환경이 정상 범위예요.';
 const dateTime=now.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false});
 return {mode:sensor?'SENSOR LINK':state.mode==='manual'?'MANUAL':(modeNames[state.mode]||'MANUAL'), modeRevision:state.revision,uptimeMs:Date.now()-state.sessionAt,
  modeLabel:sensor?'실제 센서 연동':'가상 환경 시연', secondaryStatus:'',
  manualFridge:state.fridge,manualFreezer:state.freezer,manualHumidity:state.humidity,
  manualEvent:sensor?'none':state.event,manualEventProgress:!sensor&&state.mode==='manual'&&state.event!=='none'?Math.round(ev.progress*100):0, manualRecovering:!!state.recoverValues,
  ambientReady:online,ambientTemperature:online?actual.temperature:0,ambientHumidity:online?actual.humidity:0,
  baselineCaptured:state.baseline!==null,sensorBaseline:state.baseline??0,baselineHumidity:state.baselineHumidity??0,sensorTarget:2,sensorPending:online?Boolean(actual.sensorPending):false,sensorConfirmedTemperature:online?(actual.confirmedTemperature??actual.temperature):0,
  roomNormalMin:25,demoProgress:Math.round(demoProgress*100),demoSpeed:state.demoSpeed,demoSeconds:36/state.demoSpeed,recoveryProgress:Math.round(recoveryProgress*100),
  status,statusClass:strongest.statusClass,overallAction: sensor&&!online?'ESP8266 인터넷 연결과 클라우드 상태를 확인하세요.':strongest.action,overallWhy:why,overallIcon:strongest.icon,overallHint:sensor?'실내 DHT11 실측 → 가상 냉장고':both?'냉동실 + 냉장실':strongest===r?'냉장실':'냉동실', problemZone:both?'both':any?(strongest===r?'refrigerator':'freezer'):'none',time:dateTime,freezer:f,refrigerator:r};
}
async function fakeApi(url,options={}){
 const params=url.searchParams,path=url.pathname;
 const reply=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json'}});
 const val=params.get('value'),step=Number(params.get('step'));
 if(path==='/api/data'){await loadSensorIfNeeded();return reply(result());}
 if(path==='/api/history')return reply({freezer:[],refrigerator:[]});
 if(path==='/api/mode'){
  const newMode=params.get('scenario');
  if(!['manual','sensorLink',...demoModes].includes(newMode))return reply({error:'unsupported_public_mode'},400);
  state.mode=newMode;state.revision++;state.event='none';state.recoverValues=null;state.demoAt=Date.now();
  if(newMode==='sensorLink'){await loadSensorIfNeeded()}
  return reply({ok:true});
 }
 if(path==='/api/manual'){
  if(state.mode!=='manual'||state.event!=='none'||state.recoverValues||![-1,1].includes(step))return reply({error:'manual_unavailable'},409);
  if(params.get('field')==='fridge')state.fridge=clamp(state.fridge+step,-5,20);
  else if(params.get('field')==='freezer')state.freezer=clamp(state.freezer+step,-32,0);
  else if(params.get('field')==='humidity')state.humidity=clamp(state.humidity+step*5,20,95);
  else return reply({error:'bad_field'},400);
  state.revision++;save();return reply({ok:true});
 }
 if(path==='/api/manual-reset'){const d=initial();Object.assign(state,{fridge:d.fridge,freezer:d.freezer,humidity:d.humidity,event:'none',recoverValues:null,mode:'manual'});state.revision++;save();return reply({ok:true});}
 if(path==='/api/manual-event'){
  if(state.mode!=='manual'||state.recoverValues)return reply({error:'manual_unavailable'},409);
  const event=params.get('scenario');
  if(!['clear','fridgeDoor','freezerDoor','fridgeLeak','freezerLeak','fault'].includes(event))return reply({error:'bad_event'},400);
  if(event==='clear'||state.event===event){
   const z=eventValues();state.recoverValues={f:z.f,t:z.t,h:z.h};state.recoverAt=Date.now();state.event='none';
  }else {state.event=event;state.eventAt=Date.now();}
  state.revision++;return reply({ok:true});
 }
 if(path==='/api/sensor-baseline'){
  await loadSensorIfNeeded();
  if(state.mode!=='sensorLink'||!state.remote)return reply({error:'sensor_offline'},409);
  if(window.SMART_FRIDGE_SHARED_BASELINE)return reply({ok:true});
  state.baseline=state.remote.temperature;state.baselineHumidity=state.remote.humidity;state.revision++;return reply({ok:true});
 }
 if(path==='/api/sensor-target')return reply({ok:true});
 if(path==='/api/demo-speed'){
   const n=Number(val);if(![1,2,4].includes(n))return reply({error:'bad_speed'},400);
   state.demoSpeed=n;return reply({ok:true});
 }
 if(path==='/api/recover'){
   if(!demoModes.includes(state.mode)||['normal','recovery'].includes(state.mode))return reply({error:'not_demo_issue'},409);
   const d=result();state.recoveryFrom={f:d.freezer.temperature,t:d.refrigerator.temperature,h:d.refrigerator.humidity};
   state.recoveryAt=Date.now();state.mode='recovery';state.revision++;return reply({ok:true});
 }
 if(path==='/api/room-base')return reply({ok:true});
 return reply({error:'not_found'},404);
}
window.fetch=async function(input,options){
 const url=(typeof input==='string'?input:input?.url||'');
 if(!/^\/api\//.test(url))return realFetch(input,options);
 try{return await fakeApi(new URL(url,window.location.origin==='null'?'https://smart-fridge.local':window.location.origin),options)}
 catch(err){console.error('SMART FRIDGE bridge:',err);return new Response(JSON.stringify({error:'bridge_error'}),{status:503,headers:{'Content-Type':'application/json'}})}
};
})();
