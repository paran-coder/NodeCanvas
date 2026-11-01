// Presentation only: connected text stays in its source node, never copied into local input.
export function promptPresentation(graph,node){
 const sources=graph.edges.filter(e=>e.to===node.id).map(e=>graph.nodes.find(n=>n.id===e.from)).filter(n=>n?.type==='prompt').map(n=>({id:n.id,label:n.data.label||'텍스트',empty:!n.data.text?.trim()}));
 return {sources,label:sources.length?'추가 지시사항 (선택)':node.type==='edit'?'편집 지시':'프롬프트',placeholder:sources.length?'연결된 지시문에 더할 내용이 있으면 입력하세요…':node.type==='edit'?'바꿀 부분과 유지할 부분을 설명해 주세요…':'어떤 이미지를 만들고 싶은지 설명해 주세요…'};
}
