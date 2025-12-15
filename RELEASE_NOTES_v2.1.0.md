# 🚀 Inmobiliaria Manager v2.1.0

## 🎉 Novedades Principales

### Sistema de Gestión de Archivos Mejorado
Esta versión introduce un sistema completamente nuevo para la gestión de archivos de propiedades, eliminando la pérdida accidental de datos y proporcionando mayor control al usuario.

#### ✨ Características Nuevas

**📦 Historial de Archivos Procesados**
- Los archivos JSON de propiedades ya no se borran automáticamente
- Se mueven a una carpeta `data/properties/processed/` manteniendo un historial completo
- Puedes revisar los archivos originales cuando lo necesites

**🗑️ Limpieza Manual Mejorada**
- Dos botones independientes en la configuración:
  - **Limpiar Archivos Temporales**: Solo borra archivos de la carpeta `update`
  - **Limpiar Archivos Procesados**: Borra el historial JSON (los datos permanecen en SQLite)
- Mensajes claros sobre qué hace cada acción

**🛑 Guardado al Detener Scrapers**
- Cuando detienes un scraper manualmente, ahora guarda todos los datos extraídos
- Muestra estadísticas de cuántas propiedades se guardaron
- El frontend se actualiza automáticamente con las nuevas propiedades

**⚡ Consolidación Inmediata**
- Los scrapers automáticos consolidan datos inmediatamente al terminar
- No tienes que esperar 15 segundos para ver los resultados
- Notificaciones solo cuando hay datos nuevos

## 🐛 Correcciones Importantes

- ✅ **Archivos perdidos**: Ya no se borran automáticamente los archivos JSON de propiedades
- ✅ **Datos al detener**: Se guardan todos los datos extraídos aunque detengas el scraper manualmente  
- ✅ **Limpieza accidental**: La función de limpieza ya no toca los archivos de propiedades
- ✅ **Errores de consolidación**: Mejor manejo de errores al procesar archivos

## 📋 Nueva Estructura de Carpetas

```
data/
├── properties/
│   ├── processed/          # ✨ NUEVO: Archivos ya importados (historial)
│   ├── errors/             # Archivos con errores de importación
│   └── *.json              # Archivos pendientes de procesar
└── update/                 # Archivos temporales de actualización
```

## 🔄 Flujo de Datos Actualizado

1. **Scraper ejecuta** → Guarda JSON en `data/properties/`
2. **Backend detecta** → Renombra a `.processing` para bloqueo
3. **Importa a SQLite** → Todos los datos se guardan en la base de datos
4. **Mueve a processed/** → El archivo JSON se guarda como historial (antes se borraba ❌)
5. **Usuario decide** → Puede limpiar el historial cuando quiera desde configuración

## 📊 Versiones Actualizadas

- **Backend**: v2.1.0 (antes v1.2.22)
- **Frontend**: v2.1.0 (antes v1.1.6)
- **Aplicación**: v2.1.0 (antes v2.0.4)

## 📝 Notas de Instalación

### Actualización desde v2.0.x
Si ya tienes instalada una versión anterior:
1. Instala normalmente sobre la versión anterior
2. Tus datos en SQLite se mantienen intactos
3. Los archivos JSON antiguos (si quedan) funcionarán correctamente con el nuevo sistema

### Instalación Nueva
1. Descarga el instalador para tu sistema operativo
2. Ejecuta y sigue las instrucciones
3. Configura WhatsApp, Email y Python desde el menú de configuración

## 🎯 Próximas Mejoras (v2.2.0)

- [ ] Exportación de propiedades a Excel
- [ ] Filtros avanzados por múltiples criterios
- [ ] Dashboard de estadísticas mejorado
- [ ] Scraper de Idealista completamente implementado

## 🙏 Agradecimientos

Gracias por usar Inmobiliaria Manager. Si encuentras algún problema o tienes sugerencias, no dudes en abrir un issue en GitHub.

---

**Descarga**: Elige el instalador según tu sistema operativo en la sección de Assets ⬇️
