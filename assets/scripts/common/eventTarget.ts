import { EventTarget } from "cc";

export const eventTarget = new EventTarget();
export enum EVENTS {
   PLAYER_MOVE,
   STOP_MOVE,
}
