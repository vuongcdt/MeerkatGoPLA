import { _decorator, Collider, Component, director, game, instantiate, Material, MeshRenderer, Node, PhysicsSystem, Prefab, ResolutionPolicy, screen, TextAsset, v3, Vec3, view } from "cc";
import { simpleDecryptContent } from "../decryptContent";
import { ItemSpawn, Level, SpawnData } from "./GameModel";
import { EVENTS, eventTarget } from "../common/eventTarget";
import { BlockView } from "../views/BlockView";
import { HoleConfig } from "../common/HoleConfig";
const { ccclass, property } = _decorator;

const SCALE_MOVE = 0.25;
/** Ra khỏi bán kính hố đủ chừng này giây thì block trả về KINEMATIC (bản gốc: 3s). */
const LEAVE_TIME = 3;
/** Giới hạn vị trí của hố: mép mặt đất lùi vào 20 (như bản gốc) để không nhìn thấy đáy hố ở mép. */
const MIN_X = -189;
const MAX_X = 178;
const MIN_Z = -64;
const MAX_Z = 324;
/** Cạnh ô lưới (world) để chỉ xét block gần hố thay vì cả level. */
const CELL = 4;
/** Block cách hố quá bán kính hút + chừng này thì tắt body vật lý (chỉ còn hiển thị). */
const PHYSICS_MARGIN = 8;
const cellOf = (v: number) => Math.floor(v / CELL);
const cellKey = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);

/**
 * Collision matrix giống bản gốc (trùng với settings/v2/packages/project.json):
 * GROUND: GROUND|BLOCK; HOLE: HOLE|BLOCK|BLOCK_DINAMIC; BLOCK: GROUND|HOLE|BLOCK|BLOCK_DINAMIC; BLOCK_DINAMIC: HOLE|BLOCK|BLOCK_DINAMIC.
 * Áp lại lúc chạy để không phụ thuộc editor đã nạp project.json chưa (editor giữ settings cũ trong bộ nhớ
 * thì preview vẫn dùng matrix cũ -> sàn hố không đỡ block BLOCK -> block rơi xuyên).
 */
const COLLISION_MATRIX: Record<string, number> = {
   GROUND: 2 | 8,
   HOLE: 4 | 8 | 16,
   BLOCK: 2 | 4 | 8 | 16,
   BLOCK_DINAMIC: 4 | 8 | 16,
};

@ccclass("LevelManager")
export class LevelManager extends Component {
   @property(TextAsset) private encryptedTextAsset: TextAsset | null = null;
   @property([Prefab]) private prefabs: Prefab[] = [];
   @property(Node) private hole: Node | null = null;
   @property(Node) private resetBtn: Node | null = null;
   @property(MeshRenderer) private goundMesh: MeshRenderer | null = null;

   private _dirMove: Vec3 = v3();
   /** Bán kính hút hiện tại (bình phương) và hệ số tốc độ, tăng theo level của hố. */
   private _rangeSqr = HoleConfig.getRadius(0) ** 2;
   private _speedMul = 1;
   private _blocks: BlockView[] = [];
   /** Block đang đứng yên (KINEMATIC) xếp theo ô lưới. */
   private _cells = new Map<number, BlockView[]>();
   /** Block đang DYNAMIC: có thể di chuyển nên không nằm trong lưới, xét riêng mỗi frame. */
   private _dynamic = new Set<BlockView>();
   /** Các ô đang bật vật lý, và vùng ô đã tính ở lần trước (để chỉ cập nhật khi hố đổi ô / đổi bán kính). */
   private _physicsCells = new Set<number>();
   private _physicsArea = "";
   private _grountMaterial: Material = null;

   onLoad() {
      // Trước khi tạo block: body mới tạo sẽ lấy mask theo matrix này.
      this.applyCollisionMatrix();
      this.init();
      eventTarget.on(EVENTS.PLAYER_MOVE, this.onPlayerMove, this);
      eventTarget.on(EVENTS.STOP_MOVE, this.onStopMove, this);
      eventTarget.on(EVENTS.BLOCK_DESTROYED, this.onBlockDestroyed, this);
      eventTarget.on(EVENTS.BLOCK_EATEN, this.onBlockEaten, this);
      eventTarget.on(EVENTS.LEVEL_UP, this.onLevelUp, this);
      this.resetBtn?.on(Node.EventType.TOUCH_END, () => {
         game.restart();
      });
      this._grountMaterial = this.goundMesh?.getSharedMaterial(0);
      // Hố bản gốc ở (4, 0, 0) -> đổi sang hệ toạ độ đã xoay 180° quanh Y của level.
      this.hole.position = v3(-4, 0.01, 0);
            this.resize();
      screen.on("window-resize", this.resize, this);
   }

