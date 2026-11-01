export function activeSection(sections,marker,bottom=false){
 if(!sections.length)return null;if(bottom)return sections[sections.length-1].id;
 let id=sections[0].id;for(const section of sections){if(section.top<=marker)id=section.id;else break;}return id;
}
if(typeof document!=='undefined'){
 const links=[...document.querySelectorAll('.toc a[href^="#"]')];const sections=links.map(a=>document.getElementById(a.hash.slice(1))).filter(Boolean);let queued=false;
 function mark(id){for(const link of links){const current=link.hash==='#'+id;link.classList.toggle('is-current',current);if(current)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');}}
 function update(){const bottom=window.scrollY+window.innerHeight>=document.documentElement.scrollHeight-3;mark(activeSection(sections.map(s=>({id:s.id,top:s.getBoundingClientRect().top})),Math.min(180,window.innerHeight*.25),bottom));}
 function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;update();});}
 window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);window.addEventListener('hashchange',schedule);
 for(const link of links)link.addEventListener('click',()=>{mark(link.hash.slice(1));schedule();});schedule();
}
