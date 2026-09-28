import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
const db=new DatabaseSync(process.env.DB_PATH||fileURLToPath(new URL('../var/germillion.sqlite',import.meta.url)),{readOnly:true});
const rows=db.prepare('SELECT f.id,f.created,f.kind,f.message,f.round,f.answer,r.state FROM feedback f LEFT JOIN runs r ON f.run=r.id ORDER BY f.created DESC LIMIT 100').all();
for(const r of rows){const run=r.state?JSON.parse(r.state):null;console.log(JSON.stringify({id:r.id,date:new Date(r.created).toISOString(),type:r.kind,message:r.message,question:run?.prompts[r.round],answer:r.answer}));}
if(!rows.length)console.log('No feedback yet.');
db.close();
