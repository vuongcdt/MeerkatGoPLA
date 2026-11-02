import { _decorator, Component, TextAsset } from 'cc';
import { ServiceLocator } from './Core/ServiceLocator';
import { JoystickInput, MoveInputKey } from './Input/JoystickInput';
import { LevelBuilder, LevelBuilderKey } from './Level/LevelBuilder';
import { LevelDataService, LevelDataServiceKey } from './Level/LevelDataService';
import { StoreService, StoreServiceKey } from './Services/StoreService';
import { GoalPanelView } from './UI/GoalPanelView';

const { ccclass, property } = _decorator;

/**
 * Entry point: registers services into the ServiceLocator, builds the level and fills the HUD.
 */
@ccclass('GameBootstrapper')
export class GameBootstrapper extends Component {
    @property({ type: TextAsset, tooltip: 'Encrypted level file (e.g. LevelData/H_T_2).' })
    private levelFile: TextAsset | null = null;

    @property({ type: LevelBuilder })
    private levelBuilder: LevelBuilder | null = null;

    @property({ type: GoalPanelView })
    private goalPanel: GoalPanelView | null = null;

    @property({ type: JoystickInput })
    private moveInput: JoystickInput | null = null;

    private readonly _levelDataService = new LevelDataService();
    private readonly _storeService = new StoreService();

    protected onLoad(): void {
        ServiceLocator.register(LevelDataServiceKey, this._levelDataService);
        ServiceLocator.register(StoreServiceKey, this._storeService);
        if (this.levelBuilder) ServiceLocator.register(LevelBuilderKey, this.levelBuilder);
        if (this.moveInput) ServiceLocator.register(MoveInputKey, this.moveInput);
        else console.error('[GameBootstrapper] moveInput is not assigned.');
    }

    protected start(): void {
        if (!this.levelFile) {
            console.error('[GameBootstrapper] levelFile is not assigned.');
            return;
        }
        const data = ServiceLocator.resolve(LevelDataServiceKey).parse(this.levelFile.text);
        ServiceLocator.resolve(LevelBuilderKey).build(data);
        this.goalPanel?.show(data);
    }

    protected onDestroy(): void {
        ServiceLocator.unregister(LevelDataServiceKey, this._levelDataService);
        ServiceLocator.unregister(StoreServiceKey, this._storeService);
        if (this.levelBuilder) ServiceLocator.unregister(LevelBuilderKey, this.levelBuilder);
        if (this.moveInput) ServiceLocator.unregister(MoveInputKey, this.moveInput);
    }
}
