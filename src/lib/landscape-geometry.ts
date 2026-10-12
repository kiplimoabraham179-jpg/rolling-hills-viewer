import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function seededRandom(seed = 42) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function heightAt(x: number, z: number) {
  const hill = 8 * Math.exp(-(x * x / 850 + z * z / 1000));
  const rolls = 3.2 * Math.sin(x * .047 + .4) * Math.cos(z * .052) + 1.2 * Math.sin(z * .11 + x * .025);
  const valley = -9 * Math.exp(-((z + 42) ** 2 / 450)) * Math.exp(-(x * x / 900));
  return hill + rolls + valley - 3;
}

export function makeTerrain(grass: THREE.Color, light: THREE.Color, forest: THREE.Color) {
  const geometry = new THREE.PlaneGeometry(300, 300, 150, 150);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    positions.setY(i, heightAt(x, z));
    const distance = Math.hypot(x, z);
    color.copy(grass).lerp(light, .22 + .18 * Math.sin(x * .13 + z * .05));
    color.lerp(forest, THREE.MathUtils.smoothstep(distance, 28, 100) * .7);
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function makeMountains(radius: number, height: number, seed: number) {
  const random = seededRandom(seed);
  const segments = 160, rows = 9;
  const peaks = Array.from({ length: segments + 1 }, (_, i) => height * (.68 + .18 * Math.sin(i * .3) + .13 * Math.sin(i * .93) + random() * .16));
  peaks[segments] = peaks[0];
  const vertices: number[] = [], indices: number[] = [];
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI * 2;
      const r = radius + (t - .5) * 65;
      const y = -13 + peaks[i] * Math.sin(t * Math.PI) ** .85 + 2 * Math.sin(a * 17 + t * 12) * Math.sin(t * Math.PI);
      vertices.push(Math.sin(a) * r, y, Math.cos(a) * r);
      if (row < rows && i < segments) {
        const v = row * (segments + 1) + i;
        indices.push(v, v + 1, v + segments + 1, v + 1, v + segments + 2, v + segments + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function makeTree() {
  const random = seededRandom(317);
  const branches: THREE.BufferGeometry[] = [];
  const leaves: { position: THREE.Vector3; scale: THREE.Vector3; rotation: THREE.Euler; tint: number }[] = [];
  function branch(a: THREE.Vector3, b: THREE.Vector3, bottom: number, top: number) {
    const dir = b.clone().sub(a);
    const geo = new THREE.CylinderGeometry(top, bottom, dir.length(), 7, 3);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
    geo.translate(...a.clone().add(b).multiplyScalar(.5).toArray());
    branches.push(geo);
  }
  function foliage(center: THREE.Vector3, size: number) {
    for (let i = 0; i < 55; i++) {
      const a = random() * Math.PI * 2, cos = random() * 2 - 1;
      const r = Math.cbrt(random()) * size;
      const sin = Math.sqrt(1 - cos * cos);
      const s = .13 + random() * .15;
      leaves.push({
        position: center.clone().add(new THREE.Vector3(Math.cos(a) * sin * r, cos * r * .65, Math.sin(a) * sin * r)),
        scale: new THREE.Vector3(s * 1.6, s * .55, s),
        rotation: new THREE.Euler(random() * 3, random() * 6, random() * 3), tint: random(),
      });
    }
  }
  const base = new THREE.Vector3(0, 0, 0), fork = new THREE.Vector3(.25, 4.3, .1);
  branch(base, fork, .65, .36);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2;
    const end = new THREE.Vector3(Math.cos(a) * 3.7, 7.8 + random() * 1.2, Math.sin(a) * 3.4);
    branch(fork, end, .29, .13);
    for (let j = 0; j < 4; j++) {
      const angle = a + (j - 1.5) * .42;
      const radius = 4.8 + random() * 1.3;
      const tip = new THREE.Vector3(Math.cos(angle) * radius, 9.2 + random() * 1.4, Math.sin(angle) * radius * .82);
      branch(end, tip, .13, .045);
      foliage(tip, .95);
      for (let k = 0; k < 3; k++) {
        const twig = tip.clone().add(new THREE.Vector3((random() - .5) * 1.6, .3 + random() * 1.25, (random() - .5) * 1.5));
        branch(tip, twig, .045, .014);
        foliage(twig, .85);
      }
    }
  }
  for (let i = 0; i < 35; i++) {
    const a = random() * Math.PI * 2, r = random() * 3.9;
    const tip = new THREE.Vector3(Math.cos(a) * r, 11.3 + .6 * (1 - r / 4) + random() * .8, Math.sin(a) * r);
    branch(fork, tip, .08, .015);
    foliage(tip, 1.1);
  }
  const geometry = mergeGeometries(branches);
  branches.forEach(g => g.dispose());
  return { geometry, leaves };
}

export function makeGrassTexture() {
  const random = seededRandom(78), size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const value = 185 + random() * 65;
    data.set([value, value, value, 255], i * 4);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(120, 120);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}