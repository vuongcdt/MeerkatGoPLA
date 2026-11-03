import { _decorator, Component, game, instantiate, Material, MeshRenderer, Node, Prefab, TextAsset, v3, Vec3 } from "cc";
import { simpleDecryptContent } from "../decryptContent";
import { ItemSpawn, Level, SpawnData } from "./GameModel";
import { EVENTS, eventTarget } from "../common/eventTarget";
import { BlockView } from "../views/BlockView";
const { ccclass, property } = _decorator;

const SCALE_MOVE = 0.25;
const RANGE = 3;
const RANGE_SQR = RANGE * RANGE;
const FAR_RANGE_SQR = RANGE * 2 * (RANGE * 2);

@ccclass("LevelManager")
export class LevelManager extends Component {
   @property(TextAsset) private encryptedTextAsset: TextAsset | null = null;
   @property([Prefab]) private prefabs: Prefab[] = [];
   @property(Node) private hole: Node | null = null;
   @property(Node) private resetBtn: Node | null = null;
   @property(MeshRenderer) private goundMesh: MeshRenderer | null = null;

   private _dirMove: Vec3 = v3();
   private _blocks: BlockView[] = [];
   private _grountMaterial: Material = null;

   onLoad() {
      this.init();
      eventTarget.on(EVENTS.PLAYER_MOVE, this.onPlayerMove, this);
      eventTarget.on(EVENTS.STOP_MOVE, this.onStopMove, this);
      eventTarget.on(EVENTS.BLOCK_DESTROYED, this.onBlockDestroyed, this);
      this.resetBtn?.on(Node.EventType.TOUCH_END, () => {
         game.restart();
      });
      this._grountMaterial = this.goundMesh?.getSharedMaterial(0);
      // Hố bản gốc ở (4, 0, 0) -> đổi sang hệ toạ độ đã xoay 180° quanh Y của level.
      this.hole.position = v3(-4, 0.01, 0);
   }

   private init() {
      const decryptedContent = simpleDecryptContent(this.encryptedTextAsset?.text || "", 5, 3);
      const level: Level = JSON.parse(decryptedContent);
      const blockTypesSet = new Set<string>();
      const blockTypesObj: { name: string; id: number }[] = [];
      const positionsSet = new Set<Vec3>();

      level.listItemSpawns.forEach((itemSpawn: ItemSpawn) => {
         const prefab = this.prefabs.find((p) => p.name === itemSpawn.id);
         itemSpawn.listSpawnDatas.sort((a, b) => a.p.y - b.p.y);
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

   private onStopMove() {
      this._dirMove = v3();
      console.log("this.hole.position", this.hole.position);
   }

   protected update(dt: number): void {
      if (this._dirMove.lengthSqr() === 0) {
         return;
      }

      // Giống bản gốc (GameLevel.update): không ẩn block nào, render ngoài camera do engine tự cull.
      // Duyệt hết block, so khoảng cách bình phương trên mặt XZ, không tạo Vec3 mới cho từng block.
      const holePos = this.hole.worldPosition;
      const hx = holePos.x;
      const hz = holePos.z;
      for (const blockView of this._blocks) {
         const blockPos = blockView.node.worldPosition;
         const dx = blockPos.x - hx;
         const dz = blockPos.z - hz;
         const dist2 = dx * dx + dz * dz;
         if (dist2 <= RANGE_SQR) {
            blockView.setDynamic();
         } else if (dist2 > FAR_RANGE_SQR) {
            blockView.setKinematic();
         }
      }

      const pos = this.hole.position;
      this.hole.setPosition(pos.x - this._dirMove.x * SCALE_MOVE, pos.y, pos.z - this._dirMove.z * SCALE_MOVE);
   }
}
