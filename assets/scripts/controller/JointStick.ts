import { _decorator, Component, EventTouch, Input, input, Node, v3, Vec3 } from "cc";
import { EVENTS, eventTarget } from "../common/eventTarget";
const { ccclass, property } = _decorator;

/**
 * Joystick nổi: lúc đầu ẩn, chạm vào màn hình thì hiện tại chỗ chạm, thả tay thì ẩn lại.
 */
@ccclass("JointStick")
export class JointStick extends Component {
   @property(Node)
   private stick: Node = null;
   @property(Node)
   private ring: Node = null;

   private _touchPos: Vec3 = v3();
   /** Khoá điều khiển trong lúc camera intro chạy (chờ INPUT_READY). */
   private _ready = false;

   onLoad() {
      // Ẩn ngay từ đầu, chỉ hiện khi người chơi chạm vào màn hình.
      this.ring.active = false;
      eventTarget.once(EVENTS.INPUT_READY, this.onInputReady, this);
      // Phòng khi không có CameraIntro: không để game bị khoá mãi.
      this.scheduleOnce(this.onInputReady, 3);
   }

   private onInputReady() {
      this._ready = true;
      this.unschedule(this.onInputReady);
   }

   start() {
      input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
      input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
      input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
      // Chạm bị huỷ (thông báo hệ thống, chuyển app...) cũng phải ẩn joystick và dừng hố.
      input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
   }

   onDestroy() {
      input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
      input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
      input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
      input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
      eventTarget.off(EVENTS.INPUT_READY, this.onInputReady, this);
   }

   private onTouchStart(event: EventTouch) {
      if (!this._ready) {
         return;
      }
      const touchPos = event.getUILocation().toVec3();
      this.ring.active = true;
      this.ring.worldPosition = touchPos;
      this.stick.position = v3(0, 0, 0);
      this._touchPos = touchPos;
   }

   private onTouchMove(event: EventTouch) {
      if (!this._ready || !this.ring.active) {
         return;
      }
      const max = 75;
      const touchPos = event.getUILocation().toVec3();
      const ringPos = this.ring.worldPosition;

      const angle = Math.atan2(touchPos.y - ringPos.y, touchPos.x - ringPos.x);
      const dir = Vec3.subtract(v3(), touchPos, ringPos).normalize();
      const distance = Vec3.distance(touchPos, ringPos);

      dir.z = -dir.y;
      dir.y = 0;
      eventTarget.emit(EVENTS.PLAYER_MOVE, dir);

      if (distance < 70) {
         this.stick.worldPosition = touchPos;
         return;
      }
      const newStickPos = v3(ringPos.x + max * Math.cos(angle), ringPos.y + max * Math.sin(angle), 0);
      this.stick.worldPosition = newStickPos;
   }

   private onTouchEnd(event: EventTouch) {
      if (!this.ring.active) {
         return;
      }
      this.ring.active = false;
      this.stick.position = v3(0, 0, 0);
      eventTarget.emit(EVENTS.STOP_MOVE);
   }
}
