import { _decorator, Camera, Collider, Component, ITriggerEvent, Node, PhysicsSystem, RigidBody, Tween, tween, v3, Vec3 } from "cc";
import { EVENTS, eventTarget } from "../common/eventTarget";
import { HoleConfig } from "../common/HoleConfig";
const { ccclass, property } = _decorator;

const BLOCK: number = PhysicsSystem.PhysicsGroup["BLOCK"];
const BLOCK_DINAMIC: number = PhysicsSystem.PhysicsGroup["BLOCK_DINAMIC"];
/** Giới hạn tốc độ block trong hố: chặn penetration / nổ solver dẫn tới NaN. */
const MAX_SPEED = 60;
const _dir = new Vec3();
const _vel = new Vec3();

/**
 * Cách nuốt block giống bản gốc (HoleController của PLA ref):
 * - Trigger hình cầu quanh miệng hố: block lọt vào thì đổi sang group BLOCK_DINAMIC
 *   (không va chạm ground, chỉ va chạm sàn hố + block khác) nên rơi được qua lỗ. Ra khỏi trigger thì trả về BLOCK.
 * - Mỗi frame hút các block trong trigger về tâm hố và xuống dưới, giới hạn vận tốc.
 * - Block rơi tới EatZone (sâu dưới hố) thì tính là ăn: cộng XP, đủ XP thì lên level:
 *   hố (node này) to ra, camera lùi ra, phát EVENTS.LEVEL_UP để LevelManager tăng bán kính hút.
 */
@ccclass("HoleController")
export class HoleController extends Component {
   @property({ type: Collider, tooltip: "Trigger cầu quanh miệng hố" }) private collider: Collider | null = null;
   @property({ type: Node, tooltip: "Tâm hút (node Hole). Bỏ trống = node này" }) private center: Node | null = null;
   @property({ type: Collider, tooltip: "Trigger sâu dưới hố: chạm vào là tính đã ăn" }) private eatCollider: Collider | null = null;
   @property({ type: Camera, tooltip: "Camera lùi ra khi lên level" }) private camera: Camera | null = null;

   private _inside = new Set<Node>();
   /** Chống đếm 2 lần nếu block chạm EatZone nhiều nhịp. */
   private _eaten = new Set<Node>();
   private _level = 0;
   private _xp = 0;
   private _baseScale = 1;
   private _cameraStartPos = v3();
   private _scaleTween: Tween<Node> | null = null;
   private _cameraTween: Tween<Node> | null = null;

   get level() {
      return this._level;
   }

   onLoad() {
      this._baseScale = this.node.scale.x;
      if (this.camera) {
         this._cameraStartPos.set(this.camera.node.position);
      }
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

      // Hố to ra, nảy quá một chút rồi về đúng cỡ (bản gốc: HoleController.growth).
      const scale = this._baseScale * HoleConfig.getScale(this._level);
      const overScale = this._baseScale * (HoleConfig.getScale(this._level) + 0.15);
      this._scaleTween?.stop();
      this._scaleTween = tween(this.node)
         .to(0.4, { scale: v3(overScale, overScale, overScale) }, { easing: "backOut" })
         .to(0.4, { scale: v3(scale, scale, scale) }, { easing: "sineOut" })
         .start();

      // Camera lùi ra (bản gốc: CameraController.levelUp) và nhìn xa hơn.
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
      this._eaten.forEach((node) => {
         if (!node.isValid) {
            this._eaten.delete(node);
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
         _dir.multiplyScalar(500 / (clampedDist * clampedDist));
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
