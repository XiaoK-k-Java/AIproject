export class Network extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.socket = null;
    this.stopped = false;
    this.reconnectTimer = null;
    this.reconnectDelay = 800;
    this.pingTimer = null;
    this.pingStartedAt = 0;
    this.attempts = 0;
  }

  connect() {
    if (this.stopped) return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.emit('connecting');
    let socket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.attempts = 0;
      this.reconnectDelay = 800;
      this.emit('open');
      this.startPing();
    });

    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!message || typeof message.type !== 'string') return;

      if (message.type === 'pong') {
        const latency = Math.max(0, Date.now() - Number(message.t || 0));
        this.emit('latency', latency);
        return;
      }

      this.emit('message', message);
      this.emit(message.type, message);
    });

    socket.addEventListener('close', (event) => {
      this.stopPing();
      this.emit('close', { code: event.code, wasClean: event.wasClean });
      if (!this.stopped) this.scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      // The close event handles reconnection. This keeps the console clean.
    });
  }

  startPing() {
    this.stopPing();
    const sendPing = () => {
      if (!this.isOpen()) return;
      this.send({ type: 'ping', t: Date.now() });
    };
    sendPing();
    this.pingTimer = window.setInterval(sendPing, 4000);
  }

  stopPing() {
    if (this.pingTimer) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    const delay = this.reconnectDelay * (0.9 + Math.random() * 0.2);
    this.emit('reconnecting', { delay, attempts: this.attempts });
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.attempts += 1;
      this.reconnectDelay = Math.min(5000, this.reconnectDelay * 1.65);
      this.connect();
    }, delay);
  }

  send(message) {
    if (!this.isOpen()) return false;
    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  isOpen() {
    return Boolean(this.socket) && this.socket.readyState === WebSocket.OPEN;
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  stop() {
    this.stopped = true;
    this.stopPing();
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close(1000, 'Client closed');
      this.socket = null;
    }
  }
}
