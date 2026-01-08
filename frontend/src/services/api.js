import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
    baseURL: '',
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Laser API
export const laserAPI = {
    getStatus: () => api.get('/laser/status'),
    control: (switchState, power) => {
        const params = { switch: switchState };
        // Only include power parameter when turning ON (switch=1) and power is provided
        if (switchState === 1 && power !== undefined) {
            params.power = power;
        }
        return api.get('/laser/control', { params });
    },
};

// TimeTagger API
export const timetaggerAPI = {
    getStatus: () => api.get('/timetagger/status'),
    testing: (enable, channels) =>
        api.get('/timetagger/testing', {
            params: { enable: enable ? 1 : 0, ch: channels.join(',') },
        }),
    countrate: (channels, rtime = 0.5) =>
        api.get('/timetagger/countrate', {
            params: { ch: channels.join(','), rtime },
        }),
    coincidence: (groups, cwin, rtime) =>
        api.get('/timetagger/coincidence', {
            params: { groups, cwin, rtime },
        }),
    correlation: (ch1, ch2, bwidth, nbins, rtime) =>
        api.get('/timetagger/correlation', {
            params: { ch: `${ch1},${ch2}`, bwidth, nbins, rtime },
        }),
};

export default api;
