import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function loadXircle(){
  const context = {console, crypto, TextEncoder, URLSearchParams, encodeURIComponent, AbortSignal, Map, Date, Math, JSON, Object, String, Number, Array, Error, Uint8Array, Promise};
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'public/xircle-db.js'), 'utf8'), context, {filename: 'xircle-db.js'});
  return context.XLXircle;
}

function loadChat(){
  const context = {console, crypto, Date, Math, JSON, Object, String, Number, Array, Error, Uint8Array, Map};
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'public/chat.js'), 'utf8'), context, {filename: 'chat.js'});
  return context.XLChat;
}

function memStorage(){
  const m = new Map();
  return {getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => {m.set(k, String(v));}};
}

const XL = loadXircle();

test('email and phone normalize before hashing', async () => {
  assert.equal(XL.normalizeEmail('  Ada@Example.COM '), 'ada@example.com');
  assert.equal(XL.normalizeEmail('not-an-email'), '');
  assert.equal(XL.normalizePhone('+1 (415) 555-2671'), '+14155552671');
  assert.equal(XL.normalizePhone('415.555.2671'), '+14155552671');
  assert.equal(XL.normalizePhone('0917 123 4567'), '+639171234567');
  assert.equal(XL.normalizePhone('+63 917 123 4567'), '+639171234567');
  assert.equal(XL.normalizePhone('123'), '');
  const a = await XL.hashContact('email', 'Ada@Example.COM');
  const b = await XL.hashContact('email', 'ada@example.com');
  assert.equal(a.hash, b.hash);
  assert.equal(a.hash.length, 64);
  assert.equal(a.norm, 'ada@example.com');
  const phone = await XL.hashContact('phone', '4155552671');
  assert.equal(phone.norm, '+14155552671');
  assert.notEqual(phone.hash, a.hash);
});

test('local directory stores hashes only and keeps the invite tree', async () => {
  const board = [];
  const fetch = async (url, opt) => {
    const u = String(url);
    if (opt && opt.method === 'POST') {
      const ev = JSON.parse(opt.body);
      board.push(ev);
      return {ok: true, status: 200, text: async () => '{}'};
    }
    const text = board.map((ev, i) => JSON.stringify({id: 'n' + i, event: 'message', message: JSON.stringify(ev)})).join('\n');
    return {ok: true, status: 200, text: async () => text};
  };
  const ada = XL.createDirectory({config: {signupTopic: 'xlooper-test'}, storage: memStorage(), fetch, now: () => 1000});
  const joined = await ada.join({name: 'Ada', email: 'Ada@X.com', phone: '(415) 555-2671', chatId: 'ada1', consent: true});
  assert.equal(joined.error, '');
  assert.equal(joined.remote, true);
  assert.equal(joined.member.memberId, 'ada1');
  const blob = JSON.stringify(ada.dump());
  assert.equal(blob.includes('Ada@X.com'), false);
  assert.equal(blob.includes('ada@x.com'), false);
  assert.equal(blob.includes('4155552671'), false);
  assert.equal(blob.includes('+14155552671'), false);
  assert.equal(board.some(ev => JSON.stringify(ev).includes('ada@x.com')), false);
  assert.equal(board[0].t, 'xmember');
  assert.equal(board[0].emailHash, joined.emailHash);

  const bo = XL.createDirectory({config: {signupTopic: 'xlooper-test'}, storage: memStorage(), fetch, now: () => 2000});
  await bo.sync(true);
  const found = await bo.lookup('ada@x.com');
  assert.equal(found.person.chatId, 'ada1');
  assert.equal(found.person.name, 'Ada');
  const byPhone = await bo.lookup('+1 415 555 2671');
  assert.equal(byPhone.person.memberId, 'ada1');

  const child = await bo.join({name: 'Bo', email: 'bo@y.co', chatId: 'bo1', consent: true, parentId: 'ada1'});
  assert.equal(child.member.parentId, 'ada1');
  await ada.sync(true);
  const kids = ada.children('ada1');
  assert.equal(kids.length, 1);
  assert.equal(kids[0].name, 'Bo');
  assert.equal(kids[0].parentId, 'ada1');

  await ada.withdraw('ada1');
  await bo.sync(true);
  assert.equal((await bo.lookup('ada@x.com')).person, null);
  assert.equal(bo.children('ada1')[0].name, 'Bo');
  assert.equal(bo.listMembers().some(p => p.memberId === 'ada1'), false);

  const again = await ada.join({name: 'Ada', email: 'ada@x.com', chatId: 'ada9', consent: true, parentId: 'stranger'});
  assert.equal(again.member.memberId, 'ada1');
  assert.equal(again.member.chatId, 'ada9');
  assert.equal(again.member.parentId, '');
  assert.equal(ada.person('bo1').parentId, 'ada1');
});

