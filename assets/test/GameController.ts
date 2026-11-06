import { _decorator, CCInteger, Component, game, instantiate, Node, PhysicsSystem, Prefab, RigidBody, v3, Vec3 } from "cc";
import { LitePhysics } from "./LitePhysics";
import { SimplePhysics } from "./SimplePhysics";
import { EVENTS, eventTarget } from "../scripts/common/eventTarget";
import { CustomPhysic } from "./CustomPhysic";
const { ccclass, property } = _decorator;

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

const PERF_DURATION = 3;

/** Đo thời gian tính toán (ms/frame) của một physic trong PERF_DURATION giây đầu, rồi log một lần và dừng. */
class PerfStat {
   private _max = 0;
   private _sum = 0;
   private _count = 0;
   private _elapsed = 0;
   private _done = false;

   constructor(private readonly name: string) {}

   public add(ms: number, dt: number) {
      if (this._done) return;
      this._max = Math.max(this._max, ms);
      this._sum += ms;
      this._count++;
      this._elapsed += dt;
      if (this._elapsed >= PERF_DURATION) {
         this._done = true;
         console.log(
            `[physics ${PERF_DURATION}s] ${this.name}: max ${this._max.toFixed(2)}ms avg ${(this._sum / this._count).toFixed(2)}ms (${this._count} frames)`,
         );
      }
   }
}

@ccclass("GameController")
export class GameController extends Component {
   @property(CCInteger) private rows: number = 10;
   @property(Node) private hole: Node | null = null;
   @property(Node) private ground: Node | null = null;
   @property(Prefab) private cubeSimple: Prefab | null = null;
   @property(Prefab) private cubePhysic: Prefab | null = null;
   @property(Node) private physicBtn: Node | null = null;
   @property(Node) private simpleBtn: Node | null = null;
   @property(Node) private liteBtn: Node | null = null;
   @property(Node) private customBtn: Node | null = null;
   @property(Node) private resetBtn: Node | null = null;

   private _simple = new SimplePhysics();
   private _lite = new LitePhysics();
   private _custom = new CustomPhysic();
   private _cubeRigis: RigidBody[] = [];
   private _dirMove: Vec3 = v3();

   private _statEngine = new PerfStat("engine");
   private _statSimple = new PerfStat("simple");
   private _statLite = new PerfStat("lite  ");
   private _statCustom = new PerfStat("custom");
   private _engineRunning = false;
   /** Thời gian physic của engine (update + postUpdate) tích lũy từ lần ghi nhận trước. */
   private _engineMs = 0;

   /** Bọc update/postUpdate của PhysicsSystem để đo thời gian physic engine tốn mỗi frame. */
   private hookEnginePerf() {
      const ps = PhysicsSystem.instance as any;
      for (const fn of ["update", "postUpdate"]) {
         const orig = ps[fn];
         if (typeof orig !== "function") continue;
         ps[fn] = (...args: unknown[]) => {
            const t = now();
            const result = orig.apply(ps, args);
            this._engineMs += now() - t;
            return result;
         };
      }
   }

   start() {
      this.hookEnginePerf();
      // Cùng gravity cho cả 3 physic.
      this._simple.gravity = -20;
      this._lite.gravity = -20;
      this._custom.gravity = -20;
      PhysicsSystem.instance.gravity = v3(0, -20, 0);

      this.init();
      // physicBtn: physic của engine. simpleBtn: SimplePhysics (va chạm cầu). liteBtn: LitePhysics (heightfield).
      this.physicBtn.on("click", () => {
         this._engineRunning = true;
         this._cubeRigis.forEach((rigidBody) => (rigidBody.type = RigidBody.Type.DYNAMIC));
      });
      this.simpleBtn.on("click", () => (this._simple.running = true));
      this.liteBtn.on("click", () => (this._lite.running = true));
      this.customBtn.on("click", () => (this._custom.running = true));
      this.resetBtn.on("click", () => game.restart());
      eventTarget.on(EVENTS.PLAYER_MOVE, this.onPlayerMove, this);
      eventTarget.on(EVENTS.STOP_MOVE, this.onStopMove, this);

      eventTarget.emit(EVENTS.INPUT_READY);
   }

   /** Ground của Simple/Lite/Custom: mỗi node con của `ground` là một box tĩnh đọc từ node ở runtime (không có con thì dùng chính node đó). */
   private initGround() {
      if (!this.ground) return;
      const boxes = this.ground.children.length > 0 ? this.ground.children : [this.ground];
      boxes.forEach((node) => {
         this._simple.addGround(node);
         this._lite.addGround(node);
         this._custom.addGround(node);
      });
   }

   private async init() {
      this.initGround();
      // Ba cụm khối giống hệt nhau, đặt cạnh nhau để so sánh (trái -> phải: Simple, engine, Lite).
      // Simple và Lite dùng prefab không có RigidBody/Collider.
      this.spawnGrid(this.cubePhysic!, -2, -2, (node) => {
         const rigidBody = node.getComponent(RigidBody)!;
         this._cubeRigis.push(rigidBody);
      });
      this.spawnGrid(this.cubeSimple!, 2, -2, (node) => this._simple.addBody(node));
      this.spawnGrid(this.cubeSimple!, 2, 2, (node) => this._lite.addBody(node));
      this.spawnGrid(this.cubeSimple!, -2, 2, (node) => {
         this._custom.addBody(node);
      });
      console.log("this._custom", this._custom._voxel);
   }

   private spawnGrid(prefab: Prefab, startX: number, startZ: number, onSpawn: (node: Node) => void) {
      for (let i = 0; i < 4; i++) {
         for (let j = 0; j < 4; j++) {
            for (let k = 0; k < this.rows; k++) {
               const node = instantiate(prefab);
               node.setPosition(v3(startX + i * 0.4, k * 0.4 + 0.3, startZ + j * 0.4));
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
      const t0 = now();
      this._simple.update(dt);
      const t1 = now();
      this._lite.update(dt);
      const t2 = now();
      this._custom.update(dt);
      const t3 = now();
      if (this._simple.running) this._statSimple.add(t1 - t0, dt);
      if (this._lite.running) this._statLite.add(t2 - t1, dt);
      if (this._engineRunning) this._statEngine.add(this._engineMs, dt);
      if (this._custom.running) this._statCustom.add(t3 - t2, dt);
      this._engineMs = 0;

      if (this._dirMove.length() > 0) {
         const offset = 0.1;
         if (this.hole) {
            const camPos = this.hole.position;
            this.hole.position = v3(camPos.x + this._dirMove.x * offset, camPos.y, camPos.z + this._dirMove.z * offset);
         }
      }
   }
}
