'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path');
const { normalizeScreens } = require('../core/screens/runtime.js'); const { getDefaultModuleRegistry } = require('../../engine/core/applyEvent.js');
const projectPath = path.resolve(__dirname, '../../examples/alternate-hunters-v2/project.json');
const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));

test('Alternate Hunters V2는 앱 분기 없이 SimPack v0.2 화면과 모듈로 조립된다', () => {
  assert.equal(project.contract, 'simpack/0.2'); assert.equal(project.runtime.schema.meta.id, 'alternate-hunters-v2');
  const screens = normalizeScreens(project.runtime.screens, project.runtime.navigation); assert.equal(screens.issues.length, 0); assert.deepEqual(screens.navigation.map((item) => item.screenId), ['association', 'terminal', 'party']);
  const source = fs.readFileSync(path.resolve(__dirname, '../src/declarativeScreenView.js'), 'utf8') + fs.readFileSync(path.resolve(__dirname, '../src/playView.js'), 'utf8');
  assert.doesNotMatch(source, /alternate-hunters-v2|Alternate Hunters V2/);
});

test('결정 카드에는 엔진이 실제 처리할 수 있는 이벤트만 있고 상태창은 selector를 쓴다', () => {
  const registry = getDefaultModuleRegistry(); const widgets = project.runtime.screens.flatMap((screen) => Object.values(screen.regions).flat());
  const actions = widgets.flatMap((widget) => widget.actions || []); for (const action of actions) assert.ok(registry.hasEvent(action.event.id), action.event.id);
  assert.ok(widgets.some((widget) => widget.source === 'engine:hunter/status')); assert.equal(project.runtime.schema.initialState.hunter.rank, null);
});

test('기능 토글과 canonical NPC 감정 에셋이 프로젝트 데이터에 보존된다', () => {
  assert.equal(project.runtime.featureToggles.alterStore, false); assert.equal(project.runtime.featureToggles.events, true);
  assert.deepEqual(project.assets[0].canonical, { entityId: 'choi-yoo-jin', emotion: 'default' });
});
