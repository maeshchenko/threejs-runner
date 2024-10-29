import * as THREE from 'https://unpkg.com/three@0.152.2/build/three.module.js';
import * as Tone from 'https://cdn.skypack.dev/tone';

const GRAVITY = -0.005;
const JUMP_VELOCITY = 0.2;
const MIN_OBSTACLE_SPACING = 10;
const MAX_OBSTACLE_SPACING = 20;
const CAMERA_OFFSET = new THREE.Vector3(0, 15, -20);
const PLAYER_BOUNDARY_X = 10;
const OBSTACLE_CREATION_INTERVAL = 1; // Новая константа

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 10, 500);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 1);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0x00ffff, 1);
directionalLight.position.set(0, 10, 10);
directionalLight.castShadow = true;
scene.add(directionalLight);

let background1, background2;

// ... Код загрузки задних фонов (svgLayer1 и svgLayer2) остается без изменений ...

// Функция svgToTexture и загрузка задников
function svgToTexture(svg) {
    return new Promise((resolve, reject) => {
        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const loader = new THREE.TextureLoader();
        loader.load(
            url,
            (texture) => {
                URL.revokeObjectURL(url);
                resolve(texture);
            },
            undefined,
            (err) => {
                console.error('Ошибка загрузки текстуры SVG:', err);
                reject(err);
            }
        );
    });
}

async function loadBackgrounds() {
    // ... Код загрузки background1 и background2 ...
}

loadBackgrounds();

function createNeonGrid(size, divisions, color) {
    const gridHelper = new THREE.GridHelper(size, divisions, color, color);
    gridHelper.material.opacity = 0.75;
    gridHelper.material.transparent = true;
    gridHelper.material.depthWrite = false;
    gridHelper.material.blending = THREE.AdditiveBlending;
    return gridHelper;
}

const gridSizeXZ = 1000;
const gridDivisions = 100;

const gridXZ = createNeonGrid(gridSizeXZ, gridDivisions, 0xff00ff);
scene.add(gridXZ);

const wallHeight = 20;
const wallSize = 1000;
const wallDivisions = 100;

const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
ground.receiveShadow = true;
scene.add(ground);

function createWall(size, divisions, color, xPosition) {
    const gridHelper = new THREE.GridHelper(size, divisions, color, color);
    gridHelper.material.opacity = 0.75;
    gridHelper.material.transparent = true;
    gridHelper.material.depthWrite = false;
    gridHelper.material.blending = THREE.AdditiveBlending;
    gridHelper.rotation.z = Math.PI / 2;
    gridHelper.position.x = xPosition;
    gridHelper.position.y = wallHeight / 2;
    return gridHelper;
}

const leftWall = createWall(wallSize, wallDivisions, 0x00ffff, -PLAYER_BOUNDARY_X);
const rightWall = createWall(wallSize, wallDivisions, 0x00ffff, PLAYER_BOUNDARY_X);
scene.add(leftWall);
scene.add(rightWall);

const playerWidth = 1;
const playerHeight = 2;
const playerGeometry = new THREE.BoxGeometry(playerWidth, playerHeight, 1);
const playerMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0x00ffff });
const player = new THREE.Mesh(playerGeometry, playerMaterial);
player.position.set(0, playerHeight / 2, 0);
player.castShadow = true;
scene.add(player);

let obstacles = [];

const obstacleTypes = [
    { geometry: new THREE.BoxGeometry(1, 1, 1), material: new THREE.MeshStandardMaterial({ color: 0xff00ff, emissive: 0xff00ff }) },
    { geometry: new THREE.ConeGeometry(0.5, 1, 8), material: new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00 }) },
    { geometry: new THREE.SphereGeometry(0.5, 16, 16), material: new THREE.MeshStandardMaterial({ color: 0xffa500, emissive: 0xffa500 }) }
];

const maxJumpHeight = calculateMaxJumpHeight(JUMP_VELOCITY, GRAVITY);

function calculateMaxJumpHeight(initialVelocity, gravity) {
    return (initialVelocity * initialVelocity) / (2 * -gravity);
}

function createObstacle(z) {
    const obstacleType = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
    const obstacleWidth = THREE.MathUtils.randFloat(0.5, 2);
    const obstacleHeight = THREE.MathUtils.randFloat(1, maxJumpHeight - 0.5);

    const geometry = obstacleType.geometry.clone();
    geometry.scale(obstacleWidth, obstacleHeight, obstacleWidth);

    const obstacle = new THREE.Mesh(geometry, obstacleType.material.clone());
    obstacle.position.set(
        THREE.MathUtils.randFloat(-PLAYER_BOUNDARY_X + obstacleWidth / 2, PLAYER_BOUNDARY_X - obstacleWidth / 2),
        obstacleHeight / 2,
        z
    );
    obstacle.castShadow = true;
    obstacle.scored = false;

    obstacle.userData.spinSpeed = THREE.MathUtils.randFloat(0.01, 0.05);

    scene.add(obstacle);
    obstacles.push(obstacle);
}

