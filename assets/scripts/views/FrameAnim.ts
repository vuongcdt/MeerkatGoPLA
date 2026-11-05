import { _decorator, Component, SpriteFrame, SpriteRenderer } from "cc";
import { EVENTS, eventTarget } from "../common/eventTarget";
const { ccclass, property } = _decorator;

/**
 * Chạy chuỗi khung hình trên SpriteRenderer.
 * Mỗi khung `frameTime` giây, chạy hết thì ẩn. Lúc thường ẩn hẳn.
 */
@ccclass("FrameAnim")
export class FrameAnim extends Component {
   @property([SpriteFrame]) frames: SpriteFrame[] = [];
   /** Giây mỗi khung (mặc định 0.02) */
   @property frameTime = 0.02;
   /** Tự chạy khi hố lên level */
   @property playOnLevelUp = true;

   private _renderer: SpriteRenderer | null = null;
   private _index = -1;
   private _time = 0;

   onLoad() {
      this._renderer = this.getComponent(SpriteRenderer);
      if (this._renderer) {
         this._renderer.enabled = false;
      }
   }

   onEnable() {
      if (this.playOnLevelUp) {
         eventTarget.on(EVENTS.LEVEL_UP, this.play, this);
      }
   }

   onDisable() {
      eventTarget.off(EVENTS.LEVEL_UP, this.play, this);
   }

   play() {
      if (!this._renderer || this.frames.length === 0) {
         return;
      }
      this._index = 0;
      this._time = 0;
      this._renderer.spriteFrame = this.frames[0];
      this._renderer.enabled = true;
   }

   update(dt: number) {
      if (this._index < 0) {
         return;
      }
      this._time += dt;
      while (this._time >= this.frameTime && this._index >= 0) {
         this._time -= this.frameTime;
         this._index++;
         if (this._index >= this.frames.length) {
            this._index = -1;
            this._renderer!.enabled = false;
            return;
         }
         this._renderer!.spriteFrame = this.frames[this._index];
      }
   }
}
