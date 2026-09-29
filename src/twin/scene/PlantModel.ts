/**
 * The plant, built from primitives: a high-end miniature process model rather
 * than a photoreal facility. Every asset gets its own highlight uniforms,
 * a raycast proxy, a selection footprint and status beacons.
 */
import * as THREE from "three";
import type { AssetId } from "@/sim/scenarios";
import { ASSETS, DECK, ERD_X, INTAKE, OUTFALL, PUMP_X, RO, TANKS, TRAIN_Z, type AssetDef } from "./layout";
import { makeHighlightUniforms, makeWaterNormal, withHighlight, type HighlightUniforms, type Palette } from "./materials";
import { TankWater } from "./Water";
import { mergeStatic } from "./mergeStatic";

export interface AssetRuntime {
  def: AssetDef;
  group: THREE.Group;
  highlight: HighlightUniforms;
  proxy: THREE.Mesh;
  footprint: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  beacons: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>[];
  hover: number;
  select: number;
}

export interface PumpUnit {
  rotor: THREE.Object3D;
  ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  angle: number;
}

export interface PlantBuild {
  root: THREE.Group;
  assets: Record<AssetId, AssetRuntime>;
  pumps: PumpUnit[];
  pretreatWater: TankWater[];
  productWater: TankWater;
  windows: THREE.MeshStandardMaterial;
  lamps: THREE.MeshStandardMaterial;
  proxies: THREE.Mesh[];
}