function resetObstacles() {
    for (let obstacle of obstacles) {
        scene.remove(obstacle);
    }
    obstacles = [];
}

let velocityY = 0;
let isJumping = false;
const keysPressed = {};
let score = 0;
let bestScore = localStorage.getItem('bestScore') || 0;
const scoreElement = document.getElementById('score');
const bestScoreElement = document.getElementById('best-score');
bestScoreElement.textContent = `Best Score: ${bestScore}`;
const pauseOverlay = document.getElementById('pause-overlay');
let isPaused = false;

function handleKeyDown(event) {
    keysPressed[event.code] = true;
    if (event.code === 'KeyP') {
        isPaused = !isPaused;
        pauseOverlay.style.display = isPaused ? 'block' : 'none';

        // Остановка или запуск музыки
        if (isPaused) {
            Tone.Transport.pause();
        } else {
            Tone.Transport.start('+0.1'); // Небольшая задержка для синхронизации
        }
    }
}

function handleKeyUp(event) {
    keysPressed[event.code] = false;
}

document.addEventListener('keydown', handleKeyDown);
document.addEventListener('keyup', handleKeyUp);

// Функция для воспроизведения процедурной музыки и синхронизации препятствий
function playProceduralDarkSynthwave() {
    // Создаём эффекты
    const distortion = new Tone.Distortion(0.4).toDestination();
    const reverb = new Tone.Reverb({
        decay: 4,
        wet: 0.5
    }).toDestination();
    const delay = new Tone.FeedbackDelay("8n", 0.3).toDestination();

    // Создаём синтезаторы
    const bassSynth = new Tone.MonoSynth({
        oscillator: { type: 'sawtooth' },
        filter: { type: 'lowpass', frequency: 150, Q: 1 },
        envelope: { attack: 0.005, decay: 0.2, sustain: 0.5, release: 1 },
        filterEnvelope: { attack: 0.005, decay: 0.1, sustain: 0.9, release: 1, baseFrequency: 50, octaves: 2.6 }
    }).connect(distortion);

    const leadSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'pulse', width: 0.2 },
        envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 0.8 },
        filterEnvelope: { attack: 0.005, decay: 0.1, sustain: 0.5, release: 0.8, baseFrequency: 300, octaves: 4 }
    }).connect(reverb).connect(delay);

    const padSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 2, decay: 1, sustain: 0.5, release: 5 },
    }).connect(reverb).connect(delay);

    // Функции генерации последовательностей
    function generateBassSequence() {
        const bassNotes = ['C1', 'D1', 'Eb1', 'F1', 'G1', 'Ab1', 'Bb1'];
        const sequence = [];
        for (let i = 0; i < 16; i++) {
            if (Math.random() < 0.7) {
                const note = bassNotes[Math.floor(Math.random() * bassNotes.length)];
                sequence.push(note);
            } else {
                sequence.push(null);
            }
        }
        return sequence;
    }

    function generateLeadSequence() {
        const scale = ['C3', 'D3', 'Eb3', 'F3', 'G3', 'Ab3', 'Bb3', 'C4'];
        const sequence = [];
        for (let i = 0; i < 32; i++) {
            if (Math.random() < 0.5) {
                const note = scale[Math.floor(Math.random() * scale.length)];
                sequence.push(note);
            } else {
                sequence.push(null);
            }
        }
        return sequence;
    }

    // Генерация и обновление последовательностей
    let bassSequence = generateBassSequence();
    let leadSequence = generateLeadSequence();

    // Счетчик для создания препятствий
    let obstacleCounter = 0;

    // Создаём партии
    const bassPart = new Tone.Sequence((time, note) => {
        if (note) {
            bassSynth.triggerAttackRelease(note, '8n', time);

            // Создание препятствия на каждом N-ом звуке
            obstacleCounter++;
            if (obstacleCounter % OBSTACLE_CREATION_INTERVAL === 0) {
                Tone.Draw.schedule(() => {
                    createObstacle(player.position.z + 50);
                }, time);
            }
        }
    }, bassSequence, '16n').start(0);

    const leadPart = new Tone.Sequence((time, note) => {
        if (note) {
            leadSynth.triggerAttackRelease(note, '16n', time);
        }
    }, leadSequence, '8n').start(0);

    const padChords = [
        ['C2', 'Eb2', 'G2'],
        ['F2', 'Ab2', 'C3'],
        ['G2', 'Bb2', 'D3'],
        ['Eb2', 'G2', 'Bb2']
    ];
    const padPart = new Tone.Sequence((time, chord) => {
        padSynth.triggerAttackRelease(chord, '2m', time);
    }, padChords, '2m').start(0);

    // Ударные
    const drumKit = {
        kick: new Tone.MembraneSynth({
            pitchDecay: 0.05,
            octaves: 10,
            oscillator: { type: 'sine' },
            envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 }
        }).toDestination(),
        snare: new Tone.MetalSynth({
            frequency: 200,
            envelope: { attack: 0.001, decay: 0.2, release: 0.2 },
            harmonicity: 5.1,
            modulationIndex: 32,
            resonance: 4000,
            octaves: 1.5
        }).toDestination()
    };

    const drumPattern = [
        'kick', null, 'kick', 'snare',
        'kick', null, 'kick', 'snare',
        'kick', 'snare', 'kick', null,
        'kick', null, 'snare', null
    ];

    const drumPart = new Tone.Sequence((time, note) => {
        if (note === 'kick') {
            drumKit.kick.triggerAttackRelease('C1', '8n', time);
        } else if (note === 'snare') {
            drumKit.snare.triggerAttackRelease('16n', time);
        }
    }, drumPattern, '16n').start(0);

    // Обновляем последовательности каждые 8 тактов
    Tone.Transport.scheduleRepeat(() => {
        bassSequence = generateBassSequence();
        leadSequence = generateLeadSequence();
        bassPart.events = bassSequence;
        leadPart.events = leadSequence;
        // Сбрасываем счетчик препятствий при обновлении последовательности
        obstacleCounter = 0;
    }, '8m');

    // Устанавливаем темп
    Tone.Transport.bpm.value = 130;

    // Запускаем транспорт
    Tone.Transport.start();
}

