export class Level {
   listItemSpawns: ItemSpawn[];
}

export class ItemSpawn {
   id: string;
   listSpawnDatas: SpawnData[];
}

export class SpawnData {
   p: Vec3;
   r: Vec3;
   s: Vec3;
   kinematic: boolean;
}

export class Vec3 {
   x: number;
   y: number;
   z: number;
}
