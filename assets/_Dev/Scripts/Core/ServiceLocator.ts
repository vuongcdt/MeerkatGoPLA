/**
 * Typed token used to register / resolve a service.
 * TypeScript interfaces are erased at runtime, so a token stands in for the interface type.
 */
export class ServiceKey<T> {
    /** Phantom field that only carries the generic type for inference; never assigned. */
    protected readonly _type?: T;

    constructor(public readonly name: string) {}
}

/**
 * Central registry for cross-system services. Services are registered by the bootstrapper
 * and resolved by consumers through their interface key — never via static Instance properties.
 */
export class ServiceLocator {
    private static readonly _services = new Map<string, unknown>();

    static register<T>(key: ServiceKey<T>, service: T): void {
        if (this._services.has(key.name)) {
            console.warn(`[ServiceLocator] Overriding service "${key.name}".`);
        }
        this._services.set(key.name, service);
    }

    static resolve<T>(key: ServiceKey<T>): T {
        const service = this._services.get(key.name);
        if (service === undefined) {
            throw new Error(`[ServiceLocator] Service "${key.name}" is not registered.`);
        }
        return service as T;
    }

    static unregister<T>(key: ServiceKey<T>, service?: T): void {
        // Only remove when the caller still owns the registration (avoids removing a newer one).
        if (service === undefined || this._services.get(key.name) === service) {
            this._services.delete(key.name);
        }
    }
}
