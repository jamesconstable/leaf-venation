import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { leafOutlines } from "../catalogue/leafOutlines";
import { outlineRegion } from "../outline/outline";
import { isStarShapedFrom } from "../outline/starShaped";
import type { Overlays } from "../render/leafRenderer";
import { styleOptionValues, type Style, type StyleOptionValues } from "../render/style";
import { defaultStyle, styles } from "../render/styles";
import { simulationConfig, type Growth, type Venation } from "../simulation/simulation";
import type { VenationSnapshot } from "../simulation/snapshot";
import { SimulationClient } from "../worker/simulationClient";
import { Backdrop } from "./Backdrop";
import { Choice, Section, Slider, Toggle } from "./controls";
import { LeafCanvas } from "./LeafCanvas";
import { resolveOverlays, setByStyle, type ChosenOverlays } from "./overlayChoice";
import { StyleSwatches } from "./StyleSwatches";

const newRandomSeed = () => Math.random().toString(36).slice(2, 8);

const growthNames = {
  none: "no growth",
  marginal: "marginal growth",
  isogonic: "isogonic growth",
} as const;

const statusLabels = {
  growing: "Growing…",
  settled: "Finished",
  budgetReached: "Stopped at the vein node limit",
} as const;

export const App = () => {
  // Simulation parameters: changing any of these restarts the simulation.
  const [outlineId, setOutlineId] = createSignal(leafOutlines[0]?.id ?? "");
  const [venation, setVenation] = createSignal<Venation>("open");
  const [killDistance, setKillDistance] = createSignal(0.005);
  const [birthDistance, setBirthDistance] = createSignal(0.02);
  const [dartDensity, setDartDensity] = createSignal(300);
  const [growthType, setGrowthType] = createSignal<Growth["type"]>("marginal");
  const [initialSize, setInitialSize] = createSignal(0.2);
  const [growthPerStep, setGrowthPerStep] = createSignal(0.005);
  const [detail, setDetail] = createSignal(200);
  const [randomSeed, setRandomSeed] = createSignal(newRandomSeed());

  // Render settings: changing these redraws without restarting.
  const [style, setStyle] = createSignal<Style>(defaultStyle);
  const [chosenOverlays, setChosenOverlays] = createSignal<ChosenOverlays>({});
  const overlays = createMemo(() => resolveOverlays(style(), chosenOverlays()));
  const overlayToggle = (key: keyof Overlays) => ({
    checked: overlays()[key],
    note: setByStyle(style(), chosenOverlays(), key) ? "Switched on by this style" : undefined,
    onChange: (checked: boolean) => setChosenOverlays({ ...chosenOverlays(), [key]: checked }),
  });
  const [veinWidthExponent, setVeinWidthExponent] = createSignal(2);
  // The viewer's choices for each style's own options, by style id.
  const [styleOptions, setStyleOptions] = createSignal<Readonly<Record<string, StyleOptionValues>>>(
    {},
  );
  const chosenOptions = () => styleOptions()[style().id] ?? {};
  const chooseOption = (id: string, value: number | boolean) =>
    setStyleOptions({ ...styleOptions(), [style().id]: { ...chosenOptions(), [id]: value } });

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
  const blade = createMemo(() => {
    const leafOutline = outline();
    return leafOutline === undefined ? undefined : outlineRegion(leafOutline);
  });
  // Marginal growth only works if the whole blade can be seen from its base.
  const marginalAllowed = createMemo(() => {
    const region = blade();
    return region !== undefined && isStarShapedFrom(region);
  });
  createEffect(() => {
    if (growthType() === "marginal" && !marginalAllowed()) setGrowthType("isogonic");
  });
  const growth = createMemo<Growth>(() => {
    const type = growthType();
    return type === "none"
      ? { type }
      : { type, initialSize: initialSize(), growthPerStep: growthPerStep() };
  });

  const config = createMemo(() => {
    const leafOutline = outline();
    const region = blade();
    if (leafOutline === undefined || region === undefined) return undefined;
    return simulationConfig({
      blade: region,
      initialVeinNodes: leafOutline.initialVeinNodes,
      parameters: {
        venation: venation(),
        killDistance: killDistance(),
        birthDistance: birthDistance(),
        dartDensity: dartDensity(),
        growth: growth(),
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
    <div class="app" style={themeVariables(style())}>
      <main class="stage">
        <Backdrop backdrop={style().backdrop} outline={blade()?.outer ?? []} />
        <LeafCanvas
          scene={{
            blade: config()?.blade ?? { outer: [], holes: [], bounds: emptyBounds, area: 0 },
            killDistance: config()?.killDistance ?? 0,
            snapshot: snapshot(),
          }}
          settings={{
            style: style(),
            overlays: overlays(),
            veinWidthExponent: veinWidthExponent(),
            styleOptions: chosenOptions(),
          }}
        />
        <p class="caption" aria-live="polite">
          <span>
            <span class="caption-title">
              {leafOutlines.find(({ id }) => id === outlineId())?.name}
            </span>
            {` · ${venation()} venation · ${growthNames[growthType()]}`}
          </span>
          <span class="caption-status">
            {snapshot() === undefined
              ? "Starting…"
              : `${statusLabels[snapshot()?.status ?? "growing"]} Step ${snapshot()?.stepCount ?? 0}, ${(snapshot()?.xs.length ?? 0).toLocaleString()} vein nodes`}
          </span>
        </p>
      </main>

      <aside class="panel">
        <h1>Leaf Venation</h1>

        <Section title="Style">
          <StyleSwatches
            styles={styles}
            selected={style()}
            blade={config()?.blade}
            snapshot={snapshot()}
            veinWidthExponent={veinWidthExponent()}
            onSelect={setStyle}
          />
        </Section>

        <Show when={style().options}>
          {(options) => (
            <Section title="Style options">
              <For each={options()}>
                {(option) => {
                  const value = () => styleOptionValues(style(), chosenOptions())[option.id];
                  return option.kind === "toggle" ? (
                    <Toggle
                      label={option.label}
                      checked={value() === true}
                      onChange={(checked) => chooseOption(option.id, checked)}
                    />
                  ) : (
                    <Slider
                      label={option.label}
                      value={typeof value() === "number" ? Number(value()) : option.initial}
                      min={option.min}
                      max={option.max}
                      step={option.step}
                      format={(v) => String(Number(v.toFixed(4)))}
                      onCommit={(v) => chooseOption(option.id, v)}
                    />
                  );
                }}
              </For>
              <div class="button-row">
                <button
                  type="button"
                  disabled={Object.keys(chosenOptions()).length === 0}
                  onClick={() => setStyleOptions({ ...styleOptions(), [style().id]: {} })}
                  title="Return this style's options to their suggested settings"
                >
                  Reset style options
                </button>
              </div>
            </Section>
          )}
        </Show>

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
              setKillDistance(value === "closed" ? 0 : 0.005);
            }}
          />
        </Section>

        <Section title="Growth">
          <Choice
            label="Growth type"
            value={growthType()}
            options={[
              { value: "none", label: "No growth", title: "The leaf keeps its full size" },
              {
                value: "marginal",
                label: "Marginal",
                title: marginalAllowed()
                  ? "The leaf expands only at its margin; veins stay where they formed"
                  : "Unavailable: parts of this outline can't be seen from its base, so a growing margin would leave veins outside the leaf",
                disabled: !marginalAllowed(),
              },
              {
                value: "isogonic",
                label: "Isogonic",
                title: "The whole leaf, veins included, expands equally in every direction",
              },
            ]}
            onChange={setGrowthType}
          />
          <Show when={growthType() !== "none"}>
            <Slider
              label="Initial size"
              value={initialSize()}
              min={0.05}
              max={0.9}
              step={0.05}
              format={(value) => `${Math.round(value * 100)}%`}
              onCommit={setInitialSize}
            />
            <Slider
              label="Growth per step"
              value={growthPerStep()}
              min={0.001}
              max={0.02}
              step={0.001}
              format={percent}
              onCommit={setGrowthPerStep}
            />
          </Show>
        </Section>

        <Section title="Simulation" open={false}>
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

        <Section title="Display" open={false}>
          <Toggle label="Auxin sources" {...overlayToggle("auxinSources")} />
          <Toggle label="Vein nodes" {...overlayToggle("veinNodes")} />
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
      </aside>
    </div>
  );
};

const emptyBounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };

/** The style's theme, as CSS custom properties for the interface. */
const themeVariables = ({ theme }: Style) => ({
  "--accent": theme.accent,
  "--on-accent": theme.onAccent,
  "--card": theme.card,
  "--card-edge": theme.cardEdge,
  "--text": theme.text,
  "--muted": theme.muted,
  "--stage": theme.stage,
});
