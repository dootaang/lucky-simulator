// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

function selectSimPackRuntime(manifest) {
  if (!manifest || manifest.contract !== 'simpack/0.2') throw new Error('simpack_runtime_contract');
  if (!manifest.runtime || !manifest.runtime.schema) throw new Error('simpack_runtime_schema_missing');
  const persona = manifest.personas.sessionBinding && manifest.personas.sessionBinding.snapshot
    || manifest.personas.library.find((item) => item.id === manifest.personas.defaultPersonaId) || null;
  const promptPreset = manifest.prompts.sessionBinding && manifest.prompts.sessionBinding.snapshot
    || manifest.prompts.presets.find((item) => item.id === manifest.prompts.defaultPresetId) || null;
  return {
    projectId: manifest.id, title: manifest.title,
    schema: manifest.runtime.schema, initialState: manifest.runtime.initialState,
    screens: manifest.runtime.screens, navigation: manifest.runtime.navigation,
    options: manifest.runtime.options, featureToggles: manifest.runtime.featureToggles,
    persona, promptPreset, moduleBindings: manifest.modules.bindings,
    content: manifest.content, assets: manifest.assets,
  };
}

module.exports = { selectSimPackRuntime };

