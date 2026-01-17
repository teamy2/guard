import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

export default defineConfig(() => {
    dotenv.config({ path: '.env' });

    return {
        test: {
            environment: 'node',
            globals: true,
            include: ['__tests__/integration/**/*.test.ts'],
            testTimeout: 20000,
        },
    };
});
