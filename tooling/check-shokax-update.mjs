import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const metadata = JSON.parse(await readFile('.shokax-upstream.json', 'utf8'));
const remoteRef = `refs/heads/${metadata.ref}`;
const output = execFileSync('git', ['ls-remote', metadata.repository, remoteRef], {
  encoding: 'utf8'
}).trim();
const remoteSha = output.split(/\s+/)[0];

if (!/^[0-9a-f]{40}$/i.test(remoteSha)) {
  throw new Error(`Unable to resolve ${metadata.repository} ${remoteRef}`);
}

if (remoteSha === metadata.lastSynced) {
  console.log(`ShokaX is up to date at ${remoteSha}.`);
} else {
  console.log(`ShokaX update available: ${metadata.lastSynced} -> ${remoteSha}`);
  console.log('Create an update branch and review the upstream diff before synchronizing.');
}
