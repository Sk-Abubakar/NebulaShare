import type { ChatMessage } from "../lib/gemini";

declare global {
  interface Window {
    Peer?: new (...args: unknown[]) => unknown;
    NebulaQR?: {
      renderSVG: (value: string, svg: SVGElement, opts?: Record<string, unknown>) => void;
    };
    NebulaAI?: {
      ask: (messages: ChatMessage[], prompt: string) => Promise<string>;
    };
    NebulaUnmount?: () => void;
  }
}

export {};
