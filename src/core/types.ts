export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Mat4 = number[];
export type DirectionType = 'direct' | 'reciprocal';
export interface Mount { position_mm: Vec3; quaternion_xyzw: Quat }
export interface Axis { frame: string; point_mm: Vec3; direction: Vec3 }
export interface Cell { a: number; b: number; c: number; alpha_deg: number; beta_deg: number; gamma_deg: number }
export interface Visual { shape: 'plate' | 'cylinder' | 'box' | 'detector'; size_mm: Vec3; color: string }
export interface Device {
  id: string; type: 'rotary' | 'hexapod' | 'theta' | 'xy' | 'sample' | 'detector' | 'fixture';
  output_frame: string; visual: Visual; provenance: 'synthetic' | 'source_statement';
  crystal?: { frame: string; cell: Cell; center_s_mm: Vec3; target_point_s_mm: Vec3 };
  detector?: { pixels: [number, number]; pixel_size_mm: [number, number]; provenance: 'source_statement' | 'synthetic' };
}
export interface Joint { id: string; unit: 'mm' | 'deg'; limits?: [number, number] }
export type Motion =
  | { kind: 'fixed' }
  | { kind: 'revolute'; joint: string; axis: Vec3; center_mm: Vec3 }
  | { kind: 'six_dof'; joints: [string, string, string, string, string, string]; pivot_mm: Vec3; rotation_convention: 'extrinsic_xyz' }
  | { kind: 'xy_translation'; joints: [string, string]; axes: [Vec3, Vec3] };
export interface Frame { id: string; parent: string; mount: Mount; motion: Motion }
export interface SampleState { orientation_quaternion_xyzw: Quat; target_indices: Vec3; direction_type: DirectionType }
export interface SceneConfig {
  schema_version: 1;
  devices: { schema_version: 1; devices: Device[] };
  assembly: {
    schema_version: 1; frames: Frame[]; joints: Joint[];
    beam: Axis; supports: { base_frame: string; moving_frame: string; base_point_mm: Vec3; moving_point_mm: Vec3 }[];
    alignment_tolerance: { angle_deg: number; distance_mm: number };
  };
  experiment_state: {
    schema_version: 1; joints: Record<string, number>; samples: Record<string, SampleState>;
    display: { frames: boolean; crystal: boolean; lattice: boolean };
  };
}
export class SceneError extends Error {
  constructor(public code: string, public path: string, message: string) { super(message); this.name = 'SceneError'; }
  toJSON() { return { code: this.code, path: this.path, message: this.message }; }
}
export const clone = <T>(value: T): T => structuredClone(value);