// Функция для запуска игры после нажатия кнопки
function startGame() {
    playProceduralDarkSynthwave();
    animate();
}

const startOverlay = document.getElementById('start-overlay');
const startButton = document.getElementById('start-button');

// Показать оверлей старта
startOverlay.style.display = 'block';

startButton.addEventListener('click', async () => {
    await Tone.start();
    startOverlay.style.display = 'none';
    startGame();
});

function animate() {
    requestAnimationFrame(animate);

    if (!isPaused) {
        if (background1 && background2) {
            background1.position.z = camera.position.z * 0.5;
            background2.position.z = camera.position.z * 0.3;
        }

        const forwardSpeed = 0.2;
        player.position.z += forwardSpeed;
        ground.position.z = player.position.z;

        if (keysPressed['ArrowRight'] || keysPressed['KeyD']) {
            player.position.x -= 0.2;
        }

        if (keysPressed['ArrowLeft'] || keysPressed['KeyA']) {
            player.position.x += 0.2;
        }

        const playerXMin = -PLAYER_BOUNDARY_X + playerWidth / 2;
        const playerXMax = PLAYER_BOUNDARY_X - playerWidth / 2;
        player.position.x = THREE.MathUtils.clamp(player.position.x, playerXMin, playerXMax);

        if ((keysPressed['Space'] || keysPressed['ArrowUp'] || keysPressed['KeyW']) && !isJumping) {
            velocityY = JUMP_VELOCITY;
            isJumping = true;
        }

        player.position.y += velocityY;
        velocityY += GRAVITY;

        if (player.position.y <= playerHeight / 2) {
            player.position.y = playerHeight / 2;
            isJumping = false;
        }

        for (let i = 0; i < obstacles.length; i++) {
            const obstacle = obstacles[i];

            obstacle.rotation.y += obstacle.userData.spinSpeed;

            if (!obstacle.scored && player.position.z > obstacle.position.z + 0.5) {
                obstacle.scored = true;
                score++;
                scoreElement.textContent = `Score: ${score}`;
            }

            const obstacleBox = new THREE.Box3().setFromObject(obstacle);
            const playerBox = new THREE.Box3().setFromObject(player);

            if (playerBox.intersectsBox(obstacleBox)) {
                if (score > bestScore) {
                    bestScore = score;
                    bestScoreElement.textContent = `Best Score: ${bestScore}`;
                    localStorage.setItem('bestScore', bestScore);
                }
                player.position.set(0, playerHeight / 2, 0);
                velocityY = 0;
                isJumping = false;
                camera.position.set(0, CAMERA_OFFSET.y, CAMERA_OFFSET.z);
                score = 0;
                scoreElement.textContent = `Score: ${score}`;
                resetObstacles();

                // Сбросить счетчик препятствий
                obstacleCounter = 0;

                break;
            }
        }

        while (obstacles.length > 0 && obstacles[0].position.z < player.position.z - 20) {
            scene.remove(obstacles[0]);
            obstacles.shift();
        }

        const desiredCameraPosition = new THREE.Vector3(
            player.position.x + CAMERA_OFFSET.x,
            CAMERA_OFFSET.y,
            player.position.z + CAMERA_OFFSET.z
        );
        camera.position.lerp(desiredCameraPosition, 0.1);

        const lookAtPosition = new THREE.Vector3(
            player.position.x,
            1,
            player.position.z + 10
        );
        camera.lookAt(lookAtPosition);

        gridXZ.position.z = player.position.z;
        leftWall.position.z = player.position.z;
        rightWall.position.z = player.position.z;
    }

    renderer.render(scene, camera);
}

camera.position.set(0, CAMERA_OFFSET.y, CAMERA_OFFSET.z);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});