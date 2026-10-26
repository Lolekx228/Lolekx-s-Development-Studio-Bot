import {defineConfig} from 'vite';
import path from 'node:path';
export default defineConfig({
 base:process.env.LDS_BASE_PATH || '/Lolekx-s-Development-Studio-Bot/',
 publicDir:'upstream/public',
 resolve:{alias:[{find:'~',replacement:path.resolve('upstream/app')},{find:'@lds',replacement:path.resolve('app')} ]},
 esbuild:{jsx:'automatic'},
 optimizeDeps:{include:['react','react-dom/client']},
 build:{outDir:'../docs',emptyOutDir:true,commonjsOptions:{include:[/node_modules/,/app\/bot\//,/app\\bot\\/]},chunkSizeWarningLimit:2400},
});