test('join requires consent and does not send mail itself', async () => {
  const calls = [];
  const fetch = async (url, opt) => {calls.push({url: String(url), method: opt && opt.method, body: opt && opt.body}); return {ok: true, status: 200, text: async () => ''};};
  const dir = XL.createDirectory({config: {signupTopic: 'xlooper-test'}, storage: memStorage(), fetch});
  const denied = await dir.join({name: 'Ada', email: 'ada@x.com', chatId: 'ada1', consent: false});
  assert.equal(denied.error, 'need-consent');
  assert.equal(calls.length, 0);
  const draft = XL.handoff({kind: 'email', address: 'ada@x.com', link: 'https://aaabad.github.io/xLooper/?chat=ABCD&xi=ada1', groupName: 'Saturday', fromName: 'Bo'});
  assert.equal(draft.href.startsWith('mailto:ada@x.com?'), true);
  assert.equal(draft.href.includes('chat%3DABCD'), true);
  assert.equal(calls.length, 0);
  const sms = XL.handoff({kind: 'phone', address: '+14155552671', link: 'https://aaabad.github.io/xLooper/?chat=ABCD', groupName: 'Saturday', fromName: 'Bo'});
  assert.equal(sms.href.startsWith('sms:+14155552671?'), true);
  assert.equal(XL.contactsAvailable({}), false);
  assert.equal(XL.contactsAvailable({contacts: {select(){}}}), true);
});

function firestorePath(u){
  const path = String(u).split('?')[0];
  const i = path.lastIndexOf('/');
  return path.slice(0, i + 1) + decodeURIComponent(path.slice(i + 1));
}

function firestoreFetch(docs, calls){
  return async (url, opt) => {
    const u = String(url);
    calls.push({url: u, method: opt && opt.method || 'GET', body: opt && opt.body});
    if (u.includes('identitytoolkit.googleapis.com')) {
      return {ok: true, status: 200, text: async () => JSON.stringify({idToken: 'tok', refreshToken: 'ref', localId: 'uid', expiresIn: '3600'})};
    }
    const method = (opt && opt.method) || 'GET';
    const path = firestorePath(u);
    if (u.includes(':runQuery')) {
      const q = JSON.parse(opt.body).structuredQuery;
      const field = q.where.fieldFilter.field.fieldPath;
      const value = q.where.fieldFilter.value.stringValue;
      const rows = [];
      for (const [docPath, body] of docs) {
        if (!docPath.includes('/' + q.from[0].collectionId + '/')) continue;
        const decoded = XL.decodeDoc(body);
        if (decoded[field] === value) rows.push({document: body});
      }
      return {ok: true, status: 200, text: async () => JSON.stringify(rows)};
    }
    if (method === 'GET') {
      if (!docs.has(path)) return {ok: false, status: 404, text: async () => JSON.stringify({error: {message: 'missing', status: 'NOT_FOUND'}})};
      return {ok: true, status: 200, text: async () => JSON.stringify(docs.get(path))};
    }
    const body = JSON.parse(opt.body);
    if (method === 'PATCH' && u.includes('currentDocument.exists=true') && !docs.has(path)) {
      return {ok: false, status: 404, text: async () => JSON.stringify({error: {message: 'missing'}})};
    }
    if (method === 'POST' && u.includes('documentId=')) {
      const docId = new URL(u).searchParams.get('documentId');
      const docPath = u.split('?')[0].replace(/\/$/, '') + '/' + docId;
      docs.set(firestorePath(docPath), body);
      return {ok: true, status: 200, text: async () => JSON.stringify(body)};
    }
    if (method === 'DELETE') {docs.delete(path); return {ok: true, status: 200, text: async () => '{}'};}
    docs.set(path, body);
    return {ok: true, status: 200, text: async () => JSON.stringify(body)};
  };
}

