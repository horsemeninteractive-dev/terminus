import * as THREE from 'three';

export interface CelestialLightingData {
  sunDirection: THREE.Vector3;
  moonDirection: THREE.Vector3;
  sunColor: THREE.Color;
  moonColor: THREE.Color;
  sunIntensity: number;
  moonIntensity: number;
  skyTopColor: THREE.Color;
  skyHorizonColor: THREE.Color;
  ambientColor: THREE.Color;
  ambientIntensity: number;
  hemiSkyColor: THREE.Color;
  hemiGroundColor: THREE.Color;
  hemiIntensity: number;
  fogColor: THREE.Color;
  fogDensity: number;
  isNight: boolean;
  clockHour: number;
}

export class SkyAtmosphere {
  public group = new THREE.Group();

  private skyMesh: THREE.Mesh;
  private skyMaterial: THREE.ShaderMaterial;
  private starsPoints: THREE.Points;
  private sunSprite: THREE.Sprite;
  private moonSprite: THREE.Sprite;

  private scratchSunDir = new THREE.Vector3();
  private scratchMoonDir = new THREE.Vector3();

  constructor() {
    this.group.name = 'SkyAtmosphereGroup';

    // 1. Procedural High-Dynamic-Range Atmospheric Sky Dome
    const skyGeo = new THREE.SphereGeometry(6500, 32, 24);
    this.skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uSunColor: { value: new THREE.Color(0xfff3df) },
        uMoonColor: { value: new THREE.Color(0xa5c4e8) },
        uSkyTop: { value: new THREE.Color(0x31516e) },
        uSkyHorizon: { value: new THREE.Color(0xa8bcc9) },
        uSunElevation: { value: 0.8 },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec3 vViewDir;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vViewDir = normalize(worldPosition.xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        uniform vec3 uMoonDir;
        uniform vec3 uSunColor;
        uniform vec3 uMoonColor;
        uniform vec3 uSkyTop;
        uniform vec3 uSkyHorizon;
        uniform float uSunElevation;
        uniform float uTime;

        varying vec3 vWorldPosition;
        varying vec3 vViewDir;

        void main() {
          vec3 dir = normalize(vWorldPosition);
          float height = dir.y;

          // Atmospheric gradient from horizon to zenith
          float h = clamp(height + 0.05, 0.0, 1.0);
          float grad = pow(h, 0.65);
          vec3 sky = mix(uSkyHorizon, uSkyTop, grad);

          // Sunlight atmospheric forward scattering glow
          float sunCos = dot(dir, normalize(uSunDir));
          if (uSunDir.y > -0.2) {
            float sunGlow = max(0.0, sunCos);
            float sunHalo = pow(sunGlow, 12.0) * 0.45;
            float sunCore = pow(max(0.0, sunCos), 90.0) * 0.95;
            
            // Sunset / sunrise warm glow boost
            float sunsetFactor = clamp(1.0 - abs(uSunDir.y) * 2.5, 0.0, 1.0);
            vec3 glowColor = mix(uSunColor, vec3(1.0, 0.45, 0.15), sunsetFactor * 0.7);
            sky += glowColor * (sunHalo + sunCore);
          }

          // Moon atmospheric forward scattering glow
          float moonCos = dot(dir, normalize(uMoonDir));
          if (uMoonDir.y > -0.1) {
            float moonGlow = max(0.0, moonCos);
            float moonHalo = pow(moonGlow, 20.0) * 0.25;
            sky += uMoonColor * moonHalo;
          }

          // Ground fog blend near and below true horizon
          if (height < 0.0) {
            float groundBlend = clamp(-height * 12.0, 0.0, 1.0);
            sky = mix(sky, uSkyHorizon * 0.85, groundBlend);
          }

          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    });

    this.skyMesh = new THREE.Mesh(skyGeo, this.skyMaterial);
    this.skyMesh.name = 'SkyAtmosphereDome';
    this.group.add(this.skyMesh);

    // 2. Starfield with twinkle
    this.starsPoints = this.createStarfield(1200, 1750);
    this.group.add(this.starsPoints);

    // 3. Sun and Moon Sprites
    this.sunSprite = this.createSunSprite();
    this.group.add(this.sunSprite);

    this.moonSprite = this.createMoonSprite();
    this.group.add(this.moonSprite);
  }

  private createStarfield(count: number, radius: number): THREE.Points {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const opacities = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Upper hemisphere predominantly
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);

      const r = radius * (0.95 + Math.random() * 0.05);
      const sinPhi = Math.sin(phi);
      let x = r * sinPhi * Math.cos(theta);
      let y = Math.abs(r * Math.cos(phi)) + 20; // keep above horizon
      let z = r * sinPhi * Math.sin(theta);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      sizes[i] = Math.random() * 2.5 + 1.2;
      opacities[i] = Math.random() * 0.8 + 0.2;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('starOpacity', new THREE.BufferAttribute(opacities, 1));

