// SPDX-License-Identifier: GPL-3.0-or-later
// Lenient TypeScript port of LogPapa core/risu/parser.js (calcString,
// evalInline, expandBlocks, renderRisu), derived from RisuAI
// src/ts/parser/parser.svelte.ts (risuChatParser/matcher). Asset markers are
// deliberately preserved for asset-macros.ts, avoiding a second resolver.
import{CbsBudget,withCbsBudget}from'./security/budget.ts';
export interface CbsConditionContext{activeModules?:readonly string[]}
// 예산 초과는 조용히 넘어가지 않는다 — 호출자가 넘긴 예산 객체(context.budget)에 경고가 쌓인다.
// 모듈 전역에 마지막 오류만 남기면 이전 렌더의 경고가 다음 렌더에 끈적하게 따라붙어 진단이 거짓말을 한다.
// ADR 0004 M-S0 — 렌더는 영수증이지 거래가 아니다. parseCbs는 기본 읽기 전용이며,
// setvar/addvar류의 쓰기는 스크래치 복사본에만 반영되고 폐기된다(세션 변수 불변).
// 상태를 실제로 바꾸는 것은 명시적 트리거 트랜잭션뿐이다(mutable:true — 세션만 사용).
export interface CbsContext extends CbsConditionContext{userName?:string;charName?:string;chatIndex?:number;lastMessageId?:number;screenWidth?:number;variables:Record<string,string>;assets?:readonly{name:string;type:string;mime:string;moduleNamespace?:string}[];callStack?:number;mutable?:boolean;budget?:CbsBudget;}
const ASSET=/\{\{\s*(?:raw|path|img|image|asset|emotion|bg|bgm|audio|video|video-img)\s*::[^{}]*?}}/gi;
const OPEN='cbsAssetToken',CLOSE='TokenEnd';
export function calcString(input:string):string{const s=String(input??'');let i=0;const skip=()=>{while(/\s/.test(s[i]??''))i++;};const atom=():number=>{skip();if(s[i]==='('){i++;const value=compare();skip();if(s[i]===')')i++;return value;}let j=i;while(/[0-9.]/.test(s[j]??''))j++;if(j>i){const value=Number.parseFloat(s.slice(i,j));i=j;return Number.isFinite(value)?value:0;}while(i<s.length&&!/[-+*/%()<>=\s]/.test(s[i]!))i++;return 0;};const unary=():number=>{skip();if(s[i]==='-'){i++;return-unary();}if(s[i]==='+'){i++;return unary();}return atom();};const pow=():number=>{const left=unary();skip();if(s.slice(i,i+2)==='**'){i+=2;return Math.pow(left,pow());}return left;};const mul=():number=>{let value=pow();for(;;){skip();if(s[i]==='*'&&s[i+1]!=='*'){i++;value*=pow();}else if(s[i]==='/'){i++;const right=pow();value=right===0?0:value/right;}else if(s[i]==='%'){i++;const right=pow();value=right===0?0:value%right;}else return value;}};const add=():number=>{let value=mul();for(;;){skip();if(s[i]==='+'){i++;value+=mul();}else if(s[i]==='-'){i++;value-=mul();}else return value;}};function compare(){const left=add();skip();const op=['==','!=','>=','<=','>','<'].find(value=>s.startsWith(value,i));if(!op)return left;i+=op.length;const right=add();return op==='=='?Number(left===right):op==='!='?Number(left!==right):op==='>='?Number(left>=right):op==='<='?Number(left<=right):op==='>'?Number(left>right):Number(left<right);}try{const value=compare();return Number.isFinite(value)?String(value):'0';}catch{return'0';}}
function truthy(value:unknown){return!['','0','-1','false','null','undefined'].includes(String(value??'').trim().toLowerCase());}
function compare(a:string,b:string){const x=Number(a),y=Number(b);if(Number.isFinite(x)&&Number.isFinite(y))return x-y;return a.localeCompare(b);}
function name(value:string){return value.toLowerCase().replace(/[\s_-]/g,'');}
function moduleEnabled(value:string,ctx:CbsConditionContext){const wanted=name(value);return!!wanted&&(ctx.activeModules??[]).some(item=>name(item)===wanted);}
function whenCondition(source:string){let parts=source.split('::').map(value=>value.trim()).filter(Boolean);while(parts[0]&&['keep','legacy'].includes(name(parts[0])))parts=parts.slice(1);if(parts.length===1)return truthy(parts[0]);if(name(parts[0]??'')==='not')return!truthy(parts.slice(1).join('::'));if(parts.length===3){const op=name(parts[1]??''),a=parts[0]??'',b=parts[2]??'';if(['is','equal'].includes(op))return a===b;if(['isnot','notequal'].includes(op))return a!==b;if(op==='and')return truthy(a)&&truthy(b);if(op==='or')return truthy(a)||truthy(b);if(op==='>'||op==='greater')return compare(a,b)>0;if(op==='>='||op==='greaterequal')return compare(a,b)>=0;if(op==='<'||op==='less')return compare(a,b)<0;if(op==='<='||op==='lessequal')return compare(a,b)<=0;}return truthy(parts.at(-1));}
function whenBlocks(source:string){let text=source,guard=0;while(guard++<5000){const open=/\{\{#when(?:(?:\s+|::)([^{}]*))?}}/i.exec(text);if(!open)break;let depth=1,closeStart=-1,closeEnd=-1,elseStart=-1,elseEnd=-1;const scan=/\{\{(#when(?:(?:\s+|::)[^{}]*)?|:else|\/when)}}/gi;scan.lastIndex=open.index+open[0].length;let item:RegExpExecArray|null;while((item=scan.exec(text))){if(/^#when/i.test(item[1]!))depth++;else if(item[1]!.toLowerCase()===':else'&&depth===1){elseStart=item.index;elseEnd=item.index+item[0].length;}else if(--depth===0){closeStart=item.index;closeEnd=item.index+item[0].length;break;}}if(closeStart<0){text=text.slice(0,open.index);break;}const yes=text.slice(open.index+open[0].length,elseStart<0?closeStart:elseStart),no=elseStart<0?'':text.slice(elseEnd,closeStart);text=text.slice(0,open.index)+(whenCondition(open[1]??'')?yes:no)+text.slice(closeEnd);}return text;}
export function evaluateCbsConditions(source:string,context:CbsConditionContext={}):string{const modules=String(source??'').replace(/\{\{\s*module[_ -]?enabled\s*::\s*([^{}]*?)}}/gi,(_whole,id:string)=>String(Number(moduleEnabled(id.trim(),context))));return whenBlocks(modules);}
function token(inner:string,ctx:CbsContext):string|null{if(inner.trimStart().startsWith('?'))return calcString(inner.replace(/^\s*\?\s*/,''));const parts=inner.includes('::')?inner.split('::'):inner.split(':'),fn=name(parts.shift()??''),args=parts;switch(fn){case'raw':case'path':case'img':case'image':case'asset':case'emotion':case'bg':case'bgm':case'audio':case'video':case'videoimg':return`\uE000${fn}::${args.join('::')}\uE001`;case'user':return ctx.userName??'User';case'char':case'bot':return ctx.charName??'Character';case'screenwidth':return String(ctx.screenWidth??0);case'chatindex':return String(ctx.chatIndex??'');case'lastmessageid':return String(ctx.lastMessageId??'');case'br':case'newline':return'\n';case'getvar':return ctx.variables[args[0]??'']??'';case'setvar':ctx.variables[args[0]??'']=args.slice(1).join('::');return'';case'equal':case'is':return String(Number(String(args[0])===String(args[1])));case'notequal':case'isnot':return String(Number(String(args[0])!==String(args[1])));case'greater':return String(Number(compare(args[0]??'',args[1]??'')>0));case'greaterequal':return String(Number(compare(args[0]??'',args[1]??'')>=0));case'less':return String(Number(compare(args[0]??'',args[1]??'')<0));case'lessequal':return String(Number(compare(args[0]??'',args[1]??'')<=0));case'calc':return calcString(args.join('::'));default:return null;}}
function inline(source:string,ctx:CbsContext){let text=source,guard=0;while(guard++<10_000){const match=/\{\{(?!\s*[#:/])([^{}]*?)}}/.exec(text);if(!match)break;const value=token(match[1]!,ctx);text=text.slice(0,match.index)+(value??'')+text.slice(match.index+match[0].length);}return text;}
function blocks(source:string,ctx:CbsContext){let text=source,guard=0;while(guard++<5000){const open=/\{\{#if(?:_pure)?(?:\s+|::)([^{}]*)}}/i.exec(text);if(!open)break;let depth=1,closeStart=-1,closeEnd=-1,elseStart=-1,elseEnd=-1;const scan=/\{\{(#if(?:_pure)?(?:\s+|::)[^{}]*|:else|\/(?:if)?)}}/gi;scan.lastIndex=open.index+open[0].length;let item:RegExpExecArray|null;while((item=scan.exec(text))){if(/^#if/i.test(item[1]!))depth++;else if(item[1]!.toLowerCase()===':else'&&depth===1){elseStart=item.index;elseEnd=item.index+item[0].length;}else if(--depth===0){closeStart=item.index;closeEnd=item.index+item[0].length;break;}}if(closeStart<0){text=text.slice(0,open.index);break;}const yes=text.slice(open.index+open[0].length,elseStart<0?closeStart:elseStart),no=elseStart<0?'':text.slice(elseEnd,closeStart),condition=inline(open[1]!,ctx);text=text.slice(0,open.index)+(truthy(condition)?yes:no)+text.slice(closeEnd);}return text.replace(/\{\{\/?(?:if)?}}/gi,'').replace(/\{\{:else}}/gi,'');}
// ADR 0004 M-B: 파싱 본체는 업스트림 전체 이식(port/parser.ts의 risuChatParser)에 위임한다.
// 유지되는 우리 계약: ① 에셋 매크로는 값이 되지 않고 {{fn::args}}로 보존되어 뒷단(resolveAssetMacros)이
// 처리한다(안쪽 CBS는 업스트림 루프가 먼저 평가하므로 outfit 변수 결합이 리스와 동일 시점에 완성된다)
// ② user/char/screenwidth/chatindex/lastmessageid는 세션 컨텍스트가 준 값 ③ 미해석 {{…}}은 소거.
import { risuChatParser, setCbsPortEnv, getCbsPortEnv, restoreCbsPortEnv, overrideCbsFunction } from './port/parser.ts';
let portReady=false;
function ensurePortOverrides(){if(portReady)return;portReady=true;
 for(const fn of['raw','path','img','image','asset','emotion','bg','bgm','audio','video','video-img','videoimg'])overrideCbsFunction(fn,(_str,_arg,args)=>`${fn==='videoimg'?'video-img':fn}::${args.join('::')}`);
 overrideCbsFunction('user',(_s,arg)=>String((arg as unknown as{__ctx?:CbsContext}).__ctx?.userName??activeParseContext?.userName??'User'));
 overrideCbsFunction('char',charName);overrideCbsFunction('bot',charName);
 overrideCbsFunction('screenwidth',()=>String(activeParseContext?.screenWidth??0));
 overrideCbsFunction('chatindex',()=>String(activeParseContext?.chatIndex??''));
 overrideCbsFunction('lastmessageid',()=>String(activeParseContext?.lastMessageId??''));
 // 모듈 네임스페이스는 우리가 발급한다(card-library.moduleNamespace) — 대소문자·구분자 차이를 흡수하는 정규화 매칭 유지.
 for(const fn of['moduleenabled','module_enabled'])overrideCbsFunction(fn,(_s,_a,args)=>String(Number(moduleEnabled(String(args[0]??''),{activeModules:activeParseContext?.activeModules??[]}))));}
const charName=()=>String(activeParseContext?.charName??'Character');
let activeParseContext:CbsContext|null=null;
export function parseCbs(source:string,context:CbsContext):string{if((context.callStack??0)>=20)return'';
 const previousContext=activeParseContext,previousEnv=getCbsPortEnv();
 // 기본 읽기 전용: 카드가 표시 중 쓰기를 시도하면 스크래치에만 남고 버려진다. 세션 변수 객체는 절대 건드리지 않는다.
 const store:Record<string,string>=context.mutable===true?context.variables:{...context.variables};
 activeParseContext=context;
 try{ensurePortOverrides();
 setCbsPortEnv({
   getChatVar:(key)=>store[key]??'',
   setChatVar:(key,value)=>{store[key]=value;},
   getGlobalChatVar:(key)=>store[key]??'',
   getUserName:()=>context.userName??'User',
   getModules:()=>{const namespaces=new Set([...(context.activeModules??[]),...(context.assets??[]).map(asset=>asset.moduleNamespace).filter((value):value is string=>!!value)]);return[...namespaces].map((namespace)=>({namespace,name:namespace,assets:(context.assets??[]).filter(asset=>asset.moduleNamespace===namespace).map(asset=>[asset.name,'',asset.mime.split('/').at(-1)??''])}));},
   database:()=>({characters:[{name:context.charName??'Character',type:'character',chats:[{message:[]}],chatPage:0,emotionImages:(context.assets??[]).filter(asset=>asset.type==='emotion').map(asset=>[asset.name,'']),additionalAssets:(context.assets??[]).filter(asset=>!asset.moduleNamespace&&asset.type!=='emotion').map(asset=>[asset.name,'',asset.mime.split('/').at(-1)??''])}],aiModel:''}),
  });
  // 업스트림 자체 게이트: setvar 계열은 runVar가 참일 때만 실행된다. 표시 경로에서는 끈다(이중 방어).
  const parsed=withCbsBudget(context.budget??new CbsBudget(),()=>risuChatParser(String(source??''),{chatID:context.chatIndex??-1,runVar:context.mutable===true,callStack:context.callStack??0}));
  return String(parsed).replace(/\{\{[^{}]*}}/g,'').replace(/([^]*)/g,'{{$1}}');
 }catch{return String(source??'');} // 예산 초과 포함 — 실패는 안전한 원문으로 되돌린다(경고는 context.budget.breaches에 남는다)
 finally{activeParseContext=previousContext;restoreCbsPortEnv(previousEnv);}}
