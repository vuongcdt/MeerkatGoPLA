import { _decorator, BoxCollider, Component, MeshRenderer, Node, PhysicsSystem, RigidBody } from "cc";
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
      // Prefab để RigidBody là DYNAMIC, rồi mới chuyển sang KINEMATIC ở đây để đứng yên.
      // Lý do: với Bullet (Cocos 3.8.8), body được tạo ở dạng STATIC/KINEMATIC rồi mới chuyển sang
      // DYNAMIC sẽ ra NaN ngay khi va chạm -> khối rơi/lún (đã thử cả collider có và không lệch tâm).
      // Phải gọi sau khi node đã vào scene (body đã được tạo).
      this.rigidBody.type = RigidBody.Type.KINEMATIC;
      //   if (type == 0) {
      //      this.scheduleOnce(() => {
      //         this.setDynamic();
      //      }, 1);
      //   }
   }

   setDynamic() {
      this.rigidBody.type = RigidBody.Type.DYNAMIC;
      this.rigidBody.group = BLOCK_DINAMIC;
      // Đổi group lúc runtime không tự đổi mask (mask chỉ lấy từ matrix lúc tạo body)
      // -> lấy lại mask của BLOCK_DINAMIC, nếu không sẽ không va chạm với HOLE.
      this.rigidBody.setMask(PhysicsSystem.instance.collisionMatrix[BLOCK_DINAMIC]);
   }

   setKinematic() {
      this.rigidBody.type = RigidBody.Type.KINEMATIC;
      this.rigidBody.group = BLOCK;
      this.rigidBody.setMask(PhysicsSystem.instance.collisionMatrix[BLOCK]);
   }
}
