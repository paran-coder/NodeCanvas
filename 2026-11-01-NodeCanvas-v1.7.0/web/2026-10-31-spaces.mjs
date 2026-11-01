import {validateGraph} from './2026-10-31-graph.mjs';
export function makeSpace(project,id,now=Date.now()) {validateGraph(project);return {spaceSchema:1,id,project:structuredClone(project),createdAt:now,updatedAt:now,trashed:false};}
export function updateSpace(record,changes,now=Date.now()) {
 const next=structuredClone(record);
 if(changes.project){validateGraph(changes.project);next.project=structuredClone(changes.project);}
 if(changes.name!==undefined)next.project.name=String(changes.name).trim().slice(0,80)||'이름 없는 프로젝트';
 if(changes.trashed!==undefined)next.trashed=changes.trashed===true;
 next.updatedAt=now;return next;
}
export function copySpace(record,id,now=Date.now()){const copy=makeSpace(record.project,id,now);copy.project.name=(copy.project.name+' 복사').slice(0,80);return copy;}
export function filterSpaces(records,query='',trashed=false){const search=query.trim().toLocaleLowerCase();return records.filter(r=>r.trashed===trashed&&r.project.name.toLocaleLowerCase().includes(search)).sort((a,b)=>b.updatedAt-a.updatedAt||a.id.localeCompare(b.id));}

export async function settleEdits(isDirty,save){do{await save();}while(isDirty());}
