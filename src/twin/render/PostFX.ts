/**
 * Restrained post-processing stack (WebGL2):
 *   Render (MSAA 4×, half-float HDR) → GTAO (contact shadows / depth)
 *   → Bloom (only bright emissive indicators exceed the threshold)
 *   → Depth of field (intro only) → Output (ACES tone map, sRGB)
 *   → Grade (near-imperceptible vignette, cool lift, dither against banding)
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

const GradeShader = {
  name: "AquaTwinGrade",
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignette: { value: 0.18 },
    uTime: { value: 0 },
    uFade: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uTime;
    uniform float uFade;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // Cool, slightly lifted shadows for the navy tone of the interface.
      c.rgb = mix(c.rgb, c.rgb * vec3(0.96, 0.99, 1.04) + vec3(0.004, 0.006, 0.011), 0.85);
      vec2 d = vUv - 0.5;
      float vig = 1.0 - uVignette * smoothstep(0.35, 0.95, length(d * vec2(1.25, 1.0)));
      c.rgb *= vig;
      c.rgb += (rand(vUv * 1000.0) - 0.5) / 255.0; // dither
      c.rgb *= uFade;
      gl_FragColor = c;
    }`,
};

export class PostFX {
  composer: EffectComposer;
  gtao: GTAOPass;
  bloom: UnrealBloomPass;
  bokeh: BokehPass;
  grade: ShaderPass;
  private renderPass: RenderPass;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
  ) {
    const rt = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.gtao = new GTAOPass(scene, camera, width, height);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.blendIntensity = 0.85;
    this.gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16, distanceFallOff: 1.0 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 16 });
    // Transparent pipes, water cores and particles must not occlude in the G-buffer.
    const g = this.gtao as unknown as { _overrideVisibility: () => void; _visibilityCache: THREE.Object3D[] };
    const original = g._overrideVisibility.bind(this.gtao);
    g._overrideVisibility = () => {
      original();
      scene.traverse((o) => {
        if (o.userData.noAO && o.visible) {
          o.visible = false;
          g._visibilityCache.push(o);
        }
      });
    };
    this.composer.addPass(this.gtao);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.3, 0.5, 1.25);
    this.composer.addPass(this.bloom);

    this.bokeh = new BokehPass(scene, camera, { focus: 60, aperture: 0.00012, maxblur: 0.006 });
    this.bokeh.enabled = false;
    this.composer.addPass(this.bokeh);

    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.gtao.setSize(w, h);
  }

  render(dt: number, time: number) {
    this.grade.uniforms.uTime.value = time % 100;
    this.composer.render(dt);
  }

  dispose() {
    this.composer.dispose();
    this.gtao.dispose();
    this.bloom.dispose();
  }
}
