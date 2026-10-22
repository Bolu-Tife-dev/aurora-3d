import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { THEMES } from "./themes.js";
import { buildWorld } from "./world.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isCoarse = window.matchMedia("(pointer: coarse)").matches;
const lowPower = isCoarse || window.innerWidth < 768;

const canvas = $("#scene");
const loaderEl = $("#loader");
const loaderFill = $("#loader-fill");
const loaderStatus = $("#loader-status");
const progressFill = $("#progress-fill");
const themeNameEl = $("#theme-name");
const tooltipEl = $("#tooltip");
const cursorEl = $("#cursor");
const cursorRingEl = $("#cursor-ring");
const chipsEl = $("#theme-chips");

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !lowPower,
    powerPreference: "high-performance",
  });
} catch (err) {
  loaderStatus.textContent = "WebGL unavailable";
  throw err;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 600);
camera.position.set(0, 14, 92);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  lowPower ? 0.7 : 0.95,
  0.7,
  0.18
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

let themeIndex = 0;
const world = buildWorld(scene, THEMES[themeIndex], { lowPower });

/* ---------- Camera path ---------- */
const camPath = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(0, 10, 46),
    new THREE.Vector3(-19, 8, 30),
    new THREE.Vector3(-10, 17, 10),
    new THREE.Vector3(15, 10, 20),
    new THREE.Vector3(8, 5, -16),
    new THREE.Vector3(0, 13, -42),
  ],
  false,
  "catmullrom",
  0.5
);
const lookPath = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(0, 6, 0),
    new THREE.Vector3(-2, 7, 0),
    new THREE.Vector3(0, 5, 0),
    new THREE.Vector3(2, 8, 0),
    new THREE.Vector3(0, 7, 0),
    new THREE.Vector3(0, 9, 4),
  ],
  false,
  "catmullrom",
  0.5
);
const INTRO_OFFSET = new THREE.Vector3(0, 6, 46);

/* ---------- Scroll ---------- */
let scrollTarget = 0;
let scrollSmooth = 0;
let activeSection = 0;
const panels = $$(".panel");
const dots = $$(".dot");

function maxScroll() {
  return Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
}

function onScroll() {
  scrollTarget = clamp(window.scrollY / maxScroll(), 0, 1);
  const idx = clamp(Math.round(scrollTarget * (panels.length - 1)), 0, panels.length - 1);
  if (idx !== activeSection) {
    activeSection = idx;
    panels.forEach((p, i) => p.classList.toggle("is-active", i === idx));
    dots.forEach((d, i) => d.classList.toggle("is-active", i === idx));
  }
  progressFill.style.width = `${scrollTarget * 100}%`;
}
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

$$("[data-scroll]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    const idx = Number(el.dataset.scroll);
    const y = (idx / (panels.length - 1)) * maxScroll();
    window.scrollTo({ top: y, behavior: prefersReduced ? "auto" : "smooth" });
  });
});

/* ---------- Pointer ---------- */
const pointer = new THREE.Vector2(0, 0);
const pointerNdc = new THREE.Vector2(0, 0);
const raycaster = new THREE.Raycaster();
let hovered = null;
let cursorX = window.innerWidth / 2;
let cursorY = window.innerHeight / 2;
let ringX = cursorX;
let ringY = cursorY;

window.addEventListener(
  "pointermove",
  (e) => {
    cursorX = e.clientX;
    cursorY = e.clientY;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    pointerNdc.copy(pointer);
  },
  { passive: true }
);

window.addEventListener("click", (e) => {
  if (e.target.closest("button, a, .chip")) return;
  if (hovered) {
    const p = world.crystalWorldPosition(hovered);
    world.burst(p, Math.random() > 0.5 ? "crystal" : "crystal2");
    applyTheme((themeIndex + 1) % THEMES.length);
    pulseCursor();
  }
});

function pulseCursor() {
  cursorRingEl.style.transition = "none";
  cursorRingEl.style.width = "80px";
  cursorRingEl.style.height = "80px";
  requestAnimationFrame(() => {
    cursorRingEl.style.transition = "";
    cursorRingEl.style.width = "";
    cursorRingEl.style.height = "";
  });
}

/* ---------- Theme UI ---------- */
THEMES.forEach((theme, i) => {
  const btn = document.createElement("button");
  btn.className = "chip" + (i === 0 ? " is-active" : "");
  btn.style.color = theme.crystal;
  btn.innerHTML = `<i style="background:${theme.crystal}"></i>${theme.name}`;
  btn.addEventListener("click", () => {
    world.burst(world.crystalWorldPosition(world.orbiters[i % world.orbiters.length]), "crystal");
    applyTheme(i);
  });
  chipsEl.appendChild(btn);
});

function applyTheme(i) {
  themeIndex = i;
  const theme = THEMES[i];
  world.setTheme(theme);
  document.documentElement.style.setProperty("--accent", theme.crystal);
  document.documentElement.style.setProperty("--accent-2", theme.crystal2);
  themeNameEl.textContent = theme.name;
  $$(".chip").forEach((c, ci) => c.classList.toggle("is-active", ci === i));
  if (audio.enabled) audio.setColor(theme.glow);
}