test('firestore writes hashes under the contact id and keeps parent on rejoin', async () => {
  const docs = new Map();
  const calls = [];
  const fetch = firestoreFetch(docs, calls);
  const dir = XL.createDirectory({
    config: {firebase: {apiKey: 'AIza-public', projectId: 'xlooper-demo'}},
    storage: memStorage(),
    fetch,
    now: () => 5000
  });
  const joined = await dir.join({name: 'Ada', email: 'Ada@X.com', phone: '09171234567', chatId: 'ada1', consent: true});
  assert.equal(joined.remote, true);
  assert.equal(dir.mode(), 'firestore');
  const raw = calls.map(c => c.body || '').join('\n');
  assert.equal(raw.includes('Ada@X.com'), false);
  assert.equal(raw.includes('ada@x.com'), false);
  assert.equal(raw.includes('+639171234567'), false);
  assert.equal(raw.includes('09171234567'), false);
  const contactCall = calls.find(c => c.method === 'POST' && c.url.includes('/xircleContacts'));
  assert.ok(contactCall);
  assert.equal(new URL(contactCall.url).searchParams.get('documentId'), joined.emailHash);
  const fields = JSON.parse(contactCall.body).fields;
  assert.deepEqual(Object.keys(fields).sort(), ['kind', 'memberId', 'withdrawn']);
  assert.equal(fields.kind.stringValue, 'email');
  const auth = calls.find(c => c.url.includes('Authorization') || (c.body && c.body.includes('returnSecureToken')));
  assert.ok(calls.some(c => c.url.includes('identitytoolkit.googleapis.com')));
  assert.equal(auth && true, true);

  const other = XL.createDirectory({
    config: {firebase: {apiKey: 'AIza-public', projectId: 'xlooper-demo'}},
    storage: memStorage(),
    fetch,
    now: () => 6000
  });
  const found = await other.lookup('ada@x.com');
  assert.equal(found.person.name, 'Ada');
  assert.equal(found.person.chatId, 'ada1');
  const child = await other.join({name: 'Bo', email: 'bo@y.co', chatId: 'bo1', consent: true, parentId: 'ada1'});
  assert.equal(child.member.parentId, 'ada1');
  const moved = await other.join({name: 'Bo', email: 'bo@y.co', chatId: 'bo2', consent: true, parentId: 'nope'});
  assert.equal(moved.member.memberId, 'bo1');
  assert.equal(moved.member.chatId, 'bo2');
  assert.equal(moved.member.parentId, 'ada1');
  const memberCall = calls.find(c => c.method === 'POST' && c.url.includes('/xircleMembers'));
  assert.equal(new URL(memberCall.url).searchParams.get('documentId'), 'xlooper__ada1');
  assert.equal(JSON.parse(memberCall.body).fields.appId.stringValue, 'xlooper');
  assert.equal(JSON.parse(memberCall.body).fields.xircle, undefined);
});

