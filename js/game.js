'use strict';

let scene, camera, renderer, clock;
let luffy;
let ocean, oceanT = 0;
let vehicles = [], nearVehicle = null, currentVehicle = null;
let buildings = [];
let seagulls = [];
let particles = [];
let keys = {};
let joystick = { active: false, dx: 0, dy: 0, origin: null };
let camTheta = 0, camPhi = 0.35, camDist = 8;
let dragStart = null, lastTouch = null;
let score = 0, health = 100, bounty = 0;
let miniCanvas, miniCtx;
let notifQueue = [], notifTimer = 0;

const ISLANDS = [
  { cx: 0,   cz: 0,   r: 28 },
  { cx: 80,  cz: -60, r: 14 },
  { cx: -90, cz: 40,  r: 18 },
  { cx: 60,  cz: 80,  r: 10 },
  { cx: -70, cz: -80, r: 12 },
  { cx: 120, cz: 20,  r: 8  },
];

function init() {
  clock = new THREE.Clock();

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('game-container').appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.FogExp2(0x87CEEB, 0.005);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

  const ambient = new THREE.AmbientLight(0xfff4e0, 0.7);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff0c0, 1.4);
  sun.position.set(50, 80, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 300;
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -80;
  scene.add(sun);

  scene.add(new THREE.DirectionalLight(0xadd8ff, 0.4)).position.set(-30, 20, -20);

  buildSky();
  buildWorld();
  buildLuffy();
  buildVehicles();
  buildSeagulls();
  setupMinimap();
  setupControls();

  window.addEventListener('resize', onResize);
  animate();
}

function buildSky() {
  const sunMesh = new THREE.Mesh(
    new THREE.CircleGeometry(8, 32),
    new THREE.MeshBasicMaterial({ color: 0xFFE066 })
  );
  sunMesh.position.set(80, 100, -200);
  scene.add(sunMesh);

  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(13, 32),
    new THREE.MeshBasicMaterial({ color: 0xFFD700, transparent: true, opacity: 0.3 })
  );
  glow.position.set(80, 100, -201);
  scene.add(glow);

  for (let i = 0; i < 18; i++) {
    const cloud = makeCloud();
    cloud.position.set(
      (Math.random() - 0.5) * 400,
      30 + Math.random() * 30,
      (Math.random() - 0.5) * 400
    );
    scene.add(cloud);
  }
}

function makeCloud() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  [[0,0,0,5],[-5,-1,0,3.5],[5,-1,0,3.5],[0,-1,-3,3]].forEach(([x,y,z,r]) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat);
    m.position.set(x, y, z);
    g.add(m);
  });
  return g;
}

function buildWorld() {
  const oceanGeo = new THREE.PlaneGeometry(800, 800, 80, 80);
  oceanGeo.rotateX(-Math.PI / 2);
  const pos = oceanGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, (Math.sin(pos.getX(i) * 0.05) + Math.cos(pos.getZ(i) * 0.04)) * 0.3);
  }
  oceanGeo.computeVertexNormals();
  ocean = new THREE.Mesh(oceanGeo, new THREE.MeshLambertMaterial({ color: 0x1a7fcc }));
  ocean.receiveShadow = true;
  scene.add(ocean);

  ISLANDS.forEach(isl => buildIsland(isl));
  buildPirateTown();
}

function buildIsland(isl) {
  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(isl.r, isl.r * 1.1, 2.5, 32),
    new THREE.MeshLambertMaterial({ color: 0x8BC34A })
  );
  ground.position.set(isl.cx, 0.2, isl.cz);
  ground.castShadow = true;
  ground.receiveShadow = true;
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.CylinderGeometry(isl.r * 1.05, isl.r * 1.2, 0.5, 32),
    new THREE.MeshLambertMaterial({ color: 0xF4D03F })
  );
  sand.position.set(isl.cx, -0.7, isl.cz);
  scene.add(sand);

  const treeCount = Math.floor(isl.r * 1.2);
  for (let i = 0; i < treeCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * (isl.r - 3);
    buildTree(isl.cx + Math.cos(angle) * dist, 1.5, isl.cz + Math.sin(angle) * dist);
  }
}

