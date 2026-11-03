import { _decorator, BoxCollider, Component, MeshRenderer, Node, RigidBody } from "cc";
const { ccclass, property } = _decorator;

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
      this.scheduleOnce(() => {
         if (type == 0) this.rigidBody.type = RigidBody.Type.DYNAMIC;
      }, 0);
      this.scheduleOnce(() => {
         if (type == 0) this.rigidBody.type = RigidBody.Type.KINEMATIC;
      }, 3);
   }
}
