/**
 * Cinematic recording system — type definitions.
 *
 * The cinematic system drives the homepage sphere through a scripted
 * camera sequence and captures it as an MP4 (or WebM fallback).
 */

// ── Easing ────────────────────────────────────────────────────────────────────

export type EasingName =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "easeInOutCubic"
  | "easeInOutQuint";

// ── Keyframes ─────────────────────────────────────────────────────────────────

/**
 * A single camera position at a point in time.
 * The timeline interpolates between adjacent keyframes.
 */
export interface CameraKeyframe {
  /** Time offset in seconds from sequence start */
  t: number;
  /** Zoom level (1.0 = full sphere, 5.0 = maximum) */
  zoom: number;
  /** X-axis tilt in radians (vertical pitch) */
  rx: number;
  /** Y-axis yaw in radians (horizontal orbit) */
  ry: number;
  /** Easing applied from this keyframe to the next */
  easing?: EasingName;
}

// ── Sequence ──────────────────────────────────────────────────────────────────

export interface CinematicSequence {
  /** Human-readable name / file slug */
  name: string;
  /** Total duration in seconds */
  duration: number;
  /** Target capture frame rate */
  fps: number;
  /** Output resolution */
  resolution: { width: number; height: number };
  /** Ordered list of camera keyframes (must start at t=0) */
  keyframes: CameraKeyframe[];
}

// ── Per-frame output ──────────────────────────────────────────────────────────

export interface CinematicFrame {
  /** Interpolated zoom level */
  zoom: number;
  /** 3×3 rotation matrix [row-major, 9 elements] */
  rotMat: number[];
  /** Linear progress 0..1 through the sequence */
  progress: number;
}

// ── Recording state ───────────────────────────────────────────────────────────

export interface RecordingState {
  sequence:      CinematicSequence;
  mediaRecorder: MediaRecorder;
  chunks:        BlobPart[];
  /** Set to true once the timeline finishes so finalize fires only once */
  done:          boolean;
}
