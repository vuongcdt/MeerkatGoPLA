import { _decorator, Button, Component, Tween, tween, Vec3 } from 'cc';
import { ServiceLocator } from '../Core/ServiceLocator';
import { StoreServiceKey } from '../Services/StoreService';

const { ccclass, property } = _decorator;

/** "PLAY NOW" call-to-action: pulses and opens the store on click. */
@ccclass('PlayNowButtonView')
export class PlayNowButtonView extends Component {
    @property({ type: Button })
    private button: Button | null = null;

    @property({ tooltip: 'Scale at the top of the pulse.' })
    private pulseScale = 1.08;

    private readonly _baseScale = new Vec3();

    protected onEnable(): void {
        this.button?.node.on(Button.EventType.CLICK, this.onClick, this);
        this._baseScale.set(this.node.scale);
        const up = new Vec3(this._baseScale).multiplyScalar(this.pulseScale);
        tween(this.node)
            .to(0.45, { scale: up }, { easing: 'sineInOut' })
            .to(0.45, { scale: this._baseScale }, { easing: 'sineInOut' })
            .union()
            .repeatForever()
            .start();
    }

    protected onDisable(): void {
        // Cancel the pulse so no tween outlives the node.
        Tween.stopAllByTarget(this.node);
        this.node.setScale(this._baseScale);
        this.button?.node.off(Button.EventType.CLICK, this.onClick, this);
    }

    private onClick(): void {
        ServiceLocator.resolve(StoreServiceKey).openStore();
    }
}
