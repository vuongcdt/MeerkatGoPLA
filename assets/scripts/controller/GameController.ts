import { _decorator, Component, instantiate, Node, Prefab, TextAsset, v3, Vec3 } from "cc";
import { simpleDecryptContent } from "../decryptContent";
import { ItemSpawn, Level, SpawnData } from "./GameModel";
import { EVENTS, eventTarget } from "../common/eventTarget";
import { GameLogic } from "./GameLogic";
import { BlockView } from "../views/BlockView";
const { ccclass, property } = _decorator;

@ccclass("GameController")
export class GameController extends Component {
   @property(TextAsset) private encryptedTextAsset: TextAsset | null = null;
   @property([Prefab]) private prefabs: Prefab[] = [];
   @property(Node) private camera: Node | null = null;

   private _dirMove: Vec3 = v3();
   private _gameLogic: GameLogic | null = null;

   start() {
      this.init();
      eventTarget.on(EVENTS.PLAYER_MOVE, this.onPlayerMove, this);
      eventTarget.on(EVENTS.STOP_MOVE, this.onStopMove, this);
   }

   private init() {
      const decryptedContent = simpleDecryptContent(this.encryptedTextAsset?.text || "", 5, 3);
      const level: Level = JSON.parse(decryptedContent);

      level.listItemSpawns.forEach((itemSpawn: ItemSpawn,type) => {
         const prefab = this.prefabs.find((p) => p.name === itemSpawn.id);
         itemSpawn.listSpawnDatas.sort((a, b) => a.p.y - b.p.y);

         if (!prefab) {
            return;
         }
         itemSpawn.listSpawnDatas.forEach((s: SpawnData) => {
            const node = instantiate(prefab);
            const blockView = node.getComponent(BlockView);

            blockView.init(type);
            node.parent = this.node;
            node.position = v3(s.p.x, s.p.y, s.p.z);
            node.eulerAngles = v3(s.r.x, s.r.y, s.r.z);
            node.setScale(v3(s.s.x, s.s.y, s.s.z));
         });
      });

      this._gameLogic = new GameLogic(level.listItemSpawns);

      console.log("decryptedContent", level);
   }

   private onPlayerMove(dir: Vec3) {
      this._dirMove = dir;
   }

   private onStopMove() {
      this._dirMove = v3();
   }

   protected update(dt: number): void {
      if (this._dirMove.length() > 0) {
         const offset = 0.2;
         if (this.camera) {
            const camPos = this.camera.position;
            this.camera.position = v3(camPos.x - this._dirMove.x * offset, camPos.y, camPos.z - this._dirMove.z * offset);
         }
      }
   }
}
