import { io } from 'socket.io-client';

// 'localhost' is best for WSL port forwarding
const URL = 'http://localhost:3000';
export const socket = io(URL);