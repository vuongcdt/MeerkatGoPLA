import { _decorator, BoxCollider, Component, MeshRenderer, Node, PhysicsSystem, RigidBody, v3 } from "cc";
import { AsyncUtils } from "../common/AsyncUtils";
const { ccclass, property } = _decorator;

const BLOCK_DINAMIC: number = PhysicsSystem.PhysicsGroup["BLOCK_DINAMIC"];
const BLOCK: number = PhysicsSystem.PhysicsGroup["BLOCK"];

@ccclass("BlockView")
export class BlockView extends Component {
   @property(RigidBody) private rigidBody: RigidBody | null = null;
   @property(BoxCollider) private boxCollider: BoxCollider | null = null;
   @property(MeshRenderer) private meshRenderer: MeshRenderer | null = null;

   init(type: number) {
      this.rigidBody.type = RigidBody.Type.KINEMATIC;
   }

   setDynamic() {
      this.rigidBody.type = RigidBody.Type.DYNAMIC;
      this.rigidBody.group = BLOCK_DINAMIC;
      this.rigidBody.applyForce(v3(0, -200, 0));
      this.rigidBody.setMask(PhysicsSystem.instance.collisionMatrix[BLOCK_DINAMIC]);
   }

   setKinematic() {
      this.rigidBody.type = RigidBody.Type.KINEMATIC;
      this.rigidBody.group = BLOCK;
      this.rigidBody.setMask(PhysicsSystem.instance.collisionMatrix[BLOCK]);
   }
}