   private applyCollisionMatrix() {
      const physics = PhysicsSystem.instance;
      for (const name in COLLISION_MATRIX) {
         const group = PhysicsSystem.PhysicsGroup[name];
         if (group !== undefined) {
            physics.collisionMatrix[group] = COLLISION_MATRIX[name];
         }
      }
      // Collider trong scene đã được tạo trước LevelManager: cập nhật lại mask theo matrix mới.
      for (const collider of director.getScene().getComponentsInChildren(Collider)) {
         if (collider.enabledInHierarchy) {
            collider.setMask(physics.collisionMatrix[collider.getGroup()]);
         }
      }
   }

   private init() {
      const decryptedContent = simpleDecryptContent(this.encryptedTextAsset?.text || "", 5, 3);
      const level: Level = JSON.parse(decryptedContent);
      const blockTypesSet = new Set<string>();
      const blockTypesObj: { name: string; id: number }[] = [];

      level.listItemSpawns.forEach((itemSpawn: ItemSpawn) => {
         const prefab = this.prefabs.find((p) => p.name === itemSpawn.id);
         // Tạo từ trên xuống: instancing vẽ theo thứ tự tạo, block cao (gần camera) vẽ trước
         // -> GPU loại sớm (early-Z) phần bị che của các tầng dưới, giảm tô đè pixel.
         itemSpawn.listSpawnDatas.sort((a, b) => b.p.y - a.p.y);
         if (prefab) {
            blockTypesSet.add(itemSpawn.id);
         }
      });

      blockTypesObj.push(...Array.from(blockTypesSet).map((id) => ({ name: id, id: Number(id.split("_")[1]) })));
      blockTypesObj.sort((a, b) => a.id - b.id);
      let count = 0;

      level.listItemSpawns.forEach((itemSpawn: ItemSpawn) => {
         const index = blockTypesObj.findIndex((p) => p.name === itemSpawn.id);
         if (index === -1) {
            return;
         }

         const prefab = this.prefabs[index];
         itemSpawn.listSpawnDatas.forEach((s: SpawnData) => {
            // if(count>1000){
            //    return;
            // }
            count++;
            const node = instantiate(prefab);
            const blockView = node.getComponent(BlockView);
            const pos = v3(-s.p.x, s.p.y, s.p.z);

            // Đặt transform trước khi gắn vào scene để body vật lý được tạo đúng vị trí.
            // Bản gốc đặt (p.x, p.y, -p.z); ở đây đặt (-p.x, p.y, p.z) = cả level xoay 180° quanh Y,
            // nên mỗi model cũng phải quay thêm 180° quanh Y (euler Cocos theo thứ tự Y-Z-X nên cộng vào r.y).
            node.eulerAngles = v3(s.r.x, s.r.y + 180, s.r.z);
            node.setScale(v3(s.s.x, s.s.y, s.s.z));
            node.position = pos;
            node.parent = this.node;
            // init sau khi node đã vào scene: RigidBody đã được tạo (ở dạng DYNAMIC) thì mới đổi type.
            blockView.init(index);
            this._blocks.push(blockView);
            this.addToCell(blockView);
            blockView.setPhysics(false); // bật lại khi hố tới gần (updatePhysicsArea)
         });
      });
      console.log("count", count);
      console.log("decryptedContent", level);
   }

   private onPlayerMove(dir: Vec3) {
      this._dirMove = dir;
   }

   protected onDestroy(): void {
      // eventTarget dùng chung toàn game, phải gỡ listener (vd. sau game.restart()).
      eventTarget.targetOff(this);
   }

   /** Block đã bị BlockDestroyer hủy: bỏ khỏi mọi danh sách để update không đụng vào nữa. */
   private onBlockDestroyed(block: BlockView) {
      this.forget(block);
   }

   /** Block đã lọt xuống hố (bản gốc: GameLevel.removeItems): thôi theo dõi để nó rơi tiếp, không bị trả về KINEMATIC. */
   private onBlockEaten(node: Node) {
      const block = node?.getComponent(BlockView);
      if (block) {
         this.forget(block);
      }
   }

   private forget(block: BlockView) {
      const index = this._blocks.indexOf(block);
      if (index !== -1) {
         this._blocks.splice(index, 1);
      }
      this._dynamic.delete(block);
      this.removeFromCell(block);
   }

   private addToCell(block: BlockView) {
      const p = block.node.worldPosition;
      const key = cellKey(cellOf(p.x), cellOf(p.z));
      let list = this._cells.get(key);
      if (!list) {
         list = [];
         this._cells.set(key, list);
      }
      list.push(block);
      block.cellKey = key;
   }

   private removeFromCell(block: BlockView) {
      const list = block.cellKey !== null ? this._cells.get(block.cellKey) : undefined;
      if (list) {
         const index = list.indexOf(block);
         if (index !== -1) {
            list.splice(index, 1);
         }
      }
      block.cellKey = null;
   }

