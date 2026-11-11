import {readFile, writeFile} from 'node:fs/promises';
import {createHash, sign} from 'node:crypto';
import path from 'node:path';
import {UPDATE_ORIGIN, verifyRelease} from './connector/2026-11-01-updates.mjs';
import {UPDATE_PUBLIC_KEY} from './connector/2026-11-01-update-key.mjs';

const [version, keyPath, releaseDirectory] = process.argv.slice(2);
if (!version || !/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(version) || !keyPath || !releaseDirectory) {
  throw new Error('Usage: node 2026-11-01-sign-update.mjs <version> <private-key-path> <release-directory>');
}

const filename = '2026-10-31-NodeCanvas-Setup-v' + version + '.exe';
const bytes = await readFile(path.join(releaseDirectory, filename));
const release = {
  schema: 1,
  version,
  url: UPDATE_ORIGIN + '/' + filename,
  size: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex')
};
const payload = Buffer.from(JSON.stringify(release)).toString('base64');
const signature = sign('sha256', Buffer.from(payload), await readFile(keyPath)).toString('base64');
const envelope = {payload, signature};
verifyRelease(envelope, UPDATE_PUBLIC_KEY, '0.0.0');

await writeFile(path.join(releaseDirectory, '2026-11-01-update.json'), JSON.stringify(envelope, null, 2), {flag: 'wx'});
console.log('Signed update v' + version + ' and verified its public key.');