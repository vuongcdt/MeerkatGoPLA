import { _decorator, Component } from 'cc';
import { LevelData } from '../Level/LevelData';
import { GoalItemView } from './GoalItemView';

const { ccclass } = _decorator;

/** HUD goal list: fills every child GoalItemView with the item count of the level. */
@ccclass('GoalPanelView')
export class GoalPanelView extends Component {
    show(data: LevelData): void {
        const counts = new Map(data.listItemSpawns.map(g => [g.id, g.listSpawnDatas.length]));
        for (const item of this.getComponentsInChildren(GoalItemView)) {
            item.setCount(counts.get(item.id) ?? 0);
        }
    }
}
