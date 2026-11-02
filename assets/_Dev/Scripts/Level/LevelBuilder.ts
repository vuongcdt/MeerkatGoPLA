import { _decorator, Component, instantiate, MeshRenderer, Node, Prefab, Vec3 } from 'cc';
import { ServiceKey } from '../Core/ServiceLocator';
import { LevelData } from './LevelData';
import { toCocosEuler, toCocosPosition, toCocosScale } from './UnityToCocos';

const { ccclass, property } = _decorator;

export interface LevelBuildReport {
    spawned: number;
    shadows: number;
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
const _scale = new Vec3();

/**
 * Instantiates every item placement of a level under `itemRoot`.
 * Prefabs are matched by name: the prefab named "obj_10" is used for item id "obj_10".
 * Items standing on the ground also get a soft blob shadow under `shadowRoot`.
 */
@ccclass('LevelBuilder')
export class LevelBuilder extends Component implements ILevelBuilder {
    @property({ type: [Prefab], tooltip: 'Item prefabs; each prefab name must equal the item id in the level data.' })
    private itemPrefabs: Prefab[] = [];

    @property({ type: Node, tooltip: 'Parent of spawned items.' })
    private itemRoot: Node | null = null;

    @property({ type: Prefab, tooltip: 'Unit-diameter blob placed under items that stand on the ground. Empty = no shadows.' })
    private shadowPrefab: Prefab | null = null;

    @property({ type: Node, tooltip: 'Parent of spawned blob shadows.' })
    private shadowRoot: Node | null = null;

    @property({ tooltip: 'Blob diameter relative to the item footprint.' })
    private shadowSize = 1.35;

    @property({ tooltip: 'Items whose Y is below this value count as standing on the ground.' })
    private groundHeight = 0.05;

    @property({ type: Node, tooltip: 'Directional light whose forward gives the shadow direction. Empty = round blobs.' })
    private lightNode: Node | null = null;

    @property({ tooltip: 'Shadow length per unit of stack height (scaled by the light slope).' })
    private shadowLengthScale = 0.9;

    build(data: LevelData): LevelBuildReport {
        const root = this.itemRoot ?? this.node;
        const prefabById = new Map<string, Prefab>();
        for (const prefab of this.itemPrefabs) {
            if (prefab) prefabById.set(prefab.data.name, prefab);
        }

        this.clear();
        const report: LevelBuildReport = { spawned: 0, shadows: 0, missing: {} };
        const stackTops = new Map<string, number>();
        const grounded: { at: Vec3; key: string; footprint: number }[] = [];

        for (const group of data.listItemSpawns) {
            const prefab = prefabById.get(group.id);
            if (!prefab) {
                report.missing[group.id] = group.listSpawnDatas.length;
                continue;
            }
            let size: { footprint: number; height: number } | null = null; // measured once per item type (unit scale)
            for (const spawn of group.listSpawnDatas) {
                const item = instantiate(prefab);
                item.name = group.id;
                item.setPosition(toCocosPosition(spawn.p, _tmp));
                item.setRotationFromEuler(toCocosEuler(spawn.r, _tmp));
                item.setScale(toCocosScale(spawn.s, _scale));
                root.addChild(item);
                report.spawned++;

                if (!this.shadowPrefab) continue;
                if (!size) size = this.measureItem(item, _scale);
                const key = LevelBuilder.columnKey(item.position);
                const top = item.position.y + size.height * _scale.y;
                stackTops.set(key, Math.max(stackTops.get(key) ?? 0, top));
                if (spawn.p.y < this.groundHeight) {
                    grounded.push({ at: item.position.clone(), key, footprint: size.footprint * Math.max(_scale.x, _scale.z) });
                }
            }
        }

        // Shadows after all items, so each column knows its full stack height.
        const light = this.lightNode?.forward;
        for (const g of grounded) {
            this.spawnShadow(g.at, g.footprint, stackTops.get(g.key) ?? 0, light);
            report.shadows++;
        }

        const missingIds = Object.keys(report.missing);
        if (missingIds.length > 0) {
            console.warn(`[LevelBuilder] "${data.name}": no prefab for ${missingIds.join(', ')} — skipped.`);
        }
        console.log(`[LevelBuilder] "${data.name}": spawned ${report.spawned} items, ${report.shadows} shadows.`);
        return report;
    }

    clear(): void {
        (this.itemRoot ?? this.node).destroyAllChildren();
        this.shadowRoot?.destroyAllChildren();
    }

    /**
     * Soft blob under a grounded item. With a light, it is stretched away from the light
     * by the column height, so tall stacks cast long diagonal shadows.
     */
    private spawnShadow(at: Readonly<Vec3>, footprint: number, stackTop: number, light?: Readonly<Vec3>): void {
        const blob = instantiate(this.shadowPrefab!);
        const width = footprint * this.shadowSize;
        let length = width, cx = at.x, cz = at.z, yaw = 0;

        const horizontal = light ? Math.hypot(light.x, light.z) : 0;
        if (light && horizontal > 1e-4 && light.y < -1e-4) {
            const dx = light.x / horizontal, dz = light.z / horizontal;
            const cast = stackTop * (horizontal / -light.y) * this.shadowLengthScale;
            length = width + cast;
            cx += dx * cast * 0.5;
            cz += dz * cast * 0.5;
            yaw = Math.atan2(dx, dz) * 180 / Math.PI; // local +Z -> shadow direction
        }
        blob.setPosition(cx, 0, cz);
        blob.setRotationFromEuler(0, yaw, 0);
        blob.setScale(width, 1, length);
        (this.shadowRoot ?? this.itemRoot ?? this.node).addChild(blob);
    }

    private static columnKey(p: Readonly<Vec3>): string {
        return `${Math.round(p.x * 10)},${Math.round(p.z * 10)}`;
    }

    /** Mesh footprint (largest horizontal extent) and height at unit item scale. */
    private measureItem(item: Node, itemScale: Readonly<Vec3>): { footprint: number; height: number } {
        const renderer = item.getComponentInChildren(MeshRenderer);
        const mesh = renderer?.mesh;
        const min = mesh?.struct.minPosition, max = mesh?.struct.maxPosition;
        if (!renderer || !min || !max) return { footprint: 1, height: 1 };
        const s = renderer.node.worldScale;
        const footprint = Math.max((max.x - min.x) * Math.abs(s.x), (max.z - min.z) * Math.abs(s.z));
        return {
            footprint: footprint / Math.max(Math.abs(itemScale.x), Math.abs(itemScale.z), 1e-6),
            height: (max.y - min.y) * Math.abs(s.y) / Math.max(Math.abs(itemScale.y), 1e-6),
        };
    }
}
