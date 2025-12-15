const sqliteManager = require('./db/sqlite-manager');
sqliteManager.initDB();
const db = sqliteManager.db;

const rows = db.prepare("SELECT id, title, image_url FROM properties").all();

console.log(`🔍 Total de propiedades: ${rows.length}`);
rows.forEach(r => {
    if (r.image_url && r.image_url.includes('placeholder')) {
        console.log(`⚠️ CULPABLE ENCONTRADO (ID: ${r.id}): ${r.image_url}`);
    } else {
        // console.log(`OK (ID: ${r.id}): ${r.image_url ? r.image_url.substring(0, 50) : 'NULL'}`);
    }
});
