const assert = require('node:assert/strict');
const GeometryDash = require('../src/game-core.js');

function createMockContext() {
  const gradient = { addColorStop() {} };
  return {
    fillStyle: '#000',
    strokeStyle: '#000',
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetY: 0,
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    setTransform() {},
    clearRect() {},
    fillRect() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    arcTo() {},
    arc() {},
    ellipse() {},
    fill() {},
    stroke() {},
    setLineDash() {},
    fillText() {},
    createLinearGradient() {
      return gradient;
    }
  };
}

function createGame(storageRead) {
  const ctx = createMockContext();
  const writes = [];
  const game = new GeometryDash.GeometryDashGame({
    canvas: {
      width: 0,
      height: 0,
      style: {},
      getContext() {
        return ctx;
      }
    },
    storage: {
      read() {
        return storageRead || null;
      },
      write(key, value) {
        writes.push({ key, value });
      }
    },
    audio: { play() {} },
    requestAnimationFrame() {
      return 1;
    },
    cancelAnimationFrame() {}
  });
  game.resize(390, 844, 2);
  return { game, writes };
}

function withMockedRandom(values, callback) {
  const originalRandom = Math.random;
  let index = 0;
  Math.random = () => values[Math.min(index++, values.length - 1)];
  try {
    callback();
  } finally {
    Math.random = originalRandom;
  }
}

function run() {
  assert.equal(GeometryDash.LEVELS.length, 100);
  assert.equal(GeometryDash.LEVEL_DURATION_SECONDS, 120);
  assert.equal(GeometryDash.LEVELS[0].id, 1);
  assert.equal(GeometryDash.LEVELS[99].id, 100);
  assert.equal(GeometryDash.LEVELS[0].duration, 120);
  assert.equal(GeometryDash.LEVELS[99].duration, 120);
  assert.ok(GeometryDash.LEVELS[99].bossHp > GeometryDash.LEVELS[0].bossHp);
  assert.equal(GeometryDash.SAVE_KEY, 'geometry-dash-save-v1');
  assert.deepEqual(GeometryDash.OBSTACLE_TYPES, ['plane', 'tank', 'truck', 'animal']);

  const corrupt = createGame('{bad-json');
  assert.equal(corrupt.game.save.highestLevel, 1);
  assert.deepEqual(corrupt.game.save.unlockedSkins, ['mint']);

  const { game, writes } = createGame();
  game.draw();
  assert.equal(game.state, 'menu');
  assert.ok(game.playerVisualSize < game.playerSize, 'player fighter should render smaller than obstacle scale');

  game.startLevel(1);
  assert.equal(game.state, 'playing');
  assert.equal(game.level.id, 1);
  assert.equal(game.level.duration, 120);
  assert.equal(game.run.runTime, 0);
  assert.equal(game.run.lives, 3);

  game.run.runTime = game.level.duration - 0.05;
  game.update(0.1);
  assert.equal(game.run.phase, 'boss');

  game.startLevel(1);

  game.moveLane(1);
  game.moveLane(1);
  assert.equal(game.run.targetLane, 2);
  game.moveLane(1);
  assert.equal(game.run.targetLane, 2);
  game.moveLane(-1);
  assert.equal(game.run.targetLane, 1);
  game.handleDirectionalInput('left');
  assert.equal(game.run.targetLane, 0);
  game.handleDirectionalInput('right');
  assert.equal(game.run.targetLane, 1);
  game.handleDirectionalInput('up');
  assert.ok(game.run.targetVerticalOffset < 0);
  const upOffset = game.run.targetVerticalOffset;
  game.handleDirectionalInput('down');
  assert.ok(game.run.targetVerticalOffset > upOffset);

  game.entities.push({
    kind: 'coin',
    lane: game.run.targetLane,
    x: game.laneCenters[game.run.targetLane],
    y: game.playerY,
    radius: 12,
    rotation: 0,
    spin: 0,
    speed: 0
  });
  game.checkCollisions();
  assert.equal(game.run.coinsEarned, 8);

  game.damagePlayer(1);
  assert.equal(game.run.lives, 2);
  game.damagePlayer(2);
  assert.equal(game.state, 'result');
  assert.equal(game.result.type, 'fail');

  game.startLevel(1);
  game.run.coinsEarned = 12;
  game.completeLevel();
  assert.equal(game.state, 'result');
  assert.equal(game.result.type, 'win');
  assert.equal(game.save.highestLevel, 2);
  assert.ok(game.save.coins >= 92);
  assert.ok(writes.some((entry) => entry.key === GeometryDash.SAVE_KEY));

  game.save.coins = 1000;
  const coral = GeometryDash.SKINS.find((skin) => skin.id === 'coral');
  game.buyOrEquipSkin(coral);
  assert.equal(game.save.currentSkin, 'coral');
  assert.ok(game.save.unlockedSkins.includes('coral'));
  game.startLevel(1);
  assert.equal(game.run.lives, 4);

  game.startLevel(1);
  game.run.phase = 'boss';
  game.run.bossHp = 1;
  game.update(0.1);
  assert.equal(game.state, 'result');
  assert.equal(game.result.type, 'win');

  game.startLevel(1);
  game.entities = [];
  withMockedRandom([0.2, 0.6, 0.5, 0.5], () => game.spawnObstacle());
  assert.equal(game.entities.length, 1);
  assert.ok(GeometryDash.OBSTACLE_TYPES.includes(game.entities[0].visual));

  game.startLevel(1);
  game.entities = [
    { kind: 'obstacle', lane: 0, y: game.trackTop - 48, dead: false },
    { kind: 'obstacle', lane: 1, y: game.trackTop - 52, dead: false }
  ];
  game.spawnObstacle();
  assert.equal(game.entities.length, 2, 'obstacle spawn must not close the last safe lane');

  game.startLevel(1);
  game.run.phase = 'boss';
  game.entities = [];
  withMockedRandom([0.7, 0.5], () => game.spawnBossAttack());
  assert.ok(game.run.bossAttackFlash > 0, 'boss attack must trigger firing animation');
  assert.equal(game.entities.length, 2, 'staggered boss pattern should spawn two hazards');
  assert.ok(Math.abs(game.entities[0].y - game.entities[1].y) >= 130, 'boss pair must be visibly staggered');

  game.entities = [];
  withMockedRandom([0.92, 0.2], () => game.spawnBossAttack());
  assert.equal(game.entities.length, 1, 'heavy boss pattern should not spawn a full three-lane row');

  console.log('smoke-test: ok');
}

run();
