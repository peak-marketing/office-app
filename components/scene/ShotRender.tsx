"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import type { LayoutOption } from "@/lib/layout/types";
import { buildRoomScene, eyeShots, makeRenderer } from "./roomScene";

/**
 * 한 장면을 한 번 그린다. 예시 이미지(사례 사진)를 만들 때 쓴다.
 * shot: 눈높이 시점 번호, 또는 "iso"(입체 배치도)
 */
export default function ShotRender({ option, styleId, shot, width, height }: { option: LayoutOption; styleId: string; shot: string; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const iso = shot === "iso";
    const mode = iso ? "model" : "photo";
    const { renderer, envMap } = makeRenderer(canvas, mode);
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    const room = buildRoomScene(option, styleId, mode);
    room.scene.environment = envMap;
    room.scene.environmentIntensity = iso ? 0.4 : 0.45;
    room.setLabels(false);
    const { W, D } = option;
    let camera: THREE.PerspectiveCamera;
    if (iso) {
      const size = Math.max(W, D * 1.15);
      camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 200);
      camera.position.set(W / 2 + 0.72 * size, 1.05 * size, D / 2 + 1.12 * size);
      camera.lookAt(W / 2, 0, D / 2);
    } else {
      const shots = eyeShots(option);
      const s = shots[Number(shot)] ?? shots[0];
      camera = new THREE.PerspectiveCamera(58, width / height, 0.05, 200);
      camera.position.set(s.pos[0], s.h, D - s.pos[1]);
      camera.lookAt(s.target[0], s.th, D - s.target[1]);
      document.title = s.label;
      document.body.dataset.shots = String(shots.length);
    }
    const target = new THREE.WebGLRenderTarget(width, height, { samples: 4, type: THREE.HalfFloatType });
    const composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(room.scene, camera));
    const ao = new GTAOPass(room.scene, camera, width, height);
    ao.updateGtaoMaterial({ radius: iso ? 0.6 : 0.5, distanceFallOff: 1, thickness: 1 });
    ao.blendIntensity = 1;
    composer.addPass(ao);
    composer.addPass(new OutputPass());
    // 그림자 지도가 채워지도록 몇 번 그린 뒤 완료를 알린다.
    let n = 0;
    const tick = () => {
      composer.render();
      if (++n < 3) requestAnimationFrame(tick);
      else document.body.dataset.ready = "1";
    };
    requestAnimationFrame(tick);
    return () => {
      composer.dispose();
      target.dispose();
      room.dispose();
      envMap.dispose();
      renderer.dispose();
    };
  }, [option, styleId, shot, width, height]);
  return <canvas ref={ref} width={width} height={height} style={{ width, height, display: "block" }} data-shot />;
}
