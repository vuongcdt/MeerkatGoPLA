import { _decorator, Camera, Component, Node, Vec3 } from 'cc';

const { ccclass, property, executionOrder } = _decorator;

const _world = new Vec3();
const _ui = new Vec3();

/**
 * Keeps a UI node on the screen position of a 3D target (e.g. the level bar under the hole).
 * Runs after CameraFollow (default order) so it uses this frame's camera position.
 */
@ccclass('UIFollowWorldTarget')
@executionOrder(100)
export class UIFollowWorldTarget extends Component {
    @property({ type: Node })
    private target: Node | null = null;

    @property({ type: Camera, tooltip: '3D camera that renders the target.' })
    private worldCamera: Camera | null = null;

    @property({ tooltip: 'Offset added to the target world position.' })
    private worldOffset = new Vec3();

    protected lateUpdate(): void {
        if (!this.target || !this.worldCamera || !this.node.parent) return;
        Vec3.add(_world, this.target.worldPosition, this.worldOffset);
        this.worldCamera.convertToUINode(_world, this.node.parent, _ui);
        this.node.setPosition(_ui);
    }
}
