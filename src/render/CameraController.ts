import * as THREE from 'three';
import { Point2D } from '../types/map';

export interface CameraState {
  target: THREE.Vector3;
  distance: number;
  yaw: number; // horizontal orbit in radians
  pitch: number; // vertical angle in radians (e.g. Math.PI / 4)
}

export class CameraController {
  public camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;

  // Current smooth state
  public target = new THREE.Vector3(0, 0, 0);
  public distance = 180;
  public yaw = Math.PI / 6; // 30 deg isometric angle
  public pitch = Math.PI / 3.4; // ~53 deg angled down

  // Target values for lerp smoothing
  private targetGoal = new THREE.Vector3(0, 0, 0);
  private distanceGoal = 180;
  private yawGoal = Math.PI / 6;
  private pitchGoal = Math.PI / 3.4;

  // Limits
  private minDistance = 25;
  // Capped well below the old 8500: past ~5-6 km the exponential fog washes
  // the map to flat white anyway, and extreme altitudes put the camera above
  // the cloud deck which wrecks the weather visuals. WeatherFX additionally
  // keeps the cloud canopy above the camera at any distance.
  private maxDistance = 6500;
  // ~6 deg: low enough for near street-level perspective shots (camera eye
  // lands a couple of meters above the target ground at minimum distance).
  private minPitch = Math.PI / 30;
  private maxPitch = Math.PI / 2.01; // ~89.7 deg (top-down 2D map)
  private maxPanRadius = 5500; // Broad pan range for full 8km exploration
  public isExpeditionView = false;
  public onZoomThreshold?: (isZoomedOut: boolean) => void;
  private lastZoomThresholdState = false;

  // Input tracking
  private isDraggingPan = false;
  private isDraggingOrbit = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private keysDown = new Set<string>();

  // Multi-touch tracking
  private activePointers = new Map<number, { x: number; y: number }>();
  private lastPinchDist = 0;
  private lastPinchAngle = 0;
  private lastPinchMidX = 0;
  private lastPinchMidY = 0;

  // Pan inertia velocity
  private panVelocity = new THREE.Vector3(0, 0, 0);
  private lastPanDeltaTime = 0;
  private lastTapTime = 0;
  private lastTapPos = { x: 0, y: 0 };

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;

    // Ensure CSS touch-action is none to avoid mobile browser gesture interception
    this.domElement.style.touchAction = 'none';

