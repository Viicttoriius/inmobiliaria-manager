# Notas de la Versión v2.2.26

## 🔧 Correcciones de Infraestructura (CI/CD)
- **Solución a Error de Publicación (GitHub Actions):** Se ha añadido la bandera `--overwrite` al proceso de construcción (`electron-builder`).
  - **Problema:** Las construcciones fallaban con el error `422 Unprocessable Entity` al intentar subir los ejecutables a GitHub, debido a conflictos con archivos existentes (o parcialmente subidos) de intentos anteriores.
  - **Solución:** Ahora el sistema fuerza la sobrescritura de los archivos de lanzamiento, garantizando que la versión más reciente sea la que esté disponible.
  - **Impacto:** Esto asegura que los lanzamientos automáticos para macOS, Windows y Linux se completen exitosamente sin intervención manual.
