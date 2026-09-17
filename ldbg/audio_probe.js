(() => {
  const log = (window.__audioLog = []);
  let next = 0;
  const desc = Object.getOwnPropertyDescriptor(AudioParam.prototype, 'value');
  const wrap = (proto) => {
    const original = proto.createGain;
    proto.createGain = function () {
      const node = original.call(this);
      const id = next++;
      node.__probeId = id;
      const param = node.gain;
      Object.defineProperty(param, 'value', {
        get() { return desc.get.call(param); },
        set(v) { log.push(['set', id, v]); desc.set.call(param, v); },
      });
      for (const method of ['setValueAtTime', 'linearRampToValueAtTime', 'setTargetAtTime']) {
        const m = param[method].bind(param);
        param[method] = (v, ...rest) => { log.push([method, id, v]); return m(v, ...rest); };
      }
      log.push(['create', id]);
      return node;
    };
  };
  wrap(AudioContext.prototype);
  if (window.BaseAudioContext) wrap(BaseAudioContext.prototype);
})();
(() => {
  const log = window.__audioLog;
  let nextNode = 1000;
  const idOf = (node) => {
    if (node == null) return null;
    if (node.__probeId === undefined) {
      try { node.__probeId = (node instanceof AudioDestinationNode ? 'DEST' : node.constructor.name + '#' + (nextNode++)); } catch (e) { return String(node); }
    }
    return node.__probeId;
  };
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dst, ...rest) {
    log.push(['connect', idOf(this), dst instanceof AudioParam ? 'param' : idOf(dst)]);
    return connect.call(this, dst, ...rest);
  };
  const disconnect = AudioNode.prototype.disconnect;
  AudioNode.prototype.disconnect = function (...args) {
    log.push(['disconnect', idOf(this), args[0] ? idOf(args[0]) : '*']);
    return disconnect.apply(this, args);
  };
})();
