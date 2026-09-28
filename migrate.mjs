import { readFileSync, readdirSync } from 'node:fs';

export function migrate(db) {
  const directory=new URL('./migrations/',import.meta.url);
  db.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
  for(const name of readdirSync(directory).filter(n=>n.endsWith('.sql')).sort()){
    if(db.prepare('SELECT 1 FROM local_migrations WHERE name=?').get(name))continue;
    db.exec('BEGIN');
    try{
      db.exec(readFileSync(new URL(name,directory),'utf8'));
      db.prepare('INSERT INTO local_migrations VALUES(?)').run(name);
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
}
