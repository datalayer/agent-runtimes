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
 * the other avatars' mouths do) and its head nods with it.
 *
 * One renderer and one loaded model across every state: a new state never
 * draws it again. Its animations fade into one another (`CROSSFADE_SECONDS`),
 * the poses added by code follow their targets damped (`dampedPose`), a
 * wave settles back into idle, and goodbye and stepping aside are walked:
 * it turns and walks out of its square (`leavingPose`), and back. A reader
 * who asks for reduced motion sees it still, drawn once in each state's
 * pose, with no fade. A browser that cannot
 * draw WebGL, or a model that cannot be loaded, is said in a sentence where
 * the avatar would stand.
 *
 * @module chat/assistant/Avatar3D
 */

import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import type * as Three from 'three';
import {
  CROSSFADE_SECONDS,
  GOODBYE_WAVE_SECONDS,
  NO_WEBGL_SENTENCE,
  OUT_OF_FRAME,
  REST_POSE,
  accentPose,
  cameraDistance,
  dampedPose,
  idleClipName,
  leavingPose,
  modelNotLoadedSentence,
  prefersReducedMotion,
  proceduralPose,
  smoothed,
  stateMotion,
  talkAmount,
  talkingMorphIndices,
  walkClipName,
  webglAvailable,
  type AssistantModel3D,
  type Pose3D,
} from './avatar3dModel';
import type { AssistantState } from './state';

