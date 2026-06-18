const GeometryDash = require('./src/game-core.js');

const canvas = wx.createCanvas();

function createWxStorage() {
  return {
    read(key) {
      try {
        const value = wx.getStorageSync(key);
        if (value === '' || value == null) return null;
        return typeof value === 'string' ? value : JSON.stringify(value);
      } catch (error) {
        return null;
      }
    },
    write(key, value) {
      try {
        wx.setStorageSync(key, value);
      } catch (error) {
        // Storage failures should not break a single-player run.
      }
    }
  };
}

function createWxAudio() {
  let context = null;
  const tones = {
    click: [460, 0.05, 'sine'],
    coin: [880, 0.08, 'triangle'],
    hurt: [150, 0.12, 'sawtooth'],
    boss: [520, 0.05, 'square'],
    win: [720, 0.16, 'triangle'],
    fail: [120, 0.22, 'sine']
  };

  function getContext() {
    if (context) return context;
    if (typeof wx.createWebAudioContext !== 'function') return null;
    try {
      context = wx.createWebAudioContext();
    } catch (error) {
      context = null;
    }
    return context;
  }

  return {
    play(name) {
      const audio = getContext();
      const tone = tones[name] || tones.click;
      if (audio && typeof audio.createOscillator === 'function') {
        if (audio.state === 'suspended' && typeof audio.resume === 'function') {
          audio.resume();
        }
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = tone[2];
        oscillator.frequency.value = tone[0];
        gain.gain.setValueAtTime(0.0001, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + tone[1]);
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start();
        oscillator.stop(audio.currentTime + tone[1] + 0.02);
        return;
      }
      if (typeof wx.vibrateShort === 'function' && (name === 'hurt' || name === 'win' || name === 'fail')) {
        wx.vibrateShort({ type: name === 'hurt' ? 'light' : 'medium' });
      }
    }
  };
}

const systemInfo = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
const game = new GeometryDash.GeometryDashGame({
  canvas,
  storage: createWxStorage(),
  audio: createWxAudio(),
  env: 'wechat',
  pixelRatio: systemInfo.pixelRatio || 1,
  requestAnimationFrame: typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (callback) => setTimeout(() => callback(Date.now()), 16),
  cancelAnimationFrame: typeof cancelAnimationFrame === 'function'
    ? cancelAnimationFrame
    : clearTimeout
});

function resize() {
  const info = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
  game.resize(info.windowWidth || 375, info.windowHeight || 667, info.pixelRatio || 1);
}

resize();
game.start();

if (typeof wx.onWindowResize === 'function') {
  wx.onWindowResize(resize);
}

wx.onTouchStart((event) => {
  const touch = event.touches && event.touches[0];
  if (touch) game.pointerDown(touch.clientX, touch.clientY);
});

wx.onTouchMove((event) => {
  const touch = event.touches && event.touches[0];
  if (touch) game.pointerMove(touch.clientX, touch.clientY);
});

wx.onTouchEnd((event) => {
  const touch = event.changedTouches && event.changedTouches[0];
  game.pointerUp(touch ? touch.clientX : null, touch ? touch.clientY : null);
});

if (typeof wx.onKeyDown === 'function') {
  wx.onKeyDown((event) => {
    const rawKey = event.key || event.code || '';
    const key = rawKey.length === 1 ? rawKey.toLowerCase() : rawKey;
    const keyMap = {
      ArrowLeft: 'left',
      Left: 'left',
      ArrowRight: 'right',
      Right: 'right',
      ArrowUp: 'up',
      Up: 'up',
      ArrowDown: 'down',
      Down: 'down',
      KeyA: 'left',
      a: 'left',
      KeyD: 'right',
      d: 'right',
      KeyW: 'up',
      w: 'up',
      KeyS: 'down',
      s: 'down'
    };
    const direction = keyMap[key];
    if (direction) game.handleDirectionalInput(direction);
  });
}

if (typeof wx.onHide === 'function') {
  wx.onHide(() => game.handleAppHide());
}

if (typeof wx.onShow === 'function') {
  wx.onShow(() => game.handleAppShow());
}
