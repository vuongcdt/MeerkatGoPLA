import { _decorator, Camera, Collider, Component, director, ITriggerEvent, Node, PhysicsSystem, RigidBody, Tween, tween, v3, Vec3 } from "cc";
import { EVENTS, eventTarget } from "../common/eventTarget";
import { HoleConfig } from "../common/HoleConfig";
import { GroundHole } from "./GroundHole";
const { ccclass, property } = _decorator;

const BLOCK: number = PhysicsSystem.PhysicsGroup["BLOCK"];
const BLOCK_DINAMIC: number = PhysicsSystem.PhysicsGroup["BLOCK_DINAMIC"];
/** Giới hạn tốc độ block trong hố: chặn penetration / nổ solver dẫn tới NaN. */
const MAX_SPEED = 120;
/** Block chìm sâu hơn mức này dưới mặt hố (đơn vị world) thì tính là đã bị nuốt, để UI cập nhật ngay. */
const SWALLOW_DEPTH = -2;
const _dir = new Vec3();
const _vel = new Vec3();

/**
 * Cách nuốt block:
 * - Trigger hình cầu quanh miệng hố: block lọt vào thì đổi sang group BLOCK_DINAMIC
 *   (không va chạm ground, chỉ va chạm sàn hố + block khác) nên rơi được qua lỗ. Ra khỏi trigger thì trả về BLOCK.
 * - Mỗi frame hút các block trong trigger về tâm hố và xuống dưới, giới hạn vận tốc.
 * - Block rơi tới EatZone (sâu dưới hố) thì tính là ăn: cộng XP, đủ XP thì lên level:
 *   hố (node này) to ra, camera lùi ra, phát EVENTS.LEVEL_UP để LevelManager tăng bán kính hút.
 */
@ccclass("HoleController")
export class HoleController extends Component {
   /** Trigger cầu quanh miệng hố */
   @property(Collider) private collider: Collider | null = null;
   /** Tâm hút (node Hole). Bỏ trống = node này */
   @property(Node) private center: Node | null = null;
   /** Trigger sâu dưới hố: chạm vào là tính đã ăn */
   @property(Collider) private eatCollider: Collider | null = null;
   /** Camera lùi ra khi lên level */
   @property(Camera) private camera: Camera | null = null;
   /** Block nằm trên miệng hố (tâm block trong bán kính miệng) bị kéo mạnh gấp chừng này lần lực thường, để rơi xuống nhanh. */
   @property mouthForceScale = 10;

   private _inside = new Set<Node>();
   /** Chống đếm 2 lần nếu block chạm EatZone nhiều nhịp. */
   private _eaten = new Set<Node>();
   /** Block đã báo BLOCK_SWALLOWED (mỗi block chỉ báo một lần). */
   private _swallowed = new Set<Node>();
   private _level = 0;
   private _xp = 0;
   private _baseScale = 1;
   private _cameraStartPos = v3();
   private _scaleTween: Tween<Node> | null = null;
   private _cameraTween: Tween<Node> | null = null;
   private _groundHole: GroundHole | null = null;

   get level() {
      return this._level;
   }

   /** Tiến độ XP của level hiện tại (0..1), dùng cho thanh XP ở miệng hố. */
   get xpRatio() {
      return Math.min(this._xp / HoleConfig.getRequiredXP(this._level), 1);
   }

   onLoad() {
      this._groundHole = director.getScene().getComponentInChildren(GroundHole);
      // Tham chiếu collider trong scene có thể bị null khi nạp (preview): tự tìm lại để trigger hố luôn hoạt động.
      this.collider ??= this.getComponent(Collider);
      this.eatCollider ??= this.findByName(director.getScene(), "EatZone")?.getComponent(Collider) ?? null;
      this._baseScale = this.node.scale.x;
      if (this.camera) {
         this._cameraStartPos.set(this.camera.node.position);
      }
   }

   private findByName(node: Node, name: string): Node | null {
      if (node.name === name) {
         return node;
      }
      for (const child of node.children) {
         const found = this.findByName(child, name);
         if (found) {
            return found;
         }
      }
      return null;
   }

   onEnable() {
      this.collider?.on("onTriggerEnter", this.onEnter, this);
      this.collider?.on("onTriggerExit", this.onExit, this);
      this.eatCollider?.on("onTriggerEnter", this.onEaten, this);
   }

   onDisable() {
      this.collider?.off("onTriggerEnter", this.onEnter, this);
      this.collider?.off("onTriggerExit", this.onExit, this);
      this.eatCollider?.off("onTriggerEnter", this.onEaten, this);
   }

   private onEaten(event: ITriggerEvent) {
      const node = event?.otherCollider?.node;
      if (!node || !node.isValid || this._eaten.has(node)) {
         return;
      }
      this._eaten.add(node);
      this._inside.delete(node);
      eventTarget.emit(EVENTS.BLOCK_EATEN, node);

      this._xp += HoleConfig.getPoints(node.name);
      if (this._xp >= HoleConfig.getRequiredXP(this._level)) {
         this.levelUp();
      }
   }

