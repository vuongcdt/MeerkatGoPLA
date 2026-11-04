import { _decorator, Component, tween, v3 } from "cc";
import { EVENTS, eventTarget } from "../common/eventTarget";
const { ccclass, property } = _decorator;

/**
 * Hiệu ứng camera đầu game (bản gốc: CameraController.intro):
 * camera bắt đầu cao hơn + lùi xa hơn, góc nhìn thoải hơn, rồi trượt về vị trí chơi trong `introTime` giây.
 * Hết intro thì báo EVENTS.INPUT_READY để mở khoá điều khiển.
 * Gắn lên Main Camera (con của Hole), làm việc với vị trí / góc local.
 */
@ccclass("CameraIntro")
export class CameraIntro extends Component {
   /** Thời gian intro (giây), bản gốc 1.5 */
   @property introTime = 1.5;
   /** Cao hơn vị trí chơi lúc bắt đầu */
   @property raise = 10;
   /** Lùi xa hơn vị trí chơi lúc bắt đầu */
   @property back = 10;
   /** Góc nhìn xuống lúc bắt đầu (độ), bản gốc -39 */
   @property introPitch = -39;

   start() {
      const pos = this.node.position.clone();
      const euler = this.node.eulerAngles.clone();
      // Hướng "lùi xa" = hướng từ hố ra camera trên mặt phẳng XZ (camera nằm ở phía -z của hố).
      const len = Math.hypot(pos.x, pos.z) || 1;
      const introPos = v3(pos.x + (pos.x / len) * this.back, pos.y + this.raise, pos.z + (pos.z / len) * this.back);
      this.node.setPosition(introPos);
      this.node.setRotationFromEuler(this.introPitch, euler.y, euler.z);

      tween(this.node).to(this.introTime, { position: pos }, { easing: "quadOut" }).start();
      tween(this.node).to(this.introTime, { eulerAngles: euler }, { easing: "quadOut" }).start();
      this.scheduleOnce(() => eventTarget.emit(EVENTS.INPUT_READY), this.introTime);
   }
}
