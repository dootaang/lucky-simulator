import {applyRegexScripts,parseCbs,resolveAssetMacros,type AssetMacroAsset,type AssetMacroWarning,type AssetResolveOptions,type RegexScript} from '@simbot/risu';
import {renderMarkdownWithHtml as renderMarkdown} from '@simbot/ui/markdown';
import {sanitizeHtml} from '@simbot/ui/sanitize-html';

// 치환값(페르소나·카드 이름)은 사용자가 정한 문자열이다. 그 안에 중괄호가 있으면 뒷단의 CBS 파서·에셋
// 매크로가 그것을 문법으로 오인한다(통합 감사). 치환 전에 중괄호를 무력화한다.
const literal=(value:string)=>String(value??'').replace(/[{}]/g,'');
export function displayMacros(content:string,user:string,char:string){const u=literal(user),c=literal(char);return content.replace(/{{\s*user\s*}}/gi,u).replace(/{{\s*char\s*}}/gi,c);}
export function renderDisplayContent(content:string,user:string,char:string,assets:readonly AssetMacroAsset[],scripts:readonly RegexScript[]=[],variables:Record<string,string>={},chatIndex=0,lastMessageId=0,assetOptions:AssetResolveOptions={}):{html:string;warnings:AssetMacroWarning[]}{let rendered=applyRegexScripts(content,scripts,'output');rendered=applyRegexScripts(rendered,scripts,'display');rendered=parseCbs(rendered,{userName:user,charName:char,chatIndex,lastMessageId,variables});const resolved=resolveAssetMacros(rendered,assets,assetOptions);return{html:sanitizeHtml(renderMarkdown(resolved.content)),warnings:resolved.warnings};}
