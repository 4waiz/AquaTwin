/**
 * The site around the plant: rock armour along the coast, roads with
 * markings and paved pads, the perimeter fence, street lights, outbuildings
 * and a small substation, date palms, and offshore the subsea intake and
 * brine outfall pipelines with the diffuser, the intake head and marker
 * buoys riding the waves. Repeated parts are instanced; everything is built
 * from site.ts so it agrees with the terrain and the sea.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DIFFUSER, INTAKE_HEAD, SEA_LEVEL } from "./layout";
import { canvasTexture, patch, withWaterline, withWeathering, type Palette } from "./materials";
import { roundedPath } from "./Pipes";
import { armourRocks, FENCE, groundHeight, GROUND_Y, PADS, pipelinePaths, ROADS, diffuserPorts } from "./site";
import { rng, vnoise } from "./noise";
import type { Ocean } from "./Ocean";
import type { WaterOptics } from "./Terrain";

export interface ContextBuild {
  root: THREE.Group;
  setQuality(tier: 0 | 1 | 2): void;
  update(time: number, ocean: Ocean, activity: number): void;
}

const NO_REFLECT = 1;

function shadowed<T extends THREE.Mesh>(m: T, cast = true): T {
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

/** Merge a list of (geometry, matrix) into one mesh. */
function merged(parts: { g: THREE.BufferGeometry; m: THREE.Matrix4 }[], mat: THREE.Material, cast = true) {
  const geos = parts.map(({ g, m }) => {
    const c = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m);
    for (const name of Object.keys(c.attributes)) if (!["position", "normal", "uv"].includes(name)) c.deleteAttribute(name);
    if (!c.getAttribute("uv")) c.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(c.getAttribute("position").count * 2), 2));
    return c;
  });
  const g = mergeGeometries(geos, false)!;
  geos.forEach((x) => x.dispose());
  return shadowed(new THREE.Mesh(g, mat), cast);
}

const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const V = new THREE.Vector3();
const S = new THREE.Vector3();
function mat4(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz));
}

// ---------------------------------------------------------------------------
// Rocks
// ---------------------------------------------------------------------------

function rockGeometry(seed: number) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const r = rng(seed);
  const planes: { n: THREE.Vector3; c: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const n = new THREE.Vector3(r() - 0.5, (r() - 0.5) * 1.2, r() - 0.5).normalize();
    planes.push({ n, c: 0.62 + r() * 0.24 });
  }
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  const d = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize();
    let rad = 1 + (vnoise(d.x * 2.1 + seed, d.y * 2.1 + d.z, seed) - 0.5) * 0.3;
    for (const pl of planes) {
      const k = d.dot(pl.n);
      if (k > 0) rad = Math.min(rad, pl.c / k);
    }
    p.setXYZ(i, d.x * rad, d.y * rad * 0.85, d.z * rad);
  }
  g.computeVertexNormals();
  return g;
}

