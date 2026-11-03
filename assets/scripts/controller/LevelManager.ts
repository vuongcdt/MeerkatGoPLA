import { _decorator, Collider, Component, director, game, instantiate, Material, MeshRenderer, Node, PhysicsSystem, Prefab, TextAsset, v3, Vec3 } from "cc";
import { simpleDecryptContent } from "../decryptContent";
import { ItemSpawn, Level, SpawnData } from "./GameModel";
import { EVENTS, eventTarget } from "../common/eventTarget";
import { BlockView } from "../views/BlockView";
import { HoleConfig } from "../common/HoleConfig";
const { ccclass, property } = _decorator;

const SCALE_MOVE = 0.25;
/** Ra khỏi bán kính hố đủ chừng này giây thì block trả về KINEMATIC (bản gốc: 3s). */
const LEAVE_TIME = 3;

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
      const positionsSet = new Set<Vec3>();

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
      console.log("blockTypesObj", blockTypesObj);
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
            if (pos.y === 0) {
               positionsSet.add(pos);
            }
         });
      });
      console.log("count", count);

      console.log("positionsSet", positionsSet);
      console.log("decryptedContent", level);
   }

   private onPlayerMove(dir: Vec3) {
      this._dirMove = dir;
   }

   protected onDestroy(): void {
      // eventTarget dùng chung toàn game, phải gỡ listener (vd. sau game.restart()).
      eventTarget.targetOff(this);
   }

   /** Block đã bị BlockDestroyer hủy: bỏ khỏi danh sách để update không đụng vào nữa. */
   private onBlockDestroyed(block: BlockView) {
      const index = this._blocks.indexOf(block);
      if (index !== -1) {
         this._blocks.splice(index, 1);
      }
   }

   /** Block đã lọt xuống hố (bản gốc: GameLevel.removeItems): thôi theo dõi để nó rơi tiếp, không bị trả về KINEMATIC. */
   private onBlockEaten(node: Node) {
      const index = this._blocks.findIndex((b) => b.node === node);
      if (index !== -1) {
         this._blocks.splice(index, 1);
      }
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
      const holePos = this.hole.worldPosition;
      const hx = holePos.x;
      const hz = holePos.z;
      for (const blockView of this._blocks) {
         const blockPos = blockView.node.worldPosition;
         const dx = blockPos.x - hx;
         const dz = blockPos.z - hz;
         const dist2 = dx * dx + dz * dz;
         if (dist2 < this._rangeSqr) {
            blockView.setDynamic();
            blockView.leaveTimer = 0;
         } else {
            blockView.leaveTimer += dt;
            if (blockView.leaveTimer >= LEAVE_TIME) {
               blockView.setKinematic();
            }
         }
      }

      if (this._dirMove.lengthSqr() === 0) {
         return;
      }
      const pos = this.hole.position;
      const step = SCALE_MOVE * this._speedMul;
      this.hole.setPosition(pos.x - this._dirMove.x * step, pos.y, pos.z - this._dirMove.z * step);
   }
}
