/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { throttle } from '../utils/throttle';

import './PromptController';
import './PlayPauseButton';
import type { PlaybackState, Prompt } from '../types';
import { MidiDispatcher } from '../utils/MidiDispatcher';

/** The grid of prompt inputs. */
@customElement('prompt-dj-midi')
export class PromptDjMidi extends LitElement {
  static styles = css`
    :host {
      height: 100%;
      width: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      box-sizing: border-box;
      position: relative;
      padding: 30px 20px 20px 20px;
    }
    #background {
      will-change: background-image;
      position: absolute;
      inset: 0;
      z-index: -1;
      border-radius: 8px;
    }
    #grid {
      width: min(98%, 700px);
      max-height: 85%;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      grid-template-rows: repeat(3, 1fr);
      gap: clamp(12px, 2.5vmin, 20px);
      margin: 40px auto 5px auto;
      justify-items: center;
      align-items: center;
      aspect-ratio: 4/2.8;
      padding: 5px;
    }
    prompt-controller {
      width: 100%;
      height: 100%;
      max-width: 95px;
      max-height: 85px;
      min-width: 60px;
      min-height: 55px;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    play-pause-button {
      position: relative;
      width: clamp(45px, 7vmin, 60px);
      margin-top: -25px;
      z-index: 2;
      animation: pulse 2s ease-in-out infinite;
    }
    
    @keyframes pulse {
      0%, 100% {
        transform: scale(1);
        filter: drop-shadow(0 0 10px rgba(0, 255, 100, 0.3));
      }
      50% {
        transform: scale(1.08);
        filter: drop-shadow(0 0 25px rgba(0, 255, 100, 0.8));
      }
    }
    #buttons {
      position: absolute;
      top: 6px;
      left: 10px;
      display: flex;
      flex-direction: row;
      gap: 6px;
      z-index: 3;
      align-items: flex-start;
    }
    button {
      font: inherit;
      font-weight: 600;
      font-size: 10px;
      cursor: pointer;
      color: #00ff64;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(6px);
      -webkit-font-smoothing: antialiased;
      border: 1px solid rgba(0, 255, 100, 0.3);
      border-radius: 4px;
      user-select: none;
      padding: 4px 8px;
      transition: all 0.2s ease;
      &:hover {
        background: rgba(0, 0, 0, 0.8);
        border-color: rgba(0, 255, 100, 0.5);
        color: #00ff88;
        box-shadow: 0 0 8px rgba(0, 255, 100, 0.2);
      }
      &.active {
        background: linear-gradient(145deg, #00ff64, #00cc50);
        color: #000;
        border-color: rgba(0, 255, 100, 0.8);
        box-shadow: 
          0 2px 8px rgba(0, 255, 100, 0.3),
          inset 0 1px 0 rgba(255, 255, 255, 0.3);
      }
    }
    select {
      font: inherit;
      font-size: 10px;
      padding: 4px 6px;
      background: rgba(0, 0, 0, 0.8);
      color: #00ff64;
      border-radius: 4px;
      border: 1px solid rgba(0, 255, 100, 0.3);
      outline: none;
      cursor: pointer;
      transition: all 0.2s ease;
      &:hover {
        background: rgba(0, 0, 0, 0.9);
        border-color: rgba(0, 255, 100, 0.5);
        box-shadow: 0 0 6px rgba(0, 255, 100, 0.2);
      }
      option {
        background: #000;
        color: #00ff64;
      }
    }
    
    /* Mobile adjustments */
    @media (max-width: 768px) {
      :host {
        padding: 8px 6px 6px 6px;
      }
      #grid {
        width: 99%;
        gap: clamp(10px, 2vmin, 15px);
        padding: 3px;
        max-height: 90%;
        margin: 30px auto 3px auto;
      }
      prompt-controller {
        max-width: 80px;
        max-height: 70px;
        min-width: 50px;
        min-height: 45px;
      }
      #buttons {
        top: 4px;
        left: 6px;
        gap: 4px;
      }
      button, select {
        font-size: 9px;
        padding: 3px 6px;
      }
      play-pause-button {
        width: clamp(30px, 4vmin, 45px);
        margin-top: -20px;
      }
    }
  `;

