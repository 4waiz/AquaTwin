/**
 * Water helpers.
 *  PlanarReflection: mirrored camera about a world-space plane with an
 *    oblique near plane (only what is above the water is reflected), rendered
 *    at reduced resolution into an HDR target; layer 0 only, so small
 *    details can opt out of the reflection pass.
 *  TankWater: PBR surface with a drifting normal map; its height follows the
 *    simulated water level.
 */
import * as THREE from "three";

export class PlanarReflection {
  target: THREE.WebGLRenderTarget;
  /** World position → reflection texture coordinates (homogeneous). */
  textureMatrix = new THREE.Matrix4();
  private vc = new THREE.PerspectiveCamera();
  private plane = new THREE.Plane();
  private clip = new THREE.Vector4();
  private q = new THREE.Vector4();
  private camPos = new THREE.Vector3();
  private view = new THREE.Vector3();
  private look = new THREE.Vector3();
  private tgt = new THREE.Vector3();
  private rot = new THREE.Matrix4();
  private normal: THREE.Vector3;
  private point: THREE.Vector3;

  constructor(
    normal: THREE.Vector3,
    point: THREE.Vector3,
    width: number,
    height: number,
    private clipBias = 0.003,
  ) {
    this.normal = normal.clone().normalize();
    this.point = point.clone();
    this.target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 2 });
    this.vc.layers.set(0);
  }

  setSize(w: number, h: number) {
    this.target.setSize(w, h);
  }

  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, hide: THREE.Object3D[]) {
    const n = this.normal;
    this.camPos.setFromMatrixPosition(camera.matrixWorld);
    this.view.subVectors(this.point, this.camPos);
    if (this.view.dot(n) > 0) return;
    this.view.reflect(n).negate().add(this.point);
    this.rot.extractRotation(camera.matrixWorld);
    this.look.set(0, 0, -1).applyMatrix4(this.rot).add(this.camPos);
    this.tgt.subVectors(this.point, this.look).reflect(n).negate().add(this.point);
    const vc = this.vc;
    vc.position.copy(this.view);
    vc.up.set(0, 1, 0).applyMatrix4(this.rot).reflect(n);
    vc.lookAt(this.tgt);
    vc.near = camera.near;
    vc.far = camera.far;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);

    // Oblique near plane: clip everything below the water plane.
    this.plane.setFromNormalAndCoplanarPoint(n, this.point).applyMatrix4(vc.matrixWorldInverse);
    this.clip.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant);
    const pm = vc.projectionMatrix.elements;
    this.q.set((Math.sign(this.clip.x) + pm[8]) / pm[0], (Math.sign(this.clip.y) + pm[9]) / pm[5], -1, (1 + pm[10]) / pm[14]);
    this.clip.multiplyScalar(2 / this.clip.dot(this.q));
    pm[2] = this.clip.x;
    pm[6] = this.clip.y;
    pm[10] = this.clip.z + 1 - this.clipBias;
    pm[14] = this.clip.w;
    vc.projectionMatrixInverse.copy(vc.projectionMatrix).invert();

    const prevTarget = renderer.getRenderTarget();
    const vis = hide.map((o) => o.visible);
    hide.forEach((o) => (o.visible = false));
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, vc);
    renderer.setRenderTarget(prevTarget);
    hide.forEach((o, i) => (o.visible = vis[i]));
  }

  dispose() {
    this.target.dispose();
  }
}

export class TankWater {
  mesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshStandardMaterial>;
  private normal: THREE.Texture;

  constructor(
    radius: number,
    normalMap: THREE.Texture,
    color = new THREE.Color(0.018, 0.075, 0.14),
    private floorY = 0.1,
    private maxY = 3.0,
  ) {
    this.normal = normalMap.clone();
    this.normal.repeat.set(radius / 3, radius / 3);
    this.normal.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.06,
      metalness: 0.0,
      normalMap: this.normal,
      normalScale: new THREE.Vector2(0.35, 0.35),
      envMapIntensity: 1.0,
      transparent: true,
      opacity: 0.96,
    });
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.receiveShadow = true;
  }

  /** level: 0..1 of the usable height; visible: intro fill factor. */
  setLevel(level: number, visible: number) {
    this.mesh.position.y = this.floorY + (this.maxY - this.floorY) * Math.min(Math.max(level, 0), 1);
    this.mesh.visible = visible > 0.001;
    this.mesh.material.opacity = 0.96 * Math.min(1, visible * 1.4);
  }

  update(time: number) {
    this.normal.offset.set(time * 0.012, time * 0.008);
  }
}
