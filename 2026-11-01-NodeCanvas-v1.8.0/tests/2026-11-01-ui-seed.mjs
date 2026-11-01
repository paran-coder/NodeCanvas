import {addSpace} from '/2026-10-31-storage.mjs';
function image(w,h,color){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,w,h);x.fillStyle='#ffffff';x.font='24px sans-serif';x.fillText(w+' × '+h,24,48);return c.toDataURL('image/png');}
document.querySelector('#seed').onclick=async()=>{try{await addSpace({version:'1.0.0',name:'비율·입력 안내 검증',nodes:[
 {id:'wide',type:'image',x:64,y:120,data:{label:'가로 이미지',image:image(640,360,'#79609e')}},
 {id:'portrait',type:'generate',x:480,y:120,data:{label:'세로 이미지',text:'추가 지시',image:image(360,640,'#4262ff')}},
 {id:'square',type:'edit',x:896,y:120,data:{label:'정사각형 이미지',text:'편집 지시',image:image(400,400,'#187574')}},
 {id:'shared',type:'prompt',x:64,y:470,data:{label:'공유 지시문',text:'연결된 기본 지시문'}}
 ],edges:[{id:'ref',from:'wide',to:'portrait'},{id:'shared-text',from:'shared',to:'portrait'},{id:'edit-image',from:'portrait',to:'square'}]});location.href='/2026-10-31-index.html';}catch(e){document.querySelector('#status').textContent=e.message;}};