function buildTree(x, y, z) {
  const g = new THREE.Group();
  g.add(Object.assign(
    new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 3, 8), new THREE.MeshLambertMaterial({ color: 0x8B6914 })),
    { position: new THREE.Vector3(0, 1.5, 0) }
  ));
  const fmat = new THREE.MeshLambertMaterial({ color: 0x2D8B22 });
  [[0,4.5,0,2],[-1,3.5,0.5,1.5],[1,3.8,-0.5,1.4]].forEach(([fx,fy,fz,fr]) => {
    const f = new THREE.Mesh(new THREE.SphereGeometry(fr, 8, 6), fmat);
    f.position.set(fx, fy, fz);
    g.add(f);
  });
  g.position.set(x, y, z);
  g.castShadow = true;
  scene.add(g);
}

function buildPirateTown() {
  const bldgs = [
    { x:5,  z:5,   w:5, d:5, h:8,  color:0xD4956A, roof:true  },
    { x:-8, z:3,   w:6, d:6, h:10, color:0xC0876A, roof:true  },
    { x:12, z:-5,  w:4, d:5, h:6,  color:0xE8C99A, roof:false },
    { x:-4, z:-10, w:5, d:4, h:12, color:0xBC8C5A, roof:true  },
    { x:8,  z:12,  w:7, d:5, h:7,  color:0xD4A574, roof:false },
    { x:-15,z:-5,  w:5, d:5, h:9,  color:0xE0B87A, roof:true  },
    { x:0,  z:-14, w:6, d:6, h:14, color:0xC8906A, roof:true  },
  ];

  bldgs.forEach(b => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, b.h, b.d),
      new THREE.MeshLambertMaterial({ color: b.color })
    );
    body.position.y = b.h / 2 + 1.5;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    if (b.roof) {
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(b.w, b.d) * 0.75, 3, 4),
        new THREE.MeshLambertMaterial({ color: 0x8B2525 })
      );
      roof.position.y = b.h + 1.5 + 1.5;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      g.add(roof);
    }

    const winMat = new THREE.MeshLambertMaterial({ color: 0xFFEB99 });
    for (let i = 0; i < 2; i++) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 0.1), winMat);
      win.position.set((i - 0.5) * 2, b.h * 0.5 + 1.5, b.d / 2 + 0.05);
      g.add(win);
    }

    g.position.set(b.x, 0, b.z);
    scene.add(g);
    buildings.push({ bx: b.x, bz: b.z, sw: b.w / 2 + 0.8, sd: b.d / 2 + 0.8 });
  });

  // Dock
  const dock = new THREE.Mesh(
    new THREE.BoxGeometry(12, 0.4, 6),
    new THREE.MeshLambertMaterial({ color: 0xA0764A })
  );
  dock.position.set(-2, 1.2, 24);
  dock.receiveShadow = true;
  scene.add(dock);

  [-5, 0, 5].forEach(x => {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 4, 8),
      new THREE.MeshLambertMaterial({ color: 0x7B5A3A })
    );
    pole.position.set(x, 2.5, 26.5);
    pole.castShadow = true;
    scene.add(pole);
  });

  // Chest
  const chest = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 1, 1.5),
    new THREE.MeshLambertMaterial({ color: 0x8B6914 })
  );
  chest.position.set(3, 2, -18);
  scene.add(chest);
  const goldLight = new THREE.PointLight(0xFFD700, 2, 6);
  goldLight.position.set(3, 3.2, -18);
  scene.add(goldLight);

  // Barrels
  for (let i = 0; i < 5; i++) {
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 1.2, 12),
      new THREE.MeshLambertMaterial({ color: 0x7B4F2E })
    );
    barrel.position.set(-18 + i * 1.5, 2, 8);
    barrel.castShadow = true;
    scene.add(barrel);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.51, 0.06, 8, 16),
      new THREE.MeshLambertMaterial({ color: 0x444 })
    );
    ring.position.copy(barrel.position);
    ring.position.y += 0.3;
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
  }
}

