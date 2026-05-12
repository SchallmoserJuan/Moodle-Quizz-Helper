/**
 * background.js
 * Service Worker de Manifest V3.
 * Escucha el atajo de teclado (Ctrl+Shift+X) y reenvía la orden
 * al content script del tab activo.
 */

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'resolve-question') return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) return;

    const tabId = tabs[0].id;
    chrome.tabs.sendMessage(
      tabId,
      { action: 'resolveCurrentQuestion' },
      (response) => {
        if (chrome.runtime.lastError) {
          // Es normal que falle si el content script no está cargado
          // o si la página no es Moodle (el script no responde).
          console.log(
            '[Moodle Study Helper] No se pudo contactar al content script:',
            chrome.runtime.lastError.message
          );
        }
      }
    );
  });
});
