import { createSignal, For, Show, type JSX } from "solid-js";

let nextId = 0;
const uniqueId = (prefix: string) => `${prefix}-${nextId++}`;

/** A collapsible group of controls. */
export const Section = (props: { title: string; open?: boolean; children: JSX.Element }) => (
  <details class="section" open={props.open ?? true}>
    <summary>{props.title}</summary>
    <div class="section-body">{props.children}</div>
  </details>
);

/**
 * A labelled slider. The displayed value follows the thumb while dragging, but
 * `onCommit` only fires on release, so dragging a simulation parameter restarts
 * the simulation once rather than on every pixel.
 */
export const Slider = (props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  onCommit: (value: number) => void;
}) => {
  const id = uniqueId("slider");
  const [draft, setDraft] = createSignal<number | undefined>();
  const shown = () => draft() ?? props.value;
  return (
    <div class="field">
      <label for={id}>
        <span>{props.label}</span>
        <output>{props.format?.(shown()) ?? shown()}</output>
      </label>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={shown()}
        onInput={(event) => setDraft(event.currentTarget.valueAsNumber)}
        onChange={(event) => {
          // Read the value first: clearing the draft re-renders the input with the old value.
          props.onCommit(event.currentTarget.valueAsNumber);
          setDraft(undefined);
        }}
      />
    </div>
  );
};

export const Choice = <T extends string>(props: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; title?: string; disabled?: boolean }[];
  onChange: (value: T) => void;
}) => {
  // A shared name groups the radios, so arrow keys move between options.
  const name = uniqueId("choice");
  return (
    <fieldset class="field choice">
      <legend>{props.label}</legend>
      <div class="choice-options">
        <For each={props.options}>
          {(option) => (
            <label class="choice-option" title={option.title}>
              <input
                type="radio"
                name={name}
                disabled={option.disabled ?? false}
                checked={props.value === option.value}
                onChange={() => {
                  props.onChange(option.value);
                }}
              />
              <span>{option.label}</span>
            </label>
          )}
        </For>
      </div>
    </fieldset>
  );
};

/** A checkbox, with an optional note beside its label (also read out as its description). */
export const Toggle = (props: {
  label: string;
  checked: boolean;
  note?: string | undefined;
  onChange: (checked: boolean) => void;
}) => {
  const noteId = uniqueId("note");
  return (
    <label class="toggle">
      <input
        type="checkbox"
        checked={props.checked}
        aria-describedby={props.note === undefined ? undefined : noteId}
        onChange={(event) => {
          props.onChange(event.currentTarget.checked);
        }}
      />
      <span>{props.label}</span>
      <Show when={props.note}>
        <span class="toggle-note" id={noteId}>
          {props.note}
        </span>
      </Show>
    </label>
  );
};
