import {createHash} from 'node:crypto';
export function validOrigin(value) {
  try {const u=new URL(value);return u.origin===value&&!u.username&&!u.password&&(u.protocol==='https:'||(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)&&u.port==='7330'));}catch{return false;}
}
export class ActivationGrants {
  constructor(){this.pending=new Map();}
  approve(record,now=Date.now()) {
    if(!record||!validOrigin(record.origin)||!/^[a-f0-9]{64}$/.test(record.challenge)||!Number.isSafeInteger(record.createdAt)||now-record.createdAt>120000||record.createdAt>now+10000)return false;
    this.prune(now);if(this.pending.size>=64)return false;
    this.pending.set(record.challenge,{origin:record.origin,expires:record.createdAt+120000});return true;
  }
  prune(now){for(const [k,v] of this.pending)if(v.expires<=now)this.pending.delete(k);}
  claim(origin,secret,now=Date.now()) {
    this.prune(now);if(typeof secret!=='string'||!/^[a-f0-9]{64}$/.test(secret))return false;
    const key=createHash('sha256').update(secret).digest('hex'),grant=this.pending.get(key);
    if(!grant||grant.origin!==origin)return false;this.pending.delete(key);return true;
  }
}
