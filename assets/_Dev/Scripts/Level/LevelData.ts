/** Raw vector as stored in the level file (Unity space). */
export interface Vec3Data {
    x: number;
    y: number;
    z: number;
}

/** One placed item: p = position, r = euler rotation (deg), s = scale — all in Unity space. */
export interface SpawnData {
    p: Vec3Data;
    r: Vec3Data;
    s: Vec3Data;
    kinematic: boolean;
}

/** All placements of one item type (id matches the item prefab name, e.g. "obj_10"). */
export interface ItemSpawnGroup {
    id: string;
    listSpawnDatas: SpawnData[];
}

/** Decrypted content of a level file (e.g. LevelData/H_T_2.txt). */
export interface LevelData {
    name: string;
    listItemSpawns: ItemSpawnGroup[];
    listFenceDatas: unknown[];
}
