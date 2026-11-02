import { _decorator, Component, Input, input, Node } from 'cc';

const { ccclass, property } = _decorator;

/**
 * "Slide to move" hint: moves the hand along an infinity path and hides on the first touch.
 */
@ccclass('TutorialView')
export class TutorialView extends Component {
    @property({ type: Node, tooltip: 'Hand pointer that follows the infinity path.' })
    private pointer: Node | null = null;

    @property({ tooltip: 'Half width of the infinity path (px).' })
    private radiusX = 100;

    @property({ tooltip: 'Half height of the infinity path (px).' })
    private radiusY = 45;

    @property({ tooltip: 'Loops per second.' })
    private speed = 0.6;

    private _time = 0;

    protected onEnable(): void {
        input.on(Input.EventType.TOUCH_START, this.hide, this);
    }

    protected onDisable(): void {
        input.off(Input.EventType.TOUCH_START, this.hide, this);
    }

    protected update(dt: number): void {
        if (!this.pointer) return;
        this._time += dt * this.speed * Math.PI * 2;
        // Lemniscate of Gerono: an "∞" shape centered on the path image.
        this.pointer.setPosition(
            this.radiusX * Math.sin(this._time),
            this.radiusY * Math.sin(this._time * 2),
        );
    }

    private hide(): void {
        this.node.active = false;
    }
}
