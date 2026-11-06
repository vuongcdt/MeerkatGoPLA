import { _decorator, CCInteger, Component, game, instantiate, Node, PhysicsSystem, Prefab, RigidBody, v3, Vec3 } from "cc";
import { SimplePhysics } from "./SimplePhysics";
import { EVENTS, eventTarget } from "../scripts/common/eventTarget";
const { ccclass, property } = _decorator;

@ccclass("GameController")
export class GameController extends Component {
   @property(CCInteger) private rows: number = 10;
   @property(Node) private hole: Node | null = null;
   @property(Prefab) private cubeSimple: Prefab | null = null;
   @property(Prefab) private cubePhysic: Prefab | null = null;
   @property(Node) private dynamicBtn: Node | null = null;
   @property(Node) private dropBtn: Node | null = null;
   @property(Node) private resetBtn: Node | null = null;

   private _physics = new SimplePhysics();
   private _cubeRigis: RigidBody[] = [];
   private _dirMove: Vec3 = v3();

   start() {
      // Cùng gravity cho cả 2 physic.
      this._physics.gravity = -20;
      PhysicsSystem.instance.gravity = v3(0, -20, 0);
      this.init();
      // dynamicBtn: physic tự viết. dropBtn: physic của engine.
      this.dropBtn.on("click", () => (this._physics.running = true));
      this.dynamicBtn.on("click", () => this._cubeRigis.forEach((rigidBody) => (rigidBody.type = RigidBody.Type.DYNAMIC)));
      this.resetBtn.on("click", () => game.restart());
      eventTarget.on(EVENTS.PLAYER_MOVE, this.onPlayerMove, this);
      eventTarget.on(EVENTS.STOP_MOVE, this.onStopMove, this);

      eventTarget.emit(EVENTS.INPUT_READY);
   }

   private async init() {
      // Hai cụm khối giống hệt nhau, đặt cạnh nhau để so sánh.
      this.spawnGrid(this.cubeSimple!, -1, (node) => this._physics.addBody(node));
      this.spawnGrid(this.cubePhysic!, 1, (node) => {
         const rigidBody = node.getComponent(RigidBody)!;
         this._cubeRigis.push(rigidBody);
      });
   }

   private spawnGrid(prefab: Prefab, startX: number, onSpawn: (node: Node) => void) {
      for (let i = 0; i < 4; i++) {
         for (let j = 0; j < 4; j++) {
            for (let k = 0; k < this.rows; k++) {
               const node = instantiate(prefab);
               node.setPosition(v3(startX + i * 0.4, k * 0.4 + 5, j * 0.4));
               this.node.addChild(node);
               onSpawn(node);
            }
         }
      }
   }

   private onPlayerMove(dir: Vec3) {
      this._dirMove = dir;
   }

   private onStopMove() {
      this._dirMove = v3();
   }

   protected update(dt: number): void {
      this._physics.update(dt);

      if (this._dirMove.length() > 0) {
         const offset = 0.2;
         if (this.hole) {
            const camPos = this.hole.position;
            this.hole.position = v3(camPos.x + this._dirMove.x * offset, camPos.y, camPos.z + this._dirMove.z * offset);
         }
      }
   }
}
