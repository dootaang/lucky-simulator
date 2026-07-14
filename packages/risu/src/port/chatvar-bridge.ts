// chatVar 브릿지 — 업스트림 parser/chatVar.svelte 대체(ADR 0004). CbsPortEnv가 세팅한다.
let impl = { get: (_key: string) => '', getGlobal: (_key: string) => '' };
export function setChatVarBridge(next: { get: (key: string) => string; getGlobal: (key: string) => string }) { impl = next; }
export const getChatVar = (key: string) => impl.get(key);
export const getGlobalChatVar = (key: string) => impl.getGlobal(key);
