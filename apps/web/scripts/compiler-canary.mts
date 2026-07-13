import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseCard} from '@simbot/card';
import {compileCard} from '@simbot/compiler';
import {cardToRuntimeProject} from '@simbot/risu';
import {ProjectRuntime} from '@simbot/runtime';

const cardPath=process.argv[2];
const schemaPath=process.argv[3]??resolve('../../schema/yongsa-inn.v0.json');
if(!cardPath)throw new Error('사용법: pnpm canary:compiler -- <카드 경로> [기준 스키마 경로]');

const cardBytes=new Uint8Array(await readFile(resolve(cardPath)));
const parsed=parseCard(cardBytes,cardPath);
const modelSchema=JSON.parse(await readFile(resolve(schemaPath),'utf8')) as Record<string,unknown>;
const compiled=await compileCard({parsed,provider:{async complete(){return{text:JSON.stringify(modelSchema),events:[]};}}});
const profile=cardToRuntimeProject(parsed,compiled);
const runtime=new ProjectRuntime(profile.project,20260713);

assert.equal(profile.passport.mode,'full-sim');
assert(compiled.moduleIds.includes('genre.inn'));
assert(compiled.screens.some(screen=>screen.id==='management'));
assert(runtime.registry.hasEvent('traffic_wave'));
const wave=runtime.dispatch('traffic_wave',{wave:'lunch'});
assert(wave.log.some(entry=>entry.ok&&entry.event==='traffic_wave'));

const report={
  card:{name:parsed.name,format:parsed.format,bytes:cardBytes.length,assets:parsed.assets.length},
  mining:compiled.diagnosis.runtime,
  coverage:{
    total:compiled.diagnosis.compilerCoverage.totalEntries,
    included:compiled.diagnosis.compilerCoverage.includedEntries,
    omitted:compiled.diagnosis.compilerCoverage.omittedEntries
  },
  compile:{modules:compiled.moduleIds,screens:compiled.screens.map(screen=>screen.id),patches:compiled.patches.length,unmatched:compiled.unmatchedMinedValues.length,warnings:compiled.warnings.length},
  runtime:{trafficWave:true,gold:runtime.state.gold,day:runtime.state.day}
};
console.log(JSON.stringify(report,null,2));
