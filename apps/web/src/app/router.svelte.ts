// 플레이어가 앱의 얼굴이다 — 리스처럼 열면 바로 플레이 화면. 홈/편집기는 제작자 도구 경로.
export type AppRoute='home'|'player'|'editor'|'components'; export function createRouter(initial:AppRoute='player'){let route=$state<AppRoute>(initial);return{get route(){return route;},go(next:AppRoute){route=next;}};}
