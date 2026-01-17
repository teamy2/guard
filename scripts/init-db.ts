import { initializeDatabase } from '../src/config/storage';

async function main() {
    console.log('Initializing database...');

    try {
        await initializeDatabase();
        console.log('✅ Database initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        process.exit(1);
    }
}

main();
