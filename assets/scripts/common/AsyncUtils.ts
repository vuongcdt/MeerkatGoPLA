import { Tween } from "cc";

export class AsyncUtils {
    public static sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    public static async waitTween<T extends object>(tween: Tween<T>): Promise<void> {
        return new Promise((resolve) => {
            tween.call(() => resolve()).start();
        });
    }
}