# Notas de la Versión v2.2.33

## 🛠️ Corrección Crítica en Build de macOS
- **Unificación de Jobs x64 y arm64:**
  - **Problema:** El error `422 Unprocessable Entity` persistía porque los procesos de build separados para x64 y arm64 intentaban subir/actualizar el archivo `latest-mac.yml` de forma conflictiva.
  - **Solución:** Se ha implementado un nuevo hook `beforePack` que permite ejecutar la compilación de ambos arquitecturas en un solo comando de `electron-builder`.
  - **Detalle Técnico:** 
    - Se creó `scripts/beforePack.js` que detecta la arquitectura destino y recompila las dependencias nativas (`better-sqlite3`) automáticamente antes de empaquetar cada versión.
    - Se simplificó el workflow de GitHub Actions para usar una única llamada: `npx electron-builder --mac --x64 --arm64`.
    - Esto asegura que `electron-builder` gestione correctamente la generación y subida de `latest-mac.yml` conteniendo la información de ambas arquitecturas sin conflictos.