function buildLuffy() {
  luffy = new THREE.Group();
  luffy.position.set(0, 1.5, 0);

  const skin   = new THREE.MeshLambertMaterial({ color: 0xF4A460 });
  const red    = new THREE.MeshLambertMaterial({ color: 0xCC2200 });
  const blue   = new THREE.MeshLambertMaterial({ color: 0x3355AA });
  const brown  = new THREE.MeshLambertMaterial({ color: 0x8B6914 });
  const yellow = new THREE.MeshLambertMaterial({ color: 0xFFD700 });
  const black  = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const white  = new THREE.MeshLambertMaterial({ color: 0xffffff });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 0.8), red);
  body.position.y = 0;
  body.castShadow = true;
  luffy.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.65, 16, 12), skin);
  head.position.y = 1.3;
  head.castShadow = true;
  luffy.add(head);

  [-0.22, 0.22].forEach(ex => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), white);
    eye.position.set(ex, 1.35, 0.6);
    luffy.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), black);
    pupil.position.set(ex, 1.35, 0.66);
    luffy.add(pupil);
  });

  const scar = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.2, 0.05),
    new THREE.MeshLambertMaterial({ color: 0xCC0000 })
  );
  scar.position.set(-0.22, 1.18, 0.63);
  luffy.add(scar);

  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.18, 0.04, 6, 10, Math.PI),
    new THREE.MeshLambertMaterial({ color: 0xCC4422 })
  );
  smile.position.set(0, 1.1, 0.6);
  smile.rotation.z = Math.PI;
  luffy.add(smile);

  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.08, 24), yellow);
  brim.position.y = 1.7;
  luffy.add(brim);

  const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.5, 16), yellow);
  hatTop.position.y = 1.95;
  luffy.add(hatTop);

  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.61, 0.61, 0.12, 16), red);
  band.position.y = 1.73;
  luffy.add(band);

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.0, 0.35), skin);
  armL.position.set(-0.85, 0, 0);
  armL.castShadow = true;
  luffy.add(armL);
  luffy.userData.armL = armL;

  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.0, 0.35), skin);
  armR.position.set(0.85, 0, 0);
  armR.castShadow = true;
  luffy.add(armR);
  luffy.userData.armR = armR;

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.0, 0.42), blue);
  legL.position.set(-0.35, -1.2, 0);
  legL.castShadow = true;
  luffy.add(legL);
  luffy.userData.legL = legL;

  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.0, 0.42), blue);
  legR.position.set(0.35, -1.2, 0);
  legR.castShadow = true;
  luffy.add(legR);
  luffy.userData.legR = legR;

  [-0.35, 0.35].forEach(sx => {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.6), brown);
    shoe.position.set(sx, -1.75, 0.08);
    luffy.add(shoe);
  });

  scene.add(luffy);
}

function buildVehicles() {
  spawnShip({ x: -2,  z: 26  }, 'Going Merry',  0xF5DEB3);
  spawnShip({ x: 8,   z: 28  }, 'Mini Bateau',   0xDEB887);
  spawnShip({ x: 85,  z: -55 }, 'Merry II',      0xF0E68C);
  spawnMount({ x: 10, z: -8  }, 'horse');
  spawnMount({ x: -12,z: -6  }, 'bear');
}

function spawnShip(pos, name, hullColor) {
  const g = new THREE.Group();
  g.userData = { type: 'ship', name, bobPhase: Math.random() * Math.PI * 2 };

  const hullMat = new THREE.MeshLambertMaterial({ color: hullColor });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 10), hullMat);
  hull.castShadow = true;
  g.add(hull);

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(4.5, 0.3, 9),
    new THREE.MeshLambertMaterial({ color: 0xA0724A })
  );
  deck.position.y = 1.1;
  g.add(deck);

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.2, 8, 8),
    new THREE.MeshLambertMaterial({ color: 0x8B5A2B })
  );
  mast.position.y = 5;
  g.add(mast);

  const sail = new THREE.Mesh(
    new THREE.PlaneGeometry(3.5, 5),
    new THREE.MeshLambertMaterial({ color: 0xFFF8DC, side: THREE.DoubleSide })
  );
  sail.position.set(0, 5.5, -0.5);
  g.add(sail);

  const skull = new THREE.Mesh(
    new THREE.CircleGeometry(0.6, 16),
    new THREE.MeshLambertMaterial({ color: 0x111111, side: THREE.DoubleSide })
  );
  skull.position.set(0, 8.5, -0.4);
  g.add(skull);

  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.8),
    new THREE.MeshLambertMaterial({ color: 0xCC0000, side: THREE.DoubleSide })
  );
  flag.position.set(0.8, 9.1, 0);
  flag.rotation.y = Math.PI / 2;
  g.add(flag);

  g.position.set(pos.x, 0.5, pos.z);
  scene.add(g);
  vehicles.push(g);
}

