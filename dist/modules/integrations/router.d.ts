declare const router: import("express-serve-static-core").Router;
interface GeocodingProvider {
    forward(address: string): Promise<{
        lat: number;
        lon: number;
    } | null>;
    reverse(lat: number, lon: number): Promise<{
        address: string;
        city?: string;
        country?: string;
    } | null>;
}
export declare const geocodingProvider: GeocodingProvider;
export default router;
export declare function fetchWeatherForTenant(tenantId: string): Promise<number>;
export declare function fetchWeatherForAllTenants(): Promise<number>;
//# sourceMappingURL=router.d.ts.map