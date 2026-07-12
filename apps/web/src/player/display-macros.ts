import {activeRenderContext,applyRegexScripts,parseCbs,resolveAssetMacros,type AssetMacroAsset,type AssetMacroWarning,type RegexScript} from '@simbot/risu';
import {renderMarkdownWithHtml as renderMarkdown} from '@simbot/ui/markdown';
import {sanitizeHtml} from '@simbot/ui/sanitize-html';

export function displayMacros(content:string,user:string,char:string){return content.replace(/{{\s*user\s*}}/gi,user).replace(/{{\s*char\s*}}/gi,char);}
export function renderDisplayContent(content:string,user:string,char:string,assets:readonly AssetMacroAsset[],scripts:readonly RegexScript[]=[],variables:Record<string,string>={},chatIndex=0,lastMessageId=0):{html:string;warnings:AssetMacroWarning[]}{let rendered=applyRegexScripts(content,scripts,'output');rendered=applyRegexScripts(rendered,scripts,'display');rendered=parseCbs(rendered,{userName:user,charName:char,chatIndex,lastMessageId,variables});const resolved=resolveAssetMacros(rendered,assets,{bare:false});return{html:sanitizeHtml(renderMarkdown(resolved.content)),warnings:resolved.warnings};}
let activeAssets:readonly AssetMacroAsset[]=[];
const reported=new Set<string>();
export function setDisplayAssets(assets:readonly AssetMacroAsset[]){activeAssets=assets;}
export function renderActiveDisplay(content:string,user='User',char='Character',scripts?:readonly RegexScript[],variables?:Record<string,string>,chatIndex=0,lastMessageId=0){const active=activeRenderContext(),resolved=renderDisplayContent(content,user,char,activeAssets,scripts??active.scripts,variables??active.variables,chatIndex,lastMessageId);for(const warning of resolved.warnings){const key=`${warning.code}:${warning.macro}:${warning.name}`;if(!reported.has(key)){reported.add(key);console.warn('[카드 에셋 호환성]',warning);}}return resolved.html;}
