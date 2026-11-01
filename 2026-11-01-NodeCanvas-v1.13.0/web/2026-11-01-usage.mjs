import {MAX_NODE_COUNT,MAX_EDGE_COUNT,MAX_PROJECT_BYTES,projectBytes} from './2026-10-31-graph.mjs';
export function usageLevel(value,maximum){return value>maximum?'exceeded':value===maximum?'full':value>=maximum*.8?'near':'normal';}
export function projectUsage(graph){
 const values=[['nodes','노드',graph.nodes.length,MAX_NODE_COUNT],['edges','연결',graph.edges.length,MAX_EDGE_COUNT],['bytes','용량',projectBytes(graph),MAX_PROJECT_BYTES]];
 return values.map(([key,label,value,maximum])=>({key,label,value,maximum,level:usageLevel(value,maximum),display:key==='bytes'?`용량 ${(value/1_000_000).toFixed(1)}/200MB`:`${label} ${value}/${maximum}`}));
}
export function usageNotice(metrics){
 const active=metrics.filter(m=>m.level!=='normal');if(!active.length)return {text:'',severity:'normal'};
 const severity=active.some(m=>['full','exceeded'].includes(m.level))?'danger':'warning';
 const states={near:'한도에 가까움',full:'한도 도달',exceeded:'한도 초과'};
 const unavailable=active.some(m=>m.key==='bytes'&&m.level==='exceeded')?' 용량을 줄여야 저장할 수 있습니다.':'';
 // Counts are shown separately. Stable text avoids repeated live announcements while typing or moving.
 return {severity,text:active.map(m=>`${m.label}: ${states[m.level]}`).join(' · ')+'. 불필요한 항목을 정리하거나 프로젝트를 나눠 주세요.'+unavailable};
}
export function formatStorageBytes(bytes){return bytes>=1_000_000_000?(bytes/1_000_000_000).toFixed(1)+'GB':(bytes/1_000_000).toFixed(1)+'MB';}
export function storageSummary(estimate={}){
 const usage=Number.isFinite(estimate?.usage)&&estimate.usage>=0?formatStorageBytes(estimate.usage):'확인 불가';
 const quota=Number.isFinite(estimate?.quota)&&estimate.quota>0?'약 '+formatStorageBytes(estimate.quota):'확인 불가';
 return `이 사이트 전체 저장량: ${usage} · 브라우저 허용량: ${quota}`;
}
