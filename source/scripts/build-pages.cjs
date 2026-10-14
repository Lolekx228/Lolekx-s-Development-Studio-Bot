const {spawnSync}=require('node:child_process');
const path=require('node:path');
const env={...process.env,NODE_OPTIONS:[process.env.NODE_OPTIONS,'--openssl-legacy-provider'].filter(Boolean).join(' '),NEXT_TELEMETRY_DISABLED:'1'};
for(const args of [['build'],['export','-o','../docs']]) {
  const result=spawnSync(process.execPath,[require.resolve('next/dist/bin/next'),...args],{cwd:path.join(__dirname,'..'),env,stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
}
require('node:fs').writeFileSync(path.join(__dirname,'../../docs/.nojekyll'),'');
require('node:fs').cpSync(path.join(__dirname,'../../components-source'),path.join(__dirname,'../../docs/components'),{recursive:true});
