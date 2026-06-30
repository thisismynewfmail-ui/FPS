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
    // Sky dome (ignores fog). Fragment shader paints a gradient, a sun/moon
    // disc + glow, drifting procedural clouds and faint night stars. TimeOfDay
    // drives the colour/sun/day-amount uniforms; `time` animates the clouds.
    const geo = new THREE.SphereGeometry(WORLD.FOG_FAR + 30, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, fog: false, depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(WORLD.SKY_TOP) },
        bottom: { value: new THREE.Color(WORLD.SKY_BOTTOM) },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunColor: { value: new THREE.Color(0xffe6b0) },
        dayAmount: { value: 1.0 },
        time: { value: 0.0 },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);}`,
      fragmentShader: `
        varying vec3 vP;
        uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor;
        uniform float dayAmount; uniform float time;

        float hash(vec2 p){ p = fract(p*vec2(123.34,345.45)); p += dot(p,p+34.345); return fract(p.x*p.y); }
        float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
          return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
        float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*vnoise(p); p*=2.0; a*=0.5; } return v; }

        void main(){
          vec3 dir = normalize(vP);
          float h = clamp(dir.y*0.5+0.5, 0.0, 1.0);
          vec3 col = mix(bottom, top, pow(h, 0.9));

          // --- sun (day) ---
          float sd = max(dot(dir, sunDir), 0.0);
          float disc = smoothstep(0.9975, 0.9990, sd);
          float glow = pow(sd, 220.0)*0.7 + pow(sd, 18.0)*0.18;
          col += sunColor * (disc*1.3 + glow) * dayAmount;

          // --- moon (night): mirror of the sun, lifted above the horizon ---
          vec3 moonDir = normalize(vec3(-sunDir.x, abs(sunDir.y)*0.5+0.45, -sunDir.z));
          float md = max(dot(dir, moonDir), 0.0);
          float moon = smoothstep(0.9985, 0.9994, md) + pow(md, 60.0)*0.15;
          col += vec3(0.8,0.85,1.0) * moon * (1.0-dayAmount) * 0.8;

          // --- stars (night, upper sky) ---
          if(dir.y > 0.08){
            float s = hash(floor(dir.xz*150.0));
            col += vec3(step(0.9965, s)) * (1.0-dayAmount) * smoothstep(0.08,0.3,dir.y);
          }

          // --- drifting clouds (above horizon, sparse) ---
          if(dir.y > 0.015){
            vec2 uv = dir.xz / (dir.y + 0.18);
            uv = uv*1.4 + vec2(time*0.012, time*0.007);
            float n = fbm(uv);
            n = fbm(uv + n*0.6);                         // domain warp -> puffier shapes
            float cov = smoothstep(0.58, 0.92, n);       // sparse coverage
            cov *= smoothstep(0.015, 0.22, dir.y);       // fade into the horizon
            vec3 cloudCol = mix(vec3(0.18,0.20,0.26), vec3(0.97,0.98,1.0), dayAmount);
            cloudCol *= 0.75 + 0.25*sd*dayAmount;         // sun-side highlight
            col = mix(col, cloudCol, cov*0.9);
          }

          gl_FragColor = vec4(col, 1.0);
        }`,
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