   /** Bật vật lý cho block trong vùng quanh hố, tắt cho vùng hố vừa rời đi. Chỉ chạy khi hố đổi ô hoặc đổi bán kính. */
   private updatePhysicsArea(hx: number, hz: number, radius: number) {
      const reach = radius + PHYSICS_MARGIN;
      const x0 = cellOf(hx - reach), x1 = cellOf(hx + reach), z0 = cellOf(hz - reach), z1 = cellOf(hz + reach);
      const area = `${x0},${x1},${z0},${z1}`;
      if (area === this._physicsArea) {
         return;
      }
      this._physicsArea = area;
      const next = new Set<number>();
      for (let cx = x0; cx <= x1; cx++) {
         for (let cz = z0; cz <= z1; cz++) {
            next.add(cellKey(cx, cz));
         }
      }
      this._physicsCells.forEach((key) => {
         if (!next.has(key)) {
            this._cells.get(key)?.forEach((b) => b.setPhysics(false));
         }
      });
      next.forEach((key) => {
         if (!this._physicsCells.has(key)) {
            this._cells.get(key)?.forEach((b) => b.setPhysics(true));
         }
      });
      this._physicsCells = next;
   }

   private onLevelUp(level: number) {
      this._rangeSqr = HoleConfig.getRadius(level) ** 2;
      this._speedMul = HoleConfig.getSpeedMultiplier(level);
   }

   private onStopMove() {
      this._dirMove = v3();
      console.log("this.hole.position", this.hole.position);
   }

   protected update(dt: number): void {
      // Giống bản gốc (GameLevel.update): chạy mọi frame, không ẩn block nào (engine tự cull khi render).
      // Trong bán kính hố -> DYNAMIC; ra ngoài đủ LEAVE_TIME giây -> KINEMATIC.
      // Chỉ xét block trong các ô quanh hố + block đang DYNAMIC (lưới ô CELL), kết quả giống duyệt cả level.
      const holePos = this.hole.worldPosition;
      const hx = holePos.x;
      const hz = holePos.z;
      const radius = Math.sqrt(this._rangeSqr);
      this.updatePhysicsArea(hx, hz, radius);

      // Block đứng yên trong bán kính hút -> DYNAMIC, chuyển sang danh sách dynamic.
      const x0 = cellOf(hx - radius), x1 = cellOf(hx + radius), z0 = cellOf(hz - radius), z1 = cellOf(hz + radius);
      for (let cx = x0; cx <= x1; cx++) {
         for (let cz = z0; cz <= z1; cz++) {
            const list = this._cells.get(cellKey(cx, cz));
            if (!list) {
               continue;
            }
            for (let i = list.length - 1; i >= 0; i--) {
               const block = list[i];
               const p = block.node.worldPosition;
               const dx = p.x - hx;
               const dz = p.z - hz;
               if (dx * dx + dz * dz < this._rangeSqr) {
                  list.splice(i, 1);
                  block.cellKey = null;
                  block.setPhysics(true);
                  block.setDynamic();
                  block.leaveTimer = 0;
                  this._dynamic.add(block);
               }
            }
         }
      }

      // Block DYNAMIC: ra ngoài bán kính đủ LEAVE_TIME giây -> KINEMATIC, trả về lưới theo vị trí mới.
      this._dynamic.forEach((block) => {
         if (!block.isValid) {
            this._dynamic.delete(block);
            return;
         }
         const p = block.node.worldPosition;
         const dx = p.x - hx;
         const dz = p.z - hz;
         if (dx * dx + dz * dz < this._rangeSqr) {
            block.leaveTimer = 0;
            return;
         }
         block.leaveTimer += dt;
         if (block.leaveTimer >= LEAVE_TIME) {
            block.setKinematic();
            this._dynamic.delete(block);
            this.addToCell(block);
            if (!this._physicsCells.has(block.cellKey!)) {
               block.setPhysics(false);
            }
         }
      });

      if (this._dirMove.lengthSqr() === 0) {
         return;
      }
      const pos = this.hole.position;
      const step = SCALE_MOVE * this._speedMul;
      // Không cho hố ra ngoài mặt đất.
      const x = Math.min(Math.max(pos.x - this._dirMove.x * step, MIN_X), MAX_X);
      const z = Math.min(Math.max(pos.z - this._dirMove.z * step, MIN_Z), MAX_Z);
      this.hole.setPosition(x, pos.y, z);
   }

    private resize() {
      const { width, height } = screen.windowSize;
      const design = view.getDesignResolutionSize();
      const fitHeight = width > height || width / height > design.width / design.height;
      view.setResolutionPolicy(fitHeight ? ResolutionPolicy.FIXED_HEIGHT : ResolutionPolicy.FIXED_WIDTH);
   }
}
