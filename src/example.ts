import devices from '../examples/experimental-setup/devices.json';
import assembly from '../examples/experimental-setup/assembly.json';
import experiment_state from '../examples/experimental-setup/experiment_state.json';
import { load_scene, type SceneConfig } from './core';
export const example_config = ():SceneConfig => load_scene({schema_version:1,devices,assembly,experiment_state}).save_state();
