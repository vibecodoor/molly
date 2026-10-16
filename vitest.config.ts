import { defineConfig } from 'vitest/config';

// Fixed zone with DST so midnight-split tests are deterministic on any machine.
export default defineConfig({ test: { env: { TZ: 'Europe/Berlin' } } });
