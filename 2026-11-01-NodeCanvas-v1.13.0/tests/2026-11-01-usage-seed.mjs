import {addSpace} from '/2026-10-31-storage.mjs';
const n=(id,type='prompt',x=120,y=120)=>({id,type,x,y,data:{text:'검증용 지시문',label:id}});
function nodes(count){return {version:'1.0.0',name:'노드 '+count+'개 검증',nodes:Array.from({length:count},(_,i)=>n('node-'+i,'prompt',64+(i%10)*380,120+Math.floor(i/10)*350)),edges:[]};}
function edges(count){const total=count===399?20:25;const ns=[...Array.from({length:20},(_,i)=>n('p'+i)),...Array.from({length:total+1},(_,i)=>n('g'+i,'generate',550))];const es=[];for(let p=0;p<20;p++)for(let g=0;g<total;g++)if(!(p===19&&g===total-1))es.push({id:'e'+p+'-'+g,from:'p'+p,to:'g'+g});return {version:'1.0.0',name:'연결 '+count+'개 검증',nodes:ns,edges:es};}
document.querySelector('#seed').onclick=async()=>{try{for(const g of [nodes(119),nodes(150),edges(399),edges(499)])await addSpace(g);location.href='/';}catch(e){document.querySelector('#status').textContent=e.message;}};
