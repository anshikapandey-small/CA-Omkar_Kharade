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
async function github(env, path, update) {
  const url = 'https://api.github.com/repos/'+env.REPOSITORY+'/contents/'+path;
  const headers = {Authorization:'Bearer '+env.GITHUB_TOKEN, 'User-Agent':'firm-editor', Accept:'application/vnd.github+json'};
  const result = await fetch(update ? url : url+'?ref='+encodeURIComponent(env.BRANCH), {
    method:update ? 'PUT' : 'GET', headers, body:update ? JSON.stringify({...update, branch:env.BRANCH}) : undefined, cache:'no-store'
  });
  if ([409,422].includes(result.status)) fail(409,'Save conflict or branch restriction. Reload the list before trying again.');
  if (!result.ok) fail(502,'GitHub could not complete this request. Check repository access and branch settings.');
  return result.json();
}
const imagePath = /^\/images\/updates\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;
function text(value, max, required = true) {
  if (typeof value !== 'string' || value.length > max) fail(400, 'Check field lengths.');
  value = value.trim();
  if (required && !value) fail(400, 'A section is empty. Fill it in or remove it.');
  return value;
}
function httpsUrl(value) {
  const url = text(value, 2048);
  if (!URL.canParse(url) || new URL(url).protocol !== 'https:') fail(400, 'Use a complete https:// link.');
  return url;
}
function cleanBlocks(list) {
  if (!Array.isArray(list) || !list.length || list.length > 60) fail(400, 'Add some content (up to 60 sections).');
  return list.map(block => {
    if (!block || typeof block !== 'object') fail(400, 'Invalid section.');
    switch (block.type) {
      case 'h': case 'sh': return {type: block.type, text: text(block.text, 160)};
      case 'p': return {type: 'p', text: text(block.text, 4000)};
      case 'ul':
        if (!Array.isArray(block.items) || !block.items.length || block.items.length > 30) fail(400, 'A bullet list needs 1 to 30 points.');
        return {type: 'ul', items: block.items.map(item => text(item, 300))};
      case 'img':
        if (typeof block.src !== 'string' || !imagePath.test(block.src)) fail(400, 'A photo is missing. Upload it again.');
        return {type: 'img', src: block.src, alt: text(block.alt ?? '', 200, false), caption: text(block.caption ?? '', 200, false)};
      case 'link': return {type: 'link', label: text(block.label, 80), url: httpsUrl(block.url)};
      default: return fail(400, 'Unknown section type.');
    }
  });
}
function entry(data, id) {
  const title = text(data.title, 160, false), date = text(data.date, 10, false), source = text(data.source ?? '', 2048, false);
  if (!title || !/^\d{4}-\d\d-\d\d$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) fail(400,'Enter a headline and a date.');
  if (source) httpsUrl(source);
  return {id, title, date, source, blocks: cleanBlocks(data.blocks)};
}
export async function handle(req,env) {
  const url=new URL(req.url);
  if (url.pathname==='/' && req.method==='GET') {
    const site = (env.SITE_URL || '').replace(/\/$/, '');
    return new Response(editor.replaceAll('__SITE_URL__', site),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data: "+site+"; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}});
  }
  const json=(value,headers={})=>Response.json(value,{headers:{'Cache-Control':'no-store',...headers}});
  let data;
  if(req.method==='POST') {
    if (req.headers.get('Origin')!==url.origin || req.headers.get('Content-Type')!=='application/json') fail(403,'Request rejected.');
    const limit=url.pathname==='/upload' ? 2450000 : 60000;
    if(Number(req.headers.get('Content-Length')||0)>limit) fail(413,'Request too large.');
    const raw=await req.text();
    if(raw.length>limit) fail(413,'Request too large.');
    try { data=JSON.parse(raw); } catch { fail(400,'Invalid request.'); }
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
  if(!['/entries','/upload'].includes(url.pathname) || !['GET','POST'].includes(req.method)) fail(404,'Unknown request.');
  const cookie=(req.headers.get('Cookie')||'').split('; ').find(c=>c.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
  if(!cookie || !await signedSession(env,cookie)) fail(401,'Please sign in.');
  if(url.pathname==='/upload') {
    const image=data?.image;
    if(typeof image!=='string' || image.length<100 || image.length>2400000 || image.length%4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) fail(400,'This photo could not be accepted.');
    const head=atob(image.slice(0,8));
    if(head.charCodeAt(0)!==0xFF || head.charCodeAt(1)!==0xD8 || head.charCodeAt(2)!==0xFF) fail(400,'Only JPEG photos are accepted.');
    const name='images/updates/'+crypto.randomUUID()+'.jpg';
    await github(env,name,{message:'Owner: upload update photo',content:image});
    return json({src:'/'+name});
  }
  const file=await github(env,'_data/updates.json');
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
  const result=await github(env,'_data/updates.json',{sha:file.sha,message:'Owner: '+data.action+' firm update',content:btoa(binary)});
  return json({items,sha:result.content.sha});
}
export default {async fetch(req,env) {
  try {return await handle(req,env);} catch(e){return Response.json({error:e.status ? e.message : 'Editor unavailable. Check the Worker configuration.'},{status:e.status||500,headers:{'Cache-Control':'no-store'}});}
}};