   private levelUp() {
      this._level++;
      this._xp = 0;
      eventTarget.emit(EVENTS.LEVEL_UP, this._level);

      // Hố to ra, nảy quá một chút rồi về đúng cỡ.
      const scale = this._baseScale * HoleConfig.getScale(this._level);
      const overScale = this._baseScale * (HoleConfig.getScale(this._level) + 0.15);
      this._scaleTween?.stop();
      this._scaleTween = tween(this.node)
         .to(0.4, { scale: v3(overScale, overScale, overScale) }, { easing: "backOut" })
         .to(0.4, { scale: v3(scale, scale, scale) }, { easing: "sineOut" })
         .start();

      // Camera lùi ra và nhìn xa hơn.
      if (this.camera) {
         const target = this._cameraStartPos.clone().multiplyScalar(Math.pow(HoleConfig.cameraGrowth, this._level));
         const overshoot = target.clone().multiplyScalar(1.08);
         this._cameraTween?.stop();
         this._cameraTween = tween(this.camera.node)
            .to(0.6, { position: overshoot }, { easing: "quartOut" })
            .to(1, { position: target }, { easing: "sineOut" })
            .start();
         this.camera.far *= 1.06;
      }

      if (this._level > 16) {
         PhysicsSystem.instance.gravity = v3(0, -500, 0);
      }
   }

   private onEnter(event: ITriggerEvent) {
      const other = event?.otherCollider;
      if (!other || !other.node || !other.node.isValid) {
         return;
      }
      this.setGroup(other, BLOCK_DINAMIC);
      this._inside.add(other.node);
   }

   private onExit(event: ITriggerEvent) {
      const other = event?.otherCollider;
      if (!other || !other.node || !other.node.isValid) {
         return;
      }
      // Block lăn ngang qua miệng hố rồi ra ngoài: trả group để nó đứng lại trên mặt đất.
      this.setGroup(other, BLOCK);
      this._inside.delete(other.node);
   }

   private setGroup(collider: Collider, group: number) {
      collider.setGroup(group);
      collider.setMask(PhysicsSystem.instance.collisionMatrix[group]);
   }

   update() {
      const holePos = (this.center ?? this.node).worldPosition;
      // Bán kính miệng hố hiện tại (world), giống lỗ cắt trên mặt đất.
      const mouth = this._groundHole ? this._groundHole.currentRadius : 3 * this.node.worldScale.x;
      const mouthSqr = mouth * mouth;
      this._eaten.forEach((node) => {
         if (!node.isValid) {
            this._eaten.delete(node);
         }
      });
      this._swallowed.forEach((node) => {
         if (!node.isValid) {
            this._swallowed.delete(node);
         }
      });
      this._inside.forEach((node) => {
         if (!node.isValid) {
            this._inside.delete(node);
            return;
         }
         const rigid = node.getComponent(RigidBody);
         if (!rigid) {
            return;
         }
         const objPos = node.worldPosition;

         // Chìm xuống dưới mặt hố thì báo UI ngay, không chờ block rơi tới đáy (y ~ -70 / -85, mất > 1 giây).
         // Mốc "đã nuốt" tính khi qua y = -2.
         if (objPos.y < holePos.y + SWALLOW_DEPTH && !this._swallowed.has(node)) {
            this._swallowed.add(node);
            eventTarget.emit(EVENTS.BLOCK_SWALLOWED, node);
         }

         // Body đã hỏng (NaN): dừng hẳn, bỏ khỏi danh sách, tắt node thay vì để lơ lửng ở toạ độ NaN.
         if (!Number.isFinite(objPos.x) || !Number.isFinite(objPos.y) || !Number.isFinite(objPos.z)) {
            rigid.setLinearVelocity(Vec3.ZERO);
            rigid.setAngularVelocity(Vec3.ZERO);
            this._inside.delete(node);
            node.active = false;
            return;
         }

         Vec3.subtract(_dir, holePos, objPos);
         const dist = _dir.length();
         if (dist < 0.1) {
            return;
         }
         _dir.y -= 50;
         _dir.normalize();

         // Kẹp mẫu số: tránh lực vô cực khi block sát tâm hố.
         const clampedDist = Math.max(dist, 2);
         let force = 500 / (clampedDist * clampedDist);
         // Block đang nằm trên miệng hố (tâm trong bán kính miệng): kéo mạnh hơn nhiều để tụt xuống ngay.
         const hx = holePos.x - objPos.x;
         const hz = holePos.z - objPos.z;
         if (hx * hx + hz * hz < mouthSqr) {
            force *= this.mouthForceScale;
         }
         _dir.multiplyScalar(force);
         rigid.applyForce(_dir);

         rigid.getLinearVelocity(_vel);
         const speed = _vel.length();
         if (!Number.isFinite(speed)) {
            rigid.setLinearVelocity(Vec3.ZERO);
         } else if (speed > MAX_SPEED) {
            _vel.multiplyScalar(MAX_SPEED / speed);
            rigid.setLinearVelocity(_vel);
         }
      });
   }
}
