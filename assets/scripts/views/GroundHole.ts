import { _decorator, Component, Material, MeshRenderer, Node, Vec2 } from "cc";
const { ccclass, property } = _decorator;

/**
 * Gắn lên node ground (dùng material ground-hole).
 * Mỗi frame đẩy vị trí + bán kính của node Hole vào shader để ground cắt lỗ đúng chỗ.
 */
@ccclass("GroundHole")
export class GroundHole extends Component {
   @property(Node) private hole: Node | null = null;

   /** Bán kính lỗ khi Hole có scale = 1. Mặc định 3 = mép trong của 8 tấm Plane (cách tâm 8, rộng 10). */
   @property
   private radius: number = 3;

   private _material: Material | null = null;
   private _center: Vec2 = new Vec2();
   private _lastX: number = NaN;
   private _lastZ: number = NaN;
   private _lastRadius: number = NaN;

   start() {
      // Dùng material instance để không sửa material asset dùng chung.
      this._material = this.getComponent(MeshRenderer)?.getMaterialInstance(0) ?? null;
      this.syncHole();
   }

   // lateUpdate: chạy sau LevelManager.update (nơi di chuyển hố) nên lỗ không bị trễ 1 frame.
   lateUpdate() {
      this.syncHole();
   }

   private syncHole() {
      if (!this._material || !this.hole) {
         return;
      }
      const pos = this.hole.worldPosition;
      // Hố to lên bằng cách scale node Hole thì lỗ cũng to theo.
      const radius = this.radius * this.hole.worldScale.x;
      if (pos.x === this._lastX && pos.z === this._lastZ && radius === this._lastRadius) {
         return;
      }
      this._lastX = pos.x;
      this._lastZ = pos.z;
      this._lastRadius = radius;
      this._center.set(pos.x, pos.z);
      this._material.setProperty("holeCenter", this._center);
      this._material.setProperty("holeRadius", radius);
   }
}
