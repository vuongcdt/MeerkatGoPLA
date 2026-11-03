import { _decorator, Component, game, instantiate, Layers, Material, MeshRenderer, Node, Prefab, TextAsset, v3, Vec3 } from "cc";
import { simpleDecryptContent } from "../decryptContent";
import { ItemSpawn, Level, SpawnData } from "./GameModel";
import { EVENTS, eventTarget } from "../common/eventTarget";
import { BlockView } from "../views/BlockView";
const { ccclass, property } = _decorator;

const OFFSET = 0.2;
const RANGE = 3;

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
      this.resetBtn?.on(Node.EventType.TOUCH_END, () => {
         game.restart();
      });
      this._grountMaterial = this.goundMesh?.getSharedMaterial(0);
      this.hole.position = v3(7.5, 0.01, 5.6);
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

      level.listItemSpawns.forEach((itemSpawn: ItemSpawn) => {
         const index = blockTypesObj.findIndex((p) => p.name === itemSpawn.id);
         if (index === -1) {
            return;
         }

         const prefab = this.prefabs[index];
         itemSpawn.listSpawnDatas.forEach((s: SpawnData) => {
            const node = instantiate(prefab);
            const blockView = node.getComponent(BlockView);
            const pos = v3(s.p.x, s.p.y, s.p.z);

            // Đặt transform trước khi gắn vào scene để body vật lý được tạo đúng vị trí.
            node.eulerAngles = v3(s.r.x, s.r.y, s.r.z);
            node.setScale(v3(s.s.x, s.s.y, s.s.z));
            node.position = pos;
            node.parent = this.node;
            // init sau khi node đã vào scene: RigidBody đã được tạo (ở dạng DYNAMIC) thì mới đổi type.
            blockView.init(index);
            index == 1 && this._blocks.push(blockView);
            if (pos.y === 0) {
               positionsSet.add(pos);
            }
         });
      });

      console.log("positionsSet", positionsSet);
      console.log("decryptedContent", level);
   }

   private onPlayerMove(dir: Vec3) {
      this._dirMove = dir;
   }

   private onStopMove() {
      this._dirMove = v3();
      console.log("this.hole.position", this.hole.position);
   }

   protected update(dt: number): void {
      if (this._dirMove.length() == 0) {
         return;
      }

      this._blocks.forEach((blockView) => {
         const blockPos = blockView.node.worldPosition;
         const holePos = this.hole.worldPosition;
         const p1 = v3(blockPos.x, 0, blockPos.z);
         const p2 = v3(holePos.x, 0, holePos.z);
         if (Vec3.distance(p1, p2) <= RANGE) {
            blockView.setDynamic();
         } else {
            blockView.setKinematic();
         }
      });

      if (this.hole) {
         const camPos = this.hole.position;
         this.hole.position = v3(camPos.x - this._dirMove.x * OFFSET, camPos.y, camPos.z - this._dirMove.z * OFFSET);
      }
   }
}
