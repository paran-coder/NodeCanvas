const paths={
 reference:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m3 17 5-5 4 4 4-4 5 5"/>',
 prompt:'<path d="M4 5h16M12 5v15M8 20h8"/>',
 image:'<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M8 12l4-4 4 4M12 8v9"/>',
 generate:'<rect x="3" y="5" width="15" height="16" rx="2"/><path d="m3 17 5-5 4 4 3-3 3 3M20 2v6M17 5h6"/>',
 edit:'<path d="m14 4 6 6M4 20l4-1 13-13a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/>',
 skill:'<path d="M9 3H4v6h2a2 2 0 1 1 0 4H4v7h6v-2a2 2 0 1 1 4 0v2h6v-7h-2a2 2 0 1 1 0-4h2V3h-7v2a2 2 0 1 1-4 0V3Z"/>'
};
export function nodeIcon(type){return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[type]||paths.generate}</svg>`;}
export function portIcon(kind){return nodeIcon(kind==='prompt'?'prompt':kind==='skill'?'skill':'reference');}
