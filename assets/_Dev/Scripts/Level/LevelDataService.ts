import { simpleDecryptContent } from '../../../scripts/decryptContent';
import { ServiceKey } from '../Core/ServiceLocator';
import { LevelData } from './LevelData';

/** Turns an encrypted level file into typed level data. */
export interface ILevelDataService {
    parse(encryptedText: string): LevelData;
}

export const LevelDataServiceKey = new ServiceKey<ILevelDataService>('ILevelDataService');

export class LevelDataService implements ILevelDataService {
    parse(encryptedText: string): LevelData {
        const data = JSON.parse(simpleDecryptContent(encryptedText)) as LevelData;
        if (!data || !Array.isArray(data.listItemSpawns)) {
            throw new Error('[LevelDataService] Invalid level data: "listItemSpawns" is missing.');
        }
        return data;
    }
}