function buildRocks(root: THREE.Group, pal: Palette) {
  const rocks = armourRocks();
  const mat = withWaterline(withWeathering(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 }), 0.7, -10));
  const meshes: THREE.InstancedMesh[] = [];
  const tint = new THREE.Color();
  const light = new THREE.Color("#8f887c");
  const dark = new THREE.Color("#5d5953");
  for (let v = 0; v < 3; v++) {
    const list = rocks.filter((r) => r.variant === v);
    const im = new THREE.InstancedMesh(rockGeometry(17 + v * 31), mat, list.length);
    list.forEach((rk, i) => {
      im.setMatrixAt(i, mat4(rk.x, rk.y, rk.z, rk.rx, rk.ry, rk.rz, rk.sx, rk.sy, rk.sz));
      im.setColorAt(i, tint.copy(dark).lerp(light, rk.shade));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = im.receiveShadow = true;
    im.computeBoundingSphere();
    root.add(im);
    meshes.push(im);
  }
  void pal;
  return meshes;
}

// ---------------------------------------------------------------------------
// Roads and pads
// ---------------------------------------------------------------------------

function roadMaterial(width: number, highway: boolean, optics: WaterOptics) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return patch(mat, highway ? "road-hw" : "road", (shader) => {
    Object.assign(shader.uniforms, { uNoise: optics.uNoise, uWidth: { value: width } });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vRd;\nvarying vec3 vRw;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvRd = uv;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvRw = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vRd;\nvarying vec3 vRw;\nuniform sampler2D uNoise;\nuniform float uWidth;\nfloat rdMark = 0.0;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  float along = vRd.x;
  float across = (vRd.y - 0.5) * uWidth;
  vec4 n1 = texture2D(uNoise, vRw.xz * 0.05);
  vec4 n2 = texture2D(uNoise, vRw.xz * 0.9);
  vec3 asphalt = vec3(0.075, 0.074, 0.072) * (0.85 + 0.3 * n1.r + 0.18 * (n2.b - 0.5));
  // Tyre tracks: slightly darker and smoother bands.
  float lane = ${highway ? "abs(abs(across) - uWidth * 0.25)" : "abs(abs(across) - uWidth * 0.25)"};
  asphalt *= 1.0 - 0.12 * (1.0 - smoothstep(0.3, 0.75, lane));
  float edgeL = 1.0 - smoothstep(0.06, 0.1, abs(abs(across) - (uWidth * 0.5 - 0.35)));
  float dash = step(fract(along / ${highway ? "12.0" : "9.0"}), ${highway ? "0.25" : "0.33"});
  float centre = (1.0 - smoothstep(0.05, 0.09, abs(across))) * dash * step(6.0, along);
  rdMark = max(edgeL * step(6.0, along), centre) * (0.75 + 0.25 * n2.g);
  vec3 paint = ${highway ? "mix(vec3(0.62), vec3(0.75, 0.55, 0.12), step(abs(across), 0.2))" : "vec3(0.66)"};
  diffuseColor.rgb *= mix(asphalt, paint, rdMark);
}`,
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.6, rdMark);");
  });
}

function roadGeometry(pts: [number, number][], width: number) {
  const curve = roundedPath(
    pts.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    width * 1.1,
  );
  const length = curve.getLength();
  const n = Math.max(2, Math.ceil(length / 1.5));
  const P = curve.getSpacedPoints(n);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const p = P[i];
    if (i > 0) s += p.distanceTo(P[i - 1]);
    const a = P[Math.max(0, i - 1)];
    const b = P[Math.min(n, i + 1)];
    const tx = b.x - a.x;
    const tz = b.z - a.z;
    const tl = Math.hypot(tx, tz) || 1;
    const nx = -tz / tl;
    const nz = tx / tl;
    for (const side of [-1, 1]) {
      const x = p.x + nx * side * width * 0.5;
      const z = p.z + nz * side * width * 0.5;
      pos.push(x, Math.max(groundHeight(x, z), GROUND_Y) + 0.03, z);
      uv.push(s, side < 0 ? 0 : 1);
    }
    if (i < n) {
      const k = i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Fence, lights, palms
// ---------------------------------------------------------------------------

function chainLinkTexture() {
  const N = 64;
  const tex = canvasTexture(
    N,
    N,
    (img) => {
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const u = x / N;
          const v = y / N;
          const d1 = Math.abs(((u + v) % 0.5) - 0.25);
          const d2 = Math.abs(((u - v + 1) % 0.5) - 0.25);
          const wire = Math.max(0, 1 - Math.min(Math.abs(d1 - 0.25), Math.abs(d2 - 0.25), d1, d2) * 40);
          const i = (y * N + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = 200;
          img.data[i + 3] = Math.round(Math.min(1, wire) * 255);
        }
    },
    false,
  );
  return tex;
}

function frondTexture() {
  const W = 64;
  const H = 256;
  const r = rng(91);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  // Leaflets along the rachis, angled toward the tip, shorter near the ends.
  for (let i = 0; i < 46; i++) {
    const t = i / 46;
    const y = H * (0.06 + t * 0.9);
    const len = (W * 0.5 - 2) * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.08)) * (0.85 + r() * 0.15);
    const g = 70 + Math.round(r() * 30);
    ctx.strokeStyle = `rgb(${Math.round(g * 0.78)}, ${g}, ${Math.round(g * 0.42)})`;
    ctx.lineWidth = 2.2;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(W / 2, y);
      ctx.quadraticCurveTo(W / 2 + side * len * 0.5, y - 6, W / 2 + side * len, y - 16 - r() * 6);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = "rgb(120, 112, 70)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Crown of a date palm: arching fronds as textured strips (merged). */
function crownGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const r = rng(5);
  const fronds = 18;
  for (let f = 0; f < fronds; f++) {
    const yaw = (f / fronds) * Math.PI * 2 + r() * 0.3;
    const lift = 0.15 + r() * 0.9 - (f % 3 === 0 ? 0.5 : 0);
    const len = 3.2 + r() * 0.9;
    const seg = 8;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      // Arch: rises, then droops under its weight.
      const along = t * len;
      const h = Math.sin(lift) * along - 1.1 * t * t * len * 0.45;
      const out = Math.cos(lift) * along;
      const w = 0.62 * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.04));
      const cx = Math.cos(yaw);
      const cz = Math.sin(yaw);
      for (const side of [-1, 1]) {
        // Leaflets form a shallow V along the rachis.
        pos.push(cx * out - cz * side * w, h + Math.abs(side) * w * 0.25, cz * out + cx * side * w);
        uv.push(side < 0 ? 0 : 1, t);
      }
      if (i < seg) {
        const k = i * 2;
        idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g);
  }
  const g = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return g;
}

function trunkGeometry() {
  const g = new THREE.CylinderGeometry(0.17, 0.26, 1, 9, 12, true);
  g.translate(0, 0.5, 0);
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    // Leaf-base scars: a ring every ≈ 0.12 of the height.
    const ring = 1 + 0.09 * Math.pow(Math.abs(Math.sin(y * Math.PI * 9)), 3);
    p.setX(i, p.getX(i) * ring);
    p.setZ(i, p.getZ(i) * ring);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export function buildContext(pal: Palette, optics: WaterOptics, lamps: THREE.MeshStandardMaterial): ContextBuild {
  const root = new THREE.Group();
  root.name = "site";

  // --- rock armour
  buildRocks(root, pal);

  // --- roads
  for (const road of ROADS) {
    const mesh = new THREE.Mesh(roadGeometry(road.pts, road.width), roadMaterial(road.width, road.kind === "highway", optics));
    mesh.receiveShadow = true;
    mesh.name = `road-${road.kind}`;
    root.add(mesh);
  }

  // --- paved pads (slabs with visible edges)
  const concreteParts: { g: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
  const asphaltParts: { g: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
  for (const [x0, z0, x1, z1, kind] of PADS) {
    const g = new THREE.BoxGeometry(x1 - x0, 0.14, z1 - z0);
    (kind === "concrete" ? concreteParts : asphaltParts).push({ g, m: mat4((x0 + x1) / 2, GROUND_Y - 0.05, (z0 + z1) / 2) });
  }
  root.add(merged(concreteParts, pal.concrete(), false));
  const asphalt = roadMaterial(40, false, optics);
  root.add(merged(asphaltParts, asphalt, false));
  // Car-park bays: white lines.
  const bayParts: { g: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
  const bayGeo = new THREE.BoxGeometry(0.1, 0.02, 4.8);
  for (let i = 0; i <= 10; i++) {
    bayParts.push({ g: bayGeo, m: mat4(-21.4 + i * 1.25 + 0.0, GROUND_Y + 0.025, -29.8) });
    bayParts.push({ g: bayGeo, m: mat4(-21.4 + i * 1.25, GROUND_Y + 0.025, -25.2) });
  }
  root.add(merged(bayParts, pal.paint("#d7d6d0", 0.6, 0, 0.6), false));

  // --- simple parked cars (scale cues)
  {
    const r = rng(8);
    const glassParts: { g: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
    const tyreParts: { g: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
    const lower = new THREE.BoxGeometry(1.8, 0.62, 4.5);
    const cabin = new THREE.BoxGeometry(1.62, 0.5, 2.5);
    const tyre = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 12);
    tyre.rotateZ(Math.PI / 2);
    const colours = ["#e9e9e6", "#c9cbcd", "#2b2e33", "#e9e9e6", "#8f949a", "#f0efe9"];
    const cars: [number, number][] = [
      [-20.8, -29.8],
      [-18.3, -29.8],
      [-14.5, -29.8],
      [-11.8, -25.2],
      [-19.6, -25.2],
    ];
    const bodyMats: THREE.Mesh[] = [];
    cars.forEach(([x, z], i) => {
      const yaw = (r() - 0.5) * 0.06;
      const base = GROUND_Y + 0.33;
      const b = new THREE.Mesh(mergeGeometries([lower.clone().translate(0, 0.31, 0), cabin.clone().translate(0, 0.86, -0.25)], false)!, pal.paint(colours[i % colours.length], 0.32, 0.6, 0.15));
      b.position.set(x + 0.6, base, z);
      b.rotation.y = yaw;
      bodyMats.push(shadowed(b));
      glassParts.push({ g: new THREE.BoxGeometry(1.66, 0.4, 2.3), m: mat4(x + 0.6, base + 0.88, z - 0.25, 0, yaw) });
      for (const [dx, dz] of [
        [-0.78, 1.45],
        [0.78, 1.45],
        [-0.78, -1.45],
        [0.78, -1.45],
      ])
        tyreParts.push({ g: tyre, m: mat4(x + 0.6 + dx, GROUND_Y + 0.33, z + dz, 0, yaw) });
    });
    bodyMats.forEach((b) => root.add(b));
    root.add(merged(glassParts, new THREE.MeshPhysicalMaterial({ color: "#0b1116", roughness: 0.08, metalness: 0.2 }), false));
    root.add(merged(tyreParts, pal.rubber(), true));
  }

  // --- perimeter fence
  const fencePanels: THREE.Mesh[] = [];
  {
    const postGeo = new THREE.CylinderGeometry(0.035, 0.04, 2.6, 8);
    const posts: THREE.Matrix4[] = [];
    const rails: { g: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
    const panelMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#b7bbbd"),
      alphaMap: chainLinkTexture(),
      alphaTest: 0.35,
      alphaToCoverage: true,
      side: THREE.DoubleSide,
      roughness: 0.5,
      metalness: 0.6,
    });
    for (const line of FENCE) {
      for (let s = 0; s < line.length - 1; s++) {
        const [ax, az] = line[s];
        const [bx, bz] = line[s + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const n = Math.max(1, Math.round(len / 2.8));
        const yaw = Math.atan2(bx - ax, bz - az);
        for (let i = 0; i <= n; i++) {
          const x = ax + ((bx - ax) * i) / n;
          const z = az + ((bz - az) * i) / n;
          posts.push(mat4(x, groundHeight(x, z) + 1.3, z));
        }
        const cx = (ax + bx) / 2;
        const cz = (az + bz) / 2;
        const gy = groundHeight(cx, cz);
        const rail = new THREE.CylinderGeometry(0.025, 0.025, len, 6);
        rail.rotateX(Math.PI / 2);
        rails.push({ g: rail, m: mat4(cx, gy + 2.45, cz, 0, yaw) });
        rails.push({ g: rail, m: mat4(cx, gy + 2.7, cz, 0, yaw, 0, 0.6, 0.6, 1) });
        const pg = new THREE.PlaneGeometry(len, 2.4);
        const uvs = pg.getAttribute("uv") as THREE.BufferAttribute;
        for (let k = 0; k < uvs.count; k++) uvs.setXY(k, uvs.getX(k) * (len / 0.11), uvs.getY(k) * (2.4 / 0.11));
        const panel = new THREE.Mesh(pg, panelMat);
        panel.position.set(cx, gy + 1.25, cz);
        panel.rotation.y = yaw + Math.PI / 2;
        panel.layers.set(NO_REFLECT);
        panel.receiveShadow = true;
        fencePanels.push(panel);
        root.add(panel);
      }
    }
    const galv = pal.galv();
    const im = new THREE.InstancedMesh(postGeo, galv, posts.length);
    posts.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = im.receiveShadow = true;
    im.computeBoundingSphere();
    root.add(im);
    root.add(merged(rails, galv, true));
    // Gate: two leaves (open) and a guard house.
    const gateParts: { g: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
    const leaf = new THREE.BoxGeometry(0.06, 1.6, 3.6);
    gateParts.push({ g: leaf, m: mat4(-31.6, GROUND_Y + 0.9, -45.8, 0, 0.0) });
    gateParts.push({ g: leaf, m: mat4(-24.4, GROUND_Y + 0.9, -45.8, 0, 0.0) });
    root.add(merged(gateParts, pal.yellow(), true));
  }

  // --- buildings outside the platform
  {
    const clad = pal.building();
    const roof = pal.roof();
    const dark = pal.paintDark();
    const cladParts: { g: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
    const roofParts: { g: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
    const darkParts: { g: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
    const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
    // Workshop / store (portal-frame shed).
    cladParts.push({ g: box(9, 6, 13), m: mat4(-37.8, GROUND_Y + 3, -33.5) });
    roofParts.push({ g: box(9.6, 0.25, 13.6), m: mat4(-37.8, GROUND_Y + 6.1, -33.5, 0, 0, 0.0) });
    darkParts.push({ g: box(0.12, 4.2, 4.4), m: mat4(-33.25, GROUND_Y + 2.1, -31.5) });
    darkParts.push({ g: box(0.12, 4.2, 4.4), m: mat4(-33.25, GROUND_Y + 2.1, -36.2) });
    // Guard house at the gate.
    cladParts.push({ g: box(3.2, 2.8, 3.4), m: mat4(-35.2, GROUND_Y + 1.4, -41.2) });
    roofParts.push({ g: box(4.4, 0.18, 4.6), m: mat4(-35.2, GROUND_Y + 2.9, -41.2) });
    // Product-water pumping station.
    cladParts.push({ g: box(8.4, 5, 11), m: mat4(37.5, GROUND_Y + 2.5, -29.2) });
    roofParts.push({ g: box(8.9, 0.22, 11.5), m: mat4(37.5, GROUND_Y + 5.1, -29.2) });
    for (let i = 0; i < 4; i++) darkParts.push({ g: box(0.1, 1.0, 1.6), m: mat4(33.25, GROUND_Y + 3.3, -33 + i * 2.5) });
    root.add(merged(cladParts, clad, true), merged(roofParts, roof, true), merged(darkParts, dark, true));

    // Chemical store: bund wall and three storage tanks.
    const bund: { g: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
    bund.push({ g: box(10, 0.8, 0.25), m: mat4(37.5, GROUND_Y + 0.4, -15.3) });
    bund.push({ g: box(10, 0.8, 0.25), m: mat4(37.5, GROUND_Y + 0.4, -1.7) });
    bund.push({ g: box(0.25, 0.8, 13.8), m: mat4(32.6, GROUND_Y + 0.4, -8.5) });
    bund.push({ g: box(0.25, 0.8, 13.8), m: mat4(42.4, GROUND_Y + 0.4, -8.5) });
    root.add(merged(bund, pal.concrete(), true));
    const tankParts: { g: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
    const tank = mergeGeometries([new THREE.CylinderGeometry(1.25, 1.25, 3.4, 28).translate(0, 1.7, 0), new THREE.SphereGeometry(1.25, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 1).translate(0, 3.4, 0)], false)!;
    for (let i = 0; i < 3; i++) tankParts.push({ g: tank, m: mat4(36 + (i % 2) * 3.4, GROUND_Y, -12.5 + i * 3.9) });
    root.add(merged(tankParts, pal.tankShell(), true));

    // Substation: transformers with radiators and a steel gantry.
    const tr: { g: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
    const fins: { g: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
    for (const x of [4, 13]) {
      tr.push({ g: box(3.2, 2.6, 2.4), m: mat4(x, GROUND_Y + 1.3, -32) });
      tr.push({ g: box(3.4, 0.25, 2.6), m: mat4(x, GROUND_Y + 0.12, -32) });
      for (let k = 0; k < 9; k++) fins.push({ g: box(0.06, 2.0, 0.9), m: mat4(x - 1.4 + k * 0.35, GROUND_Y + 1.25, -30.3) });
      for (let k = 0; k < 3; k++) tr.push({ g: new THREE.CylinderGeometry(0.12, 0.16, 1.1, 10), m: mat4(x - 0.9 + k * 0.9, GROUND_Y + 3.1, -32.5) });
    }
    root.add(merged(tr, pal.paint("#8b9196", 0.5, 0.3, 0.4), true), merged(fins, pal.paint("#7d838a", 0.5, 0.4, 0.3), true));
    const gantry: { g: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
    for (const x of [1, 8.5, 16, 21]) gantry.push({ g: box(0.35, 8, 0.35), m: mat4(x, GROUND_Y + 4, -37.5) });
    gantry.push({ g: box(20.4, 0.4, 0.4), m: mat4(11, GROUND_Y + 7.8, -37.5) });
    gantry.push({ g: box(20.4, 0.25, 0.25), m: mat4(11, GROUND_Y + 6.4, -37.5) });
    root.add(merged(gantry, pal.galv(), true));
  }

  // --- street lights around the ring road
  {
    const spots: [number, number, number][] = [];
    for (let z = 3; z >= -16; z -= 17) {
      spots.push([-32.2, z, Math.PI / 2]);
      spots.push([32.2, z, -Math.PI / 2]);
    }
    for (let x = -18; x <= 24; x += 21) spots.push([x, -22.2, Math.PI]);
    for (let z = -28; z >= -42; z -= 14) spots.push([-32.2, z, Math.PI / 2]);
    const pole = new THREE.CylinderGeometry(0.07, 0.11, 8, 10).translate(0, 4, 0);
    const arm = new THREE.BoxGeometry(0.08, 0.08, 1.4).translate(0, 7.95, 0.65);
    const head = new THREE.BoxGeometry(0.34, 0.1, 0.62).translate(0, 7.92, 1.4);
    const pm = new THREE.InstancedMesh(mergeGeometries([pole, arm], false)!, pal.galv(), spots.length);
    const hm = new THREE.InstancedMesh(head, lamps, spots.length);
    spots.forEach(([x, z, yaw], i) => {
      const m = mat4(x, GROUND_Y, z, 0, yaw);
      pm.setMatrixAt(i, m);
      hm.setMatrixAt(i, m);
    });
    for (const im of [pm, hm]) {
      im.castShadow = im.receiveShadow = true;
      im.computeBoundingSphere();
      root.add(im);
    }
  }

  // --- date palms along the access road and by the gate
  {
    const r = rng(77);
    const spots: [number, number][] = [];
    for (let z = -24; z >= -42; z -= 6) {
      spots.push([-35.6, z]);
      spots.push([-20.6, z]);
    }
    spots.push([-23, -47.5], [-33.5, -47.5], [-40, -2], [-40, -8], [40.5, 2]);
    const trunkMat = withWeathering(new THREE.MeshStandardMaterial({ color: new THREE.Color("#7d6a55"), roughness: 0.95 }), 0.4, GROUND_Y);
    const frondMat = new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.45, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.75, metalness: 0 });
    const trunks = new THREE.InstancedMesh(trunkGeometry(), trunkMat, spots.length);
    const crowns = new THREE.InstancedMesh(crownGeometry(), frondMat, spots.length);
    spots.forEach(([x, z], i) => {
      const h = 5.5 + r() * 2.5;
      const lean = (r() - 0.5) * 0.12;
      const yaw = r() * Math.PI * 2;
      const y = groundHeight(x, z);
      trunks.setMatrixAt(i, mat4(x, y, z, lean, yaw, 0, 1, h, 1));
      const top = new THREE.Vector3(0, h, 0).applyEuler(new THREE.Euler(lean, yaw, 0));
      crowns.setMatrixAt(i, mat4(x + top.x, y + top.y, z + top.z, 0, yaw, 0, 1, 1, 1));
    });
    for (const im of [trunks, crowns]) {
      im.castShadow = im.receiveShadow = true;
      im.computeBoundingSphere();
      root.add(im);
    }
  }

  // --- offshore: subsea pipelines, diffuser risers, intake head
  {
    const pipeMat = withWaterline(withWeathering(new THREE.MeshStandardMaterial({ color: new THREE.Color("#8d8a82"), roughness: 0.92 }), 0.8, -10));
    for (const pl of pipelinePaths()) {
      const curve = new THREE.CatmullRomCurve3(pl.pts, false, "centripetal");
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, pl.pts.length * 6), pl.radius, 12, false), pipeMat);
      tube.receiveShadow = true;
      root.add(tube);
    }
    const risers: { g: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
    const riser = mergeGeometries([new THREE.CylinderGeometry(0.12, 0.14, 0.9, 10).translate(0, 0.45, 0), new THREE.CylinderGeometry(0.24, 0.24, 0.16, 12).translate(0, 0.9, 0)], false)!;
    for (const p of diffuserPorts()) risers.push({ g: riser, m: mat4(p.x, p.y, p.z, 0.6, 0, 0) });
    root.add(merged(risers, pipeMat, false));
    const headParts: { g: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
    const hy = groundHeight(INTAKE_HEAD.x, INTAKE_HEAD.z);
    headParts.push({ g: new THREE.CylinderGeometry(1.5, 1.7, 1.4, 20), m: mat4(INTAKE_HEAD.x, hy + 0.7, INTAKE_HEAD.z) });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      headParts.push({ g: new THREE.BoxGeometry(0.22, 1.0, 0.22), m: mat4(INTAKE_HEAD.x + Math.cos(a) * 1.35, hy + 1.9, INTAKE_HEAD.z + Math.sin(a) * 1.35) });
    }
    headParts.push({ g: new THREE.CylinderGeometry(2.3, 2.3, 0.22, 24), m: mat4(INTAKE_HEAD.x, hy + 2.5, INTAKE_HEAD.z) });
    root.add(merged(headParts, pipeMat, false));
  }

  // --- marker buoys (yellow special marks) riding the waves
  const buoys: { mesh: THREE.Mesh; x: number; z: number; depth: number; phase: number }[] = [];
  {
    const body = mergeGeometries(
      [
        new THREE.CylinderGeometry(0.42, 0.34, 0.7, 16).translate(0, 0.0, 0),
        new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8).translate(0, 0.85, 0),
        new THREE.BoxGeometry(0.5, 0.08, 0.08).rotateZ(Math.PI / 4).translate(0, 1.45, 0),
        new THREE.BoxGeometry(0.5, 0.08, 0.08).rotateZ(-Math.PI / 4).translate(0, 1.45, 0),
      ],
      false,
    )!;
    const yellow = pal.paint("#e7b416", 0.45, 0.05, 0.35);
    const ax = Math.cos(DIFFUSER.angle);
    const az = Math.sin(DIFFUSER.angle);
    const spots: [number, number][] = [
      [INTAKE_HEAD.x + 3.2, INTAKE_HEAD.z + 1.5],
      [DIFFUSER.x - ax * (DIFFUSER.length / 2 + 2.5), DIFFUSER.z - az * (DIFFUSER.length / 2 + 2.5) + 1.8],
      [DIFFUSER.x + ax * (DIFFUSER.length / 2 + 2.5), DIFFUSER.z + az * (DIFFUSER.length / 2 + 2.5) + 1.8],
    ];
    spots.forEach(([x, z], i) => {
      const m = shadowed(new THREE.Mesh(body, yellow));
      m.position.set(x, SEA_LEVEL, z);
      root.add(m);
      buoys.push({ mesh: m, x, z, depth: SEA_LEVEL - groundHeight(x, z), phase: i * 1.7 });
    });
  }

  return {
    root,
    setQuality(tier) {
      for (const p of fencePanels) p.visible = tier > 0;
    },
    update(time, ocean, activity) {
      for (const b of buoys) {
        const y = ocean.heightAt(b.x, b.z, time, activity, b.depth);
        const yx = ocean.heightAt(b.x + 0.6, b.z, time, activity, b.depth);
        const yz = ocean.heightAt(b.x, b.z + 0.6, time, activity, b.depth);
        b.mesh.position.y = y + 0.08;
        b.mesh.rotation.set((yz - y) * 1.2 + Math.sin(time * 1.3 + b.phase) * 0.04, 0, -(yx - y) * 1.2);
      }
    },
  };
}
