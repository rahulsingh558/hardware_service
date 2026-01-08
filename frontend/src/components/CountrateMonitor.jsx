import { useState, useEffect, useRef } from 'react';
import {
    Card,
    CardContent,
    Typography,
    Box,
    Button,
    TextField,
    Chip,
    Grid,
    Paper,
    InputAdornment,
} from '@mui/material';
import { Timeline, PlayArrow, Stop } from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { createSocket, NAMESPACES } from '../services/socket';

const CHANNEL_COLORS_DARK = [
    '#FF0000', // Red
    '#FFA500', // Orange
    '#FFFF00', // Yellow
    '#00FF00', // Green
    '#00FFFF', // Cyan
    '#2979FF', // Blue
    '#D500F9', // Purple
    '#FFFFFF', // White
];

const CHANNEL_COLORS_LIGHT = [
    '#D32F2F', // Dark Red
    '#ED6C02', // Dark Orange
    '#F57C00', // Darker Yellow/Orange
    '#2E7D32', // Dark Green
    '#0288D1', // Dark Cyan/Blue
    '#1565C0', // Dark Blue
    '#7B1FA2', // Dark Purple
    '#424242', // Dark Grey/Black
];

import { useTheme } from '@mui/material/styles';

export default function CountrateMonitor({ isLaserOn = false }) {
    const theme = useTheme();
    const [isRunning, setIsRunning] = useState(false);
    const [selectedChannels, setSelectedChannels] = useState([1, 2]);
    const [windowTime, setWindowTime] = useState(0.3);
    const [data, setData] = useState([]);
    const socketRef = useRef(null);
    const dataCountRef = useRef(0);
    const MAX_DATA_POINTS = 100;

    const channels = [1, 2, 3, 4, 5, 6, 7, 8];



    // Lifecycle effect: Connect/Disconnect based on isRunning AND having active channels
    useEffect(() => {
        const shouldConnect = isRunning && selectedChannels.length > 0;

        if (shouldConnect) {
            // Reset data on new connection (start or resume from empty)
            setData([]);
            dataCountRef.current = 0;

            socketRef.current = createSocket(NAMESPACES.COUNTRATE);

            socketRef.current.on('connect', () => {
                console.log('Connected to countrate socket');
                // Initial configuration
                socketRef.current.emit('configure', {
                    ch: selectedChannels.join(','),
                    rtime: windowTime,
                });
            });

            socketRef.current.on('configured', (response) => {
                console.log('Countrate configured:', response);
            });

            socketRef.current.on('countrate', (response) => {
                if (response.status === 200) {
                    const rtime = parseFloat(response.rtime);
                    dataCountRef.current = Math.round((dataCountRef.current + rtime) * 100) / 100; // Track time, avoid float drift

                    const newDataPoint = {
                        time: dataCountRef.current,
                        ...response.rates,
                    };

                    setData((prevData) => {
                        const newData = [...prevData, newDataPoint];
                        // Keep last 30 samples
                        return newData.slice(-30);
                    });
                } else {
                    console.error('Countrate error:', response.error);
                }
            });

            socketRef.current.on('disconnect', () => {
                console.log('Disconnected from countrate socket');
            });
        }

        // Cleanup function for initial connection
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [isRunning, selectedChannels.length > 0]); // Re-connect if channels become empty/non-empty

    // Runtime Configuration Effect: Update params when they change while running
    useEffect(() => {
        if (isRunning && socketRef.current && socketRef.current.connected && selectedChannels.length > 0) {
            socketRef.current.emit('configure', {
                ch: selectedChannels.join(','),
                rtime: windowTime,
            });
        }
    }, [selectedChannels, windowTime, isRunning]);

    const handleStart = () => {
        setIsRunning(true);
    };

    const handleStop = () => {
        setIsRunning(false);
        setData([]);
        dataCountRef.current = 0;
    };

    const handleChannelToggle = (channel) => {
        setSelectedChannels((prev) => {
            if (prev.includes(channel)) {
                return prev.filter((ch) => ch !== channel);
            } else {
                return [...prev, channel].sort((a, b) => a - b);
            }
        });
    };

    const channelColors = theme.palette.mode === 'dark' ? CHANNEL_COLORS_DARK : CHANNEL_COLORS_LIGHT;

    return (
        <Paper elevation={0} sx={{
            height: '100%',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            overflow: 'hidden'
        }}>
            <CardContent sx={{ p: 3 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                    <Box display="flex" alignItems="center" gap={1.5}>
                        <Timeline sx={{ color: 'text.secondary' }} />
                        <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
                            Single Channel Countrate
                        </Typography>
                    </Box>

                    <Box display="flex" alignItems="center" gap={1}>
                        {isRunning && (
                            <Box sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                backgroundColor: 'error.main',
                                animation: 'pulse 1.5s infinite',
                                '@keyframes pulse': {
                                    '0%, 100%': { opacity: 1 },
                                    '50%': { opacity: 0.4 },
                                }
                            }} />
                        )}
                        <Button
                            variant={isRunning ? "contained" : "outlined"}
                            color={isRunning ? "error" : "primary"}
                            startIcon={isRunning ? <Stop /> : <PlayArrow />}
                            onClick={isRunning ? handleStop : handleStart}
                            disabled={!isRunning && selectedChannels.length === 0}
                            sx={{ fontWeight: 600 }}
                        >
                            {isRunning ? 'Stop' : 'Start'}
                        </Button>
                    </Box>
                </Box>

                <Box mb={4}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="Window"
                                type="number"
                                value={windowTime}
                                onChange={(e) => setWindowTime(parseFloat(e.target.value))}
                                size="small"
                                fullWidth
                                InputProps={{
                                    endAdornment: <InputAdornment position="end">sec</InputAdornment>,
                                    inputProps: { step: 0.1, min: 0.1, max: 5.0 }
                                }}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <Paper
                                variant="outlined"
                                sx={{
                                    p: 1.5,
                                    backgroundColor: 'action.hover',
                                    borderColor: 'divider'
                                }}
                            >
                                <Typography variant="caption" sx={{
                                    display: 'block',
                                    mb: 1,
                                    color: 'text.secondary',
                                    fontWeight: 600
                                }}>
                                    Select Channels
                                </Typography>
                                <Box display="flex" gap={1} flexWrap="wrap">
                                    {channels.map((channel) => {
                                        const isSelected = selectedChannels.includes(channel);
                                        return (
                                            <Chip
                                                key={channel}
                                                label={`CH${channel}`}
                                                onClick={() => handleChannelToggle(channel)}
                                                variant={isSelected ? "filled" : "outlined"}
                                                color={isSelected ? "primary" : "default"}
                                                size="small"
                                                disabled={false}
                                                sx={{
                                                    fontWeight: 500,
                                                    borderWidth: isSelected ? 2 : 1,
                                                    '& .MuiChip-label': {
                                                        px: 1
                                                    }
                                                }}
                                            />
                                        );
                                    })}
                                </Box>
                            </Paper>
                        </Grid>
                    </Grid>
                </Box>

                <Box sx={{ width: '100%', height: 400 }}>
                    <ResponsiveContainer>
                        <LineChart data={data} margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
                            <CartesianGrid
                                strokeDasharray="3 3"
                                stroke={theme.palette.divider}
                                vertical={false}
                            />
                            <XAxis
                                dataKey="time"
                                axisLine={false}
                                tickLine={false}
                                tick={false}
                            />
                            <YAxis
                                domain={['auto', 'auto']}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(value) => Math.floor(value)}
                                tick={{ fill: theme.palette.text.secondary }}
                                label={{
                                    value: 'Counts/s',
                                    angle: -90,
                                    position: 'insideLeft',
                                    offset: 0,
                                    dx: -20,
                                    fill: theme.palette.text.secondary
                                }}
                            />
                            <Tooltip
                                labelStyle={{ display: 'none' }}
                                contentStyle={{
                                    backgroundColor: theme.palette.background.paper,
                                    border: '1px solid',
                                    borderColor: theme.palette.divider,
                                    borderRadius: 4,
                                    boxShadow: theme.shadows[2],
                                    color: theme.palette.text.primary
                                }}
                            />
                            <Legend
                                wrapperStyle={{ paddingTop: 20 }}
                                formatter={(value) => (
                                    <span style={{ color: theme.palette.text.primary, fontWeight: 500 }}>
                                        {value.replace('Channel ', 'CH')}
                                    </span>
                                )}
                            />
                            {selectedChannels.map((channel, index) => (
                                <Line
                                    key={channel}
                                    type="monotone"
                                    dataKey={channel.toString()}
                                    stroke={channelColors[channel - 1]}
                                    strokeWidth={2}
                                    name={`Channel ${channel}`}
                                    dot={false}
                                    activeDot={{
                                        r: 4,
                                        strokeWidth: 2,
                                        stroke: 'white'
                                    }}
                                    isAnimationActive={false}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </Box>

                <Box mt={3} display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="caption" color="text.secondary">
                        {selectedChannels.length} selected channel{selectedChannels.length !== 1 ? 's' : ''}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Window: {windowTime}s
                    </Typography>
                </Box>
            </CardContent>
        </Paper>
    );
}