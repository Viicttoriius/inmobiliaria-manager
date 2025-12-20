# Notas de la Versión v2.2.34

## 🛡️ Mejoras de Estabilidad en Release (GitHub Actions)
- **Cleanup Robusto de Assets:**
  - **Problema:** El error `422 Unprocessable Entity` persistía ocasionalmente debido a condiciones de carrera (race conditions) donde GitHub reportaba que un asset había sido borrado, pero seguía presente al intentar subir el nuevo.
  - **Solución:** Se ha endurecido el script de limpieza en el workflow:
    - **Reintentos:** Ahora intenta borrar cada asset hasta 3 veces si falla.
    - **Fallo Explícito:** Si no puede borrar un asset tras 3 intentos, detiene el proceso inmediatamente (evitando uploads fallidos posteriores).
    - **Verificación en Bucle:** Al final del borrado, verifica durante 15 segundos (5 intentos x 3s) que realmente no queden assets conflictivos antes de permitir que `electron-builder` comience.
