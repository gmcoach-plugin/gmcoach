import { readFileSync as nativeRead } from 'node:fs';
import { readFile as nativeReadAsync } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Fixture-only loader. Missing linked modules fail; other files keep native read semantics.
// Follows backticked module links transitively (lean routing links design/science modules from other modules).
const LINK = /`(?:\.\.\/[a-z-]+\/)?(instructions-[a-z.-]+\.md)`/g;
function linkedNames(text) { return [...new Set([...text.matchAll(LINK)].map(m => m[1]))]; }
export function readInstructionAwareSync(path, options) {
 const entry=nativeRead(path,options);
 const url=path instanceof URL ? path : pathToFileURL(String(path));
 if(!url.pathname.endsWith('/SKILL.md')) return entry;
 if(typeof entry!=='string') throw new TypeError('Instruction fixtures require explicit text encoding');
 const seen=new Set(),parts=[entry];const queue=linkedNames(entry);
 while(queue.length){const name=queue.shift();if(seen.has(name))continue;seen.add(name);let text;try{text=nativeRead(new URL(name,url),options);}catch(error){if(error?.code!=='ENOENT')throw error;continue;}parts.push(text);queue.push(...linkedNames(text));}
 return parts.join('\n');
}
export async function readInstructionAware(path, options) {
 const url=path instanceof URL ? path : pathToFileURL(String(path));
 if(!url.pathname.endsWith('/SKILL.md')) return nativeReadAsync(path,options);
 return readInstructionAwareSync(path,options);
}
