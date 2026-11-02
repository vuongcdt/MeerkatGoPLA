import { _decorator, Component, instantiate, Node, Prefab, Vec3 } from 'cc';
import { ServiceKey } from '../Core/ServiceLocator';
import { LevelData } from './LevelData';
import { toCocosEuler, toCocosPosition, toCocosScale } from './UnityToCocos';

const { ccclass, property } = _decorator;

export interface LevelBuildReport {
    spawned: number;
    /** Item ids present in the data but without a matching prefab (id -> skipped count). */
    missing: Record<string, number>;
}

/** Spawns level items from level data. */
export interface ILevelBuilder {
    build(data: LevelData): LevelBuildReport;
    clear(): void;
}

export const LevelBuilderKey = new ServiceKey<ILevelBuilder>('ILevelBuilder');

const _tmp = new Vec3();

/**
 * Instantiates every item placement of a level under `itemRoot`.
 * Prefabs are matched by name: the prefab named "obj_10" is used for item id "obj_10".
 */
@ccclass('LevelBuilder')
export class LevelBuilder extends Component implements ILevelBuilder {
    @property({ type: [Prefab], tooltip: 'Item prefabs; each prefab name must equal the item id in the level data.' })
    private itemPrefabs: Prefab[] = [];

    @property({ type: Node, tooltip: 'Parent of spawned items.' })
    private itemRoot: Node | null = null;

    build(data: LevelData): LevelBuildReport {
        const root = this.itemRoot ?? this.node;
        const prefabById = new Map<string, Prefab>();
        for (const prefab of this.itemPrefabs) {
            if (prefab) prefabById.set(prefab.data.name, prefab);
        }

        this.clear();
        const report: LevelBuildReport = { spawned: 0, missing: {} };

        for (const group of data.listItemSpawns) {
            const prefab = prefabById.get(group.id);
            if (!prefab) {
                report.missing[group.id] = group.listSpawnDatas.length;
                continue;
            }
            for (const spawn of group.listSpawnDatas) {
                const item = instantiate(prefab);
                item.name = group.id;
                item.setPosition(toCocosPosition(spawn.p, _tmp));
                item.setRotationFromEuler(toCocosEuler(spawn.r, _tmp));
                item.setScale(toCocosScale(spawn.s, _tmp));
                root.addChild(item);
                report.spawned++;
            }
        }

        const missingIds = Object.keys(report.missing);
        if (missingIds.length > 0) {
            console.warn(`[LevelBuilder] "${data.name}": no prefab for ${missingIds.join(', ')} — skipped.`);
        }
        console.log(`[LevelBuilder] "${data.name}": spawned ${report.spawned} items.`);
        return report;
    }

    clear(): void {
        (this.itemRoot ?? this.node).destroyAllChildren();
    }
}
