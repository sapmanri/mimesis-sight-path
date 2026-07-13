import { registryFor3D, type ObjectRegistryEntry } from './objectRegistry';

export type ThreeDObjectCatalogEntry = {
  id: string;
  label: string;
  cat: string;
  assetId: string;
  animated: boolean;
};

/**
 * 3D adapter over the canonical registry.
 * Existing engine factories still decide how assetId is rendered.
 */
export const THREE_D_OBJECT_CATALOG: ThreeDObjectCatalogEntry[] = (() => {
  const byAsset = new Map<string, ThreeDObjectCatalogEntry>();
  for (const entry of registryFor3D()) {
    const view = entry.views.threeD!;
    const assetId = view.assetId ?? entry.id;
    if (!byAsset.has(assetId)) {
      byAsset.set(assetId, {
        id: assetId,
        label: entry.label,
        cat: view.catalogCategory,
        assetId,
        animated: Boolean(view.animated),
      });
    }
  }
  return [...byAsset.values()];
})();

export function findObjectById(id: string): ObjectRegistryEntry | undefined {
  return registryFor3D().find((entry) => entry.id === id || entry.views.threeD?.assetId === id);
}