const footprintFrag = /* glsl */ `
  uniform float uOpacity;
  uniform vec3 uColor;
  uniform vec2 uSize;
  varying vec2 vUv;
  float sdRoundRect(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  void main() {
    vec2 p = (vUv - 0.5) * uSize;
    float d = sdRoundRect(p, uSize * 0.5 - 0.12, 0.45);
    float line = 1.0 - smoothstep(0.0, 0.07, abs(d));
    float fill = (1.0 - smoothstep(-0.05, 0.0, d)) * 0.08;
    float a = (line * 0.85 + fill) * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
  }`;

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export function buildPlant(pal: Palette): PlantBuild {
  const root = new THREE.Group();
  root.name = "plant";

  // ---------------------------------------------------------------- deck
  const deckW = DECK.maxX - DECK.minX;
  const deckD = DECK.maxZ - DECK.minZ;
  const deckH = DECK.top - DECK.bottom;
  const deckGeo = new THREE.BoxGeometry(deckW, deckH, deckD);
  const deckMats = [pal.deckSide, pal.deckSide, pal.deck, pal.deckSide, pal.deckSide, pal.deckSide];
  const deck = new THREE.Mesh(deckGeo, deckMats);
  deck.position.set((DECK.minX + DECK.maxX) / 2, (DECK.top + DECK.bottom) / 2, (DECK.minZ + DECK.maxZ) / 2);
  deck.receiveShadow = true;
  root.add(deck);

  // Kerb along the quay edge.
  const kerb = mesh(new THREE.BoxGeometry(deckW, 0.18, 0.28), pal.deckSide);
  kerb.position.set(deck.position.x, 0.09, DECK.maxZ - 0.14);
  root.add(kerb);

  // Display base (the "table" the model stands on).
  const base = new THREE.Mesh(new THREE.CircleGeometry(95, 96), pal.base);
  base.rotation.x = -Math.PI / 2;
  base.position.y = DECK.bottom;
  base.receiveShadow = true;
  root.add(base);

  const assets = {} as Record<AssetId, AssetRuntime>;
  const proxies: THREE.Mesh[] = [];

  const makeAsset = (def: AssetDef): AssetRuntime => {
    const group = new THREE.Group();
    group.name = def.id;
    const highlight = makeHighlightUniforms();
    const [x0, z0, x1, z1] = def.footprint;
    const fpGeo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    const footprint = new THREE.Mesh(
      fpGeo,
      new THREE.ShaderMaterial({
        uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color("#5b9dff") }, uSize: { value: new THREE.Vector2(x1 - x0, z1 - z0) } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: footprintFrag,
        transparent: true,
        depthWrite: false,
      }),
    );
    footprint.rotation.x = -Math.PI / 2;
    footprint.position.set((x0 + x1) / 2, 0.025, (z0 + z1) / 2);
    footprint.renderOrder = 1;
    footprint.userData.noAO = true;
    footprint.userData.dynamic = true;
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 4.2, z1 - z0), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.set((x0 + x1) / 2, 2.1, (z0 + z1) / 2);
    proxy.userData.assetId = def.id;
    proxy.userData.dynamic = true;
    proxies.push(proxy);
    root.add(group, footprint, proxy);
    const rt: AssetRuntime = { def, group, highlight, proxy, footprint, beacons: [], hover: 0, select: 0 };
    assets[def.id] = rt;
    return rt;
  };

  const beacon = (a: AssetRuntime, pos: THREE.Vector3) => {
    const b = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.12, 16),
      new THREE.MeshStandardMaterial({ color: new THREE.Color("#0b0f14"), emissive: new THREE.Color("#3ecf8e"), emissiveIntensity: 0 }),
    );
    b.position.copy(pos);
    b.userData.dynamic = true;
    const housing = mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.08, 16), pal.paintDark(), false);
    housing.position.copy(pos).add(new THREE.Vector3(0, -0.09, 0));
    a.group.add(b, housing);
    a.beacons.push(b);
  };

  const hl = <T extends THREE.MeshStandardMaterial>(a: AssetRuntime, m: T) => withHighlight(m, a.highlight);

  // ---------------------------------------------------------------- 01 intake
  {
    const a = makeAsset(ASSETS.find((d) => d.id === "intake")!);
    const concrete = hl(a, pal.paintMid());
    const body = mesh(new THREE.BoxGeometry(INTAKE.w, INTAKE.h + 1.6, INTAKE.d), concrete);
    body.position.set(INTAKE.x, (INTAKE.h - 1.6) / 2, INTAKE.z);
    a.group.add(body);
    // Screen bays facing the sea.
    const screenMat = hl(a, pal.steel());
    for (let i = 0; i < 4; i++) {
      const bay = mesh(new THREE.BoxGeometry(0.72, 1.6, 0.12), screenMat);
      bay.position.set(INTAKE.x - 1.5 + i, -0.4, INTAKE.z + INTAKE.d / 2 + 0.06);
      a.group.add(bay);
      for (let s = 0; s < 5; s++) {
        const bar = mesh(new THREE.BoxGeometry(0.03, 1.5, 0.05), screenMat, false);
        bar.position.set(INTAKE.x - 1.78 + i + s * 0.14, -0.4, INTAKE.z + INTAKE.d / 2 + 0.14);
        a.group.add(bar);
      }
    }
    // Intake pump columns on the roof slab.
    const motor = hl(a, pal.motor());
    for (let i = 0; i < 2; i++) {
      const col = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.9, 20), motor);
      col.position.set(INTAKE.x - 0.8 + i * 1.6, INTAKE.h + 0.45, INTAKE.z + 0.5);
      a.group.add(col);
    }
    const rail = mesh(new THREE.BoxGeometry(INTAKE.w + 0.1, 0.08, 0.08), hl(a, pal.steel()), false);
    rail.position.set(INTAKE.x, INTAKE.h + 0.55, INTAKE.z - INTAKE.d / 2 + 0.05);
    a.group.add(rail);
    beacon(a, a.def.lightAt);
  }

  // ---------------------------------------------------------------- 02 pretreatment
  const pretreatWater: TankWater[] = [];
  const waterNormal = makeWaterNormal();
  {
    const a = makeAsset(ASSETS.find((d) => d.id === "pretreatment")!);
    const shell = hl(a, pal.tankShell());
    const inner = pal.tankInner();
    const ring = hl(a, pal.steel());
    for (const t of TANKS.pretreat) {
      const outer = mesh(new THREE.CylinderGeometry(t.r, t.r, t.h, 64, 1, true), shell);
      outer.position.set(t.x, t.h / 2, t.z);
      const innerM = mesh(new THREE.CylinderGeometry(t.r - 0.08, t.r - 0.08, t.h, 64, 1, true), inner, false);
      innerM.position.copy(outer.position);
      const floor = mesh(new THREE.CircleGeometry(t.r - 0.08, 48), inner, false);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(t.x, 0.12, t.z);
      const rim = mesh(new THREE.TorusGeometry(t.r - 0.02, 0.07, 10, 72), ring);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(t.x, t.h, t.z);
      const plinth = mesh(new THREE.CylinderGeometry(t.r + 0.25, t.r + 0.3, 0.14, 64), pal.deckSide);
      plinth.position.set(t.x, 0.07, t.z);
      // Walkway bridge across the top.
      const bridge = mesh(new THREE.BoxGeometry(t.r * 2 + 0.4, 0.06, 0.5), ring);
      bridge.position.set(t.x, t.h + 0.05, t.z);
      a.group.add(outer, innerM, floor, rim, plinth, bridge);
      const w = new TankWater(t.r - 0.1, waterNormal, new THREE.Color(0.02, 0.08, 0.13), 0.15, t.h - 0.25);
      w.mesh.position.set(t.x, 0, t.z);
      w.mesh.userData.dynamic = true;
      a.group.add(w.mesh);
      pretreatWater.push(w);
    }
    beacon(a, a.def.lightAt);
  }

  // ---------------------------------------------------------------- 03 HP pumps
  const pumps: PumpUnit[] = [];
  {
    const a = makeAsset(ASSETS.find((d) => d.id === "pumps")!);
    const skidMat = hl(a, pal.paintDark());
    const motorMat = hl(a, pal.motor());
    const casingMat = hl(a, pal.steel());
    TRAIN_Z.forEach((z) => {
      const skid = mesh(new THREE.BoxGeometry(3.9, 0.22, 1.5), skidMat);
      skid.position.set(PUMP_X, 0.11, z);
      const motor = mesh(new THREE.CylinderGeometry(0.52, 0.52, 1.7, 32), motorMat);
      motor.rotation.z = Math.PI / 2;
      motor.position.set(PUMP_X - 0.95, 0.78, z);
      const fins = mesh(new THREE.CylinderGeometry(0.56, 0.56, 1.2, 24, 1, true), skidMat);
      fins.rotation.z = Math.PI / 2;
      fins.position.copy(motor.position);
      const casing = mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.9, 32), casingMat);
      casing.rotation.z = Math.PI / 2;
      casing.position.set(PUMP_X + 0.95, 0.72, z);
      const volute = mesh(new THREE.SphereGeometry(0.52, 24, 16), casingMat);
      volute.scale.set(0.7, 1, 1);
      volute.position.set(PUMP_X + 1.3, 0.72, z);
      // Rotating coupling between motor and pump (visual pump speed).
      const rotor = new THREE.Group();
      rotor.position.set(PUMP_X + 0.1, 0.76, z);
      const shaft = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 20), casingMat);
      shaft.rotation.z = Math.PI / 2;
      rotor.add(shaft);
      for (let k = 0; k < 4; k++) {
        const bolt = mesh(new THREE.BoxGeometry(0.46, 0.07, 0.07), skidMat, false);
        bolt.position.set(0, Math.cos((k * Math.PI) / 2) * 0.17, Math.sin((k * Math.PI) / 2) * 0.17);
        rotor.add(bolt);
      }
      const guard = mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.55, 20, 1, true),
        new THREE.MeshStandardMaterial({ color: "#1b2027", transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
        false,
      );
      guard.rotation.z = Math.PI / 2;
      guard.position.copy(rotor.position);
      guard.userData.noAO = true;
      // Warning ring on the skid (visible only in degraded / constrained states).
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.35, 0.028, 8, 96),
        new THREE.MeshBasicMaterial({ color: new THREE.Color("#f2a93b"), transparent: true, opacity: 0, depthWrite: false }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.scale.set(1.55, 0.72, 1);
      ring.position.set(PUMP_X, 0.04, z);
      ring.userData.noAO = true;
      ring.userData.dynamic = true;
      a.group.add(skid, motor, fins, casing, volute, rotor, guard, ring);
      pumps.push({ rotor, ring, angle: 0 });
    });
    // Suction manifold stand & local panel.
    const panel = mesh(new THREE.BoxGeometry(0.5, 1.4, 1.0), skidMat);
    panel.position.set(PUMP_X - 2.4, 0.7, TRAIN_Z[1]);
    a.group.add(panel);
    beacon(a, a.def.lightAt);
  }

  // ---------------------------------------------------------------- 04 RO trains
  (["ro1", "ro2", "ro3"] as const).forEach((id, ti) => {
    const a = makeAsset(ASSETS.find((d) => d.id === id)!);
    const z = TRAIN_Z[ti];
    const vesselMat = hl(a, pal.vessel());
    const capMat = hl(a, pal.endCap());
    const frameMat = hl(a, pal.steel());
    const len = RO.x1 - RO.x0;
    const n = RO.columnsZ.length * RO.rowsY.length;
    const vesselGeo = new THREE.CylinderGeometry(RO.vesselRadius, RO.vesselRadius, len - 0.5, 28);
    vesselGeo.rotateZ(Math.PI / 2);
    const vessels = new THREE.InstancedMesh(vesselGeo, vesselMat, n);
    const capGeo = new THREE.CylinderGeometry(RO.vesselRadius + 0.035, RO.vesselRadius + 0.035, 0.26, 28);
    capGeo.rotateZ(Math.PI / 2);
    const caps = new THREE.InstancedMesh(capGeo, capMat, n * 2);
    let i = 0;
    const m4 = new THREE.Matrix4();
    for (const cz of RO.columnsZ) {
      for (const y of RO.rowsY) {
        m4.makeTranslation((RO.x0 + RO.x1) / 2, y, z + cz);
        vessels.setMatrixAt(i, m4);
        caps.setMatrixAt(i * 2, new THREE.Matrix4().makeTranslation(RO.x0 + 0.13, y, z + cz));
        caps.setMatrixAt(i * 2 + 1, new THREE.Matrix4().makeTranslation(RO.x1 - 0.13, y, z + cz));
        i++;
      }
    }
    vessels.castShadow = caps.castShadow = true;
    vessels.receiveShadow = caps.receiveShadow = true;
    a.group.add(vessels, caps);
    // Rack frame: posts and rails.
    const postGeo = new THREE.BoxGeometry(0.1, 3.1, 0.1);
    for (const px of [RO.x0 + 0.5, (RO.x0 + RO.x1) / 2, RO.x1 - 0.5]) {
      for (const pz of [-1.05, 1.05]) {
        const p = mesh(postGeo, frameMat);
        p.position.set(px, 1.55, z + pz);
        a.group.add(p);
      }
      const cross = mesh(new THREE.BoxGeometry(0.08, 0.08, 2.2), frameMat, false);
      cross.position.set(px, 3.08, z);
      const crossLow = mesh(new THREE.BoxGeometry(0.08, 0.08, 2.2), frameMat, false);
      crossLow.position.set(px, 0.3, z);
      a.group.add(cross, crossLow);
    }
    for (const pz of [-1.05, 1.05]) {
      const rail = mesh(new THREE.BoxGeometry(len - 0.9, 0.07, 0.07), frameMat, false);
      rail.position.set((RO.x0 + RO.x1) / 2, 3.08, z + pz);
      a.group.add(rail);
    }
    // Feed and outlet headers (vertical manifolds at each end).
    for (const hx of [RO.x0 - 0.25, RO.x1 + 0.25]) {
      const hdr = mesh(new THREE.CylinderGeometry(0.13, 0.13, 2.4, 16), capMat);
      hdr.position.set(hx, 1.7, z);
      a.group.add(hdr);
    }
    const skid = mesh(new THREE.BoxGeometry(len + 0.6, 0.12, 2.5), hl(a, pal.paintDark()));
    skid.position.set((RO.x0 + RO.x1) / 2, 0.06, z);
    a.group.add(skid);
    beacon(a, a.def.lightAt);
  });

  // ---------------------------------------------------------------- 05 product
  let productWater!: TankWater;
  {
    const a = makeAsset(ASSETS.find((d) => d.id === "product")!);
    const t = TANKS.product;
    const shell = hl(a, pal.tankShell());
    const outer = mesh(new THREE.CylinderGeometry(t.r, t.r, t.h, 96, 1, true), shell);
    outer.position.set(t.x, t.h / 2, t.z);
    const inner = mesh(new THREE.CylinderGeometry(t.r - 0.1, t.r - 0.1, t.h, 96, 1, true), pal.tankInner(), false);
    inner.position.copy(outer.position);
    const floor = mesh(new THREE.CircleGeometry(t.r - 0.1, 64), pal.tankInner(), false);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(t.x, 0.14, t.z);
    const rim = mesh(new THREE.TorusGeometry(t.r - 0.03, 0.08, 10, 96), hl(a, pal.steel()));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(t.x, t.h, t.z);
    const plinth = mesh(new THREE.CylinderGeometry(t.r + 0.3, t.r + 0.36, 0.16, 96), pal.deckSide);
    plinth.position.set(t.x, 0.08, t.z);
    // Level gauge strip on the tank wall.
    const gauge = mesh(new THREE.BoxGeometry(0.1, t.h - 0.4, 0.06), hl(a, pal.paintDark()), false);
    gauge.position.set(t.x - t.r * 0.72, t.h / 2, t.z + t.r * 0.7);
    gauge.lookAt(t.x, t.h / 2, t.z);
    a.group.add(outer, inner, floor, rim, plinth, gauge);
    productWater = new TankWater(t.r - 0.12, waterNormal, new THREE.Color(0.03, 0.11, 0.19), 0.2, t.h - 0.25);
    productWater.mesh.position.set(t.x, 0, t.z);
    productWater.mesh.userData.dynamic = true;
    a.group.add(productWater.mesh);
    // Post-treatment skid (remineralisation) next to the tank.
    const post = mesh(new THREE.BoxGeometry(2.6, 1.3, 1.6), hl(a, pal.paintMid()));
    post.position.set(14.8, 0.65, -9.3);
    a.group.add(post);
    for (let k = 0; k < 2; k++) {
      const c = mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.9, 24), hl(a, pal.tankShell()));
      c.position.set(17.0 + k * 1.1, 0.95, -9.3);
      a.group.add(c);
    }
    beacon(a, a.def.lightAt);
  }

  // ---------------------------------------------------------------- 06 brine / ERD
  {
    const a = makeAsset(ASSETS.find((d) => d.id === "brine")!);
    const frame = hl(a, pal.paintDark());
    const px = hl(a, pal.steel());
    TRAIN_Z.forEach((z) => {
      const skid = mesh(new THREE.BoxGeometry(2.4, 0.14, 1.4), frame);
      skid.position.set(ERD_X, 0.07, z);
      a.group.add(skid);
      for (let k = 0; k < 3; k++) {
        const c = mesh(new THREE.CylinderGeometry(0.17, 0.17, 1.9, 18), px);
        c.rotation.z = Math.PI / 2;
        c.position.set(ERD_X, 0.36 + (k % 2) * 0.36, z - 0.35 + k * 0.35);
        a.group.add(c);
      }
    });
    // Outfall headwall at the quay.
    const head = mesh(new THREE.BoxGeometry(2.2, 1.4, 0.8), pal.deckSide);
    head.position.set(OUTFALL.x, -0.3, DECK.maxZ + 0.1);
    a.group.add(head);
    beacon(a, a.def.lightAt);
  }

  // ---------------------------------------------------------------- buildings
  const windows = pal.glass;
  {
    const control = mesh(new THREE.BoxGeometry(7.2, 3.2, 4.4), pal.building());
    control.position.set(-17.6, 1.6, -8.8);
    const roof = mesh(new THREE.BoxGeometry(7.5, 0.18, 4.7), pal.roof());
    roof.position.set(-17.6, 3.29, -8.8);
    const band = mesh(new THREE.BoxGeometry(6.2, 0.5, 0.05), windows, false);
    band.position.set(-17.6, 2.2, -6.58);
    const door = mesh(new THREE.BoxGeometry(0.9, 1.9, 0.05), pal.roof(), false);
    door.position.set(-15.2, 0.95, -6.58);
    root.add(control, roof, band, door);
    // HVAC units on the roof.
    for (let k = 0; k < 2; k++) {
      const u = mesh(new THREE.BoxGeometry(1.1, 0.5, 0.9), pal.paintMid());
      u.position.set(-19.2 + k * 1.6, 3.63, -9.4);
      root.add(u);
    }
    const elec = mesh(new THREE.BoxGeometry(5.2, 2.4, 2.8), pal.building());
    elec.position.set(-5.2, 1.2, -10.4);
    const elecRoof = mesh(new THREE.BoxGeometry(5.4, 0.14, 3.0), pal.roof());
    elecRoof.position.set(-5.2, 2.47, -10.4);
    root.add(elec, elecRoof);
    for (let k = 0; k < 3; k++) {
      const tx = mesh(new THREE.BoxGeometry(1.2, 1.4, 1.0), pal.paintMid());
      tx.position.set(-1.3 + k * 1.7, 0.7, -10.6);
      root.add(tx);
    }
  }

  // ---------------------------------------------------------------- lamps
  const lamps = new THREE.MeshStandardMaterial({ color: "#10141a", emissive: new THREE.Color("#ffe6c4"), emissiveIntensity: 0 });
  for (const [x, z] of [
    [-22.2, -12.0],
    [-8.5, -12.0],
    [8.0, -12.0],
    [22.2, -12.0],
    [22.2, 0.5],
    [-22.2, 1.0],
    [2.5, 7.9],
  ] as const) {
    const pole = mesh(new THREE.CylinderGeometry(0.05, 0.07, 4.4, 10), pal.paintDark());
    pole.position.set(x, 2.2, z);
    const head = mesh(new THREE.BoxGeometry(0.5, 0.1, 0.24), lamps, false);
    head.position.set(x + 0.18, 4.42, z);
    root.add(pole, head);
  }

  // Merge static geometry per asset (and for the context buildings) to cut draw calls.
  for (const a of Object.values(assets)) mergeStatic(a.group);
  mergeStatic(root);

  return { root, assets, pumps, pretreatWater, productWater, windows, lamps, proxies };
}
