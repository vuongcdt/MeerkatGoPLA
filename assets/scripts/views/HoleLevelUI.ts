import { _decorator, Camera, Color, Component, Label, Node, Sprite, tween, Tween, UITransform, v3 } from "cc";
import { HoleController } from "./HoleController";
import { EVENTS, eventTarget } from "../common/eventTarget";
import { HoleConfig } from "../common/HoleConfig";
const { ccclass, property } = _decorator;

const _tmp = v3();

/**
 * Nhãn "LV. n" + thanh XP ở miệng hố.
 * Mỗi frame chiếu điểm `anchor` (node 3D nằm dưới miệng hố, là con của Visual nên tự xuống thấp khi hố to ra)
 * ra toạ độ UI rồi đặt node này vào đó.
 * Mỗi block bị nuốt hiện chữ "+n" bay lên phía trên nhãn.
 */
@ccclass("HoleLevelUI")
export class HoleLevelUI extends Component {
   /** Hố (lấy level + XP) */
   @property(HoleController) hole: HoleController | null = null;
   /** Điểm 3D dưới miệng hố để gắn nhãn */
   @property(Node) anchor: Node | null = null;
   /** Camera 3D nhìn hố */
   @property(Camera) camera: Camera | null = null;
   /** Chữ LV. n */
   @property(Label) levelLabel: Label | null = null;
   /** Thanh XP (Sprite kiểu FILLED) */
   @property(Sprite) xpFill: Sprite | null = null;
   /** Node chứa chữ "+n" bay lên */
   @property(Node) floatingParent: Node | null = null;
   /** Số chữ "+n" hiện cùng lúc tối đa (nuốt hàng loạt không bị rối màn hình) */
   @property maxFloating = 15;

   private _shownLevel = -1;
   private _pool: Label[] = [];
   private _active = 0;

   onEnable() {
      eventTarget.on(EVENTS.BLOCK_SWALLOWED, this.onSwallowed, this);
   }

   onDisable() {
      eventTarget.off(EVENTS.BLOCK_SWALLOWED, this.onSwallowed, this);
   }

   lateUpdate() {
      // lateUpdate: hố/camera đã di chuyển xong trong frame.
      if (this.camera && this.anchor && this.node.parent) {
         // Ma trận view của camera chỉ được engine cập nhật lúc render -> ở đây vẫn là của frame trước,
         // hố chạy nhanh thì nhãn bị lệch 1 frame. Cập nhật ngay theo vị trí camera hiện tại rồi mới chiếu.
         this.camera.camera?.update(true);
         this.camera.convertToUINode(this.anchor.worldPosition, this.node.parent, _tmp);
         this.node.setPosition(_tmp.x, _tmp.y, 0);
      }
      if (!this.hole) {
         return;
      }
      const level = this.hole.level;
      if (level !== this._shownLevel && this.levelLabel) {
         this._shownLevel = level;
         this.levelLabel.string = `LV. ${level + 1}`;
      }
      if (this.xpFill) {
         this.xpFill.fillRange = this.hole.xpRatio;
      }
   }

   // ------------------------------------------------------------ Chữ "+n" bay lên

   private onSwallowed(node: Node) {
      if (!this.floatingParent || this._active >= this.maxFloating) {
         return;
      }
      const label = this._pool.pop() ?? this.createFloating();
      this._active++;
      // Lệch ngẫu nhiên ±30px, bay lên 20..40px trong 0.5s rồi biến mất.
      const p = this.floatingParent.position;
      const x = p.x + (Math.random() - 0.5) * 60;
      const y = p.y + (Math.random() - 0.5) * 60;
      const node2 = label.node;
      label.string = `+${HoleConfig.getPoints(node?.name ?? "")}`;
      node2.setPosition(x, y, 0);
      node2.active = true;
      Tween.stopAllByTarget(node2);
      tween(node2)
         .to(0.5, { position: v3(x, y + 20 + Math.random() * 20, 0) })
         .call(() => {
            node2.active = false;
            this._pool.push(label);
            this._active--;
         })
         .start();
   }

   /** Chữ "+n": cỡ 40, đậm, trắng viền đen 2px. */
   private createFloating(): Label {
      const n = new Node("Floating");
      n.layer = this.floatingParent!.layer;
      n.addComponent(UITransform);
      const label = n.addComponent(Label);
      label.fontSize = 40;
      label.lineHeight = 40;
      label.isBold = true;
      label.color = Color.WHITE;
      label.enableOutline = true;
      label.outlineColor = Color.BLACK;
      label.outlineWidth = 2;
      n.active = false;
      this.floatingParent!.addChild(n);
      return label;
   }
}
