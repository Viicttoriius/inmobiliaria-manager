const sqliteManager = require('./db/sqlite-manager');

console.log("🧹 Iniciando limpieza profunda de propiedades corruptas...");

// Inicializar DB
sqliteManager.initDB();
const db = sqliteManager.db;

try {
    // 1. Eliminar propiedades donde la image_url sea el placeholder
    const deleteStmt = db.prepare(`
        DELETE FROM properties 
        WHERE image_url LIKE '%via.placeholder.com%'
    `);
    const infoDelete = deleteStmt.run();
    console.log(`🗑️  Eliminadas ${infoDelete.changes} propiedades con imagen rota.`);

    // 2. Actualizar a NULL cualquier remanente (por si acaso no queremos borrar)
    // En este caso, preferimos borrar lo corrupto, pero limpiamos por seguridad
    const updateStmt = db.prepare(`
        UPDATE properties 
        SET image_url = NULL 
        WHERE image_url LIKE '%via.placeholder.com%' OR image_url = 'None'
    `);
    const infoUpdate = updateStmt.run();
    console.log(`✨ Limpiadas ${infoUpdate.changes} propiedades con URLs inválidas.`);

    console.log("✅ Base de datos saneada. El error 404 debería desaparecer.");

} catch (error) {
    console.error("❌ Error durante la limpieza:", error);
}
