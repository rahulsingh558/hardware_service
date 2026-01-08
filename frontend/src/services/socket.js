import { Manager } from 'socket.io-client';

const SOCKET_URL = '';

// Explicitly create a single Manager to force one TCP connection for ALL sockets
const manager = new Manager(SOCKET_URL, {
    transports: ['polling', 'websocket'], // Allow polling first, then upgrade to WebSocket
    reconnection: true,
    reconnectionDelay: 5000,    // 5 seconds wait
    reconnectionDelayMax: 10000,
    reconnectionAttempts: Infinity,
    timeout: 20000,
});

// Create socket instances for different namespaces from the SAME manager
export const createSocket = (namespace) => {
    return manager.socket(namespace);
};

// Socket namespaces
export const NAMESPACES = {
    LASER_STATUS: '/ws/laser/status',
    TIMETAGGER_STATUS: '/ws/timetagger/status',
    COUNTRATE: '/ws/timetagger/countrate',
    COINCIDENCE: '/ws/timetagger/coincidence',
    CORRELATION: '/ws/timetagger/correlation',
};
