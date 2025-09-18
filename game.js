class GameClient {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.worldImage = null;
        this.worldWidth = 2048;
        this.worldHeight = 2048;
        
        // Game state
        this.myPlayerId = null;
        this.players = {};
        this.avatars = {};
        this.websocket = null;
        this.isConnected = false;
        
        // Viewport system
        this.viewport = {
            x: 0,
            y: 0,
            width: 0,
            height: 0
        };
        
        // Avatar settings
        this.avatarSize = 32;
        
        // Movement state
        this.keysPressed = {};
        this.isMoving = false;
        this.activeDirections = new Set();
        this.movementInterval = null;
        
        // Jump state
        this.isJumping = false;
        this.jumpStartTime = 0;
        this.jumpDuration = 1000; // 1 second jump duration
        this.jumpHeight = 100; // Base jump height
        this.doubleJumpHeight = 150; // Double jump total height
        this.jumpCount = 0; // Number of jumps performed
        this.maxJumps = 2; // Maximum jumps allowed (double jump)
        this.jumpCooldown = 100; // Cooldown between jumps in ms
        this.lastJumpTime = 0; // Time of last jump
        
        this.init();
    }

    init() {
        this.setupCanvas();
        this.loadWorldMap();
        this.connectToServer();
        this.setupKeyboardControls();
        this.startRenderLoop();
    }

    setupCanvas() {
        // Set canvas size to fill the browser window
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.updateViewport();
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            this.updateViewport();
        });
    }

    updateViewport() {
        this.viewport.width = this.canvas.width;
        this.viewport.height = this.canvas.height;
        
        // Center viewport on my player if I have one
        if (this.myPlayerId && this.players[this.myPlayerId]) {
            const myPlayer = this.players[this.myPlayerId];
            this.viewport.x = myPlayer.x - this.viewport.width / 2;
            this.viewport.y = myPlayer.y - this.viewport.height / 2;
            
            // Clamp to world bounds
            this.viewport.x = Math.max(0, Math.min(this.viewport.x, this.worldWidth - this.viewport.width));
            this.viewport.y = Math.max(0, Math.min(this.viewport.y, this.worldHeight - this.viewport.height));
        }
    }

    loadWorldMap() {
        this.worldImage = new Image();
        this.worldImage.onload = () => {
            this.drawWorldMap();
        };
        this.worldImage.onerror = () => {
            console.error('Failed to load world map image');
        };
        this.worldImage.src = 'world.jpg';
    }

    connectToServer() {
        this.websocket = new WebSocket('wss://codepath-mmorg.onrender.com');
        
        this.websocket.onopen = () => {
            console.log('Connected to game server');
            this.isConnected = true;
            this.joinGame();
        };
        
        this.websocket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleServerMessage(message);
            } catch (error) {
                console.error('Error parsing server message:', error);
            }
        };
        
        this.websocket.onclose = () => {
            console.log('Disconnected from game server');
            this.isConnected = false;
            this.stopMovementLoop(); // Stop movement when disconnected
            // Attempt to reconnect after 3 seconds
            setTimeout(() => this.connectToServer(), 3000);
        };
        
        this.websocket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    joinGame() {
        if (!this.isConnected) return;
        
        const joinMessage = {
            action: 'join_game',
            username: 'Jose'
        };
        
        this.websocket.send(JSON.stringify(joinMessage));
        console.log('Sent join game message');
    }

    handleServerMessage(message) {
        switch (message.action) {
            case 'join_game':
                if (message.success) {
                    this.myPlayerId = message.playerId;
                    this.players = message.players;
                    this.avatars = message.avatars;
                    this.loadAvatarImages();
                    this.updateViewport();
                    console.log('Successfully joined game as', message.playerId);
                } else {
                    console.error('Failed to join game:', message.error);
                }
                break;
                
            case 'player_joined':
                this.players[message.player.id] = message.player;
                this.avatars[message.avatar.name] = message.avatar;
                this.loadAvatarImages();
                console.log('Player joined:', message.player.username);
                break;
                
            case 'players_moved':
                Object.assign(this.players, message.players);
                this.updateViewport();
                break;
                
            case 'player_left':
                delete this.players[message.playerId];
                console.log('Player left:', message.playerId);
                break;
                
            default:
                console.log('Unknown message:', message);
        }
    }

    loadAvatarImages() {
        Object.values(this.avatars).forEach(avatar => {
            Object.values(avatar.frames).forEach(directionFrames => {
                directionFrames.forEach(frameData => {
                    if (frameData.startsWith('data:image/')) {
                        const img = new Image();
                        img.src = frameData;
                        // Store the loaded image back in the frame data for efficient rendering
                        img.onload = () => {
                            // Replace base64 with loaded image object
                            const index = directionFrames.indexOf(frameData);
                            directionFrames[index] = img;
                        };
                    }
                });
            });
        });
    }

    worldToScreen(worldX, worldY) {
        return {
            x: worldX - this.viewport.x,
            y: worldY - this.viewport.y
        };
    }

    isInViewport(worldX, worldY) {
        const screen = this.worldToScreen(worldX, worldY);
        return screen.x >= -50 && screen.x <= this.viewport.width + 50 &&
               screen.y >= -50 && screen.y <= this.viewport.height + 50;
    }

    drawWorldMap() {
        if (!this.worldImage) return;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw the visible portion of the world map
        this.ctx.drawImage(
            this.worldImage,
            this.viewport.x, this.viewport.y, this.viewport.width, this.viewport.height,  // Source: viewport area
            0, 0, this.viewport.width, this.viewport.height   // Destination: full canvas
        );
    }

    drawAvatars() {
        Object.values(this.players).forEach(player => {
            if (!this.isInViewport(player.x, player.y)) return;
            
            const screenPos = this.worldToScreen(player.x, player.y);
            this.drawAvatar(player, screenPos.x, screenPos.y);
        });
    }

    drawAvatar(player, screenX, screenY) {
        const avatar = this.avatars[player.avatar];
        if (!avatar) return;

        const direction = player.facing || 'south';
        const frameIndex = player.animationFrame || 0;
        const frames = avatar.frames[direction];
        
        if (!frames || !frames[frameIndex]) return;

        const frame = frames[frameIndex];
        
        // Calculate avatar size maintaining aspect ratio
        let avatarWidth = this.avatarSize;
        let avatarHeight = this.avatarSize;
        
        if (frame.width && frame.height) {
            const aspectRatio = frame.width / frame.height;
            if (aspectRatio > 1) {
                avatarHeight = this.avatarSize / aspectRatio;
            } else {
                avatarWidth = this.avatarSize * aspectRatio;
            }
        }

        // Apply jump offset if this is my player and they're jumping
        let jumpOffset = 0;
        if (player.id === this.myPlayerId && this.isJumping) {
            jumpOffset = this.getJumpOffset();
        }

        // Center the avatar on the player position
        const drawX = screenX - avatarWidth / 2;
        const drawY = screenY - avatarHeight - jumpOffset; // Apply jump offset

        // Draw avatar
        this.ctx.drawImage(frame, drawX, drawY, avatarWidth, avatarHeight);

        // Draw username label (also apply jump offset)
        this.drawUsernameLabel(player.username, screenX, drawY - 5);
    }

    drawUsernameLabel(username, x, y) {
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(x - this.ctx.measureText(username).width / 2 - 4, y - 16, 
                         this.ctx.measureText(username).width + 8, 16);
        
        this.ctx.fillStyle = 'white';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(username, x, y - 4);
        this.ctx.restore();
    }

    setupKeyboardControls() {
        // Key mapping for movement directions
        this.keyToDirection = {
            'ArrowUp': 'up',
            'ArrowDown': 'down',
            'ArrowLeft': 'left',
            'ArrowRight': 'right'
        };

        // Handle key down events
        document.addEventListener('keydown', (event) => {
            console.log('Key pressed:', event.code);
            
            // Handle spacebar for jumping
            if (event.code === 'Space') {
                event.preventDefault(); // Prevent page scroll
                this.handleJump();
                return;
            }
            
            const direction = this.keyToDirection[event.code];
            console.log('Mapped direction:', direction);
            console.log('Key already pressed:', this.keysPressed[event.code]);
            
            if (direction && !this.keysPressed[event.code]) {
                this.keysPressed[event.code] = true;
                this.handleMovement(direction);
            }
        });

        // Handle key up events
        document.addEventListener('keyup', (event) => {
            const direction = this.keyToDirection[event.code];
            if (direction) {
                delete this.keysPressed[event.code];
                this.activeDirections.delete(direction);
                this.handleMovementStop();
            }
        });

        // Prevent arrow keys from scrolling the page
        document.addEventListener('keydown', (event) => {
            if (this.keyToDirection[event.code]) {
                event.preventDefault();
            }
        });
    }

    handleMovement(direction) {
        console.log('handleMovement called:', direction);
        console.log('isConnected:', this.isConnected);
        console.log('myPlayerId:', this.myPlayerId);
        
        if (!this.isConnected || !this.myPlayerId) {
            console.log('Movement blocked - not connected or no player ID');
            return;
        }

        // Add direction to active set
        this.activeDirections.add(direction);
        this.isMoving = true;
        
        console.log('Active directions:', Array.from(this.activeDirections));
        
        // Send immediate move command with current active directions
        this.sendMoveCommand();
        
        // Start or restart continuous movement loop
        this.startMovementLoop();
    }

    handleMovementStop() {
        if (!this.isConnected || !this.myPlayerId) return;

        // Check if any movement keys are still pressed
        const hasMovementKeys = Object.keys(this.keysPressed).some(key => 
            this.keyToDirection[key]
        );

        if (!hasMovementKeys) {
            this.isMoving = false;
            this.activeDirections.clear();
            this.stopMovementLoop();
            this.sendStopCommand();
        }
    }

    startMovementLoop() {
        // Clear any existing interval
        if (this.movementInterval) {
            clearInterval(this.movementInterval);
        }
        
        // Send move commands continuously while moving
        this.movementInterval = setInterval(() => {
            if (this.isMoving && this.activeDirections.size > 0 && this.isConnected) {
                this.sendMoveCommand();
            }
        }, 100); // Send command every 100ms for smooth movement
    }

    stopMovementLoop() {
        if (this.movementInterval) {
            clearInterval(this.movementInterval);
            this.movementInterval = null;
        }
    }

    sendMoveCommand() {
        if (!this.isConnected || this.activeDirections.size === 0) return;

        // Convert Set to Array for JSON serialization
        const directions = Array.from(this.activeDirections);
        
        // For now, send single direction (server may not support multiple directions)
        // TODO: Implement proper diagonal movement if server supports it
        const direction = directions[0]; // Take first direction for now
        
        const moveMessage = {
            action: 'move',
            direction: direction
        };

        this.websocket.send(JSON.stringify(moveMessage));
        console.log('Sent move command:', direction);
    }

    sendStopCommand() {
        if (!this.isConnected) return;

        const stopMessage = {
            action: 'stop'
        };

        this.websocket.send(JSON.stringify(stopMessage));
        console.log('Sent stop command');
    }

    handleJump() {
        if (!this.isConnected || !this.myPlayerId) {
            console.log('Jump blocked - not connected or no player ID');
            return;
        }

        const currentTime = Date.now();
        
        // Check cooldown
        if (currentTime - this.lastJumpTime < this.jumpCooldown) {
            console.log('Jump on cooldown, ignoring');
            return;
        }

        // Check if we can jump (have jumps remaining)
        if (this.jumpCount >= this.maxJumps) {
            console.log('No jumps remaining, ignoring jump command');
            return;
        }

        // Increment jump count
        this.jumpCount++;
        this.lastJumpTime = currentTime;

        console.log(`Starting jump ${this.jumpCount}/${this.maxJumps}`);
        
        // If this is the first jump, start the jump animation
        if (this.jumpCount === 1) {
            this.isJumping = true;
            this.jumpStartTime = currentTime;
        } else {
            // For double jump, don't restart animation - let it continue smoothly
            // The double jump will be handled in getJumpOffset() based on jumpCount
            console.log('Double jump activated - continuing animation');
        }
        
        this.sendJumpCommand();
    }

    sendJumpCommand() {
        if (!this.isConnected) return;

        const jumpMessage = {
            action: 'jump'
        };

        this.websocket.send(JSON.stringify(jumpMessage));
        console.log('Sent jump command');
    }

    updateJumpAnimation() {
        if (!this.isJumping) return;

        const currentTime = Date.now();
        const jumpProgress = (currentTime - this.jumpStartTime) / this.jumpDuration;

        if (jumpProgress >= 1.0) {
            // Jump completed - reset jump count and stop jumping
            this.isJumping = false;
            this.jumpCount = 0;
            console.log('Jump completed - jump count reset');
        }
    }

    getJumpOffset() {
        if (!this.isJumping) return 0;

        const currentTime = Date.now();
        const jumpProgress = (currentTime - this.jumpStartTime) / this.jumpDuration;

        if (jumpProgress >= 1.0) return 0;

        let jumpOffset = 0;

        if (this.jumpCount === 1) {
            // First jump: normal height
            jumpOffset = Math.sin(jumpProgress * Math.PI) * this.jumpHeight;
        } else if (this.jumpCount === 2) {
            // Double jump: smooth transition from first jump to double jump
            const firstJumpHeight = this.jumpHeight; // 100px
            const doubleJumpAdditional = this.doubleJumpHeight - this.jumpHeight; // 50px additional
            
            // Calculate the first jump component (continues from where it was)
            const firstJumpOffset = Math.sin(jumpProgress * Math.PI) * firstJumpHeight;
            
            // Calculate the double jump component (starts when double jump is triggered)
            // Use a modified progress that starts from 0 when double jump is activated
            const doubleJumpProgress = Math.max(0, jumpProgress - 0.5); // Start double jump at 50% of first jump
            const doubleJumpOffset = Math.sin(doubleJumpProgress * Math.PI * 2) * doubleJumpAdditional;
            
            jumpOffset = firstJumpOffset + doubleJumpOffset;
        }

        return jumpOffset;
    }

    startRenderLoop() {
        const render = () => {
            // Update jump animation
            this.updateJumpAnimation();
            
            // Update viewport for smooth camera following
            this.updateViewport();
            
            this.drawWorldMap();
            this.drawAvatars();
            requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GameClient();
});
