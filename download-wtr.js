import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, webcrypto } from 'node:crypto';
import * as cheerio from 'cheerio';

const slug = 'pocket-monsters-start-with-an-ai-system';
const root = path.resolve('all-books', slug);
const raw = path.join(root, `${slug}_raw`);
const translated = path.join(root, `${slug}_translated`);
const cookies = process.argv[2];
if (!cookies) throw new Error('Usage: node download-wtr.js /absolute/path/to/wtr-cookies.txt [last-chapter]');
await fs.access(cookies);
await Promise.all([fs.mkdir(raw, {recursive:true}), fs.mkdir(translated, {recursive:true})]);
const base = `https://wtr-lab.com/en/novel/19293/${slug}`;
let nextRequestAt = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(url, payload) {
  if (new URL(url).hostname !== 'wtr-lab.com') throw new Error('Unexpected request host');
  for (let attempt=0; attempt<5; attempt++) {
    const wait = Math.max(0, nextRequestAt-Date.now());
    nextRequestAt = Math.max(nextRequestAt, Date.now()) + 300;
    await sleep(wait);
    const args = ['--silent','--show-error','--max-time','45','--cookie',cookies,'--header','Origin: https://wtr-lab.com','--header',`Referer: ${base}/chapter-1`];
    if (payload) args.push('--header','Content-Type: application/json','--data',JSON.stringify(payload));
    args.push('--write-out','\n%{http_code}',url);
    const result = await new Promise((resolve,reject) => {
      const child=spawn('curl',args); let output='',error='';
      child.stdout.on('data',x=>output+=x); child.stderr.on('data',x=>error+=x);
      child.on('error',reject); child.on('close',code=>resolve({code,output,error}));
    });
    const split=result.output.lastIndexOf('\n');
    const status=Number(result.output.slice(split+1));
    if (result.code===0 && status===200) return result.output.slice(0,split);
    if ([401,403].includes(status)) throw new Error(`Authentication or access rejected (HTTP ${status})`);
    if (attempt===4) throw new Error(`HTTP ${status}, curl exit ${result.code}`);
    const delay=status===429?30000:2000*2**attempt;
    nextRequestAt=Math.max(nextRequestAt,Date.now()+delay); await sleep(delay);
  }
}
const firstHtml = await request(`${base}/chapter-1`);
const $=cheerio.load(firstHtml);
const page=JSON.parse($('#__NEXT_DATA__').text()||'{}');
const info=page.props?.pageProps?.serie?.serie_data;
if (!info || info.raw_id!==19293) throw new Error('Book metadata unavailable: verify cookie authentication');
const count = Number(process.argv[3]||info.chapter_count);
if (!Number.isInteger(count)||count<1||count>info.chapter_count) throw new Error('Invalid chapter range');
await fs.writeFile(path.join(root,'book.json'),JSON.stringify({source:base,title:'Pokemon: Start with an AI System',author:info.data.author,chapterCount:info.chapter_count,service:'ai',retrievedAt:new Date().toISOString()},null,2)+'\n');
const glossary=JSON.parse(await request('https://wtr-lab.com/api/v2/reader/terms/19293.json'));
if (!glossary.success) throw new Error('Terminology unavailable');
await fs.writeFile(path.join(root,'glossaries.json'),JSON.stringify(glossary,null,2)+'\n');
const terms=new Map();
for (const g of glossary.glossaries) for (const term of g.data?.terms||[]) {
  if (!terms.has(term[1])) terms.set(term[1],Array.isArray(term[0])?term[0][0]:term[0]);
}
const escape = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function render(value, localTerms) {
  return String(value).replace(/※(\d+)⛬/g,(_,index)=>{
    const term=localTerms[Number(index)];
    if (!term) throw new Error(`Unresolved glossary marker ${index}`);
    return terms.get(term[1])||term[0];
  }).replace(/%\{([^|{}]+)\|([^{}]+)\}/g,(_,fallback,encoded)=>Buffer.from(encoded,'base64').toString('utf8')||fallback);
}
async function decrypt(body) {
  const array=body.startsWith('arr:');
  const [iv,tag,cipher]=body.replace(/^(arr|str):/,'').split(':').map(x=>Buffer.from(x,'base64'));
  const key=await webcrypto.subtle.importKey('raw',Buffer.from('IJAFUUxjM25hyzL2AZrn0wl7cESED6Ru'),{name:'AES-GCM'},false,['decrypt']);
  const plain=Buffer.from(await webcrypto.subtle.decrypt({name:'AES-GCM',iv},key,Buffer.concat([cipher,tag]))).toString('utf8');
  return array?JSON.parse(plain):plain;
}
const entries=[], failures=[];
let cursor=1, done=0;
async function chapter(index) {
  const file=path.join(raw,`Chapter ${index}.json`);
  let response;
  try { response=JSON.parse(await fs.readFile(file,'utf8')); } catch {}
  if (!response) {
    const reader=JSON.parse(await request('https://wtr-lab.com/api/reader/get',{translate:'ai',language:'en',raw_id:19293,chapter_no:index,retry:false,force_retry:false}));
    if (!reader.success) throw new Error(reader.code||reader.error||'Reader unavailable');
    if (reader.chapter?.locked) throw new Error('Chapter locked');
    if (reader.chapter?.order!==index || reader.chapter?.raw_id!==19293) throw new Error('Mismatched chapter metadata');
    if (reader.content_url) {
      if (!reader.content_url.startsWith('/api/v2/reader/content/')) throw new Error('Unexpected content URL');
      const content=JSON.parse(await request('https://wtr-lab.com'+reader.content_url));
      if (!content.success) throw new Error('Content unavailable');
      reader.data=content.data;
    }
    if (!reader.data?.data?.body) throw new Error('No existing translated text');
    response={chapter:reader.chapter,data:reader.data};
  }
  if (response.chapter.order!==index || response.data.chapter_id!==response.chapter.id) throw new Error('Content identity mismatch');
  const data=response.data.data;
  let body=data.encrypted?await decrypt(data.body):data.body;
  if (typeof body==='string') body=body.split(/\n+/);
  if (!Array.isArray(body)||body.some(x=>typeof x!=='string')) throw new Error('Unsupported chapter body format');
  const paragraphs=body.map(x=>render(x,data.glossary_data?.terms||[]));
  const text=paragraphs.join('\n\n');
  if (text.length<300 || /※\d+⛬|%\{/.test(text)) throw new Error('Invalid or unresolved chapter text');
  const title=render(response.chapter.title,data.glossary_data?.terms||[]);
  const extra=data.title&&data.title!==response.chapter.title?`<p>${escape(render(data.title,data.glossary_data?.terms||[]))}</p>\n`:'';
  const html=`<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Chapter ${index}: ${escape(title)}</title></head><body>\n<h1>Chapter ${index}: ${escape(title)}</h1>\n<div id="article">\n${extra}${paragraphs.map(x=>`<p>${escape(x)}</p>`).join('\n')}\n</div>\n</body></html>\n`;
  await fs.writeFile(file,JSON.stringify(response,null,2)+'\n');
  await fs.writeFile(path.join(translated,`Chapter ${index}.html`),html);
  await fs.writeFile(path.join(translated,`Chapter ${index}.txt`),`Chapter ${index}: ${title}\n\n${data.title&&data.title!==response.chapter.title?render(data.title,data.glossary_data?.terms||[])+'\n\n':''}${text}\n`);
  entries.push({index,id:response.chapter.id,title,url:`${base}/chapter-${index}`,modelId:response.data.ai_id,characters:text.length,sha256:createHash('sha256').update(text).digest('hex')});
}
console.log(`Downloading ${count} chapters (AI translations, English).`);
await Promise.all(Array.from({length:2},async()=>{
  while(cursor<=count) {
    const index=cursor++;
    try {await chapter(index);} catch(e) {failures.push({index,error:e.message}); console.error(`Chapter ${index}: ${e.message}`);}
    done++; if(done%25===0||done===count) console.log(`Processed ${done}/${count}; saved ${entries.length}; failed ${failures.length}`);
  }
}));
entries.sort((a,b)=>a.index-b.index); failures.sort((a,b)=>a.index-b.index);
const hashes=new Map(), duplicates=[];
for(const entry of entries) {if(hashes.has(entry.sha256)) duplicates.push([hashes.get(entry.sha256),entry.index]); else hashes.set(entry.sha256,entry.index);}
await fs.writeFile(path.join(root,'chapters.json'),JSON.stringify({source:base,chapters:entries},null,2)+'\n');
await fs.writeFile(path.join(root,'download-status.json'),JSON.stringify({expected:count,saved:entries.length,failures,duplicates,checkedAt:new Date().toISOString()},null,2)+'\n');
const texts=await Promise.all(entries.map(x=>fs.readFile(path.join(translated,`Chapter ${x.index}.txt`),'utf8')));
await fs.writeFile(path.join(root,`${slug}${failures.length?'-partial':''}.txt`),texts.join('\n\n'+ '='.repeat(72)+'\n\n'));
const pages=await Promise.all(entries.map(async x=>{const $=cheerio.load(await fs.readFile(path.join(translated,`Chapter ${x.index}.html`),'utf8'));return `<section id="chapter-${x.index}">${$('h1').toString()}${$('#article').html()}</section>`;}));
await fs.writeFile(path.join(root,`${slug}${failures.length?'-partial':''}.html`),`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Pokemon: Start with an AI System</title><style>body{max-width:48rem;margin:3rem auto;padding:0 1rem;font:18px/1.6 Georgia,serif}section{margin:4rem 0}a{color:inherit}</style></head><body><h1>Pokemon: Start with an AI System</h1><nav>${entries.map(x=>`<p><a href="#chapter-${x.index}">Chapter ${x.index}: ${escape(x.title)}</a></p>`).join('')}</nav>${pages.join('\n')}</body></html>\n`);
console.log(`Finished: ${entries.length}/${count} saved; ${duplicates.length} duplicate bodies; ${failures.length} failures.`);
if(failures.length||duplicates.length) process.exitCode=1;
