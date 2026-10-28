#!/usr/bin/env node
// Verify canonical sitemap, static discovery links, and indexable generated pages.
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
function load(file,symbol){const box={};vm.createContext(box);vm.runInContext(read(file)+'\nvar out='+symbol+';',box);return box.out;}
const es=load('events.js','EVENTS'),os=load('organizations.js','ORGANIZATIONS'),published=es.filter(e=>e.isPublished);
const related=(e,o)=>!!(e.orgId&&String(e.orgId)===String(o.id))||(Array.isArray(o.relatedEventIds)&&o.relatedEventIds.some(id=>String(id)===String(e.id)))||!!(e.organizer&&o.name&&e.organizer.trim()===o.name.trim());
const eligible=os.filter(o=>!!(o.description&&o.description.trim())||!!(o.instagramUrl||o.twitterUrl||o.websiteUrl)||published.some(e=>related(e,o)));
const sitemap=read('sitemap.xml'),directory=read('organizations.html');
const locs=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]),urlset=new Set(locs),errors=[];
function check(v,m){if(!v)errors.push(m);}
check(locs.length===urlset.size,'sitemap duplicate URL');
check(locs.length===published.length+eligible.length+6,'sitemap URL count');
check(directory.includes('org-directory-generated:start'),'organization directory marker');
for(const o of eligible){
 const url='/org/'+encodeURIComponent(o.id)+'.html',html=read('org/'+o.id+'.html');
 check(directory.includes('href="'+url+'"'),'missing org index link: '+url);
 check(html.includes('<link rel="canonical" href="https://wasedacalendar.com'+url+'"'),'org canonical: '+url);
 check(html.includes('content="index, follow"'),'org index: '+url);
 check(urlset.has('https://wasedacalendar.com'+url),'org sitemap: '+url);
}
for(const e of published){
 const url='/event/'+encodeURIComponent(e.id)+'.html',html=read('event/'+e.id+'.html');
 check(html.includes('<link rel="canonical" href="https://wasedacalendar.com'+url+'"'),'event canonical: '+url);
 check(html.includes('<div id="event-related"><nav class="related-events-section"'),'static related links: '+url);
 check(urlset.has('https://wasedacalendar.com'+url),'event sitemap: '+url);
}
for(const e of es.filter(e=>e.mergedInto)){
 check(!urlset.has('https://wasedacalendar.com/event/'+e.id+'.html'),'legacy alias in sitemap');
 check(read('event/'+e.id+'.html').includes('/event/'+e.mergedInto+'.html'),'legacy redirect missing');
}
if(errors.length){console.error(errors.slice(0,25).join('\n'));throw Error('SEO link tests failed: '+errors.length);}
console.log('SEO link integrity OK: '+published.length+' events / '+eligible.length+' organizations / '+locs.length+' sitemap entries');
