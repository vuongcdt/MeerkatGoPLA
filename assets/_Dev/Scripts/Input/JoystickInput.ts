import { _decorator, Component, EventTouch, Input, input, Vec2 } from 'cc';
import { ServiceKey } from '../Core/ServiceLocator';

const { ccclass, property } = _decorator;

/** Movement intent in screen space: x = right, y = up, magnitude 0..1. */
export interface IMoveInput {
    readonly direction: Readonly<Vec2>;
}

export const MoveInputKey = new ServiceKey<IMoveInput>('IMoveInput');

const _touch = new Vec2();

/**
 * Floating joystick over the whole screen: the drag vector from the touch origin gives the direction.
 * When the finger goes beyond `maxRadius`, the origin is dragged along so reversing is instant.
 */
@ccclass('JoystickInput')
export class JoystickInput extends Component implements IMoveInput {
    @property({ tooltip: 'Drag distance (UI px) that gives full speed.' })
    private maxRadius = 80;

    private readonly _origin = new Vec2();
    private readonly _direction = new Vec2();

    get direction(): Readonly<Vec2> {
        return this._direction;
    }

    protected onEnable(): void {
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    protected onDisable(): void {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        this._direction.set(0, 0);
    }

    private onTouchStart(event: EventTouch): void {
        event.getUILocation(this._origin);
        this._direction.set(0, 0);
    }

    private onTouchMove(event: EventTouch): void {
        event.getUILocation(_touch);
        Vec2.subtract(this._direction, _touch, this._origin);
        const length = this._direction.length();
        if (length > this.maxRadius) {
            // Pull the origin toward the finger so the vector never exceeds maxRadius.
            Vec2.scaleAndAdd(this._origin, this._origin, this._direction, (length - this.maxRadius) / length);
            this._direction.multiplyScalar(this.maxRadius / length);
        }
        this._direction.multiplyScalar(1 / this.maxRadius);
    }

    private onTouchEnd(): void {
        this._direction.set(0, 0);
    }
}
