import { _decorator, Component, instantiate, Node, Prefab, TextAsset, v3 } from "cc";
import { simpleDecryptContent } from "../decryptContent";
import { ItemSpawn, Level, SpawnData } from "./GameModel";
const { ccclass, property } = _decorator;

@ccclass("GameController")
export class GameController extends Component {
   @property(TextAsset) private encryptedTextAsset: TextAsset | null = null;
   @property([Prefab]) private prefabs: Prefab[] = [];

   start() {
      const decryptedContent = simpleDecryptContent(this.encryptedTextAsset?.text || "", 5, 3);
      const data: Level = JSON.parse(decryptedContent);
      console.log("decryptedContent", data);

      data.listItemSpawns.forEach((itemSpawn: ItemSpawn) => {
         const prefab = this.prefabs.find((p) => p.name === itemSpawn.id);
         if (prefab) {
            itemSpawn.listSpawnDatas.forEach((s: SpawnData) => {
               const node = instantiate(prefab);

               node.parent = this.node;
               node.position = v3(s.p.x, s.p.y, s.p.z);
               node.eulerAngles = v3(s.r.x, s.r.y, s.r.z);
               node.setScale(v3(s.s.x * 18, s.s.y * 18, s.s.z * 18));
            });
         } else {
            console.warn(`Prefab with name ${itemSpawn.id} not found.`);
         }
      });
   }
}
