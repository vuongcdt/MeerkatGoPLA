import { _decorator, Component, EventTouch, Input, input, Node, v3, Vec3 } from "cc";
import { EVENTS, eventTarget } from "../common/eventTarget";
const { ccclass, property } = _decorator;

@ccclass("JointStick")
export class JointStick extends Component {
   @property(Node)
   private stick: Node = null;
   @property(Node)
   private ring: Node = null;

   private _touchPos: Vec3 = v3();

   start() {
      input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
      input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
      input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
   }

   private onTouchStart(event: EventTouch) {
      const touchPos = event.getUILocation().toVec3();
      this.ring.worldPosition = touchPos;
      this._touchPos = touchPos;
   }

   private onTouchMove(event: EventTouch) {
      const max = 125;
      const touchPos = event.getUILocation().toVec3();
      const ringPos = this.ring.worldPosition;

      const angle = Math.atan2(touchPos.y - ringPos.y, touchPos.x - ringPos.x);
      const dir = Vec3.subtract(v3(), touchPos, ringPos).normalize();
      const distance = Vec3.distance(touchPos, ringPos);

      dir.z = -dir.y;
      dir.y = 0;
      eventTarget.emit(EVENTS.PLAYER_MOVE, dir);

      if (distance < 120) {
         this.stick.worldPosition = touchPos;
         return;
      }
      const newStickPos = v3(ringPos.x + max * Math.cos(angle), ringPos.y + max * Math.sin(angle), 0);
      this.stick.worldPosition = newStickPos;
   }

   private onTouchEnd(event: EventTouch) {
      this.ring.position = v3(0, -500, 0);
      this.stick.position = v3(0, 0, 0);
      eventTarget.emit(EVENTS.STOP_MOVE);
   }
}
