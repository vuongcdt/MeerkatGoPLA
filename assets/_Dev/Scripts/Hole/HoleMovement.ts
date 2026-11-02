import { _decorator, Camera, Component, Vec2, Vec3 } from 'cc';
import { ServiceLocator } from '../Core/ServiceLocator';
import { IMoveInput, MoveInputKey } from '../Input/JoystickInput';

const { ccclass, property } = _decorator;

const _right = new Vec3();
const _forward = new Vec3();
const _pos = new Vec3();

/** Moves the hole on the ground (XZ plane) from the move input, relative to the camera view. */
@ccclass('HoleMovement')
export class HoleMovement extends Component {
    @property({ type: Camera, tooltip: 'Camera whose view defines "up / right" on screen.' })
    private viewCamera: Camera | null = null;

    @property({ tooltip: 'Units per second at full joystick.' })
    private speed = 14;

    @property({ tooltip: 'Min (x, z) the hole can reach.' })
    private boundsMin = new Vec2(-55, -38);

    @property({ tooltip: 'Max (x, z) the hole can reach.' })
    private boundsMax = new Vec2(55, 95);

    private _input: IMoveInput | null = null;

    protected start(): void {
        this._input = ServiceLocator.resolve(MoveInputKey);
    }

    protected update(dt: number): void {
        const dir = this._input?.direction;
        if (!dir || (dir.x === 0 && dir.y === 0) || !this.viewCamera) return;

        // Camera axes flattened onto the ground.
        const camNode = this.viewCamera.node;
        _right.set(camNode.right.x, 0, camNode.right.z).normalize();
        _forward.set(camNode.forward.x, 0, camNode.forward.z).normalize();

        const step = this.speed * dt;
        this.node.getPosition(_pos);
        _pos.x += (_right.x * dir.x + _forward.x * dir.y) * step;
        _pos.z += (_right.z * dir.x + _forward.z * dir.y) * step;
        _pos.x = Math.min(Math.max(_pos.x, this.boundsMin.x), this.boundsMax.x);
        _pos.z = Math.min(Math.max(_pos.z, this.boundsMin.y), this.boundsMax.y);
        this.node.setPosition(_pos);
    }
}
