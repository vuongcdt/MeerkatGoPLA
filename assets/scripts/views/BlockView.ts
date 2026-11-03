import { _decorator, BoxCollider, Component, MeshRenderer, PhysicsSystem, RigidBody, v3 } from "cc";
const { ccclass, property } = _decorator;

const BLOCK_DINAMIC: number = PhysicsSystem.PhysicsGroup["BLOCK_DINAMIC"];
const BLOCK: number = PhysicsSystem.PhysicsGroup["BLOCK"];
const _pushForce = v3(0, -200, 0);

@ccclass("BlockView")
export class BlockView extends Component {
   @property(RigidBody) private rigidBody: RigidBody | null = null;
   @property(BoxCollider) private boxCollider: BoxCollider | null = null;
   @property(MeshRenderer) private meshRenderer: MeshRenderer | null = null;

   get isDynamic() {
      return this.rigidBody?.type === RigidBody.Type.DYNAMIC;
   }

   init(type: number) {
      this.rigidBody.type = RigidBody.Type.KINEMATIC;
   }

   setDynamic() {
      // Được gọi mỗi frame khi block còn gần hố: đã dynamic thì chỉ đẩy xuống tiếp,
      // không gọi lại type/group/setMask (setMask luôn gọi xuống Bullet).
      if (this.isDynamic) {
         this.rigidBody.applyForce(_pushForce);
         return;
      }
      this.rigidBody.type = RigidBody.Type.DYNAMIC;
      this.rigidBody.group = BLOCK_DINAMIC;
      this.rigidBody.applyForce(_pushForce);
      this.rigidBody.setMask(PhysicsSystem.instance.collisionMatrix[BLOCK_DINAMIC]);
   }

   setKinematic() {
      // Được gọi mỗi frame cho mọi block ở xa hố: đã kinematic thì bỏ qua.
      if (!this.isDynamic) {
         return;
      }
      this.rigidBody.type = RigidBody.Type.KINEMATIC;
      this.rigidBody.group = BLOCK;
      this.rigidBody.setMask(PhysicsSystem.instance.collisionMatrix[BLOCK]);
   }
}
