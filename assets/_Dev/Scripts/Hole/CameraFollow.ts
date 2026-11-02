import { _decorator, Component, Node, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

const _pos = new Vec3();

/** Keeps the camera at its initial offset from the target (no rotation change). */
@ccclass('CameraFollow')
export class CameraFollow extends Component {
    @property({ type: Node })
    private target: Node | null = null;

    private readonly _offset = new Vec3();

    protected start(): void {
        if (this.target) Vec3.subtract(this._offset, this.node.worldPosition, this.target.worldPosition);
    }

    protected lateUpdate(): void {
        if (!this.target) return;
        Vec3.add(_pos, this.target.worldPosition, this._offset);
        this.node.setWorldPosition(_pos);
    }
}