export interface Avatar3DProps {
  avatar: AssistantModel3D;
  state: AssistantState;
  /** Its size, in pixels: the square it is drawn in. */
  size: number;
  /** How loud its voice is now, between 0 and 1, while it is heard. */
  mouthLevel?: () => number;
  /** Stepped aside (T-27): it walks out of its square, and back after. */
  aside?: boolean;
  /** A count: changed, it plays its state again — the same model, not drawn again. */
  replay?: number;
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
  aside = false,
  replay = 0,
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
  const away = useRef(aside);
  away.current = aside;
  const enter = useRef<(next: AssistantState, again: boolean) => void>(
    () => undefined,
  );
  const stepAside = useRef<(aside: boolean) => void>(() => undefined);
  const replayed = useRef(replay);
  useEffect(() => {
    const again = replayed.current !== replay;
    replayed.current = replay;
    enter.current(state, again);
  }, [state, replay]);
  useEffect(() => {
    stepAside.current(aside);
  }, [aside]);

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
      // How far sideways it walks, as a share of this: out of the square.
      const span = Math.max(extent.x, extent.y);
      const rest = {
        x: model.rotation.x,
        y: model.rotation.y,
        z: model.rotation.z,
        lift: model.position.y,
        shift: model.position.x,
      };
      // Each state's animation, or its idle one, played while it is shown.
      const mixer = new THREE.AnimationMixer(model);
      const names = gltf.animations.map(each => each.name);
      const idleName = idleClipName(names);
      const walkName = walkClipName(names);
      // A once-animation played again fades in over itself: a second action
      // of the same clip, so the replay is a crossfade and never a cut.
      const twins = new Map<string, Three.AnimationAction>();
      const actionOf = (name: string | undefined, fresh = false) => {
        const found = gltf.animations.find(each => each.name === name);
        if (!found) {
          return undefined;
        }
        const action = mixer.clipAction(found);
        if (!fresh || action !== playing) {
          return action;
        }
        let twin = twins.get(found.name);
        if (!twin) {
          twin = mixer.clipAction(found.clone());
          twins.set(found.name, twin);
        }
        return twin === playing ? action : twin;
      };
      let playing: Three.AnimationAction | undefined;
      let playingName: string | undefined;
      // What it acts now: the state, or idle once a wave has settled.
      let motion = stateMotion(acted.current, names);
      let posed: AssistantState = acted.current;
      let enteredAt = 0;
      // Leaving: since when it walks out (goodbye, once waved; aside).
      let leftAt: number | undefined;
      let current: Pose3D = { ...REST_POSE };
      const clock = new THREE.Clock();
      // A new animation fades in over the last one; still, it replaces it.
      // Never faded out to nothing: with no weight, a model shows its bind
      // pose, and that flash is a blink.
      const play = (
        next: Three.AnimationAction | undefined,
        once: boolean,
        name: string | undefined,
      ): void => {
        playingName = name;
        if (!next || (next === playing && !once)) {
          return;
        }
        if (playing && playing !== next && still) {
          playing.stop();
        }
        next.reset();
        next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        // Played once, its last pose stays until the next fades in.
        next.clampWhenFinished = once;
        next.setEffectiveWeight(1);
        next.play();
        if (playing && playing !== next && !still) {
          next.crossFadeFrom(playing, CROSSFADE_SECONDS, false);
        }
        playing = next;
      };
      const leave = () => {
        if (leftAt === undefined) {
          leftAt = clock.elapsedTime;
          play(actionOf(walkName ?? idleName), false, walkName ?? idleName);
        }
      };
      // Played once: goodbye walks off; a held pose stays; else idle again.
      mixer.addEventListener('finished', event => {
        if (event.action !== playing) {
          return;
        }
        if (posed === 'goodbye') {
          leave();
        } else if (!motion.holds) {
          motion = stateMotion('idle', names);
          posed = 'idle';
          play(actionOf(idleName), false, idleName);
        }
      });
      play(actionOf(motion.clip), motion.once, motion.clip);
      if (away.current) {
        leave();
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
      // Walking back into its square, from where it walked to.
      const isReturning = () =>
        leftAt === undefined && current.bodyShift > 0.05 * OUT_OF_FRAME;
      // Where its pose is going: walking out, else its state's.
      const target = (now: number): Pose3D => {
        if (leftAt !== undefined) {
          return leavingPose(still ? Infinity : now - leftAt);
        }
        const seconds = now - enteredAt;
        const own = motion.procedural
          ? proceduralPose(posed, seconds)
          : accentPose(posed, seconds);
        // Walking back in from the side it left by: facing where it goes.
        return isReturning() ? { ...own, bodyYaw: -Math.PI / 2 } : own;
      };
      // The head's turn last added, taken off before the mixer poses it again.
      const added = { x: 0, y: 0, z: 0 };
      const pose = (moved: Pose3D, nod: number) => {
        const pitch = moved.headPitch + nod;
        if (head) {
          added.x = pitch;
          added.y = moved.headYaw;
          added.z = moved.headRoll;
          head.rotation.x += pitch;
          head.rotation.y += moved.headYaw;
          head.rotation.z += moved.headRoll;
        }
        // Without a head, the whole model turns as its head would.
        model.rotation.set(
          rest.x + moved.bodyLean + (head ? 0 : pitch),
          rest.y + moved.bodyYaw + (head ? 0 : moved.headYaw),
          rest.z + (head ? 0 : moved.headRoll),
        );
        model.position.y = rest.lift + moved.bodyLift * height;
        model.position.x = rest.shift + moved.bodyShift * span;
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
        current = target(enteredAt + 0.5);
        pose(current, 0);
        renderer.render(scene, camera);
      };
      // A new state (or the same, again): its animation faded in, its pose
      // followed from where it is; back from where it walked to first.
      enter.current = (next, again) => {
        if (next === posed && !again && leftAt === undefined) {
          return;
        }
        motion = stateMotion(next, names);
        posed = next;
        enteredAt = clock.elapsedTime;
        if (!away.current) {
          leftAt = undefined;
        }
        if (leftAt === undefined) {
          play(actionOf(motion.clip, again), motion.once, motion.clip);
        }
        if (still) {
          drawStill();
        }
      };
      stepAside.current = nowAside => {
        if (nowAside) {
          leave();
        } else if (leftAt !== undefined && posed !== 'goodbye') {
          leftAt = undefined;
          enteredAt = clock.elapsedTime;
          play(actionOf(motion.clip), motion.once, motion.clip);
        }
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
        const now = clock.elapsedTime;
        // A goodbye with no wave of its own goes once it has wiggled.
        if (
          posed === 'goodbye' &&
          leftAt === undefined &&
          !motion.own &&
          now - enteredAt > GOODBYE_WAVE_SECONDS
        ) {
          leave();
        }
        // Walking back in, it walks; once back, its state's animation.
        const returning = isReturning();
        const wanted = returning ? (walkName ?? motion.clip) : undefined;
        if (wanted && playingName !== wanted) {
          play(actionOf(wanted), false, wanted);
        } else if (
          !returning &&
          leftAt === undefined &&
          playingName !== motion.clip &&
          playingName === walkName &&
          motion.clip !== walkName
        ) {
          play(actionOf(motion.clip), motion.once, motion.clip);
        }
        unpose();
        mixer.update(seconds);
        const loudness = talkAmount({
          speaking: speaking.current,
          level: level.current?.(),
          reducedMotion: false,
          seconds: now,
        });
        talking = smoothed(talking, loudness, seconds);
        for (const mouth of mouths) {
          for (const index of mouth.indices) {
            mouth.influences[index] = talking;
          }
        }
        // Added over the pose the mixer has just set, followed, never
        // snapped to: the state's, and a nod with the voice.
        current = dampedPose(current, target(now), seconds);
        pose(current, -talking * 0.18);
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
      stepAside.current = () => undefined;
      cancelAnimationFrame(frame);
      dispose();
    };
  }, [avatar.url, size]);

  return (
    <span
      ref={holder}
      className="assistant-model3d"
      data-avatar-state={state}
      {...(aside ? { 'data-avatar-aside': '' } : {})}
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
