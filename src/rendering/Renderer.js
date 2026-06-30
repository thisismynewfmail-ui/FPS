import * as THREE from 'three';
import { WORLD, PLAYER } from '../config/constants.js';

// Owns the WebGL renderer, scene, camera, fog, sky and lighting.
// Deliberately keeps zero gameplay state — systems push meshes into `scene`.
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,          // crunchy retro edges
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = true;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(WORLD.FOG_COLOR, WORLD.FOG_NEAR, WORLD.FOG_FAR);

    this.baseFOV = PLAYER.FOV;
    this.camera = new THREE.PerspectiveCamera(
      this.baseFOV, window.innerWidth / window.innerHeight, 0.08, WORLD.FOG_FAR + 40);
    this.camera.rotation.order = 'YXZ';   // yaw then pitch — no roll

    this._buildSky();
    this._buildLights();

    window.addEventListener('resize', () => this.onResize());
  }

  _buildSky() {
    // Gradient dome that sits just inside the far plane and ignores fog.
    const geo = new THREE.SphereGeometry(WORLD.FOG_FAR + 30, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, fog: false, depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(WORLD.SKY_TOP) },
        bottom: { value: new THREE.Color(WORLD.SKY_BOTTOM) },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);}`,
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 bottom;
        void main(){ float h = clamp((normalize(vP).y*0.5+0.5),0.0,1.0); gl_FragColor = vec4(mix(bottom, top, h),1.0);} `,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
  }

  _buildLights() {
    // References kept so the day/night cycle (TimeOfDay) can drive them.
    this.hemi = new THREE.HemisphereLight(0xa6bad6, 0x322c24, 0.98);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffe0b0, 0.85);
    this.sun.position.set(-60, 80, 40);
    this.scene.add(this.sun);

    this.ambient = new THREE.AmbientLight(0x49525f, 0.5);
    this.scene.add(this.ambient);
  }

  // exposed for TimeOfDay
  get skyUniforms() { return this.sky.material.uniforms; }

  setFOV(fov) {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  render() {
    // keep sky centred on camera so it never clips
    this.sky.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }
}
