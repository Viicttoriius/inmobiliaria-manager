# Notas de la Versión v2.2.27

## 🔧 Correcciones de Infraestructura (CI/CD)
- **Reversión y Mejora del Proceso de Publicación:**
  - **Corrección Crítica:** Se ha eliminado la bandera `--overwrite` que no es compatible con la versión actual de `electron-builder` y causaba el fallo total de la construcción.
  - **Mejora del Script de Limpieza:** Se ha reescrito el script de "Cleanup Existing Assets" para ser más robusto, detallado y seguro.
    - Ahora lista explícitamente todos los archivos antes de intentar borrarlos.
    - Maneja mejor los errores de conexión con GitHub CLI.
    - Filtra con mayor precisión los archivos conflictivos (`latest.yml`, `.dmg`, `.exe`, etc.) para evitar el error `422 Unprocessable Entity` sin romper el flujo de trabajo.
