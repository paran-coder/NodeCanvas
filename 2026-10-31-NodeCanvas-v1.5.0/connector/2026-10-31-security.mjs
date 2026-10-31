import {timingSafeEqual} from 'node:crypto';
export class LeaseRegistry {
  constructor({now=Date.now(),grace=90_000,startup=300_000}={}) {this.started=now;this.grace=grace;this.startup=startup;this.tabs=new Map();this.live=new Set();this.seen=false;}
  touch(id,now=Date.now()) {
    if(typeof id!=='string' || !/^[\w-]{1,80}$/.test(id)) throw new Error('탭 ID가 올바르지 않습니다.');
    for(const [key,time] of this.tabs) if(now-time>this.grace) this.tabs.delete(key);
    if(!this.tabs.has(id) && this.tabs.size>=64) throw new Error('연결 가능한 탭 수를 초과했습니다.');
    this.tabs.set(id,now);this.seen=true;
  }
  expired(now=Date.now()) {
    if(this.live.size)return false;
    if(!this.seen) return now-this.started>=this.startup;
    return [...this.tabs.values()].every(t=>now-t>=this.grace);
  }
  open(id,now=Date.now()) {if(this.live.size>=64&&!this.live.has(id))throw new Error('연결 가능한 탭 수를 초과했습니다.');this.touch(id,now);this.live.add(id);}
  close(id,now=Date.now()) {this.live.delete(id);this.touch(id,now);}
}
export function allowedOrigin(origin,origins) {return typeof origin==='string' && origins.has(origin);}
export function validToken(header,token) {
  if(typeof header!=='string' || typeof token!=='string') return false;
  const a=Buffer.from(header),b=Buffer.from(`Bearer ${token}`);
  return a.length===b.length && timingSafeEqual(a,b);
}