  private prompts: Map<string, Prompt>;
  private midiDispatcher: MidiDispatcher;

  @property({ type: Boolean }) private showMidi = false;
  @property({ type: String }) public playbackState: PlaybackState = 'stopped';
  @state() public audioLevel = 0;
  @state() private midiInputIds: string[] = [];
  @state() private activeMidiInputId: string | null = null;

  @property({ type: Object })
  private filteredPrompts = new Set<string>();

  constructor(
    initialPrompts: Map<string, Prompt>,
  ) {
    super();
    this.prompts = initialPrompts;
    this.midiDispatcher = new MidiDispatcher();
  }

  private handlePromptChanged(e: CustomEvent<Prompt>) {
    const { promptId, text, weight, cc } = e.detail;
    const prompt = this.prompts.get(promptId);

    if (!prompt) {
      console.error('prompt not found', promptId);
      return;
    }

    prompt.text = text;
    prompt.weight = weight;
    prompt.cc = cc;

    const newPrompts = new Map(this.prompts);
    newPrompts.set(promptId, prompt);

    this.prompts = newPrompts;
    this.requestUpdate();

    this.dispatchEvent(
      new CustomEvent('prompts-changed', { detail: this.prompts }),
    );
  }

  /** Generates radial gradients for each prompt based on weight and color. */
  private readonly makeBackground = throttle(
    () => {
      // Return empty background to remove colored gradients
      return '';
    },
    30, // don't re-render more than once every XXms
  );

  private toggleShowMidi() {
    return this.setShowMidi(!this.showMidi);
  }

  public async setShowMidi(show: boolean) {
    this.showMidi = show;
    if (!this.showMidi) return;
    try {
      const inputIds = await this.midiDispatcher.getMidiAccess();
      this.midiInputIds = inputIds;
      this.activeMidiInputId = this.midiDispatcher.activeMidiInputId;
    } catch (e: any) {
      this.showMidi = false;
      this.dispatchEvent(new CustomEvent('error', {detail: e.message}));
    }
  }

  private handleMidiInputChange(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const newMidiId = selectElement.value;
    this.activeMidiInputId = newMidiId;
    this.midiDispatcher.activeMidiInputId = newMidiId;
  }

  private playPause() {
    this.dispatchEvent(new CustomEvent('play-pause'));
  }

  public addFilteredPrompt(prompt: string) {
    this.filteredPrompts = new Set([...this.filteredPrompts, prompt]);
  }

  render() {
    const bg = styleMap({
      backgroundImage: this.makeBackground(),
    });
    return html`<div id="background" style=${bg}></div>
      <div id="buttons">
        <button
          @click=${this.toggleShowMidi}
          class=${this.showMidi ? 'active' : ''}
          >MIDI</button
        >
        <select
          @change=${this.handleMidiInputChange}
          .value=${this.activeMidiInputId || ''}
          style=${this.showMidi ? '' : 'visibility: hidden'}>
          ${this.midiInputIds.length > 0
        ? this.midiInputIds.map(
          (id) =>
            html`<option value=${id}>
                    ${this.midiDispatcher.getDeviceName(id)}
                  </option>`,
        )
        : html`<option value="">No devices found</option>`}
        </select>
      </div>
      <div id="grid">${this.renderPrompts()}</div>
      <play-pause-button .playbackState=${this.playbackState} @click=${this.playPause}></play-pause-button>`;
  }

  private renderPrompts() {
    return [...this.prompts.values()].map((prompt) => {
      return html`<prompt-controller
        promptId=${prompt.promptId}
        ?filtered=${this.filteredPrompts.has(prompt.text)}
        cc=${prompt.cc}
        text=${prompt.text}
        weight=${prompt.weight}
        color=${prompt.color}
        .midiDispatcher=${this.midiDispatcher}
        .showCC=${this.showMidi}
        audioLevel=${this.audioLevel}
        @prompt-changed=${this.handlePromptChanged}>
      </prompt-controller>`;
    });
  }
}
