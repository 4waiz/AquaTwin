/**
 * Draw-call reduction: merges the static meshes of a group that share an
 * equivalent material (same parameters and the same highlight uniforms) into
 * a single mesh. Dynamic parts (beacons, rotors, rings, water, instanced
 * meshes, anything flagged userData.dynamic) and nested groups are untouched.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

function signature(m: THREE.Material): string {
  const s = m as THREE.MeshStandardMaterial & THREE.MeshPhysicalMaterial;
  return [
    m.type,
    s.color?.getHexString(),
    s.emissive?.getHexString(),
    s.roughness,
    s.metalness,
    s.clearcoat,
    s.map?.uuid,
    s.roughnessMap?.uuid,
    s.normalMap?.uuid,
    m.transparent,
    m.opacity,
    m.side,
    // Materials with injected shaders are only merged within the same injection.
    m.onBeforeCompile?.toString().length ?? 0,
    m.customProgramCacheKey?.(),
  ].join("|");
}

export function mergeStatic(group: THREE.Object3D, uniformsKey: (m: THREE.Material) => unknown = () => null): number {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map<string, THREE.Mesh[]>();
  for (const child of [...group.children]) {
    const m = child as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || m.userData.dynamic || Array.isArray(m.material)) continue;
    if (!m.visible) continue;
    const g = m.geometry;
    if (!g.index || !g.getAttribute("normal") || !g.getAttribute("uv")) continue;
    const key = `${signature(m.material as THREE.Material)}|${String(uniformsKey(m.material as THREE.Material))}|${m.castShadow}|${m.receiveShadow}|${m.renderOrder}`;
    const list = buckets.get(key) ?? [];
    list.push(m);
    buckets.set(key, list);
  }
  let removed = 0;
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const geos = list.map((m) => {
      const g = m.geometry.clone();
      const mat = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
      g.applyMatrix4(mat);
      for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
      return g;
    });
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const first = list[0];
    const mesh = new THREE.Mesh(merged, first.material);
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder;
    mesh.name = `${group.name}-merged`;
    group.add(mesh);
    for (const m of list) {
      group.remove(m);
      m.geometry.dispose();
      removed++;
    }
    removed--;
  }
  return removed;
}
