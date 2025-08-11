document.addEventListener('DOMContentLoaded', () => {

    // --- REFERÊNCIAS AOS ELEMENTOS DO DOM ---
    const gameScreen = document.getElementById('game-screen');
    const scoreDisplay = document.getElementById('score-display');
    const highscoreDisplay = document.getElementById('highscore-display');
    const timerDisplay = document.getElementById('timer-display');
    const comboDisplay = document.getElementById('combo-display');
    const buffInventoryDisplay = document.getElementById('buff-inventory');
    const epicBuffOverlay = document.getElementById('epic-buff-overlay');
    const useBuffButton = document.getElementById('use-buff-button');
    const startButton = document.getElementById('start-button');
    const gameContainer = document.getElementById('game-container');
    const backgroundContainer = document.getElementById('background-container');
    const startStopMessage = document.getElementById('start-stop-message');
    const messageTitle = document.getElementById('message-title');
    const messageScore = document.getElementById('message-score');

    // --- REFERÊNCIAS AOS ÁUDIOS ---
    const sounds = {
        music: document.getElementById('sound-music'), squash: document.getElementById('sound-squash'),
        start: document.getElementById('sound-start'), gameOver: document.getElementById('sound-gameover'),
        powerup: document.getElementById('sound-powerup'), bossHit: document.getElementById('sound-boss-hit'),
        buffUse: document.getElementById('sound-buff-use'),
    };

    // --- VARIÁVEIS DE ESTADO DO JOGO ---
    const SURVIVAL_TIME_SECONDS = 40;
    let score = 0, timeLeft = SURVIVAL_TIME_SECONDS, combo = 1, lastSquashTime = 0;
    let bugCreationIntervalMs = 600;
    let isGameRunning = false, isBuffActive = false;
    let lastTime = 0, timeToNextBug = 0;
    let bugs = [], powerups = [];
    let highScore = localStorage.getItem('bugSmasherHighScore') || 0;
    let gameLoopId, timerId;
    let screenWidth = 0, screenHeight = 0, screenArea = 0;
    let buffCount = 0;

    // --- CONFIGURAÇÕES DO CANVAS DE FUNDO PARALLAX ---
    const layers = [
        { canvas: document.getElementById('matrix-layer-far'), speed: 0.3, size: 12, opacity: 0.3 },
        { canvas: document.getElementById('matrix-layer-mid'), speed: 0.6, size: 16, opacity: 0.5 },
        { canvas: document.getElementById('matrix-layer-near'), speed: 1, size: 20, opacity: 0.7 }
    ];
    let matrixInstances = [];

    function setupMatrix() {
        matrixInstances = [];
        layers.forEach(layer => {
            const canvas = layer.canvas;
            if (canvas) {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
                const ctx = canvas.getContext('2d');
                const columns = Math.floor(canvas.width / layer.size);
                const drops = Array(Math.floor(columns)).fill(1);
                matrixInstances.push({ ctx, drops, ...layer });
            }
        });
    }

    function drawAllMatrix() {
        matrixInstances.forEach(inst => {
            const { ctx, drops, size, opacity } = inst;
            ctx.fillStyle = `rgba(0, 0, 0, 0.1)`;
            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.fillStyle = `rgba(0, 255, 0, ${opacity})`;
            ctx.font = `${size}px monospace`;
            for (let i = 0; i < drops.length; i++) {
                const text = String.fromCharCode(0x30A0 + Math.random() * 96);
                ctx.fillText(text, i * size, drops[i] * size);
                if (drops[i] * size > ctx.canvas.height && Math.random() > 0.975) {
                    drops[i] = 0;
                }
                drops[i]++;
            }
        });
    }
    
    // --- FUNÇÕES AUXILIARES ---
    function playSound(sound) {
        sound.currentTime = 0;
        sound.play().catch(error => console.log(`Erro ao tocar som: ${error.message}`));
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => { clearTimeout(timeout); func(...args); };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // --- LÓGICA DO JOGO ---
    function gerarPosicaoAleatoriaDentroDaCaixa(boxWidth, boxHeight, objectWidth, objectHeight) {
        if (boxWidth <= objectWidth || boxHeight <= objectHeight) return { x: 0, y: 0 };
        const maxX = boxWidth - objectWidth; const maxY = boxHeight - objectHeight;
        const randomX = Math.floor(Math.random() * maxX); const randomY = Math.floor(Math.random() * maxY);
        return { x: randomX, y: randomY };
    }
    
    function spawnEntity() {
        if (isBuffActive) return;
        const roll = Math.random();
        if (roll < 0.06 && powerups.length === 0) createBuff();
        else if (roll < 0.15) createBug(true);
        else createBug(false);
    }

    function createBug(isBoss) {
        const element = document.createElement('div');
        element.classList.add(isBoss ? 'boss-bug' : 'bug');
        const objectWidth = isBoss ? 85 : 50; const objectHeight = isBoss ? 85 : 50;
        const position = gerarPosicaoAleatoriaDentroDaCaixa(screenWidth, screenHeight, objectWidth, objectHeight);
        const bug = { element, x: position.x, y: position.y, isBoss, health: isBoss ? 5 : 1, width: objectWidth, height: objectHeight, timeUntilReproduction: 5000 + Math.random() * 2000 };
        element.style.left = `${bug.x}px`; element.style.top = `${bug.y}px`;
        element.addEventListener('click', () => squash(bug));
        bugs.push(bug); gameScreen.appendChild(element);
    }
    
    function spawnNearbyBug(parentBug) {
        const element = document.createElement('div');
        element.classList.add('bug');
        const objectWidth = 50, objectHeight = 50;
        const offsetX = (Math.random() - 0.5) * 200; const offsetY = (Math.random() - 0.5) * 200;
        let newX = parentBug.x + offsetX; let newY = parentBug.y + offsetY;
        newX = Math.max(0, Math.min(newX, screenWidth - objectWidth));
        newY = Math.max(0, Math.min(newY, screenHeight - objectHeight));
        const bug = { element, x: newX, y: newY, isBoss: false, health: 1, width: objectWidth, height: objectHeight, timeUntilReproduction: 7000 + Math.random() * 2000 };
        element.style.left = `${bug.x}px`; element.style.top = `${bug.y}px`;
        element.addEventListener('click', () => squash(bug));
        bugs.push(bug); gameScreen.appendChild(element);
    }

    function createBuff() {
        const element = document.createElement('div');
        element.classList.add('buff-item');
        const position = gerarPosicaoAleatoriaDentroDaCaixa(screenWidth, screenHeight, 55, 55);
        const powerup = { element, x: position.x, y: position.y };
        element.style.left = `${powerup.x}px`; element.style.top = `${powerup.y}px`;
        element.addEventListener('click', () => collectBuff(powerup));
        powerups.push(powerup); gameScreen.appendChild(element);
    }
    
    function collectBuff(powerup) {
        if (!isGameRunning || !powerup.element.parentNode) return;
        playSound(sounds.powerup);
        buffCount++;
        buffInventoryDisplay.textContent = buffCount;
        useBuffButton.disabled = false;
        powerup.element.remove();
        powerups = powerups.filter(p => p !== powerup);
    }
    
    function useBuff() {
        if (!isGameRunning || buffCount <= 0 || isBuffActive) return;
        isBuffActive = true;
        buffCount--;
        buffInventoryDisplay.textContent = buffCount;
        if (buffCount === 0) useBuffButton.disabled = true;
        clearTimeout(timerId);
        epicBuffOverlay.classList.add('active');
        playSound(sounds.buffUse);
        setTimeout(vanishNextBug, 400); 
        setTimeout(() => epicBuffOverlay.classList.remove('active'), 1200);
    }

    function vanishNextBug() {
        if (bugs.length === 0) {
            endBuffSequence();
            return;
        }
        const bugToVanish = bugs.shift();
        bugToVanish.element.classList.add(bugToVanish.isBoss ? 'boss-bug-vanishing' : 'bug-vanishing');
        playSound(sounds.squash);
        score += (bugToVanish.isBoss ? 50 : 10) * combo;
        scoreDisplay.textContent = score;
        setTimeout(() => {
            if (bugToVanish.element.parentNode) bugToVanish.element.remove();
        }, 300);
        setTimeout(vanishNextBug, 80);
    }

    function endBuffSequence() {
        isBuffActive = false;
        timerId = setTimeout(updateTimer, 1000);
    }

    function squash(bug) {
        if (!isGameRunning || !bug.element.parentNode) return;
        backgroundContainer.classList.add('glitch');
        setTimeout(() => backgroundContainer.classList.remove('glitch'), 150);
        bug.health--;
        bug.element.classList.add('damaged');
        setTimeout(() => {
            if (bug.element) bug.element.classList.remove('damaged')
        }, 200);
        if (bug.health > 0) {
            playSound(sounds.bossHit);
            return;
        }
        playSound(sounds.squash);
        const timeNow = Date.now();
        if (timeNow - lastSquashTime < 1500) { combo++; } else { combo = 1; }
        lastSquashTime = timeNow;
        const points = (bug.isBoss ? 50 : 10) * combo;
        score += points;
        scoreDisplay.textContent = score;
        comboDisplay.textContent = `x${combo}`;
        bug.element.remove();
        bugs = bugs.filter(b => b !== bug);
    }

    // --- FUNÇÕES PRINCIPAIS DE CONTROLE DO JOGO ---
    function startGame() {
        screenWidth = gameScreen.clientWidth; screenHeight = gameScreen.clientHeight;
        screenArea = screenWidth * screenHeight;
        if (screenWidth === 0) { alert("Erro ao iniciar. Tente recarregar."); return; }
        
        isGameRunning = true; isBuffActive = false;
        score = 0; combo = 1; timeLeft = SURVIVAL_TIME_SECONDS; buffCount = 0;
        bugCreationIntervalMs = 600;
        timeToNextBug = 1000;
        
        // ==================================================================
        // LÓGICA DE LIMPEZA CORRIGIDA
        // ==================================================================
        // Limpa apenas os bugs, deixando a UI intacta.
        bugs.forEach(bug => bug.element.remove());
        powerups.forEach(p => p.element.remove());
        bugs = []; powerups = [];
        
        buffInventoryDisplay.textContent = buffCount;
        useBuffButton.disabled = true;
        scoreDisplay.textContent = score; comboDisplay.textContent = `x${combo}`;
        timerDisplay.textContent = timeLeft;
        
        // Esconde a mensagem e o botão
        startButton.classList.add('hidden');
        startStopMessage.classList.add('hidden');
        
        playSound(sounds.start);
        sounds.music.volume = 0.3; sounds.music.currentTime = 0; sounds.music.play();
        
        clearTimeout(timerId); timerId = setTimeout(updateTimer, 1000);
        
        lastTime = performance.now();
        cancelAnimationFrame(gameLoopId);
        gameLoopId = requestAnimationFrame(gameLoop);
    }
    
    // ==================================================================
    // FUNÇÃO stopGame USANDO A TELA DE MENSAGEM
    // ==================================================================
    function stopGame(outcome) {
        if (!isGameRunning) return;
        isGameRunning = false;
        cancelAnimationFrame(gameLoopId);
        clearTimeout(timerId);
        playSound(sounds.gameOver);
        sounds.music.pause();
        
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('bugSmasherHighScore', highScore);
            highscoreDisplay.textContent = highScore;
        }
        
        if (outcome === 'win') {
            messageTitle.textContent = "VOCÊ VENCEU!";
            messageScore.textContent = `Pontuação Final: ${score}`;
        } else {
            messageTitle.textContent = "BUGS DOMINARAM!";
            messageScore.textContent = `Você foi derrotado. Pontuação: ${score}`;
        }
        
        startStopMessage.classList.remove('hidden');
        startButton.textContent = "Jogar Novamente";
        startButton.classList.remove('hidden'); // O botão está dentro da mensagem agora
    }
    
    function gameLoop(timestamp) {
        if (!isGameRunning) return;
        const deltaTime = timestamp - lastTime; lastTime = timestamp;
        if (!isBuffActive) {
            timeToNextBug -= deltaTime;
            if (timeToNextBug <= 0) {
                spawnEntity();
                if (bugCreationIntervalMs > 150) bugCreationIntervalMs -= 15;
                timeToNextBug = bugCreationIntervalMs;
            }
            let totalBugArea = 0;
            bugs.forEach(bug => {
                bug.timeUntilReproduction -= deltaTime;
                if (bug.timeUntilReproduction <= 0) {
                    spawnNearbyBug(bug);
                    bug.timeUntilReproduction = 6000 + Math.random() * 2000;
                }
                totalBugArea += (bug.width * bug.height);
            });
            if ((totalBugArea / screenArea) >= 0.65 && (totalBugArea / screenArea) < 0.75) {
                gameScreen.classList.add('overrun-warning');
            } else {
                gameScreen.classList.remove('overrun-warning');
            }
            if ((totalBugArea / screenArea) >= 0.75) stopGame('lose');
        }
        gameLoopId = requestAnimationFrame(gameLoop);
    }

    function updateTimer() {
        if (!isGameRunning || isBuffActive) return;
        timeLeft--;
        timerDisplay.textContent = timeLeft;
        if (timeLeft <= 0) {
            stopGame('win');
        } else {
            timerId = setTimeout(updateTimer, 1000);
        }
    }

    // --- INICIALIZAÇÃO E EVENT LISTENERS ---
    highscoreDisplay.textContent = highScore;
    // Agora o botão está dentro da mensagem, então mostramos a mensagem
    startStopMessage.classList.remove('hidden'); 
    messageTitle.textContent = "ESMAGA-BUG";
    messageScore.textContent = "Sobreviva por 40 segundos e não deixe os bugs tomarem a tela!";
    
    startButton.addEventListener('click', startGame);
    useBuffButton.addEventListener('click', useBuff);
    window.addEventListener('keydown', (e) => {
        if ((e.key === 'd' || e.key === 'D') && isGameRunning) useBuff();
    });
    window.addEventListener('resize', debounce(setupMatrix, 250));
    
    setupMatrix();
    setInterval(drawAllMatrix, 50);
});