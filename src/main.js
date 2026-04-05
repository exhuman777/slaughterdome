import { initRenderer, render, clock, updateCamera } from './renderer.js';
import { createArena, updateBiome } from './arena.js';

initRenderer();
createArena();

function gameLoop() {
  requestAnimationFrame(gameLoop);
  const dt = clock.getDelta();
  updateBiome(dt);
  updateCamera(0, 0);
  render();
}

gameLoop();
