import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function listTools() {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'gm-coach-tools-ref-'));
  const child = spawn(process.execPath, [path.join(root, 'mcp_server.mjs')], { env: { ...process.env, PLUGIN_DATA: path.join(tmp, 'data'), CODEX_HOME: path.join(tmp, 'codex') }, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  try {
    return await new Promise((resolve, reject) => {
      let buffer = '';
      const timer = setTimeout(() => reject(new Error('tools/list timeout')), 20000);
      child.on('error', reject);
      child.stdout.on('data', (chunk) => {
        buffer += chunk;
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
          let message; try { message = JSON.parse(line); } catch { continue; }
          if (message.id === 2) { clearTimeout(timer); resolve(message.result.tools); }
        }
      });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n');
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
    });
  } finally {
    child.kill();
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

function sections(markdown) {
  const result = new Map();
  const parts = markdown.split(/^### /m).slice(1);
  for (const part of parts) {
    const name = part.slice(0, part.indexOf('\n')).trim();
    assert.ok(!result.has(name), `duplicate section ${name}`);
    result.set(name, part);
  }
  return result;
}

test('tools-reference.md documents every MCP tool with schema-accurate required arguments', async () => {
  const tools = await listTools();
  const markdown = await readFile(path.join(root, 'skills/speediance-coach/references/tools-reference.md'), 'utf8');
  const docs = sections(markdown);
  const names = tools.map((tool) => tool.name);
  assert.ok(names.length > 0);
  assert.deepEqual(names.filter((name) => !docs.has(name)), [], 'tools without a section');
  assert.deepEqual([...docs.keys()].filter((name) => !names.includes(name)), [], 'sections for tools that no longer exist');
  for (const tool of tools) {
    const body = docs.get(tool.name);
    const line = body.split('\n').find((text) => text.startsWith('- **Wymagane:**'));
    assert.ok(line, `${tool.name}: missing Wymagane line`);
    const listed = [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    const schema = tool.inputSchema || {};
    const properties = Object.keys(schema.properties || {});
    for (const arg of listed) assert.ok(properties.includes(arg), `${tool.name}: documented argument ${arg} is not in the schema`);
    assert.deepEqual([...listed].sort(), [...(schema.required || [])].sort(), `${tool.name}: required arguments differ from schema`);
    for (const match of body.matchAll(/^\| (\w+) \|/gm)) {
      if (match[1] !== 'Pole') assert.ok(properties.includes(match[1]), `${tool.name}: table field ${match[1]} is not in the schema`);
    }
  }
});

test('SKILL.md points chats to the tools reference', async () => {
  const skill = await readFile(path.join(root, 'skills/speediance-coach/SKILL.md'), 'utf8');
  assert.match(skill, /references\/tools-reference\.md/);
});

