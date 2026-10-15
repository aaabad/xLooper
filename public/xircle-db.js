// Global xircle directory, shared by every xircle app.
// xirclePeople and xircleContacts are global: one person, found by a SHA-256
// hash (lowercase trimmed email, E.164 phone). Each Firebase web appId is a
// sub-xircle. xircleMembers/{appId}__{memberId} holds that app's family tree
// (parentId is who invited them inside this app only).
//
// Backend: Firebase Firestore REST when public/config.js has firebase.apiKey
// and firebase.projectId. The sub-xircle key is firebase.appId (xlooper when
// the id is omitted). Otherwise this phone plus the ntfy signup topic
// (about 12 hours). Never put a service-account private key in config.js.
// See README and firestore.rules.
(function(root){
 const PEOPLE='name,chatId,emailHash,phoneHash,consentAt,withdrawn';
 const CONTACT='kind,memberId,withdrawn';
 const MEMBER='appId,memberId,parentId,name,chatId,joinedAt,withdrawn';
 const INVITE='id,appId,toMemberId,toChatId,fromMemberId,fromName,groupId,groupName,room,status,ts';
 const DEFAULT_APP='xlooper';
 function blank(){return{people:{},contacts:{},members:{},invites:{},seen:{}}}
 function memoryStorage(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{m.set(k,String(v))}}}
 function defaultStorage(){try{if(typeof localStorage!=='undefined'&&localStorage){localStorage.getItem(KEY);return localStorage}}catch(e){}return memoryStorage()}
 const KEY='xl.xdir';
 function readStore(storage){try{const raw=JSON.parse(storage.getItem(KEY)||'');if(!raw||typeof raw!=='object'||Array.isArray(raw))return blank();
  ['people','contacts','members','invites','seen'].forEach(k=>{if(!raw[k]||typeof raw[k]!=='object'||Array.isArray(raw[k]))raw[k]={}});return raw}catch(e){return blank()}}
 function writeStore(storage,db){try{storage.setItem(KEY,JSON.stringify(db))}catch(e){}}
 function normalizeEmail(raw){const s=String(raw==null?'':raw).trim().toLowerCase();if(!s||s.length>120)return '';if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))return '';return s}
 function normalizePhone(raw){let s=String(raw==null?'':raw).trim();if(!s)return '';s=s.replace(/[().\-\s]/g,'');if(s.indexOf('00')===0)s='+'+s.slice(2);
  if(s[0]==='+'){const d=s.slice(1).replace(/\D/g,'');return /^[1-9]\d{7,14}$/.test(d)?'+'+d:''}
  const d=s.replace(/\D/g,'');if(/^09\d{9}$/.test(d))return '+63'+d.slice(1);if(/^63\d{10}$/.test(d))return '+'+d;if(/^1\d{10}$/.test(d))return '+'+d;if(/^\d{10}$/.test(d))return '+1'+d;if(/^[1-9]\d{7,14}$/.test(d))return '+'+d;return ''}
 function classifyContact(raw){const s=String(raw==null?'':raw).trim();if(!s)return{error:'need-contact'};
  if(s.indexOf('@')>=0){const norm=normalizeEmail(s);return norm?{kind:'email',norm}:{error:'bad-email'}}
  const norm=normalizePhone(s);return norm?{kind:'phone',norm}:{error:'bad-phone'}}
 async function sha256Hex(text){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(text)));return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('')}
 async function hashContact(kind,raw){const norm=kind==='phone'?normalizePhone(raw):normalizeEmail(raw);if(!norm)return{error:kind==='phone'?'bad-phone':'bad-email'};return{kind:kind==='phone'?'phone':'email',norm,hash:await sha256Hex(norm)}}
 function contactsAvailable(nav){nav=nav||(typeof navigator!=='undefined'?navigator:null);return !!(nav&&nav.contacts&&typeof nav.contacts.select==='function')}
 function chatJoinUrl(originPath,groupId,parent){const base=String(originPath||'').replace(/[?#].*$/,'');const q=new URLSearchParams();q.set('chat',String(groupId||''));
  if(parent&&parent.id)q.set('xi',String(parent.id).slice(0,40));if(parent&&parent.name)q.set('xin',String(parent.name).replace(/[<>]/g,'').slice(0,24));return base+'?'+q.toString()}
 function handoff(spec){const who=String(spec.fromName||'A friend').replace(/[<>]/g,'').slice(0,40);const group=String(spec.groupName||'a chat').replace(/[<>]/g,'').slice(0,40);
  const link=String(spec.link||'');const subject=who+' invited you to '+group+' on xLooper';
  const body=subject+'\n\n'+link+'\n\nOpen the link to join the chat. Joining xircle is your choice. Nothing is sent until you tap send.';
  const share={title:subject,text:body,url:link};
  if(spec.kind==='email')return{kind:'email',href:'mailto:'+spec.address+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body),share};
  return{kind:'phone',href:'sms:'+spec.address+'?&body='+encodeURIComponent(body),share}}
 function pick(obj,keys){const out={};keys.split(',').forEach(k=>{if(obj[k]!=null)out[k]=obj[k]});return out}
 function assertNoRaw(obj){Object.keys(obj).forEach(k=>{if(/email|phone|tel|e164/i.test(k)&&!/hash/i.test(k))throw new Error('refusing field '+k);
  if(/hash$/i.test(k)&&obj[k]&&!/^[a-f0-9]{64}$/.test(String(obj[k])))throw new Error('bad hash')});
  ['emailHash','phoneHash','chatId','memberId','toChatId','fromMemberId','id'].forEach(k=>{const v=obj[k]==null?'':String(obj[k]);if(/@/.test(v))throw new Error('refusing to store a raw email');if(/\+\d{8,15}/.test(v))throw new Error('refusing to store a raw phone')})}
 function enc(v){if(typeof v==='boolean')return{booleanValue:v};if(typeof v==='number')return{integerValue:String(Math.trunc(v))};return{stringValue:String(v==null?'':v)}}
 function encodeDoc(obj){assertNoRaw(obj);const fields={};Object.keys(obj).forEach(k=>{fields[k]=enc(obj[k])});return{fields}}
 function dec(v){if(!v||typeof v!=='object')return null;if('stringValue' in v)return v.stringValue;if('integerValue' in v)return Number(v.integerValue);if('booleanValue' in v)return !!v.booleanValue;if('doubleValue' in v)return Number(v.doubleValue);if('nullValue' in v)return null;return null}
 function decodeDoc(doc){const out={};const fields=doc&&doc.fields||{};Object.keys(fields).forEach(k=>{out[k]=dec(fields[k])});return out}
 function docsFromQuery(json){const rows=Array.isArray(json)?json:[];return rows.map(r=>r&&r.document).filter(Boolean).map(decodeDoc)}
 function timeoutSignal(ms){try{if(typeof AbortSignal!=='undefined'&&AbortSignal.timeout)return AbortSignal.timeout(ms)}catch(e){}return undefined}
 function firebaseConfig(config){const f=config&&config.firebase;if(!f||!f.apiKey||!f.projectId)return null;return{apiKey:String(f.apiKey),projectId:String(f.projectId)}}
 function appIdOf(config){const raw=config&&config.firebase&&config.firebase.appId?String(config.firebase.appId).trim():'';if(!raw)return DEFAULT_APP;return /^[A-Za-z0-9:_-]{1,80}$/.test(raw)?raw:''}
 function topicOf(config){const c=config||{};if(c.xircleTopic&&typeof c.xircleTopic==='string'&&!/^https?:\/\//i.test(c.xircleTopic))return c.xircleTopic.replace(/[^A-Za-z0-9_-]/g,'').slice(0,64);
  const s=c.signupTopic;if(s&&typeof s==='string'&&!/^https?:\/\//i.test(s))return String(s).replace(/^\/+/,'').slice(0,64);return 'xlooper-xircle'}
 function noticeUrl(config){const s=config&&config.signupTopic;if(s&&/^https?:\/\//i.test(s))return s;return 'https://ntfy.sh/'+topicOf(config)}
 function memberKey(appId,id){return appId+'/'+id}
 function memberDocId(appId,id){return appId+'__'+id}
 function safeId(s){return String(s==null?'':s).replace(/[^A-Za-z0-9_-]/g,'').slice(0,40)}
 function clipName(s){return String(s==null?'':s).replace(/[<>]/g,'').trim().slice(0,80)}
 function personView(db,appId,id){const p=db.people[id];if(!p)return null;const m=db.members[memberKey(appId,id)];
  return{memberId:p.id,name:(m&&m.name)||p.name||'',chatId:(m&&m.chatId)||p.chatId||p.id,withdrawn:m?!!m.withdrawn:!!p.withdrawn,parentId:m&&m.parentId||'',inXlooper:!!m&&!m.withdrawn,appId,emailHash:p.emailHash||'',phoneHash:p.phoneHash||''}}
 function findByHash(db,appId,hash,onlyLive){const c=hash&&db.contacts[hash];if(!c)return null;if(onlyLive&&c.withdrawn)return null;const view=personView(db,appId,c.memberId);if(!view)return null;if(onlyLive&&!view.inXlooper)return null;return view}
 function eventApp(ev){return String(ev&&(ev.appId||ev.xircle)||'')}
 function applyMemberEvent(db,ev,appId){if(!ev||ev.email||ev.phone||ev.tel)return;const evApp=eventApp(ev);if(evApp&&evApp!==appId)return;if(ev.t==='xmember'){const id=safeId(ev.id);if(!id||!ev.emailHash)return;
   const key=memberKey(appId,id);const prev=db.members[key];const parent=prev&&prev.parentId?prev.parentId:(safeId(ev.parentId)||'');
   const prior=db.people[id];const chatId=safeId(ev.chatId)||id;
   db.people[id]={id,name:clipName(ev.name)||(prior&&prior.name)||'Player',chatId:(prior&&prior.chatId)||chatId,emailHash:String(ev.emailHash||''),phoneHash:String(ev.phoneHash||''),consentAt:+ev.ts||Date.now(),withdrawn:prior?!!prior.withdrawn:false};
   db.members[key]={appId,memberId:id,parentId:parent,name:db.people[id].name,chatId,joinedAt:prev&&prev.joinedAt||+ev.ts||Date.now(),withdrawn:!!ev.withdrawn};
   if(ev.emailHash)db.contacts[ev.emailHash]={hash:ev.emailHash,kind:'email',memberId:id,withdrawn:false};
   if(ev.phoneHash)db.contacts[ev.phoneHash]={hash:ev.phoneHash,kind:'phone',memberId:id,withdrawn:false};return}
  if(ev.t==='xwithdraw'){const id=safeId(ev.id);const m=id&&db.members[memberKey(appId,id)];if(m)m.withdrawn=true;return}
  if(ev.t==='xinvite'){const id=safeId(ev.id);if(!id)return;const prev=db.invites[id]||{};db.invites[id]=Object.assign({},prev,{id,appId,toMemberId:safeId(ev.toMemberId),toChatId:safeId(ev.toChatId),fromMemberId:safeId(ev.fromMemberId),fromName:clipName(ev.fromName),groupId:String(ev.groupId||prev.groupId||'').slice(0,40),groupName:clipName(ev.groupName||prev.groupName||''),room:String(ev.room||prev.room||'').slice(0,80),status:ev.status==='accepted'||ev.status==='dismissed'?ev.status:'pending',ts:+ev.ts||prev.ts||Date.now()})}}
 function createDirectory(opts){opts=opts||{};const config=opts.config||root.XLOOPER_CONFIG||{};const storage=opts.storage||defaultStorage();
  const fetchImpl=opts.fetch||root.fetch;const fb=firebaseConfig(config);const APP=appIdOf(config);let mode=fb&&APP?'firestore':'local';let firebaseError=fb&&!APP?'firebase.appId must be the public web app id.':'';let confirmed=false;let authed=null;let lastSync=0;
  const authKey='xl.fbauth';
  function authGet(){if(opts.authStorage)return opts.authStorage.get()||null;try{return JSON.parse(storage.getItem(authKey)||'null')}catch(e){return null}}
  function authSet(v){if(opts.authStorage){opts.authStorage.set(v);return}try{storage.setItem(authKey,JSON.stringify(v))}catch(e){}}
  function load(){return readStore(storage)}
  function save(db){writeStore(storage,db)}
  function baseUrl(){return 'https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(fb.projectId)+'/databases/%28default%29/documents'}
  async function parseRes(r){const text=await r.text();let json=null;try{json=text?JSON.parse(text):null}catch(e){}return{ok:r.ok,status:r.status,json,text}}
  function explainAuth(status,json){const msg=json&&json.error&&(json.error.message||json.error.status)||'';
   if(/OPERATION_NOT_ALLOWED|ADMIN_ONLY_OPERATION/i.test(msg))return 'Enable Anonymous sign-in in Firebase Authentication.';
   if(/API_KEY_INVALID|API key not valid/i.test(msg))return 'firebase.apiKey was rejected. Use the public web API key from Firebase project settings.';
   if(status===400&&/CONFIGURATION_NOT_FOUND|PROJECT_NOT_FOUND/i.test(msg))return 'firebase.projectId was not found.';
   return msg||('Firebase auth HTTP '+status)}
  async function ensureAuth(){if(mode!=='firestore')return '';const now=opts.now?opts.now():Date.now();const saved=authGet();
   if(saved&&saved.idToken&&saved.exp>now+60000){authed=saved;return saved.idToken}
   if(saved&&saved.refreshToken){try{const r=await fetchImpl('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(fb.apiKey),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(saved.refreshToken),signal:timeoutSignal(8000)});
    const body=await parseRes(r);if(body.ok&&body.json&&body.json.id_token){authed={idToken:body.json.id_token,refreshToken:body.json.refresh_token||saved.refreshToken,localId:body.json.user_id||saved.localId,exp:now+(+body.json.expires_in||3600)*1000};authSet(authed);return authed.idToken}}catch(e){}}
   const r=await fetchImpl('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key='+encodeURIComponent(fb.apiKey),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true}),signal:timeoutSignal(8000)});
   const body=await parseRes(r);if(!body.ok||!body.json||!body.json.idToken){mode='local';firebaseError=explainAuth(body.status,body.json);throw new Error(firebaseError)}
   authed={idToken:body.json.idToken,refreshToken:body.json.refreshToken,localId:body.json.localId,exp:now+(+body.json.expiresIn||3600)*1000};authSet(authed);return authed.idToken}
  async function fs(method,url,body){const token=await ensureAuth();const headers={'Content-Type':'application/json'};if(token)headers.Authorization='Bearer '+token;
   const sep=url.indexOf('?')>=0?'&':'?';const r=await fetchImpl(url+sep+'key='+encodeURIComponent(fb.apiKey),{method,headers,body:body==null?undefined:JSON.stringify(body),signal:timeoutSignal(8000)});
   const parsed=await parseRes(r);if(!parsed.ok){const err=new Error((parsed.json&&parsed.json.error&&parsed.json.error.message)||('HTTP '+parsed.status));err.status=parsed.status;if(parsed.status===403)err.message='Firestore rules blocked the request. Publish firestore.rules from this repo.';throw err}return parsed.json}
  async function getDoc(col,id){try{const json=await fs('GET',baseUrl()+'/'+col+'/'+encodeURIComponent(id));return decodeDoc(json)}catch(e){if(e.status===404)return null;throw e}}
  async function putDoc(col,id,data){const body=encodeDoc(data);const url=baseUrl()+'/'+col+'/'+encodeURIComponent(id);
   try{return decodeDoc(await fs('PATCH',url+'?currentDocument.exists=true',body))}catch(e){if(e.status!==404)throw e}
   try{return decodeDoc(await fs('POST',baseUrl()+'/'+col+'?documentId='+encodeURIComponent(id),body))}catch(e){if(e.status!==409)throw e;return decodeDoc(await fs('PATCH',url,body))}}
  async function queryEq(col,field,value,limit){const json=await fs('POST',baseUrl()+':runQuery',{structuredQuery:{from:[{collectionId:col}],where:{fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:{stringValue:String(value)}}},limit:limit||40}});return docsFromQuery(json)}
  async function publishNotice(ev){try{assertNoRaw(ev)}catch(e){return false}if(!fetchImpl)return false;try{const r=await fetchImpl(noticeUrl(config),{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(ev),signal:timeoutSignal(8000)});return !!r.ok}catch(e){return false}}
  async function pullNotice(){if(!fetchImpl)return;const url=noticeUrl(config);const getUrl=/^https?:\/\//i.test(config.signupTopic)?url:(url.replace(/\/$/,'')+'/json?poll=1&since=all');
   let parsed;try{const r=await fetchImpl(getUrl,{signal:timeoutSignal(8000)});parsed=await parseRes(r)}catch(e){return}
   if(!parsed.ok||!parsed.text)return;const db=load();parsed.text.split('\n').forEach(line=>{if(!line.trim())return;let row,ev;try{row=JSON.parse(line)}catch(e){return}if(!row||row.event!=='message'||!row.message)return;if(row.id&&db.seen[row.id])return;try{ev=JSON.parse(row.message)}catch(e){return}applyMemberEvent(db,ev,APP);if(row.id)db.seen[row.id]=1});
   const ids=Object.keys(db.seen);if(ids.length>400)ids.slice(0,ids.length-400).forEach(id=>{delete db.seen[id]});save(db)}
  async function pullIdentity(hash){if(mode!=='firestore'||!hash)return null;const contact=await getDoc('xircleContacts',hash);if(!contact||!contact.memberId)return null;const id=safeId(contact.memberId);if(!id)return null;const person=await getDoc('xirclePeople',id);if(!person)return null;const mem=await getDoc('xircleMembers',memberDocId(APP,id));const db=load();const prev=db.people[id];
   db.people[id]={id,name:clipName(person.name)||(prev&&prev.name)||'Player',chatId:safeId(person.chatId)||(prev&&prev.chatId)||id,emailHash:person.emailHash||'',phoneHash:person.phoneHash||'',consentAt:+person.consentAt||Date.now(),withdrawn:!!person.withdrawn};
   db.contacts[hash]={hash,kind:contact.kind==='phone'?'phone':'email',memberId:id,withdrawn:!!contact.withdrawn};
   const inDoc=mem&&mem.appId===APP&&safeId(mem.memberId)===id;
   if(inDoc)db.members[memberKey(APP,id)]={appId:APP,memberId:id,parentId:String(mem.parentId||''),name:clipName(mem.name||person.name)||db.people[id].name,chatId:safeId(mem.chatId)||id,joinedAt:+mem.joinedAt||Date.now(),withdrawn:!!mem.withdrawn};
   save(db);const live=inDoc&&!mem.withdrawn&&!contact.withdrawn&&!person.withdrawn;return{id,inThis:!!live}}
  async function sync(force){const now=opts.now?opts.now():Date.now();if(!force&&now-lastSync<15000)return status();lastSync=now;
   if(mode==='firestore'){try{await ensureAuth();const members=await queryEq('xircleMembers','appId',APP,80);const db=load();members.forEach(doc=>{if(doc.appId&&doc.appId!==APP)return;const id=safeId(doc.memberId);if(!id)return;const prev=db.people[id];
     db.members[memberKey(APP,id)]={appId:APP,memberId:id,parentId:String(doc.parentId||''),name:clipName(doc.name)||'Player',chatId:safeId(doc.chatId)||id,joinedAt:+doc.joinedAt||Date.now(),withdrawn:!!doc.withdrawn};
     db.people[id]=Object.assign({},prev||{emailHash:'',phoneHash:'',consentAt:+doc.joinedAt||now},{id,name:clipName(doc.name)||(prev&&prev.name)||'Player',chatId:(prev&&prev.chatId)||safeId(doc.chatId)||id,withdrawn:prev?!!prev.withdrawn:false});});
    const chatId=opts.chatId?safeId(opts.chatId()):'';const mine=opts.memberId?safeId(opts.memberId()):'';const incoming=[];
    if(chatId)incoming.push.apply(incoming,await queryEq('xircleInvites','toChatId',chatId,20));if(mine&&mine!==chatId)incoming.push.apply(incoming,await queryEq('xircleInvites','toMemberId',mine,20));
    incoming.forEach(doc=>{if(doc.appId&&doc.appId!==APP)return;const id=safeId(doc.id)||safeId(doc.groupId+doc.toChatId);if(!id)return;applyMemberEvent(db,{t:'xinvite',appId:doc.appId||APP,id,toMemberId:doc.toMemberId,toChatId:doc.toChatId,fromMemberId:doc.fromMemberId,fromName:doc.fromName,groupId:doc.groupId,groupName:doc.groupName,room:doc.room,status:doc.status,ts:doc.ts},APP)});save(db);confirmed=true}catch(e){if(/Anonymous|apiKey|projectId|rules|appId/i.test(e.message||''))mode='local';firebaseError=firebaseError||e.message||'Firebase is not ready';}}
   if(mode!=='firestore')await pullNotice();return status()}
  function status(){const configured=!!(fb&&APP);let detail;
   if(mode==='firestore'&&confirmed)detail='Directory: Firebase Firestore for xircle.us.';
   else if(mode==='firestore')detail='Directory: checking Firebase Firestore…';
   else if(firebaseError)detail='Directory: this phone and ntfy (about 12 hours). Firebase is not ready: '+firebaseError;
   else detail='Directory: this phone and ntfy (about 12 hours). Add firebase.apiKey and firebase.projectId in public/config.js (public web keys only), enable Anonymous sign-in, and publish firestore.rules.';
   return{mode,configured,confirmed,error:firebaseError,detail,topic:topicOf(config),appId:APP}}
  async function lookup(raw){const hit=classifyContact(raw);if(hit.error)return{error:hit.error};const hashed=await hashContact(hit.kind,hit.norm);
   if(mode==='firestore'){try{const ident=await pullIdentity(hashed.hash);if(ident&&ident.inThis)return{contact:hit,hash:hashed.hash,person:personView(load(),APP,ident.id)}}catch(e){firebaseError=firebaseError||e.message||''}}
   if(mode!=='firestore')await sync(false);const person=findByHash(load(),APP,hashed.hash,true);return{contact:hit,hash:hashed.hash,person:person||null}}
  async function join(input){input=input||{};if(!input.consent)return{error:'need-consent'};const name=clipName(input.name);if(!name)return{error:'need-name'};
   const email=await hashContact('email',input.email);if(email.error)return{error:email.error};let phone=null;if(String(input.phone||'').trim()){phone=await hashContact('phone',input.phone);if(phone.error)return{error:phone.error}}
   const chatId=safeId(input.chatId);if(!chatId)return{error:'need-id'};const now=opts.now?opts.now():Date.now();let db=load();
   let existing=findByHash(db,APP,email.hash,false)||(phone&&findByHash(db,APP,phone.hash,false));
   if(mode==='firestore'){try{const ident=await pullIdentity(email.hash)||(phone&&await pullIdentity(phone.hash));if(ident&&ident.id){db=load();existing=personView(db,APP,ident.id)||{memberId:ident.id}}}catch(e){firebaseError=firebaseError||e.message||''}}
   const id=existing?existing.memberId:chatId;db=load();const prevMem=db.members[memberKey(APP,id)];const parentId=prevMem?String(prevMem.parentId||''):(safeId(input.parentId)===id?'':safeId(input.parentId));
   const prior=db.people[id];const oldEmail=prior&&prior.emailHash;const oldPhone=prior&&prior.phoneHash;
   const person={id,name,chatId:(prior&&prior.chatId)||chatId,emailHash:email.hash,phoneHash:phone?phone.hash:'',consentAt:now,withdrawn:false};
   db.people[id]=person;db.members[memberKey(APP,id)]={appId:APP,memberId:id,parentId,name,chatId,joinedAt:prevMem&&prevMem.joinedAt||now,withdrawn:false};
   if(oldEmail&&oldEmail!==email.hash&&db.contacts[oldEmail]&&db.contacts[oldEmail].memberId===id)db.contacts[oldEmail].withdrawn=true;if(oldPhone&&(!phone||oldPhone!==phone.hash)&&db.contacts[oldPhone]&&db.contacts[oldPhone].memberId===id)db.contacts[oldPhone].withdrawn=true;
   db.contacts[email.hash]={hash:email.hash,kind:'email',memberId:id,withdrawn:false};if(phone)db.contacts[phone.hash]={hash:phone.hash,kind:'phone',memberId:id,withdrawn:false};save(db);
   let remote=false,error='';
   if(mode==='firestore'){try{await putDoc('xirclePeople',id,pick(person,PEOPLE));await putDoc('xircleMembers',memberDocId(APP,id),pick(db.members[memberKey(APP,id)],MEMBER));
     await putDoc('xircleContacts',email.hash,{kind:'email',memberId:id,withdrawn:false});if(phone)await putDoc('xircleContacts',phone.hash,{kind:'phone',memberId:id,withdrawn:false});
     if(oldEmail&&oldEmail!==email.hash)await putDoc('xircleContacts',oldEmail,{kind:'email',memberId:id,withdrawn:true});if(oldPhone&&(!phone||oldPhone!==phone.hash))await putDoc('xircleContacts',oldPhone,{kind:'phone',memberId:id,withdrawn:true});remote=true;confirmed=true}catch(e){error=e.message||'Firebase write failed';if(/Anonymous|apiKey|projectId|rules|appId/i.test(error))mode='local'}}
   if(!remote){remote=await publishNotice({t:'xmember',id,name,chatId,emailHash:email.hash,phoneHash:phone?phone.hash:'',parentId,appId:APP,withdrawn:false,ts:now});if(!remote)error=error||'The directory notice did not send.';else error=''}
   return{member:personView(load(),APP,id),emailHash:email.hash,phoneHash:phone?phone.hash:'',remote,local:true,error,created:!existing}}
  async function withdraw(memberId){const id=safeId(memberId);const db=load();const m=db.members[memberKey(APP,id)];const p=db.people[id];if(!m&&!p)return{ok:false,error:'missing'};if(m)m.withdrawn=true;save(db);let remote=false,error='';
   if(mode==='firestore'&&m){try{await putDoc('xircleMembers',memberDocId(APP,id),pick(m,MEMBER));remote=true}catch(e){error=e.message||'Firebase write failed';if(/Anonymous|apiKey|projectId|rules|appId/i.test(error))mode='local'}}
   if(!remote)remote=await publishNotice({t:'xwithdraw',id,appId:APP,ts:opts.now?opts.now():Date.now()});
   return{ok:true,remote,error}}
  function listMembers(){const db=load();const prefix=APP+'/';return Object.keys(db.members).filter(k=>k.indexOf(prefix)===0).map(k=>personView(db,APP,db.members[k].memberId)).filter(p=>p&&p.inXlooper)}
  function children(memberId){const id=safeId(memberId);const db=load();const prefix=APP+'/';return Object.keys(db.members).filter(k=>k.indexOf(prefix)===0&&db.members[k].parentId===id).map(k=>personView(db,APP,db.members[k].memberId)).filter(Boolean)}
  function person(memberId){return personView(load(),APP,safeId(memberId))}
  async function recordInvite(inv){const id=safeId(inv.id)||('i'+Math.random().toString(36).slice(2,10));const row={id,appId:APP,toMemberId:safeId(inv.toMemberId),toChatId:safeId(inv.toChatId),fromMemberId:safeId(inv.fromMemberId),fromName:clipName(inv.fromName),groupId:String(inv.groupId||'').slice(0,40),groupName:clipName(inv.groupName),room:String(inv.room||'').slice(0,80),status:'pending',ts:opts.now?opts.now():Date.now()};
   assertNoRaw(row);const db=load();db.invites[id]=row;save(db);let remote=false;
   if(mode==='firestore'){try{await putDoc('xircleInvites',id,pick(row,INVITE));remote=true}catch(e){if(/Anonymous|apiKey|projectId|rules|appId/i.test(e.message||''))mode='local'}}
   if(!remote)await publishNotice(Object.assign({t:'xinvite'},row));return row}
  function invitesFor(chatId,memberId){const c=safeId(chatId),m=safeId(memberId);return Object.keys(load().invites).map(k=>load().invites[k]).filter(inv=>inv&&inv.status==='pending'&&(!inv.appId||inv.appId===APP)&&(inv.toChatId===c||(m&&inv.toMemberId===m)))}
  async function setInviteStatus(id,status){id=safeId(id);if(status!=='accepted'&&status!=='dismissed')return null;const db=load();const row=db.invites[id];if(!row)return null;row.status=status;save(db);
   if(mode==='firestore'){try{await fs('PATCH',baseUrl()+'/xircleInvites/'+encodeURIComponent(id)+'?updateMask.fieldPaths=status&currentDocument.exists=true',encodeDoc({status}))}catch(e){}}
   else await publishNotice({t:'xinvite',id,appId:APP,status,toChatId:row.toChatId,toMemberId:row.toMemberId,groupId:row.groupId,ts:row.ts});return row}
  return{mode:()=>mode,status,sync,lookup,join,withdraw,listMembers,children,person,recordInvite,invitesFor,setInviteStatus,dump:()=>load(),appId:APP,XIRCLE:APP}}
 root.XLXircle={XIRCLE:DEFAULT_APP,appIdOf,createDirectory,normalizeEmail,normalizePhone,classifyContact,hashContact,sha256Hex,handoff,chatJoinUrl,contactsAvailable,encodeDoc,decodeDoc,assertNoRaw,PEOPLE,CONTACT,MEMBER,INVITE};
})(typeof window!=='undefined'?window:globalThis);
