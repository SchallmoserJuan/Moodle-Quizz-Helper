/**
 * options.js
 * Lógica de la página de opciones.
 * Lee y escribe la configuración del proveedor y API Keys.
 */

document.addEventListener('DOMContentLoaded', () => {
  const providerSelect = document.getElementById('provider');
  const geminiSection = document.getElementById('gemini-section');
  const groqSection = document.getElementById('groq-section');
  const customSection = document.getElementById('openai-compatible-section');

  const geminiApiKeyInput = document.getElementById('geminiApiKey');
  const geminiModelInput = document.getElementById('geminiModel');
  const groqApiKeyInput = document.getElementById('groqApiKey');
  const groqModelInput = document.getElementById('groqModel');
  const customApiKeyInput = document.getElementById('customApiKey');
  const customBaseUrlInput = document.getElementById('customBaseUrl');
  const customModelInput = document.getElementById('customModel');

  const saveBtn = document.getElementById('save');
  const statusDiv = document.getElementById('status');

  function updateVisibility() {
    const provider = providerSelect.value;
    geminiSection.classList.toggle('active', provider === 'gemini');
    groqSection.classList.toggle('active', provider === 'groq');
    customSection.classList.toggle('active', provider === 'openai-compatible');
  }

  providerSelect.addEventListener('change', updateVisibility);

  // Cargar valores guardados previamente
  chrome.storage.local.get([
    'provider',
    'geminiApiKey', 'geminiModel',
    'groqApiKey', 'groqModel',
    'customApiKey', 'customBaseUrl', 'customModel'
  ], (result) => {
    if (chrome.runtime.lastError) {
      console.error('Error leyendo storage:', chrome.runtime.lastError);
      return;
    }

    providerSelect.value = result.provider || 'gemini';
    updateVisibility();

    if (result.geminiApiKey) geminiApiKeyInput.value = result.geminiApiKey;
    geminiModelInput.value = result.geminiModel || 'gemini-2.5-flash';

    if (result.groqApiKey) groqApiKeyInput.value = result.groqApiKey;
    groqModelInput.value = result.groqModel || 'openai/gpt-oss-120b';

    if (result.customApiKey) customApiKeyInput.value = result.customApiKey;
    if (result.customBaseUrl) customBaseUrlInput.value = result.customBaseUrl;
    if (result.customModel) customModelInput.value = result.customModel;
  });

  function showStatus(message, isError) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + (isError ? 'error' : 'success');
    setTimeout(() => {
      statusDiv.className = 'status';
      statusDiv.textContent = '';
    }, 3000);
  }

  saveBtn.addEventListener('click', () => {
    const provider = providerSelect.value;
    const geminiKey = geminiApiKeyInput.value.trim();
    const geminiModel = geminiModelInput.value.trim() || 'gemini-2.5-flash';
    const groqKey = groqApiKeyInput.value.trim();
    const groqModel = groqModelInput.value.trim() || 'openai/gpt-oss-120b';
    const customKey = customApiKeyInput.value.trim();
    const customBaseUrl = customBaseUrlInput.value.trim();
    const customModel = customModelInput.value.trim();

    if (provider === 'gemini' && !geminiKey) {
      showStatus('La Gemini API Key no puede estar vacía.', true);
      return;
    }

    if (provider === 'groq' && !groqKey) {
      showStatus('La Groq API Key no puede estar vacía.', true);
      return;
    }

    if (provider === 'openai-compatible') {
      if (!customKey) {
        showStatus('La API Key no puede estar vacía.', true);
        return;
      }
      if (!customBaseUrl) {
        showStatus('La Base URL no puede estar vacía.', true);
        return;
      }
      if (!customModel) {
        showStatus('El nombre del modelo no puede estar vacío.', true);
        return;
      }
    }

    chrome.storage.local.set({
      provider: provider,
      geminiApiKey: geminiKey,
      geminiModel: geminiModel,
      groqApiKey: groqKey,
      groqModel: groqModel,
      customApiKey: customKey,
      customBaseUrl: customBaseUrl,
      customModel: customModel
    }, () => {
      if (chrome.runtime.lastError) {
        showStatus('Error al guardar: ' + chrome.runtime.lastError.message, true);
        return;
      }
      showStatus('Configuración guardada correctamente.', false);
    });
  });
});