    // Star point shader with twinkle
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uNightAlpha: { value: 0.0 },
        uTime: { value: 0.0 },
      },
      vertexShader: `
        attribute float size;
        attribute float starOpacity;
        varying float vAlpha;
        uniform float uNightAlpha;
        uniform float uTime;
        void main() {
          float twinkle = sin(uTime * 2.0 + position.x * 0.05 + position.z * 0.05) * 0.3 + 0.7;
          vAlpha = starOpacity * uNightAlpha * twinkle;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (1200.0 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          vec2 coord = gl_PointCoord - vec2(0.5);
          float d = length(coord);
          if (d > 0.5) discard;
          float circle = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vec3(0.9, 0.95, 1.0), vAlpha * circle);
        }
      `,
    });

    const points = new THREE.Points(geo, mat);
    points.name = 'Starfield';
    return points;
  }

  private createSunSprite(): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Corona & Sun disk
    const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 120);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.12, 'rgba(255, 250, 220, 0.95)');
    grad.addColorStop(0.3, 'rgba(255, 200, 110, 0.6)');
    grad.addColorStop(0.6, 'rgba(255, 140, 50, 0.2)');
    grad.addColorStop(1.0, 'rgba(255, 100, 30, 0.0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(128, 128, 120, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(160, 160, 1);
    sprite.name = 'SunSprite';
    return sprite;
  }

  private createMoonSprite(): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Moon body with soft outer glow and crescent shading
    const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 110);
    grad.addColorStop(0.0, 'rgba(240, 246, 255, 1.0)');
    grad.addColorStop(0.25, 'rgba(210, 230, 255, 0.85)');
    grad.addColorStop(0.45, 'rgba(160, 195, 240, 0.4)');
    grad.addColorStop(0.75, 'rgba(120, 165, 220, 0.12)');
    grad.addColorStop(1.0, 'rgba(90, 140, 200, 0.0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(128, 128, 110, 0, Math.PI * 2);
    ctx.fill();

    // Subtle moon craters
    ctx.fillStyle = 'rgba(180, 200, 225, 0.35)';
    ctx.beginPath();
    ctx.arc(115, 110, 14, 0, Math.PI * 2);
    ctx.arc(140, 135, 18, 0, Math.PI * 2);
    ctx.arc(122, 148, 11, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(120, 120, 1);
    sprite.name = 'MoonSprite';
    return sprite;
  }

  /**
   * Update celestial positions, sky dome shaders, starfield intensity, and sun/moon flare
   */
  public update(hour: number, cameraPosition: THREE.Vector3, timeElapsed: number) {
    const h = ((hour % 24) + 24) % 24;

    // Follow camera so sky dome and celestial bodies remain infinitely far
    this.group.position.copy(cameraPosition);

    // Sun trajectory: rises East (hour 6), zenith (hour 12-13), sets West (hour 19)
    // Elevation angle: -90 deg at midnight (0h), 0 deg at 6h, +70 deg at 12.5h, 0 deg at 19h
    const sunProgress = (h - 6) / 24; // 0 at dawn, 0.25 at noon, 0.54 at dusk
    const sunAngle = sunProgress * Math.PI * 2;

    const sunElevAngle = Math.sin((h - 6) * (Math.PI / 13)); // > 0 during daytime (6h - 19h)
    const sunElevation = Math.max(-0.35, Math.min(1.0, sunElevAngle));

    const sunDist = 1500;
    const sunAzimuth = (h - 12) * 0.26; // radians east to west
    const sunX = Math.sin(sunAzimuth) * sunDist * Math.cos(Math.max(-0.2, sunElevation));
    const sunY = Math.sin(sunElevation) * sunDist;
    const sunZ = -Math.cos(sunAzimuth) * sunDist * Math.cos(Math.max(-0.2, sunElevation));

    this.scratchSunDir.set(sunX, sunY, sunZ).normalize();

    // Moon trajectory: opposite to sun
    const moonDist = 1450;
    const moonElevation = -sunElevation;
    const moonX = -sunX;
    const moonY = Math.sin(Math.max(-0.35, moonElevation)) * moonDist;
    const moonZ = -sunZ;

    this.scratchMoonDir.set(moonX, moonY, moonZ).normalize();

    // Position sun and moon sprites relative to sky center
    this.sunSprite.position.set(sunX, Math.max(-200, sunY), sunZ);
    this.moonSprite.position.set(moonX, Math.max(-200, moonY), moonZ);

    // Fade celestial sprites when below horizon
    const sunVis = Math.max(0, Math.min(1.0, (sunY + 100) / 250));
    this.sunSprite.material.opacity = sunVis;
    this.sunSprite.visible = sunVis > 0.01;

    const moonVis = Math.max(0, Math.min(1.0, (moonY + 80) / 220));
    this.moonSprite.material.opacity = moonVis * 0.9;
    this.moonSprite.visible = moonVis > 0.01;

    // Starfield visibility (fade in when sun drops below horizon)
    const nightFactor = Math.max(0, Math.min(1.0, (-sunY + 80) / 260));
    const starMat = this.starsPoints.material as THREE.ShaderMaterial;
    starMat.uniforms.uNightAlpha.value = nightFactor;
    starMat.uniforms.uTime.value = timeElapsed;

    // Update sky dome shader uniforms
    this.skyMaterial.uniforms.uSunDir.value.copy(this.scratchSunDir);
    this.skyMaterial.uniforms.uMoonDir.value.copy(this.scratchMoonDir);
    this.skyMaterial.uniforms.uSunElevation.value = sunElevation;
    this.skyMaterial.uniforms.uTime.value = timeElapsed;
  }

  public setSkyColors(top: THREE.Color, horizon: THREE.Color, sunColor: THREE.Color, moonColor: THREE.Color) {
    this.skyMaterial.uniforms.uSkyTop.value.copy(top);
    this.skyMaterial.uniforms.uSkyHorizon.value.copy(horizon);
    this.skyMaterial.uniforms.uSunColor.value.copy(sunColor);
    this.skyMaterial.uniforms.uMoonColor.value.copy(moonColor);
  }

  public dispose() {
    this.skyMesh.geometry.dispose();
    this.skyMaterial.dispose();
    this.starsPoints.geometry.dispose();
    (this.starsPoints.material as THREE.Material).dispose();
    (this.sunSprite.material as THREE.Material).dispose();
    (this.moonSprite.material as THREE.Material).dispose();
  }
}
