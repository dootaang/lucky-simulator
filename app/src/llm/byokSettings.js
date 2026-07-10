const { providerDef } = require('./providers.js');

function providerConfig(settings) {
  return {
    provider: settings.provider,
    model: settings.model || defaultModel(settings.provider),
    baseUrl: settings.provider === 'custom' ? settings.baseUrl : '',
    location: settings.provider === 'vertex' ? (settings.location || 'global') : '',
    apiKey: settings.provider === 'mock' ? '' : readKey(settings.provider),
  };
}

function loadSettings() {
  return {
    provider: localStorage.getItem('simbot.byok.provider') || 'mock',
    model: localStorage.getItem('simbot.byok.model') || 'gemini-2.5-flash',
    baseUrl: localStorage.getItem('simbot.byok.customBase') || '',
    location: localStorage.getItem('simbot.byok.location') || 'global',
  };
}

function saveSettings(settings) {
  localStorage.setItem('simbot.byok.provider', settings.provider);
  localStorage.setItem('simbot.byok.model', settings.model || '');
  localStorage.setItem('simbot.byok.customBase', settings.baseUrl || '');
  localStorage.setItem('simbot.byok.location', settings.location || 'global');
}

function registerCustomOrigin(settings) {
  if (settings.provider !== 'custom' || !settings.baseUrl || !window.SIMBOT_NETWORK_POLICY) return;
  try {
    const url = new URL(settings.baseUrl);
    if (url.protocol === 'https:') window.SIMBOT_NETWORK_POLICY.setAllowedCustomOrigin(url.origin);
  } catch (_) {}
}

function readKey(provider) {
  return localStorage.getItem(keyName(provider)) || '';
}

function keyName(provider) {
  return `simbot.byok.${provider}`;
}

function defaultModel(provider) {
  return providerDef(provider).defModel || '';
}

module.exports = {
  providerConfig,
  loadSettings,
  saveSettings,
  registerCustomOrigin,
  readKey,
  keyName,
  defaultModel,
};
