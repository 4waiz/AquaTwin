/**
 * Procedural studio environment for image-based lighting and reflections.
 * A dark room with a few large, soft emissive panels — the lighting language
 * of a product/engineering studio rather than an outdoor HDRI. Fully
 * procedural, so there are no licensing questions and every panel can be
 * tuned for the dark interface.
 */
import * as THREE from "three";

export function buildStudioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color("#07090d"), side: THREE.BackSide }));
  room.scale.set(60, 26, 60);
  room.position.y = 9;
  scene.add(room);

  const panel = (w: number, h: number, color: string, intensity: number, pos: [number, number, number], lookAt: [number, number, number]) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.lookAt(...lookAt);
    scene.add(m);
  };

  // Key softbox overhead (slightly forward), cool-neutral.
  panel(26, 14, "#dfe8f5", 3.2, [-4, 21, 6], [0, 0, 0]);
  // Long strip on the left for a crisp specular line on vessels and pipes.
  panel(3, 22, "#e9eef6", 4.5, [-28, 9, -2], [0, 6, 0]);
  // Soft warm-neutral fill from the right.
  panel(14, 10, "#f1e7da", 1.1, [27, 8, 4], [0, 4, 0]);
  // Rim from behind, cooler and dim.
  panel(30, 5, "#a9c3ea", 1.4, [0, 10, -28], [0, 4, 0]);
  // Faint floor bounce.
  panel(40, 40, "#1a2230", 0.6, [0, -3.5, 0], [0, 10, 0]);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.035);
  pmrem.dispose();
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      (o as THREE.Mesh).geometry.dispose();
      ((o as THREE.Mesh).material as THREE.Material).dispose();
    }
  });
  return rt.texture;
}
