import { EventTarget } from "cc";

export const eventTarget = new EventTarget();
export enum EVENTS {
   PLAYER_MOVE,
   STOP_MOVE,
   BLOCK_DESTROYED,
   /** Block đã lọt hẳn xuống hố (chạm EatZone). Tham số: node của block. */
   BLOCK_EATEN,
   /** Hố lên level. Tham số: level mới (bắt đầu từ 0). */
   LEVEL_UP,
}
