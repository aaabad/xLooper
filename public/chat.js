// xLooper chat client. Logical rooms are xircle/<app>/<group>, e.g. xircle/xlooper/flight-ABCD.
// Transport is separate (ntfy today, a shared xircle.us service later). This file only
// stores rooms, membership, unread state, and the offline send queue.
(function(root){
 const APP='xlooper';
 const KEY='xl.chat';
 const MAX=200;
 const CHIPS=[{en:'On the tee',tl:'Nasa tee'},{en:'Lost ball',tl:'Nawawalang bola'},{en:'Nice shot!',tl:'Ang galing!'},{en:'Running late',tl:'Late ako'}];
 function mem(){const m={};return{getItem:k=>k in m?m[k]:null,setItem:(k,v)=>{m[k]=String(v)}}}
 let store=null;
 function dbStore(){if(store)return store;try{if(root.localStorage){root.localStorage.getItem(KEY);store=root.localStorage;return store}}catch(e){}store=mem();return store}
 function blank(){return{groups:{},queue:[],open:''}}
 function load(){try{const raw=JSON.parse(dbStore().getItem(KEY)||'');if(!raw||typeof raw!=='object'||Array.isArray(raw))return blank();if(!raw.groups||typeof raw.groups!=='object')raw.groups={};if(!Array.isArray(raw.queue))raw.queue=[];if(typeof raw.open!=='string')raw.open='';return raw}catch(e){return blank()}}
 function save(db){try{dbStore().setItem(KEY,JSON.stringify(db))}catch(e){}return db}
 function safeId(s){return String(s==null?'':s).replace(/[^A-Za-z0-9_-]/g,'').slice(0,40)}
 function part(s){return String(s==null?'':s).toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,16)}
 function roomOf(groupId){const id=safeId(groupId);return id?'xircle/'+APP+'/'+id:''}
 function idFromRoom(room){const m=String(room||'').match(/^xircle\/([a-z0-9_-]+)\/([A-Za-z0-9_-]{1,40})$/);return m&&m[1]===APP?m[2]:''}
 function topicOf(room){return String(room||'').replace(/\//g,'-').toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,64)}
 function directId(a,b){const p=[part(a),part(b)].filter(Boolean).sort();if(p.length<2||p[0]===p[1])return '';return 'dm-'+p[0]+'-'+p[1]}
 function userRoom(id){const p=part(id);return p?roomOf('u-'+p):''}
 function mid(){return 'm'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
 function code(){const cs='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='',rnd=null;try{if(root.crypto&&root.crypto.getRandomValues)rnd=root.crypto.getRandomValues(new Uint8Array(8))}catch(e){}
  for(let i=0;i<8;i++)s+=cs[(rnd?rnd[i]:Math.floor(Math.random()*256))%cs.length];return s}
 function person(p){if(!p||!p.id)return null;return{id:String(p.id).slice(0,40),name:String(p.name||'').slice(0,24)}}
 function upsert(g,p){const m=person(p);if(!m)return;g.members=g.members||[];const hit=g.members.find(x=>x.id===m.id);if(hit){if(m.name)hit.name=m.name}else g.members.push(m)}
 function make(spec){const id=safeId(spec.id);return{id,room:roomOf(id),name:String(spec.name||'Chat').slice(0,40),kind:spec.kind||'custom',admin:spec.admin?String(spec.admin).slice(0,40):'',members:[],pair:spec.pair||'',autoName:!!spec.autoName,muted:[],removed:[],readAt:+spec.readAt||0,msgs:[],created:Date.now(),left:false}}
 function directAdmin(a,b){return part(a)<=part(b)?a:b}
 function openDirect(db,me,other){const id=directId(me&&me.id,other&&other.id);if(!id)return null;const existed=!!db.groups[id];
  let g=db.groups[id];
  if(!g){g=make({id,name:(other&&other.name)||'Chat',kind:'direct',admin:directAdmin(me.id,other.id),pair:id,autoName:true,readAt:Date.now()});db.groups[id]=g}
  else{g.left=false;if((g.removed||[]).includes(me.id))g.removed=g.removed.filter(x=>x!==me.id)}
  upsert(g,me);upsert(g,other);
  if(g.kind==='direct'&&other&&other.name)g.name=String(other.name).slice(0,24);
  db.open=id;return{group:g,created:!existed}}
 function createGroup(db,me,name){const id=code();const g=make({id,name:String(name||'Group').slice(0,40)||'Group',kind:'custom',admin:me.id,readAt:Date.now()});upsert(g,me);db.groups[id]=g;db.open=id;return g}
 function canonJoin(raw){const s=String(raw||'').trim().replace(/\s+/g,'');if(/^dm-/i.test(s))return 'dm-'+s.slice(3).toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,37);if(/^(flight|tour|prac)-/i.test(s)){const i=s.indexOf('-');return s.slice(0,i).toLowerCase()+'-'+safeId(s.slice(i+1).toUpperCase())}return safeId(s.toUpperCase())}
 function joinGroup(db,me,raw){const id=canonJoin(raw);if(!id||id.length<4)return null;let g=db.groups[id];
  if(!g){g=make({id,name:/^dm-/.test(id)?'Chat':'Group '+id,kind:/^dm-/.test(id)?'direct':/^flight-/.test(id)?'flight':/^tour-|^prac-/.test(id)?'tour':'custom',admin:'',pair:/^dm-/.test(id)?id:'',readAt:0});db.groups[id]=g}
  g.left=false;g.removed=(g.removed||[]).filter(x=>x!==me.id);upsert(g,me);db.open=id;return g}
 function ensureShell(db,spec){const id=safeId(spec.id);if(!id)return null;let g=db.groups[id];
  if(!g){g=make({id,name:spec.name,kind:spec.kind||'custom',admin:spec.admin||'',readAt:Date.now()});db.groups[id]=g}
  if(spec.name)g.name=String(spec.name).slice(0,40);
  if(spec.kind)g.kind=spec.kind;
  if(spec.admin)g.admin=String(spec.admin).slice(0,40);
  if(spec.meId&&(g.removed||[]).includes(spec.meId)){g.left=true;return g}
  if(g.kind==='flight'||g.kind==='tour')g.left=false;
  (spec.members||[]).forEach(m=>{if(m&&m.id&&!(g.removed||[]).includes(m.id))upsert(g,m)});
  return g}
 function renameGrown(g){if(!g.autoName)return;const names=(g.members||[]).map(m=>m.name).filter(Boolean);if(names.length>2)g.name=names.slice(0,3).join(', ').slice(0,40)}
 function addPeople(db,groupId,people,by){const g=db.groups[groupId];if(!g||g.left)return null;const added=[];
  (people||[]).forEach(p=>{const m=person(p);if(!m)return;if((g.members||[]).some(x=>x.id===m.id))return;if((g.removed||[]).includes(m.id))g.removed=g.removed.filter(x=>x!==m.id);upsert(g,m);added.push(m)});
  if(!added.length)return{group:g,added:[],ev:null};
  if((g.members||[]).length>2&&g.kind==='direct'){g.kind='custom';renameGrown(g)}
  const ev={t:'cadd',room:g.room,people:added,members:g.members,name:g.name,admin:g.admin,fromId:by&&by.id||'',fromName:by&&by.name||'',text:((by&&by.name)||'Someone')+' added '+added.map(p=>p.name||'a player').join(', ')+'.',ts:Date.now(),mid:mid(),system:true};
  append(db,g.id,{mid:ev.mid,fromId:ev.fromId,fromName:ev.fromName,text:ev.text,ts:ev.ts,system:true});
  return{group:g,added,ev}}
 function spawnGroup(db,me,fromId,people,name){const src=db.groups[fromId];if(!src)return null;const id=code();const members=[];const seen=new Set();
  (src.members||[]).concat(people||[]).forEach(p=>{const m=person(p);if(!m||seen.has(m.id))return;seen.add(m.id);members.push(m)});
  const g=make({id,name:String(name||'Group').slice(0,40)||'Group',kind:'custom',admin:me.id,readAt:Date.now()});
  members.forEach(m=>upsert(g,m));g.spawnedFrom=fromId;db.groups[id]=g;
  const ev={t:'cmeta',room:g.room,name:g.name,admin:g.admin,members:g.members,fromId:me.id,fromName:me.name||'',ts:Date.now(),mid:mid()};
  const note={t:'cmsg',room:src.room,fromId:me.id,fromName:me.name||'',text:(me.name||'Someone')+' started '+g.name+' ('+g.id+'). This chat stays as it is.',ts:Date.now(),mid:mid(),system:true};
  append(db,src.id,{mid:note.mid,fromId:note.fromId,fromName:note.fromName,text:note.text,ts:note.ts,system:true});
  db.open=id;return{group:g,origin:src,ev,note}}
 function append(db,groupId,msg){const g=db.groups[groupId];if(!g||!msg)return null;g.msgs=g.msgs||[];
  if(msg.mid&&g.msgs.some(m=>m.mid===msg.mid))return null;
  if(msg.fromId&&(g.removed||[]).includes(msg.fromId)&&msg.fromId!==g.admin)return null;
  const row={mid:msg.mid||mid(),fromId:String(msg.fromId||'').slice(0,40),fromName:String(msg.fromName||'?').slice(0,24),text:String(msg.text||'').slice(0,280),ts:+msg.ts||Date.now(),pending:!!msg.pending,system:!!msg.system};
  if(!row.text)return null;g.msgs.push(row);g.msgs=g.msgs.slice(-MAX);return row}
 function messageEvent(g,me,text){return{t:'cmsg',room:g.room,fromId:me.id,fromName:String(me.name||'').slice(0,24),text:String(text||'').slice(0,280),ts:Date.now(),mid:mid()}}
 function metaOf(g,me){return{t:'cmeta',room:g.room,name:g.name,admin:g.admin,members:g.members||[],fromId:me&&me.id||'',fromName:me&&me.name||'',ts:Date.now(),mid:mid()}}
 function canModerate(g,byId){if(!g||!byId)return false;if(g.kind==='direct')return (g.members||[]).some(m=>m.id===byId);return !!g.admin&&g.admin===byId}
 function mute(db,groupId,targetId,byId,on){const g=db.groups[groupId];if(!g||!canModerate(g,byId)||!targetId||targetId===byId)return null;g.muted=g.muted||[];
  if(on){if(!g.muted.includes(targetId))g.muted.push(targetId)}else g.muted=g.muted.filter(x=>x!==targetId);
  const who=(g.members||[]).find(m=>m.id===targetId);  const ev={t:'cmute',room:g.room,targetId,muted:!!on,by:byId,admin:g.admin,fromId:byId,fromName:'',text:(on?'Muted ':'Unmuted ')+(who&&who.name||'a player')+'.',ts:Date.now(),mid:mid(),system:true};
  append(db,g.id,ev);return ev}
 function removeMember(db,groupId,targetId,byId){const g=db.groups[groupId];if(!g||!canModerate(g,byId)||!targetId||targetId===byId)return null;
  g.removed=g.removed||[];if(!g.removed.includes(targetId))g.removed.push(targetId);const who=(g.members||[]).find(m=>m.id===targetId);
  g.members=(g.members||[]).filter(m=>m.id!==targetId);
  const ev={t:'cremove',room:g.room,targetId,by:byId,admin:g.admin,fromId:byId,fromName:'',text:'Removed '+(who&&who.name||'a player')+'.',ts:Date.now(),mid:mid(),system:true};
  append(db,g.id,ev);return ev}
 function leave(db,groupId,meId){const g=db.groups[groupId];if(!g)return null;g.left=true;if(db.open===groupId)db.open='';
  return{t:'cleave',room:g.room,fromId:meId,ts:Date.now(),mid:mid()}}
 function markRead(db,groupId){const g=db.groups[groupId];if(!g)return;g.readAt=Date.now()}
 function unreadFor(g,meId){if(!g||g.left)return 0;const muted=new Set(g.muted||[]);return (g.msgs||[]).filter(m=>m.ts>(g.readAt||0)&&m.fromId!==meId&&!muted.has(m.fromId)&&!m.pending).length}
 function visible(g,ctx){if(!g||g.left)return false;ctx=ctx||{};if(g.kind==='flight')return g.id===ctx.flightId;if(g.kind==='tour')return g.id===ctx.tourId;return true}
 function list(db,ctx){const rows=Object.values(db.groups||{}).filter(g=>visible(g,ctx));
  const rank=g=>g.kind==='flight'?0:g.kind==='tour'?1:2;
  rows.sort((a,b)=>{const d=rank(a)-rank(b);if(d)return d;const ta=(a.msgs&&a.msgs.length)?a.msgs[a.msgs.length-1].ts:(a.created||0);const tb=(b.msgs&&b.msgs.length)?b.msgs[b.msgs.length-1].ts:(b.created||0);return tb-ta});
  return rows}
 function unread(db,meId,ctx){return list(db,ctx).reduce((n,g)=>n+unreadFor(g,meId),0)}
 function displayName(g,meId){if(!g)return '';if(g.kind==='direct'){const o=(g.members||[]).find(m=>m.id!==meId);return (o&&o.name)||g.name||'Chat'}return g.name||g.id}
 function fanout(g,meId){const rooms=[];if(g&&g.room)rooms.push(g.room);(g&&g.members||[]).forEach(m=>{if(!m||!m.id||m.id===meId)return;if((g.removed||[]).includes(m.id))return;const u=userRoom(m.id);if(u&&rooms.indexOf(u)<0)rooms.push(u)});return rooms}
 function enqueue(db,ev,rooms){db.queue=db.queue||[];db.queue.push({mid:ev.mid,ev,rooms:rooms&&rooms.length?rooms.slice():[ev.room]});db.queue=db.queue.slice(-80)}
 function shiftQueue(db,mid){if(!db.queue||!db.queue.length)return null;if(mid&&db.queue[0].mid!==mid){const i=db.queue.findIndex(q=>q.mid===mid);if(i<0)return null;return db.queue.splice(i,1)[0]}return db.queue.shift()}
 function ack(db,id){let n=0;Object.values(db.groups||{}).forEach(g=>{(g.msgs||[]).forEach(m=>{if(m.mid===id&&m.pending){m.pending=false;n++}})});return n}
 function involves(id,meId){if(!meId)return false;if(id.indexOf('dm-')===0){const bits=id.slice(3).split('-');const p=part(meId);return bits.length===2&&(bits[0]===p||bits[1]===p)}return false}
 function apply(db,ev,meId){if(!ev||typeof ev!=='object'||!ev.t)return null;const id=idFromRoom(ev.room);if(!id||id.indexOf('u-')===0)return null;
  let g=db.groups[id],created=false;
  if(!g){const members=Array.isArray(ev.members)?ev.members:(Array.isArray(ev.people)?ev.people:[]);
   const named=members.some(m=>m&&m.id===meId)||ev.targetId===meId||ev.fromId===meId||involves(id,meId);
   if(!named)return null;
   g=make({id,name:ev.name||(/^dm-/.test(id)?'Chat':id),kind:/^dm-/.test(id)?'direct':/^flight-/.test(id)?'flight':/^tour-|^prac-/.test(id)?'tour':'custom',admin:ev.admin||'',pair:/^dm-/.test(id)?id:'',autoName:/^dm-/.test(id),readAt:Date.now()-120000});
   db.groups[id]=g;created=true}
  if(ev.mid&&(g.msgs||[]).some(m=>m.mid===ev.mid))return{group:g,dup:true};
  let addedMsg=false,removedMe=false,needMeta=false;
  if(ev.t==='cmsg'&&ev.text){if(ev.fromId&&(g.removed||[]).includes(ev.fromId))return{group:g,ignored:true};
   const row=append(db,id,ev);addedMsg=!!row;if(ev.fromId)upsert(g,{id:ev.fromId,name:ev.fromName||''});
   if(g.kind==='direct'){const o=(g.members||[]).find(m=>m.id!==meId);if(o&&o.name)g.name=o.name}}
  else if(ev.t==='cjoin'&&ev.fromId){if(!(g.removed||[]).includes(ev.fromId))upsert(g,{id:ev.fromId,name:ev.fromName||''});if(g.admin&&g.admin===meId&&ev.fromId!==meId)needMeta=true}
  else if(ev.t==='cadd'){(ev.people||ev.members||[]).forEach(p=>{if(!p||!p.id)return;if(p.id===meId)g.left=false;if(!(g.removed||[]).includes(p.id))upsert(g,p)});
   if((g.members||[]).length>2&&g.kind==='direct'){g.kind='custom';if(ev.name)g.name=String(ev.name).slice(0,40);else renameGrown(g)}
   if(ev.text)addedMsg=!!append(db,id,{mid:ev.mid,fromId:ev.fromId,fromName:ev.fromName||'',text:ev.text,ts:ev.ts,system:true})}
  else if(ev.t==='cmute'&&ev.targetId){if(g.admin&&ev.by&&ev.by!==g.admin&&g.kind!=='direct')return{group:g,ignored:true};g.muted=g.muted||[];if(ev.muted){if(!g.muted.includes(ev.targetId))g.muted.push(ev.targetId)}else g.muted=g.muted.filter(x=>x!==ev.targetId);if(ev.text)addedMsg=!!append(db,id,ev)}
  else if(ev.t==='cremove'&&ev.targetId){if(g.admin&&ev.by&&ev.by!==g.admin&&g.kind!=='direct')return{group:g,ignored:true};
   g.removed=g.removed||[];if(!g.removed.includes(ev.targetId))g.removed.push(ev.targetId);g.members=(g.members||[]).filter(m=>m.id!==ev.targetId);if(ev.text)addedMsg=!!append(db,id,ev);if(ev.targetId===meId){g.left=true;removedMe=true;if(db.open===id)db.open=''}}
  else if(ev.t==='cleave'&&ev.fromId&&ev.fromId!==meId){g.members=(g.members||[]).filter(m=>m.id!==ev.fromId)}
  else if(ev.t==='cmeta'){if(ev.name&&g.kind!=='direct')g.name=String(ev.name).slice(0,40);if(ev.admin&&!g.admin)g.admin=String(ev.admin).slice(0,40);(ev.members||[]).forEach(p=>{if(p&&p.id&&!(g.removed||[]).includes(p.id))upsert(g,p)});if((ev.members||[]).some(p=>p&&p.id===meId))g.left=false}
  if(meId&&involves(g.id,meId))upsert(g,{id:meId,name:''});
  return{group:g,created,addedMsg,removedMe,needMeta,dup:false}}
 function chip(i,taglish){const c=CHIPS[i];return c?(taglish?c.tl:c.en):''}
 root.XLChat={APP,CHIPS,roomOf,topicOf,idFromRoom,directId,userRoom,part,load,save,mid,code,canonJoin,openDirect,createGroup,joinGroup,ensureShell,addPeople,spawnGroup,append,messageEvent,metaOf,canModerate,mute,removeMember,leave,markRead,unreadFor,unread,list,displayName,fanout,enqueue,shiftQueue,ack,apply,chip,visible};
})(typeof window!=='undefined'?window:globalThis);
