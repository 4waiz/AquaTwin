/**
 * Water surfaces.
 *  SeaSurface — planar reflection (mirrored camera, oblique near plane, half
 *    resolution) combined with procedural normals, Fresnel, depth tint, an
 *    intro ripple, turbidity tint (algal bloom) and distance fade.
 *  TankWater — PBR surface with a drifting normal map; its height follows the
 *    simulated water level.
 */
import * as THREE from "three";

export class PlanarReflection {
  target: THREE.WebGLRenderTarget;
  textureMatrix = new THREE.Matrix4();
  private virtualCamera = new THREE.PerspectiveCamera();
  private plane = new THREE.Plane();
  private clipPlane = new THREE.Vector4();
  private q = new THREE.Vector4();
  private tmp = {
    reflectorPos: new THREE.Vector3(),
    cameraPos: new THREE.Vector3(),
    rotation: new THREE.Matrix4(),
    lookAt: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    view: new THREE.Vector3(),
    target: new THREE.Vector3(),
  };

  constructor(
    private mesh: THREE.Mesh,
    width: number,
    height: number,
    private clipBias = 0.003,
  ) {
    this.target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 2 });
  }

  setSize(w: number, h: number) {
    this.target.setSize(w, h);
  }

  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, hide: THREE.Object3D[]) {
    const t = this.tmp;
    t.reflectorPos.setFromMatrixPosition(this.mesh.matrixWorld);
    t.cameraPos.setFromMatrixPosition(camera.matrixWorld);
    t.rotation.extractRotation(this.mesh.matrixWorld);
    t.normal.set(0, 0, 1).applyMatrix4(t.rotation);
    t.view.subVectors(t.reflectorPos, t.cameraPos);
    if (t.view.dot(t.normal) > 0) return;
    t.view.reflect(t.normal).negate().add(t.reflectorPos);
    t.rotation.extractRotation(camera.matrixWorld);
    t.lookAt.set(0, 0, -1).applyMatrix4(t.rotation).add(t.cameraPos);
    t.target.subVectors(t.reflectorPos, t.lookAt).reflect(t.normal).negate().add(t.reflectorPos);
    const vc = this.virtualCamera;
    vc.position.copy(t.view);
    vc.up.set(0, 1, 0).applyMatrix4(t.rotation).reflect(t.normal);
    vc.lookAt(t.target);
    vc.far = camera.far;
    vc.near = camera.near;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse).multiply(this.mesh.matrixWorld);

    this.plane.setFromNormalAndCoplanarPoint(t.normal, t.reflectorPos).applyMatrix4(vc.matrixWorldInverse);
    this.clipPlane.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant);
    const pm = vc.projectionMatrix.elements;
    this.q.set((Math.sign(this.clipPlane.x) + pm[8]) / pm[0], (Math.sign(this.clipPlane.y) + pm[9]) / pm[5], -1, (1 + pm[10]) / pm[14]);
    this.clipPlane.multiplyScalar(2 / this.clipPlane.dot(this.q));
    pm[2] = this.clipPlane.x;
    pm[6] = this.clipPlane.y;
    pm[10] = this.clipPlane.z + 1 - this.clipBias;
    pm[14] = this.clipPlane.w;

    const prevTarget = renderer.getRenderTarget();
    const vis = hide.map((o) => o.visible);
    hide.forEach((o) => (o.visible = false));
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, vc);
    renderer.setRenderTarget(prevTarget);
    hide.forEach((o, i) => (o.visible = vis[i]));
  }
}