test('sub-xircles share a person and keep separate trees', async () => {
  const xlooperApp = '1:380596925925:web:49c554c85142de53656b0c';
  const korApp = '1:380596925925:web:a2c784c5ba701c4e656b0c';
  const docs = new Map();
  const calls = [];
  const fetch = firestoreFetch(docs, calls);
  const xlooper = XL.createDirectory({
    config: {firebase: {apiKey: 'AIza-public', projectId: 'xircle-a43cf', appId: xlooperApp}},
    storage: memStorage(),
    fetch,
    now: () => 7000
  });
  const kor = XL.createDirectory({
    config: {firebase: {apiKey: 'AIza-public', projectId: 'xircle-a43cf', appId: korApp}},
    storage: memStorage(),
    fetch,
    chatId: () => 'adaK',
    memberId: () => 'ada1',
    now: () => 8000
  });
  const joined = await xlooper.join({name: 'Ada', email: 'Ada@X.com', chatId: 'ada1', consent: true});
  assert.equal(joined.member.memberId, 'ada1');
  assert.equal((await kor.lookup('ada@x.com')).person, null);
  const child = await xlooper.join({name: 'Bo', email: 'bo@y.co', chatId: 'bo1', consent: true, parentId: 'ada1'});
  assert.equal(child.member.parentId, 'ada1');
  const again = await kor.join({name: 'Ada', email: 'ada@x.com', chatId: 'adaK', consent: true, parentId: 'parentK'});
  assert.equal(again.member.memberId, 'ada1');
  assert.equal(again.member.chatId, 'adaK');
  assert.equal(again.member.parentId, 'parentK');
  assert.equal(again.member.appId, korApp);
  const back = await xlooper.lookup('ada@x.com');
  assert.equal(back.person.chatId, 'ada1');
  assert.equal(back.person.parentId, '');
  assert.equal(xlooper.children('ada1').length, 1);
  assert.equal(kor.children('ada1').length, 0);
  await kor.sync(true);
  assert.equal(kor.listMembers().some(p => p.memberId === 'bo1'), false);
  assert.equal(kor.listMembers().some(p => p.memberId === 'ada1'), true);
  const raw = calls.map(c => c.body || '').join('\n');
  assert.equal(raw.includes('ada@x.com'), false);
  assert.equal(raw.includes('Ada@X.com'), false);
  function doc(suffix){
    for (const [path, body] of docs) if (path.endsWith('/' + suffix)) return XL.decodeDoc(body);
    return null;
  }
  assert.equal(doc(xlooperApp + '__ada1').parentId, '');
  assert.equal(doc(xlooperApp + '__ada1').chatId, 'ada1');
  assert.equal(doc(korApp + '__ada1').parentId, 'parentK');
  assert.equal(doc(korApp + '__ada1').chatId, 'adaK');
  assert.equal(doc(korApp + '__ada1').appId, korApp);
  assert.equal(doc('ada1').chatId, 'ada1');
  await xlooper.withdraw('ada1');
  assert.equal((await xlooper.lookup('ada@x.com')).person, null);
  assert.equal((await kor.lookup('ada@x.com')).person.chatId, 'adaK');
  assert.equal(calls.some(c => c.method === 'DELETE'), false);
  await xlooper.recordInvite({id: 'inv1', toMemberId: 'ada1', toChatId: 'adaK', fromMemberId: 'zz', fromName: 'Zed', groupId: 'g1', groupName: 'Saturday', room: 'xircle/xlooper/g1'});
  const korInbox = XL.createDirectory({
    config: {firebase: {apiKey: 'AIza-public', projectId: 'xircle-a43cf', appId: korApp}},
    storage: memStorage(),
    fetch,
    chatId: () => 'adaK',
    now: () => 9000
  });
  await korInbox.sync(true);
  assert.equal(korInbox.invitesFor('adaK', 'ada1').length, 0);
  const xInbox = XL.createDirectory({
    config: {firebase: {apiKey: 'AIza-public', projectId: 'xircle-a43cf', appId: xlooperApp}},
    storage: memStorage(),
    fetch,
    chatId: () => 'adaK',
    now: () => 9000
  });
  await xInbox.sync(true);
  assert.equal(xInbox.invitesFor('adaK', 'ada1').length, 1);
  assert.equal(xInbox.invitesFor('adaK', 'ada1')[0].appId, xlooperApp);
});

