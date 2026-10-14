// Compatibility for the pinned upstream Yarn 2 runtime on Node 22/24.
const util = require('node:util');
for (const name of ['isDate','isRegExp','isNativeError']) {
  if (!util[name]) util[name] = util.types[name];
}
