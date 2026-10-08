import { runtimeSettings, inspectService, serviceError } from './runtime.mjs';
const settings = await runtimeSettings();
const status = await inspectService(settings);
if (status.state === 'running') process.exit(0);
if (status.state === 'stopped') process.exit(2);
console.error(serviceError(status.state, settings)); process.exit(1);