    this.bindEvents();
    this.updateCameraPosition(true);
  }

  private bindEvents() {
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    this.domElement.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove, { passive: false });
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    this.domElement.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  public dispose() {
    this.domElement.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.domElement.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  // While a freestanding blue-print placement gesture is capturing the drag
  // (wall run / tower rotate), the camera must not pan or orbit with it.
  public placementActive = false;

  private onPointerDown = (e: PointerEvent) => {
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Stop existing pan inertia on new touch/click
    this.panVelocity.set(0, 0, 0);

    // A placement gesture owns the drag: don't start any camera pan/orbit.
    if (this.placementActive) return;

    if (this.activePointers.size === 1) {
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      if (e.pointerType === 'touch') {
        // Single finger touch is always pan
        this.isDraggingPan = true;
        this.isDraggingOrbit = false;

        // Check for double tap to focus/zoom in
        const now = performance.now();
        const distFromLastTap = Math.hypot(e.clientX - this.lastTapPos.x, e.clientY - this.lastTapPos.y);
        if (now - this.lastTapTime < 320 && distFromLastTap < 30) {
          // Double tap action: zoom in 35%
          this.zoom('in', 0.65);
          this.lastTapTime = 0;
        } else {
          this.lastTapTime = now;
          this.lastTapPos = { x: e.clientX, y: e.clientY };
        }
      } else if (e.button === 2 || e.button === 1 || e.altKey || e.ctrlKey || e.shiftKey) {
        // Orbit drag (elevation and rotation) with right click, middle mouse, or modifier key
        this.isDraggingOrbit = true;
        this.isDraggingPan = false;
      } else if (e.button === 0) {
        // Left click pan
        this.isDraggingPan = true;
        this.isDraggingOrbit = false;
      }
    } else if (this.activePointers.size === 2) {
      // Pinch zoom / 2-finger touch
      this.isDraggingPan = false;
      this.isDraggingOrbit = false;
      const pts = Array.from(this.activePointers.values());
      this.lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      this.lastPinchAngle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      this.lastPinchMidX = (pts[0].x + pts[1].x) / 2;
      this.lastPinchMidY = (pts[0].y + pts[1].y) / 2;
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.activePointers.has(e.pointerId)) return;
    // A placement gesture owns the drag; don't pan/orbit even if we captured the
    // initial pointerdown before the placement flag was flipped on.
    if (this.placementActive) return;
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Handle Two-Finger Pinch, Twist & Pan Gesture
    if (this.activePointers.size === 2) {
      const pts = Array.from(this.activePointers.values());
      const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const currentAngle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      const currentMidX = (pts[0].x + pts[1].x) / 2;
      const currentMidY = (pts[0].y + pts[1].y) / 2;

      // 1. Pinch to Zoom
      if (this.lastPinchDist > 0 && currentDist > 0) {
        const deltaDist = currentDist - this.lastPinchDist;
        // Sensitivity based on current zoom distance
        const zoomSensitivity = this.distanceGoal * 0.0035;
        this.distanceGoal = THREE.MathUtils.clamp(
          this.distanceGoal - deltaDist * zoomSensitivity,
          this.minDistance,
          this.maxDistance
        );
      }

      // 2. Twist to Orbit/Rotate Yaw (if fingers twisted more than slight threshold)
      if (this.lastPinchAngle !== 0) {
        let deltaAngle = currentAngle - this.lastPinchAngle;
        // Normalize angle difference to -PI..PI
        while (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
        while (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;

        if (Math.abs(deltaAngle) > 0.015) {
          this.yawGoal += deltaAngle * 1.1;
        }
      }

      // 3. Two-finger Midpoint Pan
      if (this.lastPinchMidX > 0 && this.lastPinchMidY > 0) {
        const deltaMidX = currentMidX - this.lastPinchMidX;
        const deltaMidY = currentMidY - this.lastPinchMidY;

        if (Math.hypot(deltaMidX, deltaMidY) > 1.5) {
          const panSpeed = (this.distance / 700) * 1.1;
          const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
          const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

          const move = right.clone().multiplyScalar(-deltaMidX * panSpeed).add(
            forward.clone().multiplyScalar(deltaMidY * panSpeed)
          );

          this.targetGoal.add(move);
          this.clampTargetGoal();
        }
      }

      this.lastPinchDist = currentDist;
      this.lastPinchAngle = currentAngle;
      this.lastPinchMidX = currentMidX;
      this.lastPinchMidY = currentMidY;
      return;
    }

    // Single Pointer Move (Mouse Drag or 1-Finger Touch Pan)
    const deltaX = e.clientX - this.lastMouseX;
    const deltaY = e.clientY - this.lastMouseY;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;

    if (this.isDraggingOrbit) {
      // Orbiting around target
      this.yawGoal -= deltaX * 0.006;
      this.pitchGoal = THREE.MathUtils.clamp(
        this.pitchGoal + deltaY * 0.005,
        this.minPitch,
        this.maxPitch
      );
    } else if (this.isDraggingPan) {
      // Pan across ground plane relative to camera yaw
      const panSpeed = (this.distance / 650) * 1.25;
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

      const move = right.clone().multiplyScalar(-deltaX * panSpeed).add(
        forward.clone().multiplyScalar(deltaY * panSpeed)
      );

      this.targetGoal.add(move);
      this.clampTargetGoal();

      // Track pan velocity for smooth release inertia
      this.panVelocity.copy(move);
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    this.activePointers.delete(e.pointerId);
    if (this.activePointers.size === 0) {
      this.isDraggingPan = false;
      this.isDraggingOrbit = false;
      this.lastPinchDist = 0;
      this.lastPinchAngle = 0;
      this.lastPinchMidX = 0;
      this.lastPinchMidY = 0;
    } else if (this.activePointers.size === 1) {
      // Transitioned from 2-finger to 1-finger: reset lastMouseX/Y to remaining touch
      const remaining = Array.from(this.activePointers.values())[0];
      this.lastMouseX = remaining.x;
      this.lastMouseY = remaining.y;
      this.isDraggingPan = true;
      this.lastPinchDist = 0;
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const zoomDelta = e.deltaY > 0 ? 1.15 : 0.87;
    this.distanceGoal = THREE.MathUtils.clamp(
      this.distanceGoal * zoomDelta,
      this.minDistance,
      this.maxDistance
    );
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    this.keysDown.add(key);

    // Instant actions
    if (key === 'q') {
      this.yawGoal -= Math.PI / 8; // Rotate left 22.5 deg
    } else if (key === 'e') {
      this.yawGoal += Math.PI / 8; // Rotate right 22.5 deg
    } else if (key === 'r') {
      // Reset view
      this.targetGoal.set(0, 0, 0);
      this.distanceGoal = 180;
      this.yawGoal = Math.PI / 6;
      this.pitchGoal = Math.PI / 3.4;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keysDown.delete(e.key.toLowerCase());
  };

  private clampTargetGoal() {
    const dist = Math.hypot(this.targetGoal.x, this.targetGoal.z);
    if (dist > this.maxPanRadius) {
      const scale = this.maxPanRadius / dist;
      this.targetGoal.x *= scale;
      this.targetGoal.z *= scale;
    }
    this.targetGoal.y = 0;
  }

  /**
   * Focus camera onto a specific 2D world point (e.g. clicking on a building or road)
   */
  public focusOn(point: Point2D, customDistance?: number) {
    this.targetGoal.set(point.x, 0, point.z);
    if (customDistance) {
      this.distanceGoal = THREE.MathUtils.clamp(customDistance, this.minDistance, this.maxDistance);
    }
  }

  /**
   * Orbit controls API (for UI buttons)
   */
  public rotate(direction: 'left' | 'right', amount = Math.PI / 6) {
    this.yawGoal += direction === 'left' ? -amount : amount;
  }

  public zoom(direction: 'in' | 'out', factor = 0.75) {
    if (direction === 'in') {
      this.distanceGoal = THREE.MathUtils.clamp(this.distanceGoal * factor, this.minDistance, this.maxDistance);
    } else {
      this.distanceGoal = THREE.MathUtils.clamp(this.distanceGoal / factor, this.minDistance, this.maxDistance);
    }
  }

  public setTilt(direction: 'up' | 'down') {
    const step = Math.PI / 16;
    this.pitchGoal = THREE.MathUtils.clamp(
      this.pitchGoal + (direction === 'down' ? step : -step),
      this.minPitch,
      this.maxPitch
    );
  }

  public resetCamera() {
    this.targetGoal.set(0, 0, 0);
    this.distanceGoal = 180;
    this.yawGoal = Math.PI / 6;
    this.pitchGoal = Math.PI / 3.4;
  }

  /**
   * Reorient the camera so north (-Z, per latLonToMeters projection) is at the
   * top of the screen. Keeps the current target, zoom and tilt — only the yaw
   * (horizontal rotation) is corrected, so the view smoothly rotates in place.
   */
  public faceNorth() {
    this.yawGoal = 0; // camera sits south of the target looking toward -Z (north)
  }

  /**
   * Adjust camera constraints dynamically for map size
   */
  public setMapRadius(radius: number) {
    this.maxPanRadius = Math.max(radius * 1.25, 3500);
    this.maxDistance = Math.min(Math.max(radius * 2.2, 5500), 6500);
  }

  /**
   * Toggles Expedition View: Smoothly zooms out and transitions between
   * 2D top-down street map view (straight down pitch, north up) and tactical 3D isometric view.
   */
  public toggleExpeditionView(): boolean {
    this.isExpeditionView = !this.isExpeditionView;
    if (this.isExpeditionView) {
      this.pitchGoal = Math.PI / 2.01; // ~89.7 deg (top-down 2D map view)
      this.yawGoal = 0; // Face North
      this.distanceGoal = Math.max(1200, Math.min(4800, this.distance * 2.5));
    } else {
      this.pitchGoal = Math.PI / 3.4; // ~53 deg isometric
      this.distanceGoal = 180;
      this.yawGoal = Math.PI / 6;
    }
    return this.isExpeditionView;
  }

  public setExpeditionView(active: boolean) {
    if (this.isExpeditionView === active) return;
    this.toggleExpeditionView();
  }

  /**
   * Main update tick called each frame
   */
  public update(delta: number) {
    // Continuous keyboard pan (WASD / Arrows)
    const panSpeed = (this.distance * 0.9 + 50) * delta;
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    if (this.keysDown.has('w') || this.keysDown.has('arrowup')) {
      this.targetGoal.add(forward.clone().multiplyScalar(panSpeed));
    }
    if (this.keysDown.has('s') || this.keysDown.has('arrowdown')) {
      this.targetGoal.add(forward.clone().multiplyScalar(-panSpeed));
    }
    if (this.keysDown.has('a') || this.keysDown.has('arrowleft')) {
      this.targetGoal.add(right.clone().multiplyScalar(-panSpeed));
    }
    if (this.keysDown.has('d') || this.keysDown.has('arrowright')) {
      this.targetGoal.add(right.clone().multiplyScalar(panSpeed));
    }

    this.clampTargetGoal();

    // Smooth Lerp
    const lerpFactor = Math.min(delta * 12, 1);
    this.target.lerp(this.targetGoal, lerpFactor);
    this.distance = THREE.MathUtils.lerp(this.distance, this.distanceGoal, lerpFactor);
    this.yaw = THREE.MathUtils.lerp(this.yaw, this.yawGoal, lerpFactor);
    this.pitch = THREE.MathUtils.lerp(this.pitch, this.pitchGoal, lerpFactor);

    this.updateCameraPosition(false);
  }

  private updateCameraPosition(instant: boolean) {
    if (instant) {
      this.target.copy(this.targetGoal);
      this.distance = this.distanceGoal;
      this.yaw = this.yawGoal;
      this.pitch = this.pitchGoal;
    }

    // Spherical coordinate offset
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);

    const offsetX = this.distance * cosPitch * sinYaw;
    const offsetY = this.distance * sinPitch;
    const offsetZ = this.distance * cosPitch * cosYaw;

    this.camera.position.set(
      this.target.x + offsetX,
      this.target.y + offsetY,
      this.target.z + offsetZ
    );

    this.camera.lookAt(this.target.x, this.target.y, this.target.z);
    this.camera.updateMatrixWorld();
  }

  public focusOnPosition(pos: { x: number; z?: number; y?: number }, distance?: number) {
    this.targetGoal.x = pos.x;
    if (pos.z !== undefined) this.targetGoal.z = pos.z;
    if (pos.y !== undefined) this.targetGoal.y = pos.y;
    if (distance !== undefined) this.distanceGoal = THREE.MathUtils.clamp(distance, this.minDistance, this.maxDistance);
    this.clampTargetGoal();
  }

  public getState() {
    return {
      targetX: Math.round(this.target.x),
      targetZ: Math.round(this.target.z),
      distance: Math.round(this.distance),
      yawDeg: Math.round((this.yaw * 180) / Math.PI) % 360,
      pitchDeg: Math.round((this.pitch * 180) / Math.PI),
    };
  }

  public getDebugState() {
    return this.getState();
  }
}
