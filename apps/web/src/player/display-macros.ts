import {resolveAssetMacros,type AssetMacroAsset,type AssetMacroWarning} from '@simbot/risu';
import {renderMarkdownWithHtml as renderMarkdown} from '@simbot/ui/markdown';
import {sanitizeHtml} from '@simbot/ui/sanitize-html';

export function displayMacros(content:string,user:string,char:string){return content.replace(/{{\s*user\s*}}/gi,user).replace(/{{\s*char\s*}}/gi,char);}
export function renderDisplayContent(content:string,user:string,char:string,assets:readonly AssetMacroAsset[]):{html:string;warnings:AssetMacroWarning[]}{const resolved=resolveAssetMacros(displayMacros(content,user,char),assets);return{html:sanitizeHtml(renderMarkdown(resolved.content)),warnings:resolved.warnings};}
let activeAssets:readonly AssetMacroAsset[]=[];
const reported=new Set<string>();
export function setDisplayAssets(assets:readonly AssetMacroAsset[]){activeAssets=assets;}
export function renderActiveDisplay(content:string){const resolved=resolveAssetMacros(content,activeAssets);for(const warning of resolved.warnings){const key=`${warning.code}:${warning.macro}:${warning.name}`;if(!reported.has(key)){reported.add(key);console.warn('[카드 에셋 호환성]',warning);}}return sanitizeHtml(renderMarkdown(resolved.content));}
