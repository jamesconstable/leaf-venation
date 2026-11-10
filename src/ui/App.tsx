import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { leafOutlines } from "../catalogue/leafOutlines";
import { outlineRegion } from "../outline/outline";
import type { Overlays } from "../render/plainRenderer";
import { simulationConfig, type Venation } from "../simulation/simulation";
import type { VenationSnapshot } from "../simulation/snapshot";
import { SimulationClient } from "../worker/simulationClient";
import { Choice, Section, Slider, Toggle } from "./controls";
import { LeafCanvas } from "./LeafCanvas";

const newRandomSeed = () => Math.random().toString(36).slice(2, 8);

const statusLabels = {
  growing: "Growing…",
  settled: "Finished",
  budgetReached: "Stopped at the vein node limit",
} as const;

export const App = () => {
  // Simulation parameters: changing any of these restarts the simulation.
  const [outlineId, setOutlineId] = createSignal(leafOutlines[0]?.id ?? "");
  const [venation, setVenation] = createSignal<Venation>("open");
  const [killDistance, setKillDistance] = createSignal(0.04);
  const [birthDistance, setBirthDistance] = createSignal(0.05);
  const [dartDensity, setDartDensity] = createSignal(300);
  const [detail, setDetail] = createSignal(200);
  const [randomSeed, setRandomSeed] = createSignal(newRandomSeed());

  // Render settings: changing these redraws without restarting.
  const [overlays, setOverlays] = createSignal<Overlays>({ auxinSources: true, veinNodes: false });
  const [veinWidthExponent, setVeinWidthExponent] = createSignal(2);

  // Playback.
  const [stepsPerFrame, setStepsPerFrame] = createSignal(2);
  const [paused, setPaused] = createSignal(false);

  const [snapshot, setSnapshot] = createSignal<VenationSnapshot>();
  const client = new SimulationClient(setSnapshot);
  onCleanup(() => {
    client.dispose();
  });

  const outline = createMemo(
    () => (leafOutlines.find(({ id }) => id === outlineId()) ?? leafOutlines[0])?.outline,
  );
  const config = createMemo(() => {
    const leafOutline = outline();
    if (leafOutline === undefined) return undefined;
    return simulationConfig({
      blade: outlineRegion(leafOutline),
      initialVeinNodes: leafOutline.initialVeinNodes,
      parameters: {
        venation: venation(),
        killDistance: killDistance(),
        birthDistance: birthDistance(),
        dartDensity: dartDensity(),
        growth: { type: "none" },
      },
      detail: detail(),
      randomSeed: randomSeed(),
    });
  });

  createEffect(() => {
    const current = config();
    if (current === undefined) return;
    setSnapshot(undefined);
    client.start(current);
  });

  let frame = requestAnimationFrame(function tick() {
    if (!paused()) client.advance(stepsPerFrame());
    frame = requestAnimationFrame(tick);
  });
  onCleanup(() => {
    cancelAnimationFrame(frame);
  });

  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

  return (
    <div class="app">
      <aside class="panel">
        <h1>Leaf Venation</h1>

        <Section title="Leaf">
          <Choice
            label="Leaf outline"
            value={outlineId()}
            options={leafOutlines.map(({ id, name, description }) => ({
              value: id,
              label: name,
              title: description,
            }))}
            onChange={setOutlineId}
          />
          <Choice
            label="Venation"
            value={venation()}
            options={[
              { value: "open", label: "Open", title: "Veins branch but never rejoin" },
              { value: "closed", label: "Closed", title: "Veins may rejoin, forming loops" },
            ]}
            onChange={(value) => {
              setVenation(value);
              // Closed patterns need the smallest kill distance (the paper uses one vein
              // segment length); with a large one they look just like open patterns.
              setKillDistance(value === "closed" ? 0 : 0.04);
            }}
          />
        </Section>

        <Section title="Simulation">
          <Slider
            label="Kill distance"
            value={killDistance()}
            min={0}
            max={0.15}
            step={0.005}
            format={(value) => (value === 0 ? "Minimum" : percent(value))}
            onCommit={setKillDistance}
          />
          <Slider
            label="Birth distance"
            value={birthDistance()}
            min={0.01}
            max={0.15}
            step={0.005}
            format={percent}
            onCommit={setBirthDistance}
          />
          <Slider
            label="Dart density"
            value={dartDensity()}
            min={20}
            max={2000}
            step={10}
            onCommit={setDartDensity}
          />
          <Slider
            label="Detail"
            value={detail()}
            min={50}
            max={600}
            step={10}
            onCommit={setDetail}
          />
          <div class="field">
            <label for="random-seed">
              <span>Random seed</span>
            </label>
            <div class="seed-row">
              <input
                id="random-seed"
                type="text"
                value={randomSeed()}
                spellcheck={false}
                onChange={(event) => setRandomSeed(event.currentTarget.value)}
              />
              <button
                type="button"
                onClick={() => setRandomSeed(newRandomSeed())}
                title="Grow a new leaf with a different random seed"
              >
                Reroll
              </button>
            </div>
            <p class="help">
              Not a plant seed: the starting point for the simulation's random choices. The same
              random seed and settings always grow exactly the same leaf.
            </p>
          </div>
        </Section>

        <Section title="Display">
          <Toggle
            label="Auxin sources"
            checked={overlays().auxinSources}
            onChange={(auxinSources) => setOverlays({ ...overlays(), auxinSources })}
          />
          <Toggle
            label="Vein nodes"
            checked={overlays().veinNodes}
            onChange={(veinNodes) => setOverlays({ ...overlays(), veinNodes })}
          />
          <Slider
            label="Vein width exponent"
            value={veinWidthExponent()}
            min={1.5}
            max={4}
            step={0.1}
            format={(value) => value.toFixed(1)}
            onCommit={setVeinWidthExponent}
          />
        </Section>

        <Section title="Playback">
          <Slider
            label="Speed (steps per frame)"
            value={stepsPerFrame()}
            min={1}
            max={20}
            step={1}
            onCommit={setStepsPerFrame}
          />
          <div class="button-row">
            <button type="button" onClick={() => setPaused(!paused())}>
              {paused() ? "Play" : "Pause"}
            </button>
            <button
              type="button"
              onClick={() => {
                const current = config();
                if (current !== undefined) client.start(current);
              }}
            >
              Restart
            </button>
          </div>
        </Section>

        <p class="status" aria-live="polite">
          {snapshot() === undefined
            ? "Starting…"
            : `${statusLabels[snapshot()?.status ?? "growing"]} Step ${snapshot()?.stepCount ?? 0}, ${snapshot()?.xs.length ?? 0} vein nodes`}
        </p>
      </aside>

      <main class="stage">
        <LeafCanvas
          scene={{
            blade: config()?.blade ?? { outer: [], holes: [], bounds: emptyBounds, area: 0 },
            killDistance: config()?.killDistance ?? 0,
            snapshot: snapshot(),
          }}
          settings={{ overlays: overlays(), veinWidthExponent: veinWidthExponent() }}
        />
      </main>
    </div>
  );
};

const emptyBounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
