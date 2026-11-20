import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

const version = 'v1.0.0';
const base = `dao-den-long-${version}`;

async function filesIn(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await filesIn(path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

function archive(files) {
  const pieces = [];
  const headers = [];
  let offset = 0;
  for (const [path, bytes] of files) {
    const name = Buffer.from(`${base}/${path}`, 'utf8');
    const compressed = deflateRawSync(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(33, 12); // DOS date 1980-01-01 makes identical inputs reproducible.
    local.writeUInt32LE(crc32(bytes), 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    local.copy(central, 6, 4);
    central.writeUInt32LE(offset, 42);
    headers.push(central, name);
    pieces.push(local, name, compressed);
    offset += local.length + name.length + compressed.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(headers.reduce((total, part) => total + part.length, 0), 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...pieces, ...headers, end]);
}

const staticFiles = await filesIn('dist');
const runtime = ['src/cli/run.js', 'src/cli/options.js', 'src/server/http.js', 'src/server/leaderboard.js', 'LICENSE', 'CREDITS.md', 'CHANGELOG.md'];
const files = await Promise.all([...staticFiles, ...runtime].map(async path => [path, await readFile(path)]));
files.push(
  ['README.md', await readFile('release/README.md')],
  ['THREE-LICENSE.txt', await readFile('node_modules/three/LICENSE')],
  ['VITE-LICENSE.md', await readFile('node_modules/vite/LICENSE.md')],
  ['package.json', Buffer.from(`${JSON.stringify({ name: 'dao-den-long', version: version.slice(1), private: true, type: 'module', scripts: { start: 'node src/cli/run.js' } }, null, 2)}\n`) ],
);
await mkdir('release', { recursive: true });
const out = join('release', `${base}.zip`);
await writeFile(out, archive(files));
console.log(out);
