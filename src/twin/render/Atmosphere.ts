/**
 * Atmosphere: sky, image-based lighting and aerial perspective for a
 * late-afternoon Gulf coast. Everything is procedural:
 *
 *  - Sky: the Preetham analytic daylight model (three/addons Sky, with its
 *    procedural clouds), scaled to the sun's intensity, rendered once into an
 *    HDR cube map that serves as the background and as the sea's reflection
 *    source when planar reflections are off.
 *  - IBL: a PMREM of the same sky without the sun disc, above a sunlit-sand
 *    ground hemisphere, so faces in shadow receive blue sky light from above
 *    and warm bounce light from below.
 *  - Fog: exponential aerial perspective. Its colour is read back from the
 *    sky's horizon and warms toward the sun (ShaderChunk override, so every
 *    built-in material fades into exactly the sky behind it).
 */
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";

/** Sun position: low late-afternoon sun from the left of the default views. */
export const SUN = {
  azimuth: -1.42,
  elevation: THREE.MathUtils.degToRad(23),
};

export const SUN_DIR = new THREE.Vector3(
  Math.cos(SUN.elevation) * Math.sin(SUN.azimuth),
  Math.sin(SUN.elevation),
  Math.cos(SUN.elevation) * Math.cos(SUN.azimuth),
).normalize();

/** Direct sunlight colour (warm, low sun through a long, hazy air path). */
export const SUN_COLOR = new THREE.Color(1.0, 0.82, 0.64);

const SKY_SCALE = 0.075;
const SUN_DISC_CLAMP = 60;
/** Fog density for THREE.FogExp2 (aerial perspective at plant scale ≈ metres). */
export const FOG_DENSITY = 0.00105;

function makeSky(showSun: boolean, clouds: boolean) {
  const sky = new Sky();
  sky.scale.setScalar(1500);
  const u = sky.material.uniforms;
  u.turbidity.value = 3.2;
  u.rayleigh.value = 1.35;
  u.mieCoefficient.value = 0.0052;
  u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.copy(SUN_DIR).multiplyScalar(450000);
  u.showSunDisc.value = showSun ? 1 : 0;
  u.cloudCoverage.value = clouds ? 0.32 : 0;
  u.cloudDensity.value = 0.32;
  u.cloudElevation.value = 0.62;
  u.cloudScale.value = 0.00021;
  u.time.value = 37;
  // Scale the sky to the sun's intensity and keep the sun disc within half-float range.
  u.skyScale = { value: SKY_SCALE };
  u.sunClamp = { value: SUN_DISC_CLAMP };
  sky.material.fragmentShader = sky.material.fragmentShader
    .replace("uniform float time;", "uniform float time;\nuniform float skyScale;\nuniform float sunClamp;")
    .replace("gl_FragColor = vec4( texColor, 1.0 );", "gl_FragColor = vec4( min( texColor * skyScale, vec3( sunClamp ) ), 1.0 );");
  sky.material.needsUpdate = true;
  return sky;
}

/** Installs aerial-perspective fog (sun-aware colour) into every built-in material. */
function installFogChunks(sunTint: THREE.Color) {
  const C = THREE.ShaderChunk as Record<string, string>;
  if (C.fog_fragment.includes("AQUATWIN_FOG")) return;
  const v3 = (c: THREE.Vector3 | THREE.Color) => {
    const a = c instanceof THREE.Color ? [c.r, c.g, c.b] : [c.x, c.y, c.z];
    return `vec3(${a.map((x) => x.toFixed(5)).join(", ")})`;
  };
  C.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogRay;
#endif`;
  C.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogRay = ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;
#endif`;
  C.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogRay;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  vec3 aquaFogColor( vec3 dir ) {
    float s = pow( max( dot( dir, ${v3(SUN_DIR)} ), 0.0 ), 5.0 );
    return fogColor * mix( vec3( 1.0 ), ${v3(sunTint)}, s );
  }
#endif`;
  C.fog_fragment = `#ifdef USE_FOG
  // AQUATWIN_FOG: aerial perspective, slightly denser close to the sea.
  float fogDist = length( vFogRay );
  vec3 fogDir = vFogRay / max( fogDist, 1e-4 );
  #ifdef FOG_EXP2
    float fogH = mix( 1.25, 0.8, clamp( ( cameraPosition.y + vFogRay.y * 0.5 ) / 60.0, 0.0, 1.0 ) );
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * fogDist * fogDist * fogH );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, aquaFogColor( fogDir ), fogFactor );
#endif`;
}