function spawnMount(pos, type) {
  const g = new THREE.Group();
  g.userData = { type: 'mount', name: type === 'horse' ? 'Cheval' : 'Ours Polaire' };

  const bodyColor = type === 'horse' ? 0xC8964A : 0x8B7355;
  const mat = new THREE.MeshLambertMaterial({ color: bodyColor });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 2.8), mat);
  body.position.y = 1.2;
  body.castShadow = true;
  g.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 1.2), mat);
  head.position.set(0, 2, -1.6);
  g.add(head);

  [-0.25, 0.25].forEach(ex => {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.2), mat);
    ear.position.set(ex, 2.55, -1.6);
    g.add(ear);
  });

  [[-0.5,-1.4,0.9],[-0.5,-1.4,-0.9],[0.5,-1.4,0.9],[0.5,-1.4,-0.9]].forEach(([x,y,z]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 0.4), mat);
    leg.position.set(x, y, z);
    g.add(leg);
  });

  [-0.22, 0.22].forEach(ex => {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0x111111 })
    );
    eye.position.set(ex, 2.1, -2.15);
    g.add(eye);
  });

  g.position.set(pos.x, 0, pos.z);
  scene.add(g);
  vehicles.push(g);
}

function buildSeagulls() {
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    const bodyMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0xfafafa })
    );
    g.add(bodyMesh);

    const wingMat = new THREE.MeshLambertMaterial({ color: 0xfafafa, side: THREE.DoubleSide });
    [-1, 1].forEach(side => {
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), wingMat);
      wing.position.set(side * 0.45, 0, 0);
      wing.rotation.z = side * 0.3;
      wing.userData.side = side;
      g.add(wing);
    });

    g.userData = {
      orbitR:     20 + Math.random() * 60,
      orbitH:     20 + Math.random() * 30,
      orbitSpeed: 0.2 + Math.random() * 0.3,
      phase:      Math.random() * Math.PI * 2,
      flapSpeed:  3 + Math.random() * 2,
      cx:         (Math.random() - 0.5) * 80,
      cz:         (Math.random() - 0.5) * 80,
    };

    scene.add(g);
    seagulls.push(g);
  }
}

function burst(pos, color, count) {
  count = count || 12;
  for (let i = 0; i < count; i++) {
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 6, 4),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1 })
    );
    p.position.copy(pos);
    p.userData = {
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 5 + 2,
        (Math.random() - 0.5) * 4
      ),
      life: 1.0,
    };
    scene.add(p);
    particles.push(p);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.userData.vel.y -= 9.8 * dt;
    p.position.addScaledVector(p.userData.vel, dt);
    p.userData.life -= dt * 1.2;
    p.material.opacity = Math.max(0, p.userData.life);
    if (p.userData.life <= 0) {
      scene.remove(p);
      particles.splice(i, 1);
    }
  }
}