const seaVertex = /* glsl */ `
  uniform mat4 textureMatrix;
  varying vec4 vReflUv;
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vReflUv = textureMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const seaFragment = /* glsl */ `
  uniform sampler2D tReflection;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uLevelFade;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uTurbid;
  uniform float uTurbidity;
  uniform vec3 uRippleOrigin;
  uniform float uRippleRadius;
  uniform vec3 uPlumeOrigin;
  uniform float uPlume;
  varying vec4 vReflUv;
  varying vec3 vWorld;

  float h(vec2 p) {
    float t = uTime;
    float v = 0.0;
    v += sin(dot(p, vec2(0.62, 0.35)) * 1.1 + t * 0.9) * 0.5;
    v += sin(dot(p, vec2(-0.41, 0.77)) * 1.9 + t * 1.25) * 0.28;
    v += sin(dot(p, vec2(0.93, -0.21)) * 3.3 + t * 1.8) * 0.12;
    v += sin(dot(p, vec2(-0.12, -0.99)) * 5.9 + t * 2.6) * 0.06;
    return v;
  }

  void main() {
    vec2 p = vWorld.xz;
    float e = 0.06;
    float dx = (h(p + vec2(e, 0.0)) - h(p - vec2(e, 0.0))) / (2.0 * e);
    float dz = (h(p + vec2(0.0, e)) - h(p - vec2(0.0, e))) / (2.0 * e);
    // Intro ripple and outfall plume disturb the surface locally.
    float dr = distance(p, uRippleOrigin.xz);
    float ring = uRippleRadius > 0.0 ? sin((dr - uRippleRadius) * 3.0) * exp(-pow((dr - uRippleRadius) / 1.6, 2.0)) : 0.0;
    float dp = distance(p, uPlumeOrigin.xz);
    float plume = uPlume * exp(-dp * 0.45) * sin(dp * 5.0 - uTime * 5.0);
    vec3 n = normalize(vec3(-dx * 0.06 - ring * 0.25 - plume * 0.1, 1.0, -dz * 0.06 - ring * 0.25));

    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, viewDir), 0.0), 5.0);
    vec2 uv = vReflUv.xy / vReflUv.w + n.xz * 0.035;
    vec3 refl = texture2D(tReflection, uv).rgb;
    vec3 body = mix(uDeep, uShallow, 0.35 + 0.25 * n.x);
    body = mix(body, uTurbid, uTurbidity);
    vec3 L = normalize(vec3(-0.45, 0.8, 0.35));
    float spec = pow(max(dot(reflect(-L, n), viewDir), 0.0), 160.0) * 1.6;
    vec3 col = mix(body, refl, clamp(fres * 1.35, 0.0, 0.92)) + vec3(0.85, 0.92, 1.0) * spec;
    // Dissolve into the background away from the quay (no hard slab edges).
    float qz = vWorld.z - 8.5;
    float qx = max(abs(vWorld.x) - 23.0, 0.0);
    float edge = max(qz * 0.95, qx * 1.25);
    float fade = 1.0 - smoothstep(4.0, 24.0, edge);
    gl_FragColor = vec4(col, uOpacity * fade * uLevelFade);
  }`;

export class SeaSurface {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  reflection: PlanarReflection;
  uniforms: Record<string, THREE.IUniform>;

  constructor(width: number, height: number, level: number) {
    const geo = new THREE.PlaneGeometry(140, 70, 1, 1);
    this.uniforms = {
      tReflection: { value: null },
      textureMatrix: { value: new THREE.Matrix4() },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uLevelFade: { value: 1 },
      uDeep: { value: new THREE.Color(0.004, 0.014, 0.03) },
      uShallow: { value: new THREE.Color(0.008, 0.03, 0.058) },
      uTurbid: { value: new THREE.Color(0.035, 0.05, 0.035) },
      uTurbidity: { value: 0 },
      uRippleOrigin: { value: new THREE.Vector3() },
      uRippleRadius: { value: -1 },
      uPlumeOrigin: { value: new THREE.Vector3() },
      uPlume: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: seaVertex,
      fragmentShader: seaFragment,
      transparent: true,
      depthWrite: true,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(0, level, 43);
    this.mesh.renderOrder = 1;
    this.reflection = new PlanarReflection(this.mesh, Math.max(2, Math.round(width / 2)), Math.max(2, Math.round(height / 2)));
    this.uniforms.tReflection.value = this.reflection.target.texture;
    this.uniforms.textureMatrix.value = this.reflection.textureMatrix;
  }

  /** Reflection render-target resolution relative to the canvas (quality governor). */
  reflectionScale = 0.5;

  setSize(w: number, h: number) {
    const k = this.reflectionScale;
    this.reflection.setSize(Math.max(2, Math.round(w * k)), Math.max(2, Math.round(h * k)));
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
      envMapIntensity: 1.25,
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
