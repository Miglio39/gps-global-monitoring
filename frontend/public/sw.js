// Un Service Worker básico y vacío es suficiente para engañar al navegador
// y obligarlo a mostrar el botón de instalación.
self.addEventListener('fetch', function(event) {
    // No hace nada, solo existe para cumplir el requisito de PWA.
});