function setupControls() {
  window.addEventListener('keydown', function(e) {
    keys[e.code] = true;
    if (e.code === 'KeyE') tryVehicle();
    if (e.code === 'Space') { e.preventDefault(); doAttack(); }
  });
  window.addEventListener('keyup', function(e) { keys[e.code] = false; });

  renderer.domElement.addEventListener('mousedown', function(e) {
    dragStart = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('mousemove', function(e) {
    if (!dragStart) return;
    camTheta -= (e.clientX - dragStart.x) * 0.005;
    camPhi   -= (e.clientY - dragStart.y) * 0.005;
    camPhi = Math.max(0.1, Math.min(1.2, camPhi));
    dragStart = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('mouseup', function() { dragStart = null; });
  renderer.domElement.addEventListener('wheel', function(e) {
    camDist += e.deltaY * 0.01;
    camDist = Math.max(4, Math.min(20, camDist));
  });

  var jzone = document.getElementById('joystick-zone');
  jzone.addEventListener('touchstart', function(e) {
    e.preventDefault();
    var t = e.touches[0];
    joystick.origin = { x: t.clientX, y: t.clientY };
    joystick.active = true;
    document.getElementById('joystick-thumb').style.display = 'block';
  }, { passive: false });
  jzone.addEventListener('touchmove', function(e) {
    e.preventDefault();
    if (!joystick.active) return;
    var t = e.touches[0];
    var dx = t.clientX - joystick.origin.x;
    var dy = t.clientY - joystick.origin.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    var maxR = 40;
    joystick.dx = dx / Math.max(len, maxR);
    joystick.dy = dy / Math.max(len, maxR);
    var thumb = document.getElementById('joystick-thumb');
    thumb.style.left = (Math.min(Math.abs(dx), maxR) * Math.sign(dx) + 60 - 20) + 'px';
    thumb.style.top  = (Math.min(Math.abs(dy), maxR) * Math.sign(dy) + 60 - 20) + 'px';
  }, { passive: false });
  jzone.addEventListener('touchend', function(e) {
    e.preventDefault();
    joystick.active = false;
    joystick.dx = 0;
    joystick.dy = 0;
    var thumb = document.getElementById('joystick-thumb');
    thumb.style.display = 'none';
    thumb.style.left = '40px';
    thumb.style.top  = '40px';
  }, { passive: false });

  var czone = document.getElementById('cam-zone');
  czone.addEventListener('touchstart', function(e) {
    e.preventDefault();
    lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: false });
  czone.addEventListener('touchmove', function(e) {
    e.preventDefault();
    if (!lastTouch) return;
    camTheta -= (e.touches[0].clientX - lastTouch.x) * 0.006;
    camPhi   -= (e.touches[0].clientY - lastTouch.y) * 0.006;
    camPhi = Math.max(0.1, Math.min(1.2, camPhi));
    lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: false });
  czone.addEventListener('touchend', function() { lastTouch = null; });
}

function notify(msg) {
  notifQueue.push(msg);
  if (notifQueue.length === 1) showNextNotif();
}
function showNextNotif() {
  if (!notifQueue.length) return;
  var el = document.getElementById('notification');
  el.textContent = notifQueue[0];
  el.style.opacity = '1';
  notifTimer = 2.5;
}

function tryVehicle() {
  if (currentVehicle) {
    exitVehicle();
  } else if (nearVehicle) {
    enterVehicle(nearVehicle);
  }
}
function enterVehicle(v) {
  currentVehicle = v;
  var tag = document.getElementById('crew-tag');
  tag.textContent = '⛵ ' + v.userData.name;
  tag.style.display = 'block';
  document.getElementById('vehicle-btn').textContent = 'QUITTER';
  notify('A bord: ' + v.userData.name + '!');
}
function exitVehicle() {
  if (!currentVehicle) return;
  luffy.position.copy(currentVehicle.position);
  luffy.position.y = 1.5;
  luffy.position.x += 3;
  currentVehicle = null;
  document.getElementById('crew-tag').style.display = 'none';
  document.getElementById('vehicle-btn').textContent = 'MONTER';
  notify('Debarque!');
}

function doAttack() {
  var attackPos = luffy.position.clone();
  attackPos.y += 1.5;
  burst(attackPos, 0xFF4400, 15);
  score += 50;
  bounty += 100000;
  updateHUD();
  notify('Gomu Gomu no Pistol!');
}

function updateHUD() {
  document.getElementById('score').textContent = score.toLocaleString();
  var hbar = document.getElementById('health-bar');
  hbar.style.width = health + '%';
  hbar.style.background = health > 50 ? '#2ecc40' : health > 25 ? '#ff851b' : '#ff4136';
  document.getElementById('bounty').textContent = bounty.toLocaleString();
  var spd = 0;
  if (currentVehicle) {
    spd = currentVehicle.userData.type === 'ship' ? 12 : 8;
  } else if (Math.abs(joystick.dx) + Math.abs(joystick.dy) > 0.1 || keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD']) {
    spd = 6;
  }
  document.getElementById('speed').textContent = spd;
}

function setupMinimap() {
  miniCanvas = document.getElementById('minimap');
  miniCtx = miniCanvas.getContext('2d');
}

function drawMinimap() {
  var W = 120, H = 120, scale = 0.5;
  miniCtx.clearRect(0, 0, W, H);
  miniCtx.fillStyle = '#1a7fcc';
  miniCtx.fillRect(0, 0, W, H);

  var ox = W / 2 - luffy.position.x * scale;
  var oy = H / 2 - luffy.position.z * scale;

  ISLANDS.forEach(function(isl) {
    miniCtx.fillStyle = '#4CAF50';
    miniCtx.beginPath();
    miniCtx.arc(ox + isl.cx * scale, oy + isl.cz * scale, isl.r * scale, 0, Math.PI * 2);
    miniCtx.fill();
  });

  vehicles.forEach(function(v) {
    miniCtx.fillStyle = v === currentVehicle ? '#FFD700' : '#ffffff';
    miniCtx.fillRect(ox + v.position.x * scale - 2, oy + v.position.z * scale - 2, 4, 4);
  });

  miniCtx.save();
  miniCtx.translate(W / 2, H / 2);
  miniCtx.rotate(-luffy.rotation.y - Math.PI / 2);
  miniCtx.fillStyle = '#FF4136';
  miniCtx.beginPath();
  miniCtx.moveTo(0, -6);
  miniCtx.lineTo(-4, 4);
  miniCtx.lineTo(4, 4);
  miniCtx.closePath();
  miniCtx.fill();
  miniCtx.restore();

  miniCtx.strokeStyle = '#FFD700';
  miniCtx.lineWidth = 2;
  miniCtx.strokeRect(0, 0, W, H);
}

function update(dt) {
  oceanT += dt;

  var mx = joystick.dx, mz = joystick.dy;
  if (keys['KeyW'] || keys['ArrowUp'])    mz = -1;
  if (keys['KeyS'] || keys['ArrowDown'])  mz =  1;
  if (keys['KeyA'] || keys['ArrowLeft'])  mx = -1;
  if (keys['KeyD'] || keys['ArrowRight']) mx =  1;
  var sprint = keys['ShiftLeft'] || keys['ShiftRight'];
  var speed = sprint ? 9 : 5.5;
  var isMoving = Math.abs(mx) > 0.05 || Math.abs(mz) > 0.05;

  if (currentVehicle) {
    var vSpeed = currentVehicle.userData.type === 'ship' ? 7 : 10;
    var dirX = Math.sin(currentVehicle.rotation.y) * -mz + Math.cos(currentVehicle.rotation.y) * mx;
    var dirZ = Math.cos(currentVehicle.rotation.y) * -mz - Math.sin(currentVehicle.rotation.y) * mx;
    currentVehicle.position.x += dirX * vSpeed * dt;
    currentVehicle.position.z += dirZ * vSpeed * dt;
    if (mx !== 0) currentVehicle.rotation.y += mx * 0.8 * dt;

    luffy.position.copy(currentVehicle.position);
    luffy.position.y = currentVehicle.userData.type === 'ship'
      ? currentVehicle.position.y + 1.8
      : currentVehicle.position.y + 2.5;
    luffy.rotation.y = currentVehicle.rotation.y;

    if (currentVehicle.userData.type === 'ship') {
      currentVehicle.position.y = 0.5 + Math.sin(oceanT * 1.2 + currentVehicle.userData.bobPhase) * 0.22;
      currentVehicle.rotation.z = Math.sin(oceanT * 0.8 + currentVehicle.userData.bobPhase) * 0.035;
    }
  } else {
    if (isMoving) {
      var moveX = Math.sin(camTheta) * mz + Math.cos(camTheta) * mx;
      var moveZ = Math.cos(camTheta) * mz - Math.sin(camTheta) * mx;
      var len = Math.sqrt(moveX * moveX + moveZ * moveZ);
      if (len > 0) { moveX /= len; moveZ /= len; }

      var nx = luffy.position.x + moveX * speed * dt;
      var nz = luffy.position.z + moveZ * speed * dt;

      var blocked = false;
      for (var i = 0; i < buildings.length; i++) {
        var b = buildings[i];
        if (Math.abs(nx - b.bx) < b.sw && Math.abs(nz - b.bz) < b.sd) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        luffy.position.x = nx;
        luffy.position.z = nz;
        luffy.position.y = 1.5;
        luffy.rotation.y = Math.atan2(moveX, moveZ) + Math.PI;
      }

      var t = clock.elapsedTime * 8;
      luffy.userData.legL.rotation.x =  Math.sin(t) * 0.5;
      luffy.userData.legR.rotation.x = -Math.sin(t) * 0.5;
      luffy.userData.armL.rotation.x = -Math.sin(t) * 0.4;
      luffy.userData.armR.rotation.x =  Math.sin(t) * 0.4;
    } else {
      luffy.userData.legL.rotation.x *= 0.85;
      luffy.userData.legR.rotation.x *= 0.85;
      luffy.userData.armL.rotation.x *= 0.85;
      luffy.userData.armR.rotation.x *= 0.85;
    }
  }

  nearVehicle = null;
  var nearest = 5;
  vehicles.forEach(function(v) {
    var d = luffy.position.distanceTo(v.position);
    if (d < nearest && v !== currentVehicle) { nearest = d; nearVehicle = v; }
  });
  var hint = document.getElementById('interact-hint');
  if (nearVehicle) {
    hint.style.display = 'block';
    hint.textContent = '[ E ] Monter: ' + nearVehicle.userData.name;
  } else {
    hint.style.display = 'none';
  }

  vehicles.forEach(function(v) {
    if (v.userData.type === 'ship' && v !== currentVehicle) {
      v.position.y = 0.5 + Math.sin(oceanT * 1.2 + v.userData.bobPhase) * 0.22;
      v.rotation.z = Math.sin(oceanT * 0.8 + v.userData.bobPhase) * 0.035;
    }
  });

  seagulls.forEach(function(sg) {
    var d = sg.userData;
    d.phase += d.orbitSpeed * dt;
    sg.position.set(
      d.cx + Math.cos(d.phase) * d.orbitR,
      d.orbitH + Math.sin(d.phase * 1.7) * 3,
      d.cz + Math.sin(d.phase) * d.orbitR
    );
    sg.rotation.y = -d.phase + Math.PI / 2;
    sg.children.forEach(function(c) {
      if (c.userData.side) {
        c.rotation.z = c.userData.side * (0.3 + Math.sin(clock.elapsedTime * d.flapSpeed) * 0.5);
      }
    });
  });

  updateParticles(dt);

  if (isMoving && Math.random() < 0.02) { score += 10; }
  updateHUD();

  if (notifTimer > 0) {
    notifTimer -= dt;
    if (notifTimer <= 0) {
      var el = document.getElementById('notification');
      el.style.opacity = '0';
      notifQueue.shift();
      setTimeout(showNextNotif, 500);
    }
  }

  drawMinimap();

  var target = new THREE.Vector3(luffy.position.x, luffy.position.y + 1.2, luffy.position.z);
  var camX = Math.sin(camTheta) * Math.cos(camPhi) * camDist;
  var camY = Math.sin(camPhi) * camDist;
  var camZ = Math.cos(camTheta) * Math.cos(camPhi) * camDist;
  var desiredCam = new THREE.Vector3(target.x + camX, target.y + camY, target.z + camZ);
  camera.position.lerp(desiredCam, 0.09);
  camera.lookAt(target);
}

function animate() {
  requestAnimationFrame(animate);
  var dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.tryVehicle = tryVehicle;
window.doAttack = doAttack;
window.doSprint = function() { keys['ShiftLeft'] = true; setTimeout(function() { keys['ShiftLeft'] = false; }, 800); };

window.addEventListener('load', init);
