import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// db/migrate.mjs splits each migration on ';'. A semicolon inside a comment cut 007 in half once (DEC-043).
test('every statement the migration runner sends is real SQL, not a fragment of a comment', () => {
  const directory = new URL('../db/migrations/', import.meta.url);
  for (const name of readdirSync(directory).filter(file => file.endsWith('.sql'))) {
    const sql = readFileSync(new URL(name, directory), 'utf8').replaceAll('\r\n', '\n');
    for (const statement of sql.split(';').map(part => part.trim()).filter(Boolean)) {
      const code = statement.split('\n').filter(line => !line.trim().startsWith('--')).join('\n').trim();
      assert.ok(code, `${name}: a statement is only comments; is there a ';' inside a comment?`);
    }
    for (const line of sql.split('\n').filter(l => l.trim().startsWith('--'))) {
      assert.ok(!line.includes(';'), `${name}: comment contains ';' and would be split: ${line.trim()}`);
    }
  }
});
