// Splash particles and paint splats.
import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

const MAX_DECALS = 250;
const particleGeo = new THREE.SphereGeometry(1, 6, 4);
const decalGeo = new THREE.CircleGeometry(1, 14);

export class Effects {
  private particles: Particle[] = [];
  private decals: THREE.Mesh[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  splash(at: THREE.Vector3, color: number, count = 10, power = 4, size = 0.08) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(particleGeo, mat);
      mesh.scale.setScalar(size * (0.6 + Math.random() * 0.8));
      mesh.position.copy(at);
      const vel = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(power * (0.5 + Math.random()));
      const life = 0.4 + Math.random() * 0.4;
      this.particles.push({ mesh, vel, life, maxLife: life });
      this.scene.add(mesh);
    }
  }

  /** Flat paint splat stuck to a surface with the given normal. */
  paint(at: THREE.Vector3, normal: THREE.Vector3, color: number, radius = 0.5) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4,
    });
    const decal = new THREE.Mesh(decalGeo, mat);
    decal.scale.setScalar(radius * (0.7 + Math.random() * 0.6));
    decal.position.copy(at).addScaledVector(normal, 0.02);
    decal.lookAt(at.clone().add(normal));
    decal.rotateZ(Math.random() * Math.PI * 2);
    this.scene.add(decal);
    this.decals.push(decal);
    if (this.decals.length > MAX_DECALS) {
      const old = this.decals.shift()!;
      this.scene.remove(old);
      (old.material as THREE.Material).dispose();
    }
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= 15 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.02) {
        p.mesh.position.y = 0.02;
        p.vel.set(0, 0, 0);
      }
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = p.life / p.maxLife;
    }
  }
}
