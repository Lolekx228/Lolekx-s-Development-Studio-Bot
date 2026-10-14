'use strict';

const path = require('node:path');
const root = path.join(__dirname, '..');

try {
    const result = require('./install.cjs').install({ root });
    console.log('[LDS EDITOR] Shared-port integration ready: ' +
        (result.changed.join(', ') || 'already installed'));
} catch (error) {
    console.error('[LDS EDITOR] Installation stopped: ' + error.message);
}

require(path.join(root, 'index.js'));
