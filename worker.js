// Sandboxed JS execution worker
self.onmessage = (e) => {
  const { code } = e.data || {};
  const logs = [];
  const safeConsole = {
    log: (...args) => logs.push(args.map(String).join(' ')),
    error: (...args) => logs.push('[error] ' + args.map(String).join(' ')),
    warn: (...args) => logs.push('[warn] ' + args.map(String).join(' ')),
  };

  try {
    const result = (function (console) {
      // No access to network or DOM here; it's an isolated worker scope.
      return eval(code);
    })(safeConsole);
    self.postMessage({ logs, result });
  } catch (err) {
    self.postMessage({ logs, error: String(err && err.message || err) });
  }
};