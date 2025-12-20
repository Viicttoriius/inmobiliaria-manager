# Notas de la Versión v2.2.25

## 🐛 Correcciones de Errores (Bug Fixes)
- **Error Crítico en Bandeja de Entrada:** Se ha solucionado el error "Minified React error #31" que ocurría al abrir ciertos correos electrónicos.
  - Causa: El sistema intentaba mostrar objetos de dirección de correo (ej. `{ name: 'Juan', address: 'juan@email.com' }`) directamente en la interfaz, lo cual no es permitido por React.
  - Solución: Se implementó un formateador inteligente (`formatAddress`) que convierte estos objetos en texto legible (ej. "Juan <juan@email.com>") antes de mostrarlos.
  - Resultado: La visualización de remitentes y destinatarios en la bandeja de entrada es ahora robusta y soporta múltiples formatos de datos.

## 🛠 Mejoras Técnicas
- Refactorización del componente `InboxPanel.jsx` para manejar de forma segura estructuras de datos complejas provenientes del servidor IMAP.
