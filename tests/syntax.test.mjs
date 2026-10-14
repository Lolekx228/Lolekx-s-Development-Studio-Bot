import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
for (const directory of ['bot-api', 'docs']) {
    for (const name of readdirSync(path.join(root, directory))) {
        if (!/\.(?:cjs|mjs|js)$/.test(name)) continue;
        test('Syntax: ' + directory + '/' + name, () => {
            assert.doesNotThrow(() => execFileSync(process.execPath,
                ['--check', path.join(root, directory, name)],
                { stdio: 'pipe' }));
        });
    }
}
