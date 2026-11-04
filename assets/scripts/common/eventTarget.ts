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
   /** Block vừa chìm xuống dưới mặt hố (sớm hơn nhiều so với BLOCK_EATEN ở đáy hố). Tham số: node của block. */
   BLOCK_SWALLOWED,
   /** Một block vừa được tính là đã ăn (mỗi block 1 lần). Tham số: isTarget (block mục tiêu còn đang đếm). */
   BLOCK_COLLECTED,
   /** Vừa hoàn thành một loại mục tiêu. Tham số: index mục tiêu. */
   TARGET_COMPLETED,
   /** Hoàn thành tất cả mục tiêu (hiện end card). */
   GAME_WIN,
   /** Hết hiệu ứng camera đầu game, cho phép điều khiển. */
   INPUT_READY,
}
