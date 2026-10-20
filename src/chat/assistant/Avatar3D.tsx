/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A 3D avatar, drawn (the third kind, beside Datalayer's drawings and the
 * Microsoft Agent characters): a glTF model loaded with three.js, which is
 * imported only when one is shown, so a page with no 3D avatar never loads
 * it. It idles with its `Idle` animation; while it speaks, the morph
 * targets that open its mouth follow its voice's level (`mouthLevel`, as
 * the other avatars' mouths do) and its head nods with it. A reader who
 * asks for reduced motion sees it still, drawn once. A browser that cannot
 * draw WebGL, or a model that cannot be loaded, is said in a sentence where
 * the avatar would stand.
 *
 * @module chat/assistant/Avatar3D
 */

import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import type * as Three from 'three';
import {
  NO_WEBGL_SENTENCE,
  cameraDistance,
  idleClipName,
  modelNotLoadedSentence,
  prefersReducedMotion,
  smoothed,
  talkAmount,
  talkingMorphIndices,
  webglAvailable,
  type AssistantModel3D,
} from './avatar3d';
import type { AssistantState } from './state';

export interface Avatar3DProps {
  avatar: AssistantModel3D;
  state: AssistantState;
  /** Its size, in pixels: the square it is drawn in. */
  size: number;
  /** How loud its voice is now, between 0 and 1, while it is heard. */
  mouthLevel?: () => number;
}

/** The field of view of its camera, in degrees. */
const FOV = 30;

/** What is said in place of the model, or none while it shows or loads. */
type Said = { sentence: string } | null;

export function Avatar3D({
  avatar,
  state,
  size,
  mouthLevel,
}: Avatar3DProps): JSX.Element {
  const holder = useRef<HTMLSpanElement>(null);
  const [said, setSaid] = useState<Said>(() =>
    webglAvailable() ? null : { sentence: NO_WEBGL_SENTENCE },
  );
  const [loading, setLoading] = useState(true);
  // Read each frame without drawing the scene again.
  const speaking = useRef(state === 'speaking');
  speaking.current = state === 'speaking';
  const level = useRef(mouthLevel);
  level.current = mouthLevel;

  useEffect(() => {
    const element = holder.current;
    if (!element || !webglAvailable()) {
      return;
    }
    let stopped = false;
    let frame = 0;
    let dispose = (): void => undefined;
    const still = prefersReducedMotion();
    (async () => {
      const THREE = await import('three');
      const { GLTFLoader } =
        await import('three/examples/jsm/loaders/GLTFLoader.js');
      if (stopped) {
        return;
      }
      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(size, size);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.setAttribute('aria-hidden', 'true');
      element.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 2.6));
      const sun = new THREE.DirectionalLight(0xffffff, 2.2);
      sun.position.set(2, 4, 3);
      scene.add(sun);
      const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 1000);
      dispose = () => {
        scene.traverse(object => {
          const mesh = object as Three.Mesh;
          mesh.geometry?.dispose();
          const materials = Array.isArray(mesh.material)
            ? mesh.material
            : mesh.material
              ? [mesh.material]
              : [];
          materials.forEach(material => material.dispose());
        });
        renderer.dispose();
        renderer.domElement.remove();
      };
      let gltf: { scene: Three.Group; animations: Three.AnimationClip[] };
      try {
        gltf = await new GLTFLoader().loadAsync(avatar.url);
      } catch (error) {
        if (!stopped) {
          setSaid({
            sentence: modelNotLoadedSentence(
              avatar.url,
              error instanceof Error ? error.message : String(error),
            ),
          });
          setLoading(false);
        }
        return;
      }
      if (stopped) {
        return;
      }
      const model = gltf.scene;
      scene.add(model);
      // Framed whole, its middle at the centre of the square.
      const box = new THREE.Box3().setFromObject(model);
      const extent = box.getSize(new THREE.Vector3());
      const middle = box.getCenter(new THREE.Vector3());
      const distance = cameraDistance(Math.max(extent.x, extent.y), FOV);
      camera.position.set(middle.x, middle.y, middle.z + distance);
      camera.lookAt(middle);
      // Its idle animation, played while it is shown.
      const mixer = new THREE.AnimationMixer(model);
      const idle = idleClipName(gltf.animations.map(clip => clip.name));
      const clip = gltf.animations.find(each => each.name === idle);
      if (clip) {
        mixer.clipAction(clip).play();
      }
      // What its voice moves: the morph targets of a mouth, and its head.
      const mouths: { influences: number[]; indices: number[] }[] = [];
      let head: Three.Object3D | undefined;
      model.traverse(object => {
        const mesh = object as Three.Mesh;
        const indices = talkingMorphIndices(mesh.morphTargetDictionary);
        if (indices.length > 0 && mesh.morphTargetInfluences) {
          mouths.push({ influences: mesh.morphTargetInfluences, indices });
        }
        if (!head && /head/i.test(object.name) && object.type === 'Bone') {
          head = object;
        }
      });
      setLoading(false);
      if (still) {
        mixer.update(0);
        renderer.render(scene, camera);
        return;
      }
      const clock = new THREE.Clock();
      let talking = 0;
      // The nod last added, taken off before the mixer poses the head again.
      let nod = 0;
      const step = () => {
        const seconds = clock.getDelta();
        if (head) {
          head.rotation.x += nod;
        }
        mixer.update(seconds);
        const target = talkAmount({
          speaking: speaking.current,
          level: level.current?.(),
          reducedMotion: false,
          seconds: clock.elapsedTime,
        });
        talking = smoothed(talking, target, seconds);
        for (const mouth of mouths) {
          for (const index of mouth.indices) {
            mouth.influences[index] = talking;
          }
        }
        if (head) {
          // Added over the idle pose the mixer has just set.
          nod = talking * 0.18;
          head.rotation.x -= nod;
        }
        renderer.render(scene, camera);
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    })().catch((error: unknown) => {
      if (!stopped) {
        setSaid({
          sentence: modelNotLoadedSentence(
            avatar.url,
            error instanceof Error ? error.message : String(error),
          ),
        });
        setLoading(false);
      }
    });
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      dispose();
    };
  }, [avatar.url, size]);

  return (
    <span
      ref={holder}
      className="assistant-model3d"
      role="img"
      aria-label={avatar.name}
      aria-busy={loading && !said}
      data-avatar-model3d={avatar.url}
      {...(said ? { 'data-avatar-model3d-said': '' } : {})}
      style={{
        position: 'relative',
        display: 'block',
        width: size,
        height: size,
      }}
    >
      {said && (
        <span
          role="status"
          style={{
            display: 'block',
            width: Math.max(size, 180),
            fontSize: 12,
            lineHeight: 1.3,
            color: 'var(--fgColor-muted, #59636e)',
            background: 'var(--bgColor-default, #fff)',
            borderRadius: 6,
            padding: 4,
          }}
        >
          {said.sentence}
        </span>
      )}
    </span>
  );
}

export default Avatar3D;
