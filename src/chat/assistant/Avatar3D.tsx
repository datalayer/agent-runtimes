/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A 3D avatar, drawn (the third kind, beside Datalayer's drawings and the
 * Microsoft Agent characters): a glTF model loaded with three.js, which is
 * imported only when one is shown, so a page with no 3D avatar never loads
 * it. It acts out every state the other avatars do (`stateMotion`): with
 * an animation of its own when the model has one — RobotExpressive waves
 * hello and goodbye, walks while it works, sits down when paused — else
 * idling and moved by code (`proceduralPose`): it tilts its head to think,
 * leans in to wait, turns its head as it talks. While it speaks, the morph
 * targets that open its mouth follow its voice's level (`mouthLevel`, as
 * the other avatars' mouths do) and its head nods with it. A reader who
 * asks for reduced motion sees it still, drawn once in each state's pose. A browser that cannot
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
  proceduralPose,
  smoothed,
  stateMotion,
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
  // The state acted now, and how a new one is entered once the model is in.
  const acted = useRef(state);
  acted.current = state;
  const enter = useRef<(next: AssistantState) => void>(() => undefined);
  useEffect(() => {
    enter.current(state);
  }, [state]);

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
      const height = extent.y;
      const rest = {
        x: model.rotation.x,
        y: model.rotation.y,
        z: model.rotation.z,
        lift: model.position.y,
      };
      // Each state's animation, or its idle one, played while it is shown.
      const mixer = new THREE.AnimationMixer(model);
      const names = gltf.animations.map(each => each.name);
      const idleName = idleClipName(names);
      const actionOf = (name: string | undefined) => {
        const found = gltf.animations.find(each => each.name === name);
        return found ? mixer.clipAction(found) : undefined;
      };
      let playing: Three.AnimationAction | undefined;
      let motion = stateMotion(acted.current, names);
      let enteredAt = 0;
      const clock = new THREE.Clock();
      // A new animation fades in over the last one; still, it replaces it.
      const play = (
        next: Three.AnimationAction | undefined,
        once: boolean,
      ): void => {
        if (next === playing && !once) {
          return;
        }
        if (playing && playing !== next && still) {
          playing.stop();
        }
        if (next) {
          next.reset();
          next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
          // Played once, its last pose stays until the next fades in.
          next.clampWhenFinished = once;
          next.setEffectiveWeight(1);
          next.play();
          if (playing && playing !== next && !still) {
            next.crossFadeFrom(playing, 0.3, false);
          }
        } else if (!still) {
          playing?.fadeOut(0.3);
        }
        playing = next;
      };
      // Played once, it idles again, unless it holds its last pose.
      mixer.addEventListener('finished', event => {
        if (event.action === playing && !motion.holds) {
          play(actionOf(idleName), false);
        }
      });
      play(actionOf(motion.clip), motion.once);
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
      // The head's turn last added, taken off before the mixer poses it again.
      const added = { x: 0, y: 0, z: 0 };
      const pose = (seconds: number, nod: number) => {
        const moved = motion.procedural
          ? proceduralPose(acted.current, seconds)
          : proceduralPose('idle', 0);
        const pitch = (motion.procedural ? moved.headPitch : 0) + nod;
        const yaw = motion.procedural ? moved.headYaw : 0;
        const roll = motion.procedural ? moved.headRoll : 0;
        if (head) {
          added.x = pitch;
          added.y = yaw;
          added.z = roll;
          head.rotation.x += pitch;
          head.rotation.y += yaw;
          head.rotation.z += roll;
        }
        // Without a head, the whole model turns as its head would.
        model.rotation.set(
          rest.x + moved.bodyLean + (head ? 0 : pitch),
          rest.y + moved.bodyYaw + (head ? 0 : yaw),
          rest.z + (head ? 0 : roll),
        );
        model.position.y = rest.lift + moved.bodyLift * height;
      };
      const unpose = () => {
        if (head) {
          head.rotation.x -= added.x;
          head.rotation.y -= added.y;
          head.rotation.z -= added.z;
        }
        added.x = added.y = added.z = 0;
      };
      // Still: each state's pose, drawn once — a held animation at its end.
      const drawStill = () => {
        unpose();
        if (playing && motion.holds) {
          playing.time = playing.getClip().duration;
        }
        mixer.update(0);
        pose(0.5, 0);
        renderer.render(scene, camera);
      };
      // A new state: its animation, and, still, its pose drawn at once.
      enter.current = next => {
        motion = stateMotion(next, names);
        enteredAt = clock.elapsedTime;
        play(actionOf(motion.clip), motion.once);
        if (still) {
          drawStill();
        }
      };
      setLoading(false);
      if (still) {
        drawStill();
        return;
      }
      let talking = 0;
      const step = () => {
        const seconds = clock.getDelta();
        unpose();
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
        // Added over the pose the mixer has just set: the state's, and a
        // nod with the voice.
        pose(clock.elapsedTime - enteredAt, -talking * 0.18);
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
      enter.current = () => undefined;
      cancelAnimationFrame(frame);
      dispose();
    };
  }, [avatar.url, size]);

  return (
    <span
      ref={holder}
      className="assistant-model3d"
      data-avatar-state={state}
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
