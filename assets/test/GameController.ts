import { _decorator, CCInteger, Component, game, instantiate, Node, PhysicsSystem, Prefab, RigidBody, v3, Vec3 } from "cc";
import { LitePhysics } from "./LitePhysics";
import { SimplePhysics } from "./SimplePhysics";
import { EVENTS, eventTarget } from "../scripts/common/eventTarget";
const { ccclass, property } = _decorator;

@ccclass("GameController")
export class GameController extends Component {
   @property(CCInteger) private rows: number = 10;
   @property(Node) private hole: Node | null = null;
   @property(Prefab) private cubeSimple: Prefab | null = null;
   @property(Prefab) private cubePhysic: Prefab | null = null;
   @property(Node) private physicBtn: Node | null = null;
   @property(Node) private simpleBtn: Node | null = null;
   @property(Node) private liteBtn: Node | null = null;
   @property(Node) private resetBtn: Node | null = null;

   private _simple = new SimplePhysics();
   private _lite = new LitePhysics();
   private _cubeRigis: RigidBody[] = [];
   private _dirMove: Vec3 = v3();

   start() {
      // Cùng gravity cho cả 3 physic.
      this._simple.gravity = -20;
      this._lite.gravity = -20;
      PhysicsSystem.instance.gravity = v3(0, -20, 0);
      this.init();
      // physicBtn: physic của engine. simpleBtn: SimplePhysics (va chạm cầu). liteBtn: LitePhysics (heightfield).
      this.physicBtn.on("click", () => this._cubeRigis.forEach((rigidBody) => (rigidBody.type = RigidBody.Type.DYNAMIC)));
      this.simpleBtn.on("click", () => (this._simple.running = true));
      this.liteBtn.on("click", () => (this._lite.running = true));
      this.resetBtn.on("click", () => game.restart());
      eventTarget.on(EVENTS.PLAYER_MOVE, this.onPlayerMove, this);
      eventTarget.on(EVENTS.STOP_MOVE, this.onStopMove, this);

      eventTarget.emit(EVENTS.INPUT_READY);
   }

   private async init() {
      // Ba cụm khối giống hệt nhau, đặt cạnh nhau để so sánh (trái -> phải: Simple, engine, Lite).
      // Simple và Lite dùng prefab không có RigidBody/Collider.
      this.spawnGrid(this.cubePhysic!, -3, (node) => {
         const rigidBody = node.getComponent(RigidBody)!;
         this._cubeRigis.push(rigidBody);
      });
      this.spawnGrid(this.cubeSimple!, 0, (node) => this._simple.addBody(node));
      this.spawnGrid(this.cubeSimple!, 3, (node) => this._lite.addBody(node));
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
      this._simple.update(dt);
      this._lite.update(dt);

      if (this._dirMove.length() > 0) {
         const offset = 0.1;
         if (this.hole) {
            const camPos = this.hole.position;
            this.hole.position = v3(camPos.x + this._dirMove.x * offset, camPos.y, camPos.z + this._dirMove.z * offset);
         }
      }
   }
}
