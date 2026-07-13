// SPDX-License-Identifier: GPL-3.0-or-later
// Ported from LogPapa core/convert/cardRegex.js (extractRegexScripts,
// sanitizeRegexOut, isCatastrophic, buildRegex, substituteGroups), itself
// compatible with RisuAI regex hooks. See THIRD_PARTY_NOTICES.md.
export type CardRegexStage='display'|'output'|'process'|'input';
type RegexStage=CardRegexStage;
export interface RegexScript{in:string;out:string;type:string;flag?:string;flags?:string;comment?:string;}

const stageTypes:Record<CardRegexStage,Set<string>>={
  display:new Set(['editdisplay','edit_display','display']),
  output:new Set(['editoutput','edit_output','output']),
  process:new Set(['editprocess','edit_process','process','editrequest','edit_request','request']),
  input:new Set(['editinput','edit_input','input'])
};
const MAX_SCRIPTS=200,MAX_MATCHES=1000,MAX_TEXT=1_000_000,MAX_MS=25;
let activeScripts:readonly RegexScript[]=[],activeVariables:Record<string,string>={};
export function setActiveRenderContext(scripts:readonly RegexScript[],variables:Record<string,string>){activeScripts=scripts;activeVariables=variables;}
export function activeRenderContext(){return{scripts:activeScripts,variables:activeVariables};}
function record(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
export function sanitizeRegexOut(out:string){return String(out).replace(/<\s*script\b[\s\S]*?<\s*\/\s*script\s*>/gi,'').replace(/<\s*\/?\s*(?:script|iframe|object|embed|link|meta|base)\b[^>]*>/gi,'').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,'').replace(/javascript:/gi,'');}
export function isCatastrophic(pattern:string){return /\([^()]*[+*][^()]*\)[+*{]/.test(pattern);}
export function buildRegex(input:string,hint=''){let pattern=input,flags=hint;const match=/^\/([\s\S]*)\/([gimsuy]*)$/.exec(input);if(match){pattern=match[1]!;flags=match[2]||flags;}if(!flags.includes('g'))flags+='g';return new RegExp(pattern,flags);}
export function extractRegexScripts(parsed:unknown):RegexScript[]{const root=record(parsed),found:RegexScript[]=[],seen=new Set<unknown>();const push=(value:unknown)=>{if(!Array.isArray(value)||seen.has(value))return;seen.add(value);for(const entry of value){const item=record(entry);if(typeof item.in==='string'&&typeof item.out==='string')found.push({in:item.in,out:sanitizeRegexOut(item.out),type:String(item.type??'editdisplay'),flag:String(item.flag??item.flags??''),comment:String(item.comment??'')});}};const card=record(root.card),data=record(card.data??card),risu=record(record(data.extensions).risuai);push(risu.customScripts);push(risu.customscript);push(risu.regexScript);push(risu.regex);push(record(root.module).regex);push(record(card.module).regex);for(const module of Array.isArray(root.modules)?root.modules:[]){const value=record(module);push(value.regex);push(record(value.raw).regex);}return found;}
function substitute(template:string,args:RegExpExecArray){return template.replace(/\$(\$|\d{1,2})/g,(whole,digit:string)=>{if(digit==='$')return'$';const index=Number(digit);return index>0&&index<args.length?(args[index]??''):whole;});}
export function applyRegexScripts(text:string,scripts:readonly RegexScript[],stage:RegexStage){if(!text||!scripts.length||text.length>MAX_TEXT)return text;let output=text;const started=Date.now();for(const script of scripts.slice(0,MAX_SCRIPTS)){if(Date.now()-started>MAX_MS)break;if(!script||!stageTypes[stage].has(String(script.type||'editdisplay').toLowerCase()))continue;let regex:RegExp;try{regex=buildRegex(script.in,script.flag??script.flags??'');}catch{continue;}if(isCatastrophic(regex.source))continue;const safe=sanitizeRegexOut(script.out);let cursor=0,result='',count=0,match:RegExpExecArray|null;try{while((match=regex.exec(output))&&count++<MAX_MATCHES){result+=output.slice(cursor,match.index)+substitute(safe,match);cursor=match.index+match[0].length;if(!match[0].length)regex.lastIndex+=1;if(Date.now()-started>MAX_MS)break;}if(count)output=result+output.slice(cursor);}catch{/* keep the last safe output */}}return output;}
