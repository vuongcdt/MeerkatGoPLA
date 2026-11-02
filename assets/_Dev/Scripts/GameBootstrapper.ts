import { _decorator, Component, TextAsset } from 'cc';
import { ServiceLocator } from './Core/ServiceLocator';
import { LevelBuilder, LevelBuilderKey } from './Level/LevelBuilder';
import { LevelDataService, LevelDataServiceKey } from './Level/LevelDataService';

const { ccclass, property } = _decorator;

/**
 * Entry point: registers services into the ServiceLocator, then builds the level.
 */
@ccclass('GameBootstrapper')
export class GameBootstrapper extends Component {
    @property({ type: TextAsset, tooltip: 'Encrypted level file (e.g. LevelData/H_T_2).' })
    private levelFile: TextAsset | null = null;

    @property({ type: LevelBuilder })
    private levelBuilder: LevelBuilder | null = null;

    private readonly _levelDataService = new LevelDataService();

    protected onLoad(): void {
        ServiceLocator.register(LevelDataServiceKey, this._levelDataService);
        if (this.levelBuilder) ServiceLocator.register(LevelBuilderKey, this.levelBuilder);
    }

    protected start(): void {
        if (!this.levelFile) {
            console.error('[GameBootstrapper] levelFile is not assigned.');
            return;
        }
        const data = ServiceLocator.resolve(LevelDataServiceKey).parse(this.levelFile.text);
        ServiceLocator.resolve(LevelBuilderKey).build(data);
    }

    protected onDestroy(): void {
        ServiceLocator.unregister(LevelDataServiceKey, this._levelDataService);
        if (this.levelBuilder) ServiceLocator.unregister(LevelBuilderKey, this.levelBuilder);
    }
}
