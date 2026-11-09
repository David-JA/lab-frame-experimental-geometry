import { load_scene } from './core';
import { example_config } from './example';
const scene = load_scene(example_config());
document.querySelector('#app')!.textContent = JSON.stringify(scene.get_world_position('sample'));
