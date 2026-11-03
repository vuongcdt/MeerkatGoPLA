import { Vec3 } from "cc";

export class Level {
   listItemSpawns: ItemSpawn[];
}

export class ItemSpawn {
   id: string;
   listSpawnDatas: SpawnData[];
}

export class SpawnData {
   p: Vec3Data;
   r: Vec3Data;
   s: Vec3Data;
   kinematic: boolean;
}

export class Vec3Data {
   x: number;
   y: number;
   z: number;
}

export class Block {
   id: number;
   type: number;
   position: Vec3;
}
