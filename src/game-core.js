(function initGeometryDash(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GeometryDash = factory();
  }
})(typeof self !== 'undefined' ? self : this, function geometryDashFactory() {
  'use strict';

  const SAVE_KEY = 'geometry-dash-save-v1';
  const LANES = 3;
  const GAME_NAME = '几何冲刺';

  const COLORS = {
    bgTop: '#f8fcfd',
    bgBottom: '#e9f6f7',
    text: '#284451',
    muted: '#7c96a0',
    border: '#d8e9ed',
    panel: 'rgba(255, 255, 255, 0.86)',
    panelSolid: '#ffffff',
    mint: '#65d6bd',
    mintDark: '#2db59d',
    coral: '#ff7f76',
    coralDark: '#dc5d56',
    lemon: '#ffd56a',
    sky: '#78c8ff',
    violet: '#a8a0ff',
    danger: '#ff6e76',
    shadow: 'rgba(48, 79, 91, 0.14)'
  };

  const TOTAL_LEVELS = 100;
  const LEVEL_DURATION_SECONDS = 120;
  const LEVELS = Array.from({ length: TOTAL_LEVELS }, (_, index) => {
    const id = index + 1;
    const t = index / (TOTAL_LEVELS - 1);
    return {
      id,
      speed: Math.round(250 + 180 * t),
      duration: LEVEL_DURATION_SECONDS,
      distance: Math.round(1250 + 1450 * t),
      obstacleDensity: Number((0.82 + 0.68 * t).toFixed(2)),
      coinDensity: Number((0.92 - 0.24 * t).toFixed(2)),
      bossHp: Math.round(95 + 430 * t),
      bossAttackRate: Number((1 + 0.75 * t).toFixed(2)),
      reward: Math.round(80 + 420 * t)
    };
  });

  const OBSTACLE_TYPES = ['plane', 'tank', 'truck', 'animal'];

  const SKINS = [
    {
      id: 'mint',
      name: '薄荷棱镜',
      price: 0,
      primary: '#65d6bd',
      secondary: '#dffff7',
      accent: '#2db59d',
      bonusLives: 0,
      coinMultiplier: 1
    },
    {
      id: 'coral',
      name: '珊瑚脉冲',
      price: 220,
      primary: '#ff7f76',
      secondary: '#ffe3df',
      accent: '#dc5d56',
      bonusLives: 1,
      coinMultiplier: 1
    },
    {
      id: 'lemon',
      name: '柠檬星轨',
      price: 320,
      primary: '#ffd56a',
      secondary: '#fff4c9',
      accent: '#e0a92f',
      bonusLives: 0,
      coinMultiplier: 1.18
    },
    {
      id: 'sky',
      name: '晴空折线',
      price: 460,
      primary: '#78c8ff',
      secondary: '#dff3ff',
      accent: '#399bd9',
      bonusLives: 1,
      coinMultiplier: 1.12
    }
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function formatNumber(value) {
    return Math.floor(value).toString();
  }

  function formatClock(seconds) {
    const total = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
  }

  function safeParseSave(raw) {
    if (!raw) return null;
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (error) {
      return null;
    }
  }

  function defaultSave() {
    return {
      coins: 0,
      unlockedSkins: ['mint'],
      currentSkin: 'mint',
      highestLevel: 1,
      soundEnabled: true
    };
  }

  function normalizeSave(save) {
    const base = defaultSave();
    const unlocked = Array.isArray(save && save.unlockedSkins) ? save.unlockedSkins : base.unlockedSkins;
    const currentSkin = SKINS.some((skin) => skin.id === save.currentSkin) ? save.currentSkin : base.currentSkin;
    return {
      coins: Math.max(0, Number(save && save.coins) || 0),
      unlockedSkins: Array.from(new Set(['mint'].concat(unlocked.filter((id) => SKINS.some((skin) => skin.id === id))))),
      currentSkin: unlocked.includes(currentSkin) || currentSkin === 'mint' ? currentSkin : 'mint',
      highestLevel: clamp(Math.floor(Number(save && save.highestLevel) || 1), 1, LEVELS.length),
      soundEnabled: typeof (save && save.soundEnabled) === 'boolean' ? save.soundEnabled : true
    };
  }

  function createNoopAudio() {
    return { play() {} };
  }

  function createBrowserStorage() {
    return {
      read(key) {
        try {
          return window.localStorage.getItem(key);
        } catch (error) {
          return null;
        }
      },
      write(key, value) {
        try {
          window.localStorage.setItem(key, value);
        } catch (error) {
          // Ignore unavailable storage in private or embedded contexts.
        }
      }
    };
  }

  function createBrowserAudio() {
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
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      if (!context) context = new AudioContext();
      return context;
    }

    return {
      play(name) {
        const audio = getContext();
        if (!audio) return;
        if (audio.state === 'suspended' && typeof audio.resume === 'function') {
          audio.resume();
        }
        const tone = tones[name] || tones.click;
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
      }
    };
  }

  class GeometryDashGame {
    constructor(options) {
      this.canvas = options.canvas;
      this.ctx = this.canvas.getContext('2d');
      this.storage = options.storage || { read: () => null, write: () => {} };
      this.audio = options.audio || createNoopAudio();
      this.env = options.env || 'browser';
      this.pixelRatio = options.pixelRatio || 1;
      this.requestAnimationFrame = options.requestAnimationFrame || (typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame.bind(typeof window !== 'undefined' ? window : null)
        : (callback) => setTimeout(() => callback(Date.now()), 16));
      this.cancelAnimationFrame = options.cancelAnimationFrame || (typeof cancelAnimationFrame === 'function'
        ? cancelAnimationFrame.bind(typeof window !== 'undefined' ? window : null)
        : clearTimeout);

      this.width = 375;
      this.height = 667;
      this.safeTop = 18;
      this.state = 'menu';
      this.buttons = [];
      this.pointer = null;
      this.lastTime = 0;
      this.frameId = null;
      this.elapsed = 0;
      this.save = this.loadSave();
      this.message = '';
      this.messageTimer = 0;
      this.selectedShopIndex = 0;
      this.backgroundShapes = this.createBackgroundShapes();
      this.resetRun(this.save.highestLevel);
    }

    loadSave() {
      return normalizeSave(safeParseSave(this.storage.read(SAVE_KEY)) || defaultSave());
    }

    persistSave() {
      this.storage.write(SAVE_KEY, JSON.stringify(normalizeSave(this.save)));
    }

    resize(width, height, pixelRatio) {
      this.width = Math.max(280, width || this.width);
      this.height = Math.max(480, height || this.height);
      this.pixelRatio = pixelRatio || this.pixelRatio || 1;
      this.canvas.width = Math.floor(this.width * this.pixelRatio);
      this.canvas.height = Math.floor(this.height * this.pixelRatio);
      this.canvas.style && (this.canvas.style.width = `${this.width}px`);
      this.canvas.style && (this.canvas.style.height = `${this.height}px`);
      this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      this.computeLayout();
    }

    computeLayout() {
      this.trackTop = this.height * 0.18;
      this.trackBottom = this.height * 0.87;
      this.trackCenter = this.width * 0.5;
      this.trackWidth = clamp(this.width * 0.68, 210, 315);
      this.laneWidth = this.trackWidth / LANES;
      this.playerY = this.height * 0.78;
      this.playerSize = clamp(this.width * 0.085, 28, 42);
      this.playerVisualSize = clamp(this.width * 0.068, 22, 32);
      this.hudTop = Math.max(16, this.height * 0.035);
      this.computeLaneCenters();
    }

    computeLaneCenters() {
      const left = this.trackCenter - this.trackWidth * 0.5;
      this.laneCenters = [0, 1, 2].map((lane) => left + this.laneWidth * (lane + 0.5));
    }

    createBackgroundShapes() {
      return Array.from({ length: 14 }, (_, index) => ({
        x: (index * 73) % 360,
        y: (index * 137) % 720,
        size: 10 + (index % 4) * 6,
        speed: 8 + (index % 5) * 3,
        color: [COLORS.mint, COLORS.sky, COLORS.lemon, COLORS.coral][index % 4],
        alpha: 0.08 + (index % 3) * 0.035,
        sides: index % 2 === 0 ? 4 : 3
      }));
    }

    start() {
      if (this.frameId) return;
      const tick = (time) => {
        this.frameId = this.requestAnimationFrame(tick);
        const now = Number(time) || Date.now();
        const dt = this.lastTime ? clamp((now - this.lastTime) / 1000, 0, 0.04) : 0;
        this.lastTime = now;
        this.update(dt);
        this.draw();
      };
      this.frameId = this.requestAnimationFrame(tick);
    }

    stop() {
      if (this.frameId) {
        this.cancelAnimationFrame(this.frameId);
        this.frameId = null;
      }
    }

    handleAppHide() {
      if (this.state === 'playing') this.state = 'paused';
      this.persistSave();
    }

    handleAppShow() {
      this.lastTime = 0;
      this.start();
    }

    getCurrentSkin() {
      return SKINS.find((skin) => skin.id === this.save.currentSkin) || SKINS[0];
    }

    getLevel(levelId) {
      return LEVELS[clamp((levelId || 1) - 1, 0, LEVELS.length - 1)];
    }

    resetRun(levelId) {
      this.level = this.getLevel(levelId);
      this.run = {
        levelId: this.level.id,
        phase: 'run',
        distance: 0,
        runTime: 0,
        lives: 3 + this.getCurrentSkin().bonusLives,
        coinsEarned: 0,
        bossHp: this.level.bossHp,
        bossMaxHp: this.level.bossHp,
        bossTimer: 0,
        bossHitTimer: 0,
        bossAttackFlash: 0,
        obstacleTimer: 0.9,
        coinTimer: 0.55,
        lane: 1,
        targetLane: 1,
        x: this.laneCenters ? this.laneCenters[1] : this.width * 0.5,
        verticalOffset: 0,
        targetVerticalOffset: 0,
        invuln: 0,
        phaseTimer: 0,
        combo: 0
      };
      this.entities = [];
      this.particles = [];
    }

    startLevel(levelId) {
      this.resetRun(levelId);
      this.state = 'playing';
      this.message = '';
      this.playSound('click');
    }

    playSound(name) {
      if (!this.save.soundEnabled) return;
      this.audio.play(name);
    }

    update(dt) {
      this.elapsed += dt;
      if (this.messageTimer > 0) this.messageTimer -= dt;
      this.updateParticles(dt);
      if (this.state === 'playing') this.updatePlaying(dt);
    }

    updatePlaying(dt) {
      const run = this.run;
      const level = this.level;
      run.phaseTimer += dt;
      run.invuln = Math.max(0, run.invuln - dt);
      run.bossHitTimer = Math.max(0, run.bossHitTimer - dt);
      run.bossAttackFlash = Math.max(0, run.bossAttackFlash - dt);
      run.x = lerp(run.x, this.laneCenters[run.targetLane], clamp(dt * 14, 0, 1));
      run.verticalOffset = lerp(run.verticalOffset, run.targetVerticalOffset, clamp(dt * 12, 0, 1));

      if (run.phase === 'run') {
        const speed = level.speed + Math.min(80, run.distance * 0.025);
        run.runTime += dt;
        run.distance += speed * dt;
        run.obstacleTimer -= dt;
        run.coinTimer -= dt;
        if (run.obstacleTimer <= 0) {
          this.spawnObstacle();
          run.obstacleTimer = clamp(1.06 / level.obstacleDensity - Math.random() * 0.18, 0.42, 1.15);
        }
        if (run.coinTimer <= 0) {
          this.spawnCoinTrail();
          run.coinTimer = clamp(1.2 / level.coinDensity + Math.random() * 0.22, 0.6, 1.45);
        }
        if (run.runTime >= level.duration) {
          run.phase = 'boss';
          run.phaseTimer = 0;
          this.entities = this.entities.filter((entity) => entity.kind === 'coin');
          this.message = 'BOSS';
          this.messageTimer = 1.1;
        }
      } else if (run.phase === 'boss') {
        run.bossHp = Math.max(0, run.bossHp - (16 + level.id * 2) * dt);
        run.bossTimer -= dt;
        if (run.bossTimer <= 0) {
          this.spawnBossAttack();
          run.bossTimer = clamp(1.0 / level.bossAttackRate + Math.random() * 0.28, 0.34, 0.95);
        }
        if (run.bossHp <= 0) {
          this.completeLevel();
          return;
        }
      }

      this.updateEntities(dt);
      this.checkCollisions();
    }

    updateEntities(dt) {
      const speed = this.level.speed * (this.run.phase === 'boss' ? 1.08 : 1);
      this.entities.forEach((entity) => {
        entity.y += (entity.speed || speed) * dt;
        entity.rotation += (entity.spin || 0) * dt;
      });
      this.entities = this.entities.filter((entity) => entity.y < this.height + 80 && !entity.dead);
    }

    updateParticles(dt) {
      this.particles.forEach((particle) => {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.life -= dt;
        particle.rotation += particle.spin * dt;
        particle.vy += 40 * dt;
      });
      this.particles = this.particles.filter((particle) => particle.life > 0);
    }

    spawnObstacle() {
      const blockedLanes = this.getBlockedLanesNear(this.trackTop - 50, 130);
      if (blockedLanes.size > 0) return;
      const candidates = [0, 1, 2].filter((lane) => !blockedLanes.has(lane));
      const lane = candidates[Math.floor(Math.random() * candidates.length)];
      const visual = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
      this.entities.push({
        kind: 'obstacle',
        visual,
        lane,
        x: this.laneCenters[lane],
        y: this.trackTop - 50,
        radius: this.playerSize * (visual === 'truck' ? 0.7 : 0.62),
        rotation: visual === 'plane' ? -0.12 + Math.random() * 0.24 : 0,
        spin: visual === 'plane' ? 0.35 : 0,
        speed: this.level.speed * (0.96 + Math.random() * 0.14)
      });
    }

    spawnCoinTrail() {
      const lane = Math.floor(Math.random() * LANES);
      const count = Math.random() > 0.58 ? 3 : 2;
      for (let index = 0; index < count; index += 1) {
        this.entities.push({
          kind: 'coin',
          lane,
          x: this.laneCenters[lane],
          y: this.trackTop - 40 - index * 44,
          radius: this.playerSize * 0.32,
          rotation: 0,
          spin: 3.4,
          speed: this.level.speed * 0.9
        });
      }
    }

    spawnBossAttack() {
      this.run.bossAttackFlash = 0.34;
      const pattern = Math.random();
      if (pattern < 0.62) {
        const lane = Math.floor(Math.random() * LANES);
        this.spawnBossBullet(lane, 'orb');
      } else if (pattern < 0.86) {
        const safeLane = Math.floor(Math.random() * LANES);
        const lanes = [0, 1, 2].filter((lane) => lane !== safeLane);
        this.spawnBossBullet(lanes[0], 'orb');
        this.spawnBossBullet(lanes[1], 'orb', 150);
      } else {
        const lane = Math.floor(Math.random() * LANES);
        this.spawnBossBullet(lane, 'beam');
      }
    }

    spawnBossBullet(lane, shape, delay) {
      const y = this.trackTop + 34 - (delay || 0);
      const blockedLanes = this.getBlockedLanesNear(y, 110);
      if (blockedLanes.size >= LANES - 1 && !blockedLanes.has(lane)) return;
      this.entities.push({
        kind: 'boss',
        shape,
        lane,
        x: this.laneCenters[lane],
        y,
        radius: this.playerSize * (shape === 'beam' ? 0.66 : 0.48),
        rotation: 0,
        spin: shape === 'orb' ? 4.2 : 0,
        speed: this.level.speed * 1.18 + this.level.id * 16
      });
    }

    getBlockedLanesNear(y, range) {
      const lanes = new Set();
      this.entities.forEach((entity) => {
        if (entity.dead || (entity.kind !== 'obstacle' && entity.kind !== 'boss')) return;
        if (Math.abs(entity.y - y) <= range) lanes.add(entity.lane);
      });
      return lanes;
    }

    checkCollisions() {
      const run = this.run;
      const playerLane = run.targetLane;
      const playerY = this.getPlayerY();
      for (const entity of this.entities) {
        if (entity.dead || entity.lane !== playerLane) continue;
        const dy = Math.abs(entity.y - playerY);
        const hitRange = entity.radius + this.playerVisualSize * 0.48;
        if (dy > hitRange) continue;
        if (entity.kind === 'coin') {
          entity.dead = true;
          const gain = Math.max(1, Math.round(8 * this.getCurrentSkin().coinMultiplier));
          run.coinsEarned += gain;
          run.combo += 1;
          this.emitParticles(entity.x, entity.y, COLORS.lemon, 8);
          this.playSound('coin');
        } else if (run.invuln <= 0) {
          entity.dead = true;
          this.damagePlayer(entity.kind === 'boss' ? 1 : 1);
        }
      }
    }

    damagePlayer(amount) {
      const run = this.run;
      run.lives -= amount;
      run.combo = 0;
      run.invuln = 1.05;
      this.emitParticles(run.x, this.getPlayerY(), COLORS.coral, 12);
      this.playSound('hurt');
      if (run.lives <= 0) {
        this.failLevel();
      }
    }

    completeLevel() {
      const level = this.level;
      const reward = level.reward + this.run.coinsEarned;
      this.save.coins += reward;
      this.save.highestLevel = Math.max(this.save.highestLevel, Math.min(level.id + 1, LEVELS.length));
      this.persistSave();
      this.result = {
        type: 'win',
        title: level.id === LEVELS.length ? '全部通关' : '关卡完成',
        detail: `奖励 ${reward} 金币`,
        levelId: level.id
      };
      this.state = 'result';
      this.emitParticles(this.width * 0.5, this.height * 0.28, COLORS.mint, 28);
      this.playSound('win');
    }

    failLevel() {
      this.result = {
        type: 'fail',
        title: '挑战失败',
        detail: `本局收集 ${this.run.coinsEarned} 金币`,
        levelId: this.level.id
      };
      this.state = 'result';
      this.playSound('fail');
    }

    emitParticles(x, y, color, count) {
      for (let index = 0; index < count; index += 1) {
        const angle = (Math.PI * 2 * index) / count + Math.random() * 0.3;
        const speed = 60 + Math.random() * 130;
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 3 + Math.random() * 5,
          color,
          life: 0.35 + Math.random() * 0.45,
          rotation: Math.random() * Math.PI,
          spin: -4 + Math.random() * 8
        });
      }
    }

    pointerDown(x, y) {
      this.pointer = { startX: x, startY: y, x, y, moved: false };
    }

    pointerMove(x, y) {
      if (!this.pointer) return;
      this.pointer.x = x;
      this.pointer.y = y;
      const dx = x - this.pointer.startX;
      if (Math.abs(dx) > 34 && Math.abs(dx) > Math.abs(y - this.pointer.startY) * 0.7) {
        this.pointer.moved = true;
        this.moveLane(dx > 0 ? 1 : -1);
        this.pointer.startX = x;
        this.pointer.startY = y;
      }
    }

    pointerUp(x, y) {
      if (!this.pointer) return;
      const start = this.pointer;
      this.pointer = null;
      const tapX = x == null ? start.x : x;
      const tapY = y == null ? start.y : y;
      const dx = tapX - start.startX;
      const dy = tapY - start.startY;

      if (this.state === 'playing') {
        if (Math.abs(dx) > 38 && Math.abs(dx) > Math.abs(dy)) {
          this.moveLane(dx > 0 ? 1 : -1);
          return;
        }
        if (tapY > this.trackBottom - 50) {
          this.moveLane(tapX > this.width * 0.5 ? 1 : -1);
          return;
        }
      }
      this.activateButton(tapX, tapY);
    }

    handleDirectionalInput(direction) {
      if (this.state !== 'playing') return;
      if (direction === 'left') this.moveLane(-1);
      if (direction === 'right') this.moveLane(1);
      if (direction === 'up') this.moveVertical(-1);
      if (direction === 'down') this.moveVertical(1);
    }

    moveLane(direction) {
      if (this.state !== 'playing') return;
      const next = clamp(this.run.targetLane + direction, 0, LANES - 1);
      if (next !== this.run.targetLane) {
        this.run.targetLane = next;
        this.playSound('click');
      }
    }

    moveVertical(direction) {
      if (this.state !== 'playing') return;
      const limit = Math.max(28, this.height * 0.09);
      const step = Math.max(30, this.height * 0.045);
      const next = clamp(this.run.targetVerticalOffset + direction * step, -limit, limit);
      if (next !== this.run.targetVerticalOffset) {
        this.run.targetVerticalOffset = next;
        this.playSound('click');
      }
    }

    getPlayerY() {
      return this.playerY + (this.run ? this.run.verticalOffset : 0);
    }

    activateButton(x, y) {
      const button = this.buttons.find((item) => x >= item.x && x <= item.x + item.w && y >= item.y && y <= item.y + item.h);
      if (!button) return;
      this.playSound('click');
      button.action();
    }

    toggleSound() {
      this.save.soundEnabled = !this.save.soundEnabled;
      this.persistSave();
    }

    openShop() {
      this.selectedShopIndex = 0;
      this.state = 'shop';
    }

    buyOrEquipSkin(skin) {
      const unlocked = this.save.unlockedSkins.includes(skin.id);
      if (unlocked) {
        this.save.currentSkin = skin.id;
        this.persistSave();
        this.message = '已装备';
        this.messageTimer = 1.2;
        return;
      }
      if (this.save.coins < skin.price) {
        this.message = '金币不足';
        this.messageTimer = 1.2;
        return;
      }
      this.save.coins -= skin.price;
      this.save.unlockedSkins.push(skin.id);
      this.save.currentSkin = skin.id;
      this.persistSave();
      this.message = '解锁成功';
      this.messageTimer = 1.2;
    }

    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);
      this.buttons = [];
      this.drawBackground();

      if (this.state === 'menu') this.drawMenu();
      if (this.state === 'shop') this.drawShop();
      if (this.state === 'playing' || this.state === 'paused') this.drawGame();
      if (this.state === 'result') {
        this.drawGame();
        this.drawResult();
      }
      if (this.state === 'paused') this.drawPause();
      this.drawParticles();
      if (this.messageTimer > 0 && this.state !== 'result') this.drawToast(this.message);
    }

    drawBackground() {
      const ctx = this.ctx;
      const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
      gradient.addColorStop(0, COLORS.bgTop);
      gradient.addColorStop(1, COLORS.bgBottom);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, this.width, this.height);

      for (const shape of this.backgroundShapes) {
        const x = (shape.x / 360) * this.width;
        const y = ((shape.y + this.elapsed * shape.speed) % 760) / 760 * (this.height + 80) - 40;
        ctx.save();
        ctx.globalAlpha = shape.alpha;
        ctx.translate(x, y);
        ctx.rotate(this.elapsed * 0.15 + shape.size);
        ctx.fillStyle = shape.color;
        this.drawPolygon(0, 0, shape.size, shape.sides);
        ctx.restore();
      }
    }

    drawMenu() {
      const ctx = this.ctx;
      const skin = this.getCurrentSkin();
      this.drawLogo(this.width * 0.5, this.height * 0.19, skin);
      this.drawText(GAME_NAME, this.width * 0.5, this.height * 0.31, {
        size: clamp(this.width * 0.11, 34, 48),
        weight: 800,
        align: 'center',
        color: COLORS.text
      });
      this.drawText('三跑道滑动躲避，关末击败几何 Boss', this.width * 0.5, this.height * 0.36, {
        size: 14,
        align: 'center',
        color: COLORS.muted
      });

      const startY = this.height * 0.46;
      this.drawButton('开始游戏', this.width * 0.15, startY, this.width * 0.7, 52, () => this.startLevel(this.save.highestLevel), 'primary');
      this.drawButton('商店', this.width * 0.15, startY + 66, this.width * 0.7, 50, () => this.openShop(), 'light');
      this.drawButton(this.save.soundEnabled ? '音效：开' : '音效：关', this.width * 0.15, startY + 128, this.width * 0.7, 50, () => this.toggleSound(), 'light');

      this.drawPanel(this.width * 0.12, this.height * 0.77, this.width * 0.76, 78, 20);
      this.drawText(`最高关卡 ${this.save.highestLevel} / ${LEVELS.length}`, this.width * 0.5, this.height * 0.805, {
        size: 15,
        weight: 700,
        align: 'center',
        color: COLORS.text
      });
      this.drawText(`金币 ${formatNumber(this.save.coins)} · 当前皮肤 ${skin.name}`, this.width * 0.5, this.height * 0.84, {
        size: 13,
        align: 'center',
        color: COLORS.muted
      });
    }

    drawShop() {
      const ctx = this.ctx;
      this.drawTopBar('皮肤商店', () => { this.state = 'menu'; });
      this.drawText(`金币 ${formatNumber(this.save.coins)}`, this.width * 0.5, this.height * 0.13, {
        size: 18,
        weight: 800,
        align: 'center',
        color: COLORS.text
      });

      const cardW = this.width * 0.82;
      const cardH = clamp(this.height * 0.13, 82, 108);
      let y = this.height * 0.18;
      SKINS.forEach((skin) => {
        const unlocked = this.save.unlockedSkins.includes(skin.id);
        const equipped = this.save.currentSkin === skin.id;
        this.drawPanel(this.width * 0.09, y, cardW, cardH, 20);
        this.drawSkinPreview(this.width * 0.18, y + cardH * 0.5, skin, 24);
        this.drawText(skin.name, this.width * 0.28, y + 30, {
          size: 16,
          weight: 800,
          align: 'left',
          color: COLORS.text
        });
        const attr = `${skin.bonusLives ? `生命 +${skin.bonusLives}` : '标准生命'} · 金币 x${skin.coinMultiplier}`;
        this.drawText(attr, this.width * 0.28, y + 54, {
          size: 12,
          align: 'left',
          color: COLORS.muted
        });
        const label = equipped ? '已装备' : unlocked ? '装备' : `${skin.price} 金币`;
        this.drawButton(label, this.width * 0.64, y + cardH * 0.5 - 18, this.width * 0.22, 36, () => this.buyOrEquipSkin(skin), equipped ? 'disabled' : 'small');
        y += cardH + 14;
      });

      if (this.messageTimer > 0) this.drawToast(this.message);
    }

    drawGame() {
      this.drawTrack();
      if (this.run.phase === 'boss') this.drawBoss();
      this.drawEntities();
      this.drawPlayer();
      this.drawHud();
      this.drawSwipeHint();
    }

    drawTrack() {
      const ctx = this.ctx;
      const topW = this.trackWidth * 0.56;
      const bottomW = this.trackWidth;
      const topLeft = this.trackCenter - topW * 0.5;
      const topRight = this.trackCenter + topW * 0.5;
      const bottomLeft = this.trackCenter - bottomW * 0.5;
      const bottomRight = this.trackCenter + bottomW * 0.5;

      ctx.save();
      ctx.fillStyle = this.createLinearFill(0, this.trackTop, 0, this.trackBottom, [
        [0, 'rgba(255, 255, 255, 0.9)'],
        [0.55, 'rgba(244, 252, 253, 0.78)'],
        [1, 'rgba(226, 244, 248, 0.9)']
      ]);
      ctx.strokeStyle = 'rgba(119, 169, 180, 0.26)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(topLeft, this.trackTop);
      ctx.lineTo(topRight, this.trackTop);
      ctx.lineTo(bottomRight, this.trackBottom);
      ctx.lineTo(bottomLeft, this.trackBottom);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      for (let lane = 1; lane < LANES; lane += 1) {
        const topX = lerp(topLeft, topRight, lane / LANES);
        const bottomX = lerp(bottomLeft, bottomRight, lane / LANES);
        ctx.strokeStyle = 'rgba(86, 142, 154, 0.2)';
        ctx.setLineDash([8, 10]);
        ctx.beginPath();
        ctx.moveTo(topX, this.trackTop + 10);
        ctx.lineTo(bottomX, this.trackBottom);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = 'rgba(101, 214, 189, 0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(topLeft + 8, this.trackTop + 8);
      ctx.lineTo(bottomLeft + 12, this.trackBottom - 4);
      ctx.moveTo(topRight - 8, this.trackTop + 8);
      ctx.lineTo(bottomRight - 12, this.trackBottom - 4);
      ctx.stroke();
      ctx.globalAlpha = 1;

      const progress = this.run.phase === 'run' ? clamp(this.run.runTime / this.level.duration, 0, 1) : 1;
      const barX = this.width * 0.16;
      const barY = this.height * 0.105;
      const barW = this.width * 0.68;
      const clockLabel = this.run.phase === 'run' ? `剩余 ${formatClock(this.level.duration - this.run.runTime)}` : 'BOSS 战';
      this.drawText(clockLabel, this.width * 0.5, barY - 7, {
        size: 12,
        weight: 800,
        color: this.run.phase === 'boss' ? COLORS.coralDark : COLORS.mintDark
      });
      this.drawRoundRect(barX, barY, barW, 8, 4, 'rgba(209, 229, 234, 0.72)');
      this.drawRoundRect(barX, barY, barW * progress, 8, 4, this.run.phase === 'boss' ? COLORS.coral : COLORS.mint);
      ctx.restore();
    }

    drawBoss() {
      const ctx = this.ctx;
      const cx = this.width * 0.5;
      const cy = this.trackTop + 34;
      const pulse = Math.sin(this.elapsed * 5) * 1.8;
      const fire = clamp(this.run.bossAttackFlash / 0.34, 0, 1);
      const recoil = easeOutCubic(fire) * 10;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(this.elapsed * 1.6) * 0.08);
      ctx.shadowColor = 'rgba(101, 214, 189, 0.28)';
      ctx.shadowBlur = 24;

      ctx.strokeStyle = '#4ab9a9';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-22, -36);
      ctx.lineTo(-32, -58 - pulse);
      ctx.moveTo(22, -36);
      ctx.lineTo(32, -58 - pulse);
      ctx.stroke();
      ctx.fillStyle = COLORS.lemon;
      ctx.beginPath();
      ctx.arc(-33, -61 - pulse, 5, 0, Math.PI * 2);
      ctx.arc(33, -61 - pulse, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = this.createLinearFill(0, -56, 0, 18, [
        [0, '#dffff7'],
        [0.35, '#65d6bd'],
        [1, '#2db59d']
      ]);
      ctx.beginPath();
      ctx.ellipse(0, -20, 42 + pulse, 34 + pulse * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40, 68, 81, 0.12)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = this.createLinearFill(0, -34, 0, 8, [
        [0, '#ffffff'],
        [1, '#dff8f2']
      ]);
      ctx.beginPath();
      ctx.ellipse(0, -15, 25, 18, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = this.createLinearFill(0, -35, 0, -8, [
        [0, '#45606b'],
        [1, '#162c35']
      ]);
      ctx.beginPath();
      ctx.ellipse(-13, -22, 6, 10, -0.15, 0, Math.PI * 2);
      ctx.ellipse(13, -22, 6, 10, 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-15, -25, 2, 0, Math.PI * 2);
      ctx.arc(11, -25, 2, 0, Math.PI * 2);
      ctx.fill();

      this.drawRoundRect(-26, 12, 52, 30, 14, '#53b9aa');
      this.drawRoundRect(-13, 18, 26, 20 + recoil * 0.4, 10, this.createLinearFill(0, 18, 0, 42 + recoil, [
        [0, '#ffc6be'],
        [1, '#ff7f76']
      ]));
      ctx.fillStyle = '#dff8f2';
      ctx.beginPath();
      ctx.arc(-14, 28, 3, 0, Math.PI * 2);
      ctx.arc(14, 28, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#4ab9a9';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-28, 7);
      ctx.quadraticCurveTo(-48, 19 + recoil, -38, 36 + recoil);
      ctx.moveTo(28, 7);
      ctx.quadraticCurveTo(48, 19 + recoil, 38, 36 + recoil);
      ctx.stroke();

      if (fire > 0) {
        ctx.save();
        ctx.globalAlpha = fire;
        ctx.fillStyle = COLORS.lemon;
        this.drawPolygon(0, 56 + recoil, 14 + fire * 8, 5);
        ctx.fillStyle = '#fff6c7';
        ctx.beginPath();
        ctx.arc(0, 56 + recoil, 5 + fire * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      const hpW = this.width * 0.56;
      const hpX = this.width * 0.22;
      const hpY = this.trackTop + 78;
      this.drawText('ALIEN BOSS', cx, hpY - 12, { size: 12, weight: 900, align: 'center', color: '#2f9b8c' });
      this.drawRoundRect(hpX, hpY, hpW, 10, 5, 'rgba(101, 214, 189, 0.2)');
      this.drawRoundRect(hpX, hpY, hpW * clamp(this.run.bossHp / this.run.bossMaxHp, 0, 1), 10, 5, COLORS.mint);
    }

    drawEntities() {
      this.entities.forEach((entity) => {
        const scale = clamp(0.62 + (entity.y - this.trackTop) / (this.trackBottom - this.trackTop) * 0.5, 0.55, 1.16);
        const radius = entity.radius * scale;
        if (entity.kind === 'coin') this.drawCoin(entity.x, entity.y, radius, entity.rotation);
        if (entity.kind === 'obstacle') this.drawObstacle(entity, radius);
        if (entity.kind === 'boss') this.drawBossHazard(entity, radius);
      });
    }

    drawPlayer() {
      const ctx = this.ctx;
      const run = this.run;
      const skin = this.getCurrentSkin();
      const flicker = run.invuln > 0 && Math.floor(this.elapsed * 18) % 2 === 0;
      if (flicker) return;
      const playerY = this.getPlayerY();
      const visualSize = this.playerVisualSize;
      this.drawSkinPreview(run.x, playerY, skin, visualSize);
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = skin.primary;
      ctx.beginPath();
      ctx.ellipse(run.x, playerY + visualSize * 0.8, visualSize * 0.62, visualSize * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawHud() {
      const y = this.hudTop;
      this.drawPill(this.width * 0.05, y, this.width * 0.25, 34, `关卡 ${this.level.id}`, COLORS.mint);
      this.drawPill(this.width * 0.34, y, this.width * 0.26, 34, `金币 ${this.run.coinsEarned}`, COLORS.lemon);
      this.drawPill(this.width * 0.64, y, this.width * 0.2, 34, `♥ ${this.run.lives}`, COLORS.coral);
      this.drawIconButton(this.width * 0.87, y, 34, () => { this.state = 'paused'; }, 'pause');
    }

    drawSwipeHint() {
      if (this.state !== 'playing') return;
      const alpha = this.run.phaseTimer < 4 ? clamp(1 - this.run.phaseTimer / 4, 0, 1) : 0.3;
      const y = this.height * 0.93;
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = alpha;
      this.drawText('方向键 / 滑动', this.width * 0.5, y, {
        size: 12,
        weight: 700,
        align: 'center',
        color: COLORS.muted
      });
      ctx.strokeStyle = COLORS.muted;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.width * 0.42, y + 16);
      ctx.lineTo(this.width * 0.58, y + 16);
      ctx.moveTo(this.width * 0.42, y + 16);
      ctx.lineTo(this.width * 0.455, y + 6);
      ctx.moveTo(this.width * 0.42, y + 16);
      ctx.lineTo(this.width * 0.455, y + 26);
      ctx.moveTo(this.width * 0.58, y + 16);
      ctx.lineTo(this.width * 0.545, y + 6);
      ctx.moveTo(this.width * 0.58, y + 16);
      ctx.lineTo(this.width * 0.545, y + 26);
      ctx.stroke();
      ctx.restore();
    }

    drawPause() {
      this.drawScrim();
      this.drawPanel(this.width * 0.12, this.height * 0.32, this.width * 0.76, 220, 24);
      this.drawText('已暂停', this.width * 0.5, this.height * 0.38, {
        size: 28,
        weight: 900,
        align: 'center',
        color: COLORS.text
      });
      this.drawButton('继续', this.width * 0.22, this.height * 0.44, this.width * 0.56, 48, () => { this.state = 'playing'; }, 'primary');
      this.drawButton('重新开始', this.width * 0.22, this.height * 0.505, this.width * 0.56, 44, () => this.startLevel(this.level.id), 'light');
      this.drawButton('返回菜单', this.width * 0.22, this.height * 0.565, this.width * 0.56, 44, () => { this.state = 'menu'; }, 'light');
    }

    drawResult() {
      this.drawScrim();
      this.drawPanel(this.width * 0.1, this.height * 0.29, this.width * 0.8, 300, 26);
      const isWin = this.result.type === 'win';
      this.drawText(this.result.title, this.width * 0.5, this.height * 0.36, {
        size: 28,
        weight: 900,
        align: 'center',
        color: isWin ? COLORS.mintDark : COLORS.coralDark
      });
      this.drawText(this.result.detail, this.width * 0.5, this.height * 0.41, {
        size: 15,
        align: 'center',
        color: COLORS.muted
      });
      if (isWin) {
        const nextLevel = Math.min(this.result.levelId + 1, LEVELS.length);
        const label = this.result.levelId === LEVELS.length ? `重玩第 ${LEVELS.length} 关` : `下一关 ${nextLevel}`;
        this.drawButton(label, this.width * 0.22, this.height * 0.48, this.width * 0.56, 50, () => this.startLevel(nextLevel), 'primary');
      } else {
        this.drawButton('再试一次', this.width * 0.22, this.height * 0.48, this.width * 0.56, 50, () => this.startLevel(this.result.levelId), 'primary');
      }
      this.drawButton('商店', this.width * 0.22, this.height * 0.55, this.width * 0.56, 44, () => this.openShop(), 'light');
      this.drawButton('返回菜单', this.width * 0.22, this.height * 0.61, this.width * 0.56, 44, () => { this.state = 'menu'; }, 'light');
    }

    drawParticles() {
      const ctx = this.ctx;
      this.particles.forEach((particle) => {
        ctx.save();
        ctx.globalAlpha = clamp(particle.life * 2, 0, 1);
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.rotation);
        this.drawRoundRect(-particle.size * 0.5, -particle.size * 0.5, particle.size, particle.size, 2, particle.color);
        ctx.restore();
      });
    }

    drawLogo(x, y, skin) {
      this.drawSkinPreview(x, y, skin, 62);
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = 0.52;
      ctx.strokeStyle = COLORS.border;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 82, 0.1, Math.PI * 1.7);
      ctx.stroke();
      ctx.strokeStyle = skin.primary;
      ctx.beginPath();
      ctx.arc(x, y, 82, Math.PI * 1.72, Math.PI * 2.14);
      ctx.stroke();
      ctx.restore();
    }

    drawSkinPreview(x, y, skin, size) {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.sin(this.elapsed * 2.2) * 0.08);
      ctx.shadowColor = COLORS.shadow;
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 8;
      this.drawFighterJet(skin, size);
      ctx.restore();
    }

    drawFighterJet(skin, size) {
      const ctx = this.ctx;
      ctx.save();

      ctx.fillStyle = this.createLinearFill(0, size * 0.48, 0, size * 1.08, [
        [0, 'rgba(255, 246, 199, 0.9)'],
        [0.52, 'rgba(255, 213, 106, 0.84)'],
        [1, 'rgba(255, 143, 127, 0.28)']
      ]);
      ctx.beginPath();
      ctx.moveTo(-size * 0.2, size * 0.54);
      ctx.lineTo(0, size * 1.1);
      ctx.lineTo(size * 0.2, size * 0.54);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = this.createLinearFill(-size * 0.3, -size, size * 0.32, size * 0.9, [
        [0, '#ffffff'],
        [0.18, skin.secondary],
        [0.58, skin.primary],
        [1, skin.accent]
      ]);
      ctx.strokeStyle = 'rgba(40, 68, 81, 0.16)';
      ctx.lineWidth = Math.max(1.5, size * 0.045);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -size * 1.02);
      ctx.lineTo(size * 0.24, -size * 0.35);
      ctx.lineTo(size * 0.18, size * 0.42);
      ctx.lineTo(size * 0.1, size * 0.76);
      ctx.lineTo(0, size * 0.9);
      ctx.lineTo(-size * 0.1, size * 0.76);
      ctx.lineTo(-size * 0.18, size * 0.42);
      ctx.lineTo(-size * 0.24, -size * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = this.createLinearFill(-size, -size * 0.2, size, size * 0.45, [
        [0, skin.accent],
        [0.45, skin.primary],
        [1, skin.secondary]
      ]);
      ctx.beginPath();
      ctx.moveTo(-size * 0.18, -size * 0.18);
      ctx.lineTo(-size * 1.0, size * 0.24);
      ctx.lineTo(-size * 0.26, size * 0.36);
      ctx.closePath();
      ctx.moveTo(size * 0.18, -size * 0.18);
      ctx.lineTo(size * 1.0, size * 0.24);
      ctx.lineTo(size * 0.26, size * 0.36);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = skin.accent;
      ctx.beginPath();
      ctx.moveTo(-size * 0.14, size * 0.38);
      ctx.lineTo(-size * 0.58, size * 0.72);
      ctx.lineTo(-size * 0.16, size * 0.7);
      ctx.closePath();
      ctx.moveTo(size * 0.14, size * 0.38);
      ctx.lineTo(size * 0.58, size * 0.72);
      ctx.lineTo(size * 0.16, size * 0.7);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = this.createLinearFill(0, -size * 0.62, 0, -size * 0.02, [
        [0, '#ffffff'],
        [0.42, '#c9f1ff'],
        [1, skin.secondary]
      ]);
      ctx.beginPath();
      ctx.ellipse(0, -size * 0.32, size * 0.13, size * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40, 68, 81, 0.14)';
      ctx.lineWidth = Math.max(1, size * 0.025);
      ctx.stroke();

      ctx.fillStyle = skin.accent;
      this.drawRoundRect(-size * 0.06, size * 0.15, size * 0.12, size * 0.5, size * 0.06, skin.accent);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.52)';
      ctx.lineWidth = Math.max(1, size * 0.025);
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.88);
      ctx.lineTo(0, size * 0.68);
      ctx.moveTo(-size * 0.7, size * 0.2);
      ctx.lineTo(-size * 0.32, size * 0.24);
      ctx.moveTo(size * 0.7, size * 0.2);
      ctx.lineTo(size * 0.32, size * 0.24);
      ctx.stroke();

      ctx.fillStyle = '#ffef77';
      ctx.beginPath();
      ctx.arc(-size * 0.78, size * 0.24, size * 0.045, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#78c8ff';
      ctx.beginPath();
      ctx.arc(size * 0.78, size * 0.24, size * 0.045, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.72;
      ctx.beginPath();
      ctx.arc(size * 0.05, -size * 0.44, size * 0.035, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawCoin(x, y, radius, rotation) {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.fillStyle = this.createLinearFill(-radius, -radius, radius, radius, [
        [0, '#fff8c9'],
        [0.45, COLORS.lemon],
        [1, '#e0a92f']
      ]);
      ctx.strokeStyle = '#e0a92f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff7c8';
      this.drawPolygon(0, 0, radius * 0.48, 4);
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, radius * 0.14);
      ctx.beginPath();
      ctx.arc(-radius * 0.1, -radius * 0.12, radius * 0.58, Math.PI * 1.05, Math.PI * 1.55);
      ctx.stroke();
      ctx.restore();
    }

    drawObstacle(entity, radius) {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(entity.x, entity.y);
      ctx.rotate(entity.rotation);
      this.drawObstacleShadow(radius);
      if (entity.visual === 'plane') this.drawPlaneObstacle(radius);
      else if (entity.visual === 'tank') this.drawTankObstacle(radius);
      else if (entity.visual === 'truck') this.drawTruckObstacle(radius);
      else this.drawAnimalObstacle(radius);
      ctx.restore();
    }

    drawObstacleShadow(radius) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = 'rgba(40, 68, 81, 0.28)';
      ctx.beginPath();
      ctx.ellipse(0, radius * 0.88, radius * 1.05, radius * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawPlaneObstacle(radius) {
      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = this.createLinearFill(0, -radius, 0, radius, [
        [0, '#e9f8ff'],
        [0.34, '#78c8ff'],
        [1, '#399bd9']
      ]);
      ctx.strokeStyle = 'rgba(57, 124, 166, 0.24)';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(0, radius * 1.05);
      ctx.lineTo(radius * 0.24, radius * 0.3);
      ctx.lineTo(radius * 1.02, radius * 0.04);
      ctx.lineTo(radius * 0.26, -radius * 0.2);
      ctx.lineTo(radius * 0.18, -radius * 0.82);
      ctx.lineTo(0, -radius * 0.58);
      ctx.lineTo(-radius * 0.18, -radius * 0.82);
      ctx.lineTo(-radius * 0.26, -radius * 0.2);
      ctx.lineTo(-radius * 1.02, radius * 0.04);
      ctx.lineTo(-radius * 0.24, radius * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      this.drawRoundRect(-radius * 0.13, -radius * 0.42, radius * 0.26, radius * 0.96, radius * 0.13, '#e9f8ff');
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.72;
      ctx.beginPath();
      ctx.arc(radius * 0.06, -radius * 0.42, radius * 0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = COLORS.lemon;
      ctx.beginPath();
      ctx.arc(-radius * 0.75, radius * 0.04, radius * 0.055, 0, Math.PI * 2);
      ctx.arc(radius * 0.75, radius * 0.04, radius * 0.055, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawTankObstacle(radius) {
      const ctx = this.ctx;
      ctx.save();
      this.drawRoundRect(-radius * 1.05, -radius * 0.12, radius * 2.1, radius * 0.62, radius * 0.24, '#3d5d5b');
      this.drawRoundRect(-radius * 0.9, -radius * 0.48, radius * 1.62, radius * 0.74, radius * 0.2, this.createLinearFill(0, -radius * 0.5, 0, radius * 0.35, [
        [0, '#a5eadc'],
        [0.55, '#65b8a8'],
        [1, '#3f8078']
      ]));
      this.drawRoundRect(-radius * 0.18, -radius * 0.78, radius * 0.66, radius * 0.46, radius * 0.18, '#4f9188');
      this.drawRoundRect(radius * 0.35, -radius * 0.66, radius * 0.76, radius * 0.16, radius * 0.08, '#4f9188');
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = Math.max(1, radius * 0.06);
      ctx.beginPath();
      ctx.moveTo(-radius * 0.65, -radius * 0.36);
      ctx.lineTo(radius * 0.38, -radius * 0.36);
      ctx.stroke();
      ctx.fillStyle = '#dff8f2';
      ctx.beginPath();
      ctx.arc(-radius * 0.6, radius * 0.2, radius * 0.13, 0, Math.PI * 2);
      ctx.arc(-radius * 0.2, radius * 0.2, radius * 0.13, 0, Math.PI * 2);
      ctx.arc(radius * 0.2, radius * 0.2, radius * 0.13, 0, Math.PI * 2);
      ctx.arc(radius * 0.6, radius * 0.2, radius * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawTruckObstacle(radius) {
      const ctx = this.ctx;
      ctx.save();
      this.drawRoundRect(-radius * 1.16, -radius * 0.48, radius * 1.36, radius * 0.82, radius * 0.16, this.createLinearFill(0, -radius * 0.5, 0, radius * 0.35, [
        [0, '#fff4c9'],
        [0.5, '#ffd56a'],
        [1, '#e0a92f']
      ]));
      this.drawRoundRect(radius * 0.08, -radius * 0.34, radius * 0.78, radius * 0.68, radius * 0.16, this.createLinearFill(0, -radius * 0.34, 0, radius * 0.36, [
        [0, '#ffc6be'],
        [1, '#ff7f76']
      ]));
      this.drawRoundRect(radius * 0.24, -radius * 0.22, radius * 0.28, radius * 0.24, radius * 0.06, '#e9f8ff');
      this.drawRoundRect(-radius * 0.92, -radius * 0.3, radius * 0.22, radius * 0.16, radius * 0.04, '#fff8c9');
      this.drawRoundRect(-radius * 0.58, -radius * 0.3, radius * 0.22, radius * 0.16, radius * 0.04, '#fff8c9');
      ctx.fillStyle = '#284451';
      ctx.beginPath();
      ctx.arc(-radius * 0.66, radius * 0.42, radius * 0.18, 0, Math.PI * 2);
      ctx.arc(radius * 0.48, radius * 0.42, radius * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-radius * 0.66, radius * 0.42, radius * 0.08, 0, Math.PI * 2);
      ctx.arc(radius * 0.48, radius * 0.42, radius * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawAnimalObstacle(radius) {
      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = this.createLinearFill(0, -radius, 0, radius, [
        [0, '#ffc6be'],
        [0.55, '#ff9a92'],
        [1, '#dc5d56']
      ]);
      ctx.beginPath();
      ctx.ellipse(0, radius * 0.18, radius * 0.82, radius * 0.58, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-radius * 0.38, -radius * 0.42, radius * 0.18, radius * 0.38, -0.35, 0, Math.PI * 2);
      ctx.ellipse(radius * 0.38, -radius * 0.42, radius * 0.18, radius * 0.38, 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe8e5';
      ctx.beginPath();
      ctx.ellipse(0, radius * 0.24, radius * 0.46, radius * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#284451';
      ctx.beginPath();
      ctx.arc(-radius * 0.22, radius * 0.05, radius * 0.055, 0, Math.PI * 2);
      ctx.arc(radius * 0.22, radius * 0.05, radius * 0.055, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#dc5d56';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-radius * 0.08, radius * 0.22);
      ctx.quadraticCurveTo(0, radius * 0.3, radius * 0.08, radius * 0.22);
      ctx.stroke();
      ctx.globalAlpha = 0.42;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, radius * 0.06);
      ctx.beginPath();
      ctx.arc(-radius * 0.18, -radius * 0.06, radius * 0.36, Math.PI * 1.1, Math.PI * 1.55);
      ctx.stroke();
      ctx.restore();
    }

    drawBossHazard(entity, radius) {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(entity.x, entity.y);
      ctx.rotate(entity.rotation);
      this.drawMiniAlienHazard(radius, entity.shape === 'beam');
      ctx.restore();
    }

    drawMiniAlienHazard(radius, boosted) {
      const ctx = this.ctx;
      const scaleY = boosted ? 1.12 : 1;
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = 'rgba(40, 68, 81, 0.28)';
      ctx.beginPath();
      ctx.ellipse(0, radius * 0.88, radius * 0.82, radius * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (boosted) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = COLORS.lemon;
        ctx.beginPath();
        ctx.moveTo(-radius * 0.26, radius * 0.58);
        ctx.lineTo(0, radius * 1.2);
        ctx.lineTo(radius * 0.26, radius * 0.58);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      ctx.fillStyle = this.createLinearFill(0, -radius * 0.7, 0, radius * 0.56, [
        [0, '#e3ffbd'],
        [0.42, '#9ee86f'],
        [1, '#64b65c']
      ]);
      ctx.beginPath();
      ctx.ellipse(0, -radius * 0.08, radius * 0.72, radius * 0.58 * scaleY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40, 68, 81, 0.12)';
      ctx.lineWidth = Math.max(1, radius * 0.06);
      ctx.stroke();

      ctx.strokeStyle = '#64b65c';
      ctx.lineWidth = Math.max(1.5, radius * 0.08);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-radius * 0.28, -radius * 0.52);
      ctx.lineTo(-radius * 0.48, -radius * 0.86);
      ctx.moveTo(radius * 0.28, -radius * 0.52);
      ctx.lineTo(radius * 0.48, -radius * 0.86);
      ctx.stroke();

      ctx.fillStyle = COLORS.lemon;
      ctx.beginPath();
      ctx.arc(-radius * 0.5, -radius * 0.9, radius * 0.12, 0, Math.PI * 2);
      ctx.arc(radius * 0.5, -radius * 0.9, radius * 0.12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = this.createLinearFill(0, -radius * 0.3, 0, radius * 0.08, [
        [0, '#45606b'],
        [1, '#162c35']
      ]);
      ctx.beginPath();
      ctx.ellipse(-radius * 0.22, -radius * 0.15, radius * 0.1, radius * 0.16, -0.12, 0, Math.PI * 2);
      ctx.ellipse(radius * 0.22, -radius * 0.15, radius * 0.1, radius * 0.16, 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-radius * 0.25, -radius * 0.2, radius * 0.025, 0, Math.PI * 2);
      ctx.arc(radius * 0.19, -radius * 0.2, radius * 0.025, 0, Math.PI * 2);
      ctx.fill();

      this.drawRoundRect(-radius * 0.34, radius * 0.32, radius * 0.68, radius * 0.2, radius * 0.1, '#53b9aa');
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, radius * 0.05);
      ctx.beginPath();
      ctx.arc(-radius * 0.14, -radius * 0.28, radius * 0.32, Math.PI * 1.05, Math.PI * 1.55);
      ctx.stroke();
    }

    drawTopBar(title, backAction) {
      this.drawIconButton(this.width * 0.05, this.hudTop, 36, backAction, 'back');
      this.drawText(title, this.width * 0.5, this.hudTop + 23, {
        size: 20,
        weight: 900,
        align: 'center',
        color: COLORS.text
      });
    }

    drawPill(x, y, w, h, label, color) {
      this.drawRoundRect(x, y, w, h, h / 2, COLORS.panel);
      this.drawRoundRect(x + 5, y + h * 0.5 - 5, 10, 10, 5, color);
      this.drawText(label, x + w * 0.56, y + h * 0.64, {
        size: 12,
        weight: 800,
        align: 'center',
        color: COLORS.text
      });
    }

    drawIconButton(x, y, size, action, icon) {
      this.drawRoundRect(x, y, size, size, size * 0.5, COLORS.panelSolid);
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = COLORS.text;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const cx = x + size * 0.5;
      const cy = y + size * 0.5;
      if (icon === 'pause') {
        ctx.beginPath();
        ctx.moveTo(cx - 4, cy - 7);
        ctx.lineTo(cx - 4, cy + 7);
        ctx.moveTo(cx + 4, cy - 7);
        ctx.lineTo(cx + 4, cy + 7);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(cx + 5, cy - 8);
        ctx.lineTo(cx - 5, cy);
        ctx.lineTo(cx + 5, cy + 8);
        ctx.stroke();
      }
      ctx.restore();
      this.buttons.push({ x, y, w: size, h: size, action });
    }

    drawButton(label, x, y, w, h, action, variant) {
      const disabled = variant === 'disabled';
      const fill = variant === 'primary'
        ? COLORS.mint
        : variant === 'small'
          ? '#effafa'
          : disabled
            ? '#e6eef0'
            : COLORS.panelSolid;
      const textColor = variant === 'primary' ? '#ffffff' : disabled ? COLORS.muted : COLORS.text;
      this.drawRoundRect(x, y, w, h, Math.min(18, h * 0.45), fill);
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = variant === 'primary' ? 'rgba(45, 181, 157, 0.4)' : COLORS.border;
      ctx.lineWidth = 1;
      this.strokeRoundRect(x + 0.5, y + 0.5, w - 1, h - 1, Math.min(18, h * 0.45));
      ctx.restore();
      this.drawText(label, x + w * 0.5, y + h * 0.62, {
        size: h < 40 ? 12 : 16,
        weight: 800,
        align: 'center',
        color: textColor
      });
      if (!disabled) this.buttons.push({ x, y, w, h, action });
    }

    drawPanel(x, y, w, h, radius) {
      const ctx = this.ctx;
      ctx.save();
      ctx.shadowColor = COLORS.shadow;
      ctx.shadowBlur = 20;
      ctx.shadowOffsetY = 10;
      this.drawRoundRect(x, y, w, h, radius, COLORS.panel);
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = 'rgba(216, 233, 237, 0.72)';
      ctx.lineWidth = 1;
      this.strokeRoundRect(x + 0.5, y + 0.5, w - 1, h - 1, radius);
      ctx.restore();
    }

    drawToast(text) {
      const w = clamp(text.length * 18 + 40, 120, this.width * 0.72);
      const h = 38;
      const x = (this.width - w) * 0.5;
      const y = this.height * 0.17;
      this.drawRoundRect(x, y, w, h, h / 2, 'rgba(40, 68, 81, 0.88)');
      this.drawText(text, this.width * 0.5, y + 24, {
        size: 14,
        weight: 800,
        align: 'center',
        color: '#ffffff'
      });
    }

    drawScrim() {
      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = 'rgba(39, 66, 78, 0.28)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }

    drawText(text, x, y, options) {
      const ctx = this.ctx;
      const size = options.size || 14;
      const weight = options.weight || 600;
      ctx.save();
      ctx.fillStyle = options.color || COLORS.text;
      ctx.font = `${weight} ${size}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.textAlign = options.align || 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, x, y);
      ctx.restore();
    }

    createLinearFill(x0, y0, x1, y1, stops) {
      const gradient = this.ctx.createLinearGradient(x0, y0, x1, y1);
      stops.forEach((stop) => gradient.addColorStop(stop[0], stop[1]));
      return gradient;
    }

    drawRoundRect(x, y, w, h, radius, fill) {
      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = fill;
      this.roundRectPath(x, y, w, h, radius);
      ctx.fill();
      ctx.restore();
    }

    strokeRoundRect(x, y, w, h, radius) {
      this.roundRectPath(x, y, w, h, radius);
      this.ctx.stroke();
    }

    roundRectPath(x, y, w, h, radius) {
      const ctx = this.ctx;
      const r = Math.min(radius, w * 0.5, h * 0.5);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    drawPolygon(x, y, radius, sides) {
      const ctx = this.ctx;
      ctx.beginPath();
      for (let index = 0; index < sides; index += 1) {
        const angle = -Math.PI / 2 + index * Math.PI * 2 / sides;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  return {
    GeometryDashGame,
    createBrowserAudio,
    createBrowserStorage,
    SAVE_KEY,
    LEVEL_DURATION_SECONDS,
    LEVELS,
    SKINS,
    OBSTACLE_TYPES
  };
});
