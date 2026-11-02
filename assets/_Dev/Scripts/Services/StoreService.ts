import Super_html_script from '../../../scripts/PLA/Super_html_script';
import { ServiceKey } from '../Core/ServiceLocator';

/** Opens the store page of the advertised game. */
export interface IStoreService {
    openStore(): void;
}

export const StoreServiceKey = new ServiceKey<IStoreService>('IStoreService');

/** Adapter over the project's existing super-html playable helper (store URLs come from Constant). */
export class StoreService implements IStoreService {
    openStore(): void {
        Super_html_script.on_click_download();
    }
}
