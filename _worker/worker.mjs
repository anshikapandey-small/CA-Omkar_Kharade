import editor from './editor.html';
const utf8 = new TextEncoder();
const cookieName = '__Host-firm';
const cookieFlags = '; Path=/; Secure; HttpOnly; SameSite=Strict';
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
function unhex(value) {
  if (!/^(?:[0-9a-f]{2})+$/.test(value)) throw Error('Invalid secret');
  return Uint8Array.from(value.match(/../g), x => parseInt(x, 16));
}
function fail(status, message) { throw Object.assign(new Error(message), {status}); }
async function signedSession(env, token) {
  const key = await crypto.subtle.importKey('raw', unhex(env.SESSION_KEY), {name:'HMAC',hash:'SHA-256'}, false, ['sign','verify']);
  if (token === undefined) {
    const payload = (Date.now() + 3600000) + '.' + crypto.randomUUID();
    return payload + '.' + hex(await crypto.subtle.sign('HMAC', key, utf8.encode(payload)));
  }
  const match = /^(\d{13})\.([\da-f-]{36})\.([\da-f]{64})$/.exec(token);
  return !!match && Number(match[1]) > Date.now() && await crypto.subtle.verify('HMAC', key, unhex(match[3]), utf8.encode(match[1]+'.'+match[2]));
}
async function github(env, update) {
  const url = 'https://api.github.com/repos/'+env.REPOSITORY+'/contents/_data/updates.json';
  const headers = {Authorization:'Bearer '+env.GITHUB_TOKEN, 'User-Agent':'firm-editor', Accept:'application/vnd.github+json'};
  const result = await fetch(update ? url : url+'?ref='+encodeURIComponent(env.BRANCH), {
    method:update ? 'PUT' : 'GET', headers, body:update ? JSON.stringify({...update, branch:env.BRANCH}) : undefined, cache:'no-store'
  });
  if ([409,422].includes(result.status)) fail(409,'Save conflict or branch restriction. Reload the list before trying again.');
  if (!result.ok) fail(502,'GitHub could not complete this request. Check repository access and branch settings.');
  return result.json();
}
function entry(data, id) {
  const read = (name,max) => {
    if (typeof data[name] !== 'string' || data[name].length > max) fail(400,'Check field lengths.');
    return data[name].trim();
  };
  const title=read('title',160), body=read('body',5000), date=read('date',10), source=read('source',2048);
  if (!title || !body || !/^\d{4}-\d\d-\d\d$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date) fail(400,'Enter a headline, date and message.');
  if (source && !URL.canParse(source)) fail(400,'Enter a complete source URL.');
  if (source && new URL(source).protocol !== 'https:') fail(400,'Use an HTTPS source link.');
  return {id,title,body,date,source};
}
export async function handle(req,env) {
  const url=new URL(req.url);
  if (url.pathname==='/' && req.method==='GET') return new Response(editor,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}});
  const json=(value,headers={})=>Response.json(value,{headers:{'Cache-Control':'no-store',...headers}});
  let data;
  if(req.method==='POST') {
    if (req.headers.get('Origin')!==url.origin || req.headers.get('Content-Type')!=='application/json') fail(403,'Request rejected.');
    const text=await req.text();
    if(text.length>12000) fail(413,'Request too large.');
    try { data=JSON.parse(text); } catch { fail(400,'Invalid request.'); }
    if (!data || typeof data!=='object') fail(400,'Invalid request.');
  }
  if(url.pathname==='/login' && data) {
    const {success}=await env.LOGIN_LIMIT.limit({key:req.headers.get('CF-Connecting-IP')||'local'});
    if(!success) fail(429,'Too many attempts. Try again in a minute.');
    if(typeof data.password!=='string' || data.password.length>512 || typeof env.OWNER_NAME!=='string') fail(400,'Invalid login.');
    const [salt,digest]=env.PASSWORD_HASH.split(':');
    const key=await crypto.subtle.importKey('raw',utf8.encode(data.password),'PBKDF2',false,['deriveBits']);
    const derived=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unhex(salt),iterations:100000},key,256));
    const expected=unhex(digest);
    let diff=expected.length ^ derived.length;
    for(let i=0;i<derived.length;i++) diff|=derived[i]^expected[i];
    if(diff || data.username!==env.OWNER_NAME) fail(401,'Incorrect username or password.');
    return json({ok:true},{'Set-Cookie':cookieName+'='+await signedSession(env)+cookieFlags+'; Max-Age=3600'});
  }
  if(url.pathname==='/logout' && data) return json({ok:true},{'Set-Cookie':cookieName+'='+cookieFlags+'; Max-Age=0'});
  if(url.pathname!=='/entries' || !['GET','POST'].includes(req.method)) fail(404,'Unknown request.');
  const cookie=(req.headers.get('Cookie')||'').split('; ').find(c=>c.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
  if(!cookie || !await signedSession(env,cookie)) fail(401,'Please sign in.');
  const file=await github(env);
  if (file.encoding!=='base64') fail(503,'The updates archive needs maintenance.');
  const items=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(file.content), c=>c.charCodeAt(0))));
  if(!data) return json({items,sha:file.sha});
  if(data.sha!==file.sha) fail(409,'The list changed. Reload before saving.');
  if(data.action==='add') items.unshift(entry(data,crypto.randomUUID()));
  else {
    const index=items.findIndex(item=>item.id===data.id);
    if(index<0) fail(404,'Update no longer exists.');
    if(data.action==='edit') items[index]=entry(data,data.id);
    else if(data.action==='delete') items.splice(index,1);
    else fail(400,'Unknown action.');
  }
  const bytes=utf8.encode(JSON.stringify(items,null,2)+'\n');
  if(bytes.length>900000) fail(400,'Archive is full. Shorten or remove older entries.');
  let binary=''; for(const b of bytes) binary+=String.fromCharCode(b);
  const result=await github(env,{sha:file.sha,message:'Owner: '+data.action+' firm update',content:btoa(binary)});
  return json({items,sha:result.content.sha});
}
export default {async fetch(req,env) {
  try {return await handle(req,env);} catch(e){return Response.json({error:e.status ? e.message : 'Editor unavailable. Check the Worker configuration.'},{status:e.status||500,headers:{'Cache-Control':'no-store'}});}
}};
