import { v3 } from "cc";
import { Block, ItemSpawn } from "./GameModel";

export class GameLogic {
   private _blocks: Block[] = [];
   private _grid: Block[][] = [];

   constructor(listItemSpawns: ItemSpawn[]) {
      let blockId = 0;
      listItemSpawns.forEach((itemSpawn, blockType) => {
         this._grid.push([]);
         itemSpawn.listSpawnDatas.forEach((spawnData) => {
            const block = new Block();
            block.id = blockId++;
            block.type = blockType;
            block.position = v3(spawnData.p.x, spawnData.p.y, spawnData.p.z);
            this._blocks.push(block);
            this._grid[blockType].push(block);
         });
      });
      console.log("this._grid", this._grid);
   }
}
