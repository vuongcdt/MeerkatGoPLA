import { _decorator, BoxCollider, Component, MeshRenderer, Node, RigidBody } from "cc";
const { ccclass, property } = _decorator;

@ccclass("BlockView")
export class BlockView extends Component {
   @property(RigidBody) private rigidBody: RigidBody | null = null;
   @property(BoxCollider) private boxCollider: BoxCollider | null = null;
   @property(MeshRenderer) private meshRenderer: MeshRenderer | null = null;

   init(type: number) {
      this.scheduleOnce(() => {
        if (type < 2) this.rigidBody.type = RigidBody.Type.DYNAMIC;
      }, 0.1);
   }
}
