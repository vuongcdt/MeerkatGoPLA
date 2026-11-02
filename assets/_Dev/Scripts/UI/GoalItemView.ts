import { _decorator, Component, Label } from 'cc';

const { ccclass, property } = _decorator;

/** One goal slot of the HUD: shows how many items of `itemId` remain. */
@ccclass('GoalItemView')
export class GoalItemView extends Component {
    @property({ tooltip: 'Item id in the level data, e.g. "obj_9".' })
    private itemId = '';

    @property({ type: Label })
    private countLabel: Label | null = null;

    get id(): string {
        return this.itemId;
    }

    setCount(count: number): void {
        if (this.countLabel) this.countLabel.string = `${count}`;
    }
}
