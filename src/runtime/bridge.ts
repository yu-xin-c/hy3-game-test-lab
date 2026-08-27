export interface GameEvent {
  seq: number;
  tick: number;
  type: string;
  payload?: unknown;
}

export interface GameObservation {
  tick: number;
  status: "menu" | "playing" | "won" | "lost";
  state: Record<string, unknown>;
  latest_event_seq: number;
}

export interface PRD2PlayBridge {
  protocol: "prd2play/1";
  isReady(): boolean;
  reset(options: { seed: number }): Promise<void> | void;
  observe(): Promise<GameObservation> | GameObservation;
  getEvents(options: { afterSeq: number }): Promise<GameEvent[]> | GameEvent[];
}

declare global {
  interface Window {
    __PRD2PLAY__?: PRD2PlayBridge;
  }
}

