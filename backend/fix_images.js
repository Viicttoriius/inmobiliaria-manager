const sqliteManager = require('./db/sqlite-manager');

// Init DB
sqliteManager.initDB();

try {
    const db = sqliteManager.db;

    // Buscar propiedades con la URL maldita en image_url
    const badUrl = 'https://via.placeholder.com/400x300';

    // También buscar en extra_data (JSON)
    // Actualizar image_url a NULL donde sea esa URL
    const updateStmt = db.prepare(`
        UPDATE properties 
        SET image_url = NULL 
        WHERE image_url LIKE '%via.placeholder.com%'
    `);

    const info = updateStmt.run();
    console.log(`✅ ${info.changes} propiedades actualizadas (image_url a NULL).`);

    // Limpiar JSON en extra_data es más complejo con SQL simple, 
    // pero si image_url está bien, el frontend debe priorizarlo.

} catch (e) {
    console.error("❌ Error corrigiendo imágenes:", e);
}
