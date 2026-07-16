import assert from'node:assert/strict';
import{openAsBlob}from'node:fs';
import{readFile}from'node:fs/promises';
import{resolve}from'node:path';
import{indexZipAssets,parseCard}from'@simbot/card';
import{compileKnownCard}from'@simbot/compiler';
import{cardToRuntimeProject}from'@simbot/risu';
import{ProjectRuntime}from'@simbot/runtime';

const cardPath=resolve(process.argv[2]??'../../소녀전선/소녀전선_잔불.png');
const modulePath=resolve(process.argv[3]??'../../소녀전선/소녀전선 에셋 모듈.charx');
const started=performance.now(),parsed=parseCard(new Uint8Array(await readFile(cardPath)),cardPath),compiled=compileKnownCard(parsed);
assert(compiled,'실카드가 인증된 소녀전선 구조로 탐지되지 않았습니다.');
const profile=cardToRuntimeProject(parsed,compiled),runtime=new ProjectRuntime(profile.project,20260717);
assert(runtime.registry.hasEvent('gfl/start'));
const registration=runtime.dispatch('gfl/start',{mode:'commander'});
assert.equal(registration.log[0]?.ok,true);
const echelons=runtime.select('gfl/echelons')as Array<Record<string,unknown>>,dolls=runtime.select('gfl/dolls')as Array<Record<string,unknown>>;
assert(dolls.length>0&&echelons.length>0);
const assignment=runtime.dispatch('gfl/echelon/assign',{echelonId:echelons[0]!.id,slot:0,dollId:dolls[0]!.id});
assert.equal(assignment.log[0]?.ok,true);
const assetStarted=performance.now(),assetIndex=await indexZipAssets(await openAsBlob(modulePath));
assert(assetIndex.entries.length>0);
console.log(JSON.stringify({
  card:{name:parsed.name,format:parsed.format,bytes:parsed.sourceBytes.length,embeddedAssets:parsed.assets.length},
  runtime:compiled.diagnosis.runtime,
  native:{modules:compiled.moduleIds,dolls:(compiled.schema.gfl as{dolls:unknown[]}).dolls.length,missions:(compiled.schema.gfl as{missions:unknown[]}).missions.length,echelons:echelons.length,starter:dolls[0]!.name},
  assetModule:{entries:assetIndex.totalEntries,images:assetIndex.entries.length,centralDirectoryBytes:assetIndex.centralDirectoryBytes,indexMs:Math.round(performance.now()-assetStarted)},
  totalMs:Math.round(performance.now()-started)
},null,2));