/** Shared sun/fog GLSL for custom shader materials (sea, terrain). */
export function fogGlsl(sunTint: THREE.Color) {
  const v3 = (c: THREE.Vector3 | THREE.Color) => {
    const a = c instanceof THREE.Color ? [c.r, c.g, c.b] : [c.x, c.y, c.z];
    return `vec3(${a.map((x) => x.toFixed(5)).join(", ")})`;
  };
  return `
  vec3 aquaFog( vec3 col, vec3 worldPos, vec3 fogCol, float density ) {
    vec3 ray = worldPos - cameraPosition;
    float d = length( ray );
    vec3 dir = ray / max( d, 1e-4 );
    float s = pow( max( dot( dir, ${v3(SUN_DIR)} ), 0.0 ), 5.0 );
    vec3 fc = fogCol * mix( vec3( 1.0 ), ${v3(sunTint)}, s );
    float h = mix( 1.25, 0.8, clamp( ( cameraPosition.y + ray.y * 0.5 ) / 60.0, 0.0, 1.0 ) );
    float f = 1.0 - exp( - density * density * d * d * h );
    return mix( col, fc, f );
  }`;
}

export class Atmosphere {
  /** HDR sky cube (background, sea reflection fallback). */
  readonly skyCube: THREE.WebGLCubeRenderTarget;
  /** Prefiltered environment for PBR materials. */
  readonly environment: THREE.Texture;
  private envTarget: THREE.WebGLRenderTarget;
  /** Average horizon colour (fog). */
  readonly fogColor = new THREE.Color(0.55, 0.62, 0.72);
  /** Horizon colour toward the sun relative to the average. */
  readonly sunTint = new THREE.Color(1.6, 1.3, 1.0);
  /** Radiance of the sunlit ground used for the lower IBL hemisphere. */
  readonly groundColor = new THREE.Color(0.2, 0.165, 0.125);

  constructor(renderer: THREE.WebGLRenderer) {
    // Horizon colours for fog: render a small cube without clouds or sun and read the horizon row.
    this.readHorizon(renderer);
    installFogChunks(this.sunTint);

    // Background: full sky with clouds and the sun disc.
    const bgScene = new THREE.Scene();
    const bgSky = makeSky(true, true);
    bgScene.add(bgSky);
    this.skyCube = new THREE.WebGLCubeRenderTarget(512, {
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    new THREE.CubeCamera(1, 4000, this.skyCube).update(renderer, bgScene);

    // Environment: sky without the sun disc (the directional light carries the sun) over sunlit ground.
    const envScene = new THREE.Scene();
    const envSky = makeSky(false, true);
    envScene.add(envSky);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(400, 48),
      new THREE.MeshBasicMaterial({ color: this.groundColor, side: THREE.DoubleSide, fog: false }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2.5;
    envScene.add(ground);
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envTarget = pmrem.fromScene(envScene, 0, 0.1, 4000, { size: 256 });
    this.environment = this.envTarget.texture;
    pmrem.dispose();

    for (const s of [bgSky, envSky]) {
      s.geometry.dispose();
      s.material.dispose();
    }
    ground.geometry.dispose();
    (ground.material as THREE.Material).dispose();
  }

  private readHorizon(renderer: THREE.WebGLRenderer) {
    const size = 32;
    const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.FloatType });
    const scene = new THREE.Scene();
    const sky = makeSky(false, false);
    scene.add(sky);
    try {
      new THREE.CubeCamera(1, 4000, rt).update(renderer, scene);
      const buf = new Float32Array(size * 4);
      const mean = new THREE.Vector3();
      let n = 0;
      let best = -1;
      const bright = new THREE.Vector3();
      for (const face of [0, 1, 4, 5]) {
        renderer.readRenderTargetPixels(rt, 0, size / 2, size, 1, buf, face);
        for (let i = 0; i < size; i++) {
          const r = buf[i * 4];
          const g = buf[i * 4 + 1];
          const b = buf[i * 4 + 2];
          if (!Number.isFinite(r + g + b)) continue;
          mean.x += r;
          mean.y += g;
          mean.z += b;
          n++;
          const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          if (l > best) {
            best = l;
            bright.set(r, g, b);
          }
        }
      }
      if (n > 0 && mean.lengthSq() > 0) {
        mean.multiplyScalar(1 / n);
        this.fogColor.setRGB(mean.x, mean.y, mean.z);
        this.sunTint.setRGB(
          Math.min(4, bright.x / Math.max(mean.x, 1e-4)),
          Math.min(4, bright.y / Math.max(mean.y, 1e-4)),
          Math.min(4, bright.z / Math.max(mean.z, 1e-4)),
        );
        // Ground bounce: sunlit sand (albedo ≈ 0.42) under sun + sky.
        const irr = SUN_COLOR.clone().multiplyScalar(3.0 * Math.sin(SUN.elevation)).add(this.fogColor.clone().multiplyScalar(Math.PI * 0.55));
        this.groundColor.setRGB(0.46, 0.39, 0.3).multiply(irr).multiplyScalar(1 / Math.PI);
      }
    } catch {
      /* keep defaults (float render targets unavailable) */
    }
    rt.dispose();
    sky.geometry.dispose();
    sky.material.dispose();
  }

  dispose() {
    this.skyCube.dispose();
    this.envTarget.dispose();
  }
}
