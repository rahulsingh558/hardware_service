import { useState, useEffect, useRef } from 'react';
import {
    CardContent,
    Typography,
    Box,
    Button,
    TextField,
    Grid,
    Paper,
    InputAdornment,
    MenuItem,
    Select,
    FormControl,
    InputLabel
} from '@mui/material';
import { Timeline, PlayArrow, Stop } from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { createSocket, NAMESPACES } from '../services/socket';
import { useTheme } from '@mui/material/styles';

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

export default function CorrelationMonitor({ isLaserOn = false }) {
    const theme = useTheme();
    const [isRunning, setIsRunning] = useState(false);

    // Configuration State
    const [ch1, setCh1] = useState(1);
    const [ch2, setCh2] = useState(2);
    const [windowTime, setWindowTime] = useState(1);
    const [binWidth, setBinWidth] = useState(1000); // ps
    const [nBins, setNBins] = useState(50);

    const [data, setData] = useState([]);
    const socketRef = useRef(null);

    // Lifecycle effect: Connect/Disconnect based on isRunning
    useEffect(() => {
        if (isRunning) {
            setData([]); // Reset plotting data

            socketRef.current = createSocket(NAMESPACES.CORRELATION);

            socketRef.current.on('connect', () => {
                console.log('Connected to correlation socket');
                // Initial configuration
                socketRef.current.emit('configure', {
                    ch: `${ch1},${ch2}`,
                    bwidth: binWidth,
                    nbins: nBins,
                    rtime: windowTime,
                });
            });

            socketRef.current.on('configured', (response) => {
                console.log('Correlation configured:', response);
            });

            socketRef.current.on('correlation', (response) => {
                if (response.status === 200) {
                    const tau = response.tau_ps; // Array of time delays in ps
                    const counts = response.counts; // Array of counts

                    // Zip into object array for Recharts: [{tau: -100, count: 5}, ...]
                    if (Array.isArray(tau) && Array.isArray(counts)) {
                        const chartData = tau.map((t, i) => ({
                            tau: t,
                            count: counts[i] || 0
                        }));
                        setData(chartData);
                    }
                } else {
                    console.error('Correlation error:', response.error);
                }
            });

            socketRef.current.on('disconnect', () => {
                console.log('Disconnected from correlation socket');
            });
        }

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [isRunning]);

    // Runtime Configuration Effect
    useEffect(() => {
        if (isRunning && socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('configure', {
                ch: `${ch1},${ch2}`,
                bwidth: binWidth,
                nbins: nBins,
                rtime: windowTime,
            });
        }
    }, [ch1, ch2, binWidth, nBins, windowTime, isRunning]);

    const handleStart = () => {
        setIsRunning(true);
    };

    const handleStop = () => {
        setIsRunning(false);
        setData([]);
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
                            Correlation Histogram
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
                            sx={{ fontWeight: 600 }}
                        >
                            {isRunning ? 'Stop' : 'Start'}
                        </Button>
                    </Box>
                </Box>

                <Box mb={4}>
                    <Grid container spacing={2} alignItems="center">
                        {/* Channel Selection */}
                        <Grid item xs={6} sm={2}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Ch A</InputLabel>
                                <Select
                                    value={ch1}
                                    label="Ch A"
                                    onChange={(e) => setCh1(e.target.value)}
                                >
                                    {[1, 2, 3, 4, 5, 6, 7, 8].map(ch => (
                                        <MenuItem key={ch} value={ch}>{ch}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={6} sm={2}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Ch B</InputLabel>
                                <Select
                                    value={ch2}
                                    label="Ch B"
                                    onChange={(e) => setCh2(e.target.value)}
                                >
                                    {[1, 2, 3, 4, 5, 6, 7, 8].map(ch => (
                                        <MenuItem key={ch} value={ch}>{ch}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>

                        {/* Integration Time */}
                        <Grid item xs={12} sm={3}>
                            <TextField
                                label="Window"
                                type="number"
                                value={windowTime}
                                onChange={(e) => setWindowTime(parseFloat(e.target.value))}
                                size="small"
                                fullWidth
                                InputProps={{
                                    endAdornment: <InputAdornment position="end">s</InputAdornment>,
                                    inputProps: { step: 0.1, min: 0.1, max: 5.0 }
                                }}
                            />
                        </Grid>

                        {/* Bin Width */}
                        <Grid item xs={6} sm={2.5}>
                            <TextField
                                label="Bin Width"
                                type="number"
                                value={binWidth}
                                onChange={(e) => setBinWidth(parseInt(e.target.value))}
                                size="small"
                                fullWidth
                                InputProps={{
                                    endAdornment: <InputAdornment position="end">ps</InputAdornment>,
                                    inputProps: { step: 100, min: 100 }
                                }}
                            />
                        </Grid>

                        {/* Number of Bins */}
                        <Grid item xs={6} sm={2.5}>
                            <TextField
                                label="Bins"
                                type="number"
                                value={nBins}
                                onChange={(e) => setNBins(parseInt(e.target.value))}
                                size="small"
                                fullWidth
                                InputProps={{
                                    inputProps: { step: 10, min: 10, max: 2000 }
                                }}
                            />
                        </Grid>
                    </Grid>
                </Box>

                <Box sx={{ width: '100%', height: 400 }}>
                    <ResponsiveContainer>
                        <LineChart data={data} margin={{ top: 5, right: 30, left: 60, bottom: 25 }}>
                            <CartesianGrid
                                strokeDasharray="3 3"
                                stroke={theme.palette.divider}
                                vertical={false}
                            />
                            <XAxis
                                dataKey="tau"
                                label={{ value: 'Delay (ps)', position: 'bottom', offset: 0 }}
                                tick={{ fontSize: 12 }}
                            />
                            <YAxis
                                domain={['auto', 'auto']}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(value) => value}
                                tick={{ fill: theme.palette.text.secondary }}
                                label={{
                                    value: 'Counts',
                                    angle: -90,
                                    position: 'insideLeft',
                                    offset: 0,
                                    dx: -20,
                                    fill: theme.palette.text.secondary
                                }}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: theme.palette.background.paper,
                                    border: '1px solid',
                                    borderColor: theme.palette.divider,
                                    borderRadius: 4,
                                    boxShadow: theme.shadows[2],
                                    color: theme.palette.text.primary
                                }}
                            />

                            <Line
                                type="monotone"
                                dataKey="count"
                                stroke={theme.palette.primary.main}
                                strokeWidth={2}
                                name="Coincidences"
                                dot={false}
                                isAnimationActive={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </Box>

                <Box mt={3} display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="caption" color="text.secondary">
                        Correlation: Ch{ch1} vs Ch{ch2}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Window: {windowTime}s • Range: {(binWidth * nBins) / 1000}ns
                    </Typography>
                </Box>

            </CardContent>
        </Paper>
    );
}
