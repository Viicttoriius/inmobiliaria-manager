# Notas de la Versión v2.2.28

## 🔧 Correcciones de Infraestructura (CI/CD)
- **Optimización de Construcción para macOS:**
  - **Solución a Conflicto de Carrera (Race Condition):** Se ha unificado la construcción de macOS (x64 y arm64) en un único trabajo secuencial.
  - **Causa:** Anteriormente, dos trabajos paralelos intentaban subir y actualizar el archivo `latest-mac.yml` al mismo tiempo, provocando el error `422 Unprocessable Entity` porque uno bloqueaba al otro.
  - **Mejora:** Ahora un solo corredor genera ambos ejecutables y un único archivo de metadatos `latest-mac.yml` que contiene la información de ambas arquitecturas, garantizando actualizaciones automáticas correctas y eliminando el conflicto de subida.
