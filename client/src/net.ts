import type { ClientMsg, ServerMsg } from '../../shared/protocol.ts';

export class Net {
  private ws: WebSocket;
  onMessage: (msg: ServerMsg) => void = () => {};
  onClose: () => void = () => {};

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (e) => this.onMessage(JSON.parse(e.data)));
    ws.addEventListener('close', () => this.onClose());
  }

  static connect(): Promise<Net> {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    return new Promise((resolve, reject) => {
      ws.addEventListener('open', () => resolve(new Net(ws)), { once: true });
      ws.addEventListener('error', () => reject(new Error('Could not reach the game server.')), { once: true });
    });
  }

  send(msg: ClientMsg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}
