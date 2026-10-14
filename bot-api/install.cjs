'use strict';
const fs=require('node:fs');const path=require('node:path');
const ROUTE_MARKER='// LDS_EDITOR_SHARED_ROUTES_V1';
const START_MARKER='// LDS_EDITOR_SHARED_START_V1';
function install(options={}) {
 const root=path.resolve(options.root || path.join(__dirname,'..'));
 const transcriptPath=path.join(root,'src','utils','ticketTranscriptServer.js'), indexPath=path.join(root,'src','index.js');
 if(!fs.existsSync(transcriptPath)||!fs.existsSync(indexPath))throw Error('Не найдены src/utils/ticketTranscriptServer.js и src/index.js. Модуль рассчитан на показанную версию LDS Bot.');
 let transcript=fs.readFileSync(transcriptPath,'utf8'),index=fs.readFileSync(indexPath,'utf8');const changed=[];
 if(!transcript.includes(ROUTE_MARKER)){
  const signature='async function handleRequest(request, response) {';
  if(!transcript.includes(signature))throw Error('Формат ticketTranscriptServer.js отличается. Автоматическая установка остановлена, исходники не изменены.');
  const routes=`\n    ${ROUTE_MARKER}\n    const editorPath = new URL(request.url || '/', 'http://localhost').pathname;\n    if (editorPath === '/healthz' || editorPath === '/api/session' || editorPath.startsWith('/api/discord/')) {\n        try {\n            const handler = await require('../../bot-api/server.cjs').getHandler();\n            return await handler(request, response);\n        } catch (error) {\n            console.error('[LDS EDITOR] API configuration error: ' + error.message);\n            if (!response.headersSent) {\n                response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });\n                response.end(JSON.stringify({ error: 'API редактора не настроен. Проверьте переменные на Wispbyte и консоль бота.' }));\n            }\n            return;\n        }\n    }\n`;
  transcript=transcript.replace(signature,signature+routes);changed.push(transcriptPath);
 }
 if(!index.includes(START_MARKER)){index+=`\n${START_MARKER}\nif (process.env.EDITOR_ACCESS_PASSWORD) {\n    require('./utils/ticketTranscriptServer').startTicketTranscriptServer();\n}\n`;changed.push(indexPath);}
 for(const file of changed){const backup=file+'.lds-editor.bak';if(!fs.existsSync(backup))fs.copyFileSync(file,backup);fs.writeFileSync(file,file===transcriptPath?transcript:index);}
 return {changed:changed.map(file=>path.relative(root,file))};
}
module.exports={install};
if(require.main===module){try{const result=install();console.log('[LDS EDITOR] Shared-port integration ready. Changed: '+(result.changed.join(', ')||'already installed'));}catch(e){console.error('[LDS EDITOR] '+e.message);process.exitCode=1}}
