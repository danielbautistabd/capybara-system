// Entrada para Vercel (raíz del proyecto en Vercel = api/, framework Express): exporta la app completa.
// Los archivos de public/ (la interfaz compilada) los sirve Vercel directamente.
// En local y en Docker se sigue usando src/server.js, que además escucha y programa tareas.
export { default } from './src/server.js';
