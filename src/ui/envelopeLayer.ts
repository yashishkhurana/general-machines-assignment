// three.js as a MapLibre custom layer: draws the envelope solid (a sloped mesh fill-extrusion can't do).
import * as maplibregl from 'maplibre-gl';
import type { CustomLayerInterface, Map as MLMap } from 'maplibre-gl';
import * as THREE from 'three';
import type { Mesh } from '../core/envelope';
import type { Frame } from '../geo/project';

export interface EnvelopeSpec { mesh: Mesh; color: string; opacity: number }

export class EnvelopeLayer implements CustomLayerInterface {
  id = 'envelope-3d';
  type = 'custom' as const;
  renderingMode = '3d' as const;
  private map?: MLMap;
  private renderer?: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private group = new THREE.Group();
  private origin = new THREE.Matrix4();

  constructor() {
    this.scene.add(this.group);
  }

  onAdd(map: MLMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true });
    this.renderer.autoClear = false;
  }

  onRemove() {
    this.clear();
    this.renderer?.dispose();
  }

  private clear() {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      const m = c as THREE.Mesh | THREE.LineSegments;
      m.geometry?.dispose();
      (m.material as THREE.Material)?.dispose();
    }
  }

  /** Replace the drawn solids. Positions are local metres in `frame`; converted to Mercator here. */
  set(frame: Frame | null, specs: EnvelopeSpec[]) {
    this.clear();
    if (!frame || !specs.length) { this.map?.triggerRepaint(); return; }
    const o = maplibregl.MercatorCoordinate.fromLngLat(frame.origin, 0);
    const s = o.meterInMercatorCoordinateUnits();
    this.origin = new THREE.Matrix4().makeTranslation(o.x, o.y, o.z).scale(new THREE.Vector3(s, s, s));
    for (const spec of specs) {
      const src = spec.mesh.positions;
      const pos = new Float32Array(src.length);
      for (let i = 0; i < src.length; i += 3) {
        const ll = frame.toLL([src[i], src[i + 1]]);
        const m = maplibregl.MercatorCoordinate.fromLngLat(ll, 0);
        pos[i] = (m.x - o.x) / s;
        pos[i + 1] = (m.y - o.y) / s;
        pos[i + 2] = src[i + 2]; // metres up
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geom.setIndex(spec.mesh.indices);
      geom.computeVertexNormals();
      const mat = new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: spec.opacity, side: THREE.DoubleSide, depthWrite: false });
      this.group.add(new THREE.Mesh(geom, mat));
      const edges = new THREE.EdgesGeometry(geom, 25);
      this.group.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: spec.color, transparent: true, opacity: Math.min(1, spec.opacity * 2.2) })));
    }
    this.map?.triggerRepaint();
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: any) {
    if (!this.renderer || !this.group.children.length) return;
    const arr = args?.defaultProjectionData?.mainMatrix ?? args?.modelViewProjectionMatrix ?? args;
    const m = new THREE.Matrix4().fromArray(Array.from(arr as ArrayLike<number>));
    this.camera.projectionMatrix = m.multiply(this.origin);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }
}