/* ---------- Ambient audio ---------- */
const audio = {
  ctx: null,
  enabled: false,
  gain: null,
  filter: null,
  oscs: [],
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 320;
    this.filter.Q.value = 4;
    this.filter.connect(this.gain);
    this.gain.connect(this.ctx.destination);

    [55, 82.41, 110.5].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = i === 2 ? "triangle" : "sine";
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.value = i === 2 ? 0.12 : 0.28;
      osc.connect(g);
      g.connect(this.filter);
      osc.start();
      this.oscs.push(osc);
    });

    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain);
    lfoGain.connect(this.filter.frequency);
    lfo.start();
  },
  setColor(hex) {
    if (!this.ctx) return;
    const c = new THREE.Color(hex);
    const freq = 180 + c.getHSL({ h: 0, s: 0, l: 0 }).h * 420;
    this.filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.6);
  },
  toggle() {
    this.init();
    if (!this.ctx) return false;
    if (this.ctx.state === "suspended") this.ctx.resume();
    this.enabled = !this.enabled;
    this.gain.gain.setTargetAtTime(this.enabled ? 0.09 : 0, this.ctx.currentTime, 0.5);
    if (this.enabled) this.setColor(THEMES[themeIndex].glow);
    return this.enabled;
  },
};

const audioBtn = $("#audio-toggle");
audioBtn.addEventListener("click", () => {
  const on = audio.toggle();
  audioBtn.setAttribute("aria-pressed", String(on));
});

/* ---------- Loader ---------- */
const loaderSteps = [
  "weaving the void…",
  "growing drift isles…",
  "charging the aether core…",
  "scattering ten thousand stars…",
  "ready",
];
let loadProgress = 0;
let loaded = false;
let introT = 0;

function finishLoading() {
  if (loaded) return;
  loaded = true;
  loaderEl.classList.add("is-done");
  loaderEl.setAttribute("aria-hidden", "true");
}

const loadTimer = setInterval(() => {
  loadProgress = Math.min(1, loadProgress + 0.06 + Math.random() * 0.08);
  loaderFill.style.width = `${loadProgress * 100}%`;
  loaderStatus.textContent = loaderSteps[Math.min(loaderSteps.length - 1, Math.floor(loadProgress * loaderSteps.length))];
  if (loadProgress >= 1) {
    clearInterval(loadTimer);
    setTimeout(finishLoading, 420);
  }
}, 90);

/* ---------- Resize ---------- */
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
}
window.addEventListener("resize", onResize);

/* ---------- Loop ---------- */
const clock = new THREE.Clock();
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const introPos = new THREE.Vector3();
const lightTarget = new THREE.Vector3(0, 10, 10);
const tmpV = new THREE.Vector3();

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (loaded && introT < 1) introT = Math.min(1, introT + dt / 2.6);
  const intro = easeOutCubic(introT);

  scrollSmooth = lerp(scrollSmooth, scrollTarget, 1 - Math.exp(-dt * (prefersReduced ? 12 : 4.5)));

  const pathT = clamp(scrollSmooth, 0, 1);
  camPath.getPointAt(pathT, camPos);
  lookPath.getPointAt(pathT, camLook);

  introPos.copy(camPos).add(INTRO_OFFSET);
  const blend = 1 - intro;
  camPos.lerp(introPos, blend);
  camLook.y += blend * 2;

  const parallax = prefersReduced ? 0 : 1;
  camera.position.set(
    camPos.x + pointer.x * 2.4 * parallax,
    camPos.y + pointer.y * 1.3 * parallax,
    camPos.z
  );
  camera.lookAt(camLook.x + pointer.x * 1.2 * parallax, camLook.y - pointer.y * 0.6 * parallax, camLook.z);

  if (!isCoarse) {
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(world.crystals, false);
    const hit = hits.length ? hits[0].object : null;
    if (hit !== hovered) {
      if (hovered) hovered.userData.hover = 0;
      hovered = hit;
      if (hovered) {
        hovered.userData.hover = 1;
        tooltipEl.textContent = hovered.userData.label;
        tooltipEl.classList.add("is-on");
        document.body.classList.add("is-hovering");
      } else {
        tooltipEl.classList.remove("is-on");
        document.body.classList.remove("is-hovering");
      }
    }
    if (hovered) {
      tooltipEl.style.left = `${cursorX}px`;
      tooltipEl.style.top = `${cursorY}px`;
    }

    const lp = tmpV.set(pointer.x, pointer.y, 0.5).unproject(camera);
    lp.sub(camera.position).normalize();
    const dist = 22;
    lightTarget.copy(camera.position).addScaledVector(lp, dist);
    world.setCursorLight(lightTarget);
  }

  ringX = lerp(ringX, cursorX, 1 - Math.exp(-dt * 14));
  ringY = lerp(ringY, cursorY, 1 - Math.exp(-dt * 14));
  cursorEl.style.transform = `translate(${cursorX}px, ${cursorY}px) translate(-50%, -50%)`;
  cursorRingEl.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%, -50%)`;

  world.update(t, dt, lightTarget);
  bloom.strength = (lowPower ? 0.7 : 0.95) + Math.sin(t * 0.8) * 0.06;

  composer.render();
  requestAnimationFrame(tick);
}

applyTheme(0);
tick();

window.addEventListener("load", () => {
  setTimeout(finishLoading, 2500);
});
