const sqliteManager = require('./db/sqlite-manager');
sqliteManager.initDB();
const db = sqliteManager.db;

console.log("🧼 Iniciando lavado profundo de JSON...");

const stmt = db.prepare("SELECT id, extra_data FROM properties");
const rows = stmt.all();

let count = 0;
const updateStmt = db.prepare("UPDATE properties SET extra_data = ? WHERE id = ?");

db.transaction(() => {
    rows.forEach(row => {
        if (!row.extra_data) return;
        try {
            let data = JSON.parse(row.extra_data);
            let changed = false;

            // Revisar claves comunes que puedan tener la URL
            ['imgurl', 'image_url', 'url'].forEach(key => {
                if (data[key] && typeof data[key] === 'string' && data[key].includes('via.placeholder.com')) {
                    console.log(`🧨 Encontrado malware URL en ID ${row.id} [${key}]`);
                    data[key] = null; // O borrar la clave: delete data[key];
                    changed = true;
                }
            });

            if (changed) {
                updateStmt.run(JSON.stringify(data), row.id);
                count++;
            }
        } catch (e) {
            // Ignorar errores de parseo
        }
    });
})();

console.log(`🎉 ${count} JSONs limpiados.`);
