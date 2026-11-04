import { _decorator, BoxCollider, Component, MeshRenderer, RigidBody } from "cc";
const { ccclass, property } = _decorator;

/**
 * Set RigidBody giống bản gốc (GameLevel.setDynamicObject / setKinematicObject):
 * prefab để KINEMATIC, không gravity; vào gần hố thì chuyển DYNAMIC đúng 1 lần.
 * Group BLOCK <-> BLOCK_DINAMIC do HoleController đổi khi block vào/ra trigger của hố.
 */
@ccclass("BlockView")
export class BlockView extends Component {
   @property(RigidBody) private rigidBody: RigidBody | null = null;
   @property(BoxCollider) private boxCollider: BoxCollider | null = null;
   @property(MeshRenderer) private meshRenderer: MeshRenderer | null = null;

   /** Thời gian (giây) block đã ở ngoài bán kính hố; đủ 3s thì trả về KINEMATIC. */
   leaveTimer = 0;

   get isDynamic() {
      return this.rigidBody?.type === RigidBody.Type.DYNAMIC;
   }

   /** Loại block (index trong listItemSpawns), UIController dùng để đếm mục tiêu. */
   type = -1;

   init(type: number) {
      this.type = type;
   }

   setDynamic() {
      const rb = this.rigidBody;
      // Chỉ set 1 lần khi chuyển trạng thái: set lại type/mass/CCD mỗi frame làm Bullet khởi tạo lại body.
      if (!rb || rb.type === RigidBody.Type.DYNAMIC) {
         return;
      }
      rb.wakeUp();
      rb.type = RigidBody.Type.DYNAMIC;
      rb.useGravity = true;
      rb.mass = 5;
      rb.linearDamping = 0.1;
      rb.angularDamping = 0.1;
      rb.useCCD = true; // chống xuyên collider nhỏ -> penetration -> NaN
   }

   setKinematic() {
      const rb = this.rigidBody;
      if (!rb || rb.type === RigidBody.Type.KINEMATIC) {
         return;
      }
      rb.useGravity = false;
      rb.type = RigidBody.Type.KINEMATIC;
   }
}
