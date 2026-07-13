// 플레이어가 앱의 얼굴이다. 제작 도구도 플레이어의 봇 편집 패널 안에서 연다.
export type AppRoute='home'|'player'|'components'; export function createRouter(initial:AppRoute='player'){let route=$state<AppRoute>(initial);return{get route(){return route;},go(next:AppRoute){route=next;}};}