test('ntfy notices from another app stay out of this tree', async () => {
  const board = [];
  const fetch = async (url, opt) => {
    if (opt && opt.method === 'POST') {
      board.push(JSON.parse(opt.body));
      return {ok: true, status: 200, text: async () => '{}'};
    }
    const text = board.map((ev, i) => JSON.stringify({id: 'n' + i, event: 'message', message: JSON.stringify(ev)})).join('\n');
    return {ok: true, status: 200, text: async () => text};
  };
  const xlooperApp = '1:111:web:aaa';
  const korApp = '1:111:web:bbb';
  const xlooper = XL.createDirectory({config: {signupTopic: 'shared-topic', firebase: {appId: xlooperApp}}, storage: memStorage(), fetch, now: () => 1000});
  await xlooper.join({name: 'Ada', email: 'ada@x.com', chatId: 'ada1', consent: true});
  assert.equal(board[0].appId, xlooperApp);
  const kor = XL.createDirectory({config: {signupTopic: 'shared-topic', firebase: {appId: korApp}}, storage: memStorage(), fetch, now: () => 2000});
  await kor.sync(true);
  assert.equal(kor.listMembers().length, 0);
  assert.equal((await kor.lookup('ada@x.com')).person, null);
});

test('missing firebase auth falls back to ntfy', async () => {
  const posts = [];
  const fetch = async (url, opt) => {
    const u = String(url);
    if (u.includes('identitytoolkit')) return {ok: false, status: 400, text: async () => JSON.stringify({error: {message: 'OPERATION_NOT_ALLOWED'}})};
    if (opt && opt.method === 'POST') {posts.push(JSON.parse(opt.body)); return {ok: true, status: 200, text: async () => '{}'};}
    return {ok: true, status: 200, text: async () => ''};
  };
  const dir = XL.createDirectory({config: {firebase: {apiKey: 'AIza-public', projectId: 'xlooper-demo'}, signupTopic: 'xlooper-test'}, storage: memStorage(), fetch});
  const joined = await dir.join({name: 'Ada', email: 'ada@x.com', chatId: 'ada1', consent: true});
  assert.equal(dir.mode(), 'local');
  assert.match(dir.status().detail, /Anonymous sign-in/);
  assert.equal(joined.local, true);
  assert.equal(posts[0].t, 'xmember');
  assert.equal(posts[0].emailHash.length, 64);
});

test('in-app invite uses the recipient chat id room', () => {
  const chat = loadChat();
  assert.equal(chat.userRoom('ada1'), 'xircle/xlooper/u-ada1');
  assert.equal(chat.topicOf(chat.userRoom('ada1')), 'xircle-xlooper-u-ada1');
  const db = chat.load();
  const g = chat.createGroup(db, {id: 'bo1', name: 'Bo'}, 'Saturday');
  const res = chat.addPeople(db, g.id, [{id: 'ada1', name: 'Ada'}], {id: 'bo1', name: 'Bo'});
  assert.ok(res.added.find(p => p.id === 'ada1'));
  assert.ok(chat.fanout(res.group, 'bo1').includes('xircle/xlooper/u-ada1'));
});

test('pages shell asks before contacts and documents the firebase keys', () => {
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const config = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  assert.match(html, /xircle-db\.js/);
  assert.match(html, /May xLooper read your contacts/);
  assert.match(html, /SHA-256/);
  assert.match(html, /id="xi-ok"/);
  assert.match(config, /apiKey:\s*'AIzaSyCjmDiNxEZs4Ju-NHLLHfWrzjogkJclYIk'/);
  assert.match(config, /projectId:\s*'xircle-a43cf'/);
  assert.match(config, /appId:\s*'1:380596925925:web:49c554c85142de53656b0c'/);
  assert.match(readme, /firebase\.apiKey|apiKey/);
  assert.match(readme, /Anonymous/);
  assert.match(readme, /1:380596925925:web:a2c784c5ba701c4e656b0c/);
  assert.match(rules, /xirclePeople/);
  assert.match(rules, /appOk/);
  assert.match(rules, /request\.resource\.data\.parentId == resource\.data\.parentId/);
  assert.equal(rules.includes("== 'xlooper'"), false);
  assert.equal(config.includes('private_key'), false);
  assert.equal(html.includes('BEGIN PRIVATE KEY'), false);
});

void require;
