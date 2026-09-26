// The fixtures of spec 1.4, as written there. `calls` is a live binding: each test calls resetCalls().
export let calls;
export const resetCalls = () => {
  calls = [];
};

export function makePair(tag) {
  const Message = class { constructor(v) { this.v = v; } };
  const Handler = class {
    handle(m) {
      calls.push([tag, m]);
      return { tag, v: m.v };
    }
  };
  return [Message, Handler];
}

export const [A, AH] = makePair('A'); // a command pair
export const [B, BH] = makePair('B'); // a second command pair
export const [Q, QH] = makePair('Q'); // a query pair

export const cmd = { './A.js': { default: A }, './AHandler.js': { default: AH } };
export const qry = { './Q.js': { default: Q }, './QHandler.js': { default: QH } };
