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
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    FormGroup,
    FormControlLabel,
    Checkbox,
    Stack,
    FormControl,
    InputLabel,
    OutlinedInput
} from '@mui/material';
import { Timeline, PlayArrow, Stop, Add, Delete } from '@mui/icons-material';
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

export default function CoincidenceMonitor({ isLaserOn = false }) {
    const theme = useTheme();
    const [isRunning, setIsRunning] = useState(false);
    // State is now an array of arrays: [[1, 2], [3, 4]]
    const [groups, setGroups] = useState([[1, 2]]);
    const [windowTime, setWindowTime] = useState(1);
    const [cwin, setCwin] = useState(1000);
    const [data, setData] = useState([]);
    const socketRef = useRef(null);
    const dataCountRef = useRef(0);

    // Dialog State
    const [openDialog, setOpenDialog] = useState(false);
    const [selectedChannels, setSelectedChannels] = useState([]);

    // Helper to serialize groups for backend: [[1,2], [3,4]] -> "1,2;3,4"
    const serializeGroups = (grpArray) => {
        return grpArray.map(g => g.join(',')).join(';');
    };

    // Helper to get legends: [[1,2]] -> ["1,2"]
    const activeGroupKeys = groups.map(g => g.join(','));

    // Lifecycle effect: Connect/Disconnect based on isRunning AND having active groups
    useEffect(() => {
        const shouldConnect = isRunning && groups.length > 0;

        if (shouldConnect) {
            // Reset data on new connection (start or resume)
            setData([]);
            dataCountRef.current = 0;

            socketRef.current = createSocket(NAMESPACES.COINCIDENCE);

            socketRef.current.on('connect', () => {
                console.log('Connected to coincidence socket');
                // Initial configuration
                socketRef.current.emit('configure', {
                    groups: serializeGroups(groups),
                    cwin: cwin,
                    rtime: windowTime,
                });
            });

            socketRef.current.on('configured', (response) => {
                console.log('Coincidence configured:', response);
            });

            socketRef.current.on('coincidence', (response) => {
                if (response.status === 200) {
                    const rtime = parseFloat(response.rtime);
                    dataCountRef.current = Math.round((dataCountRef.current + rtime) * 100) / 100;

                    // response.rates is an array of integers corresponding to the groups
                    // we need to map the rates to our group keys
                    const configGroups = response.groups; // [[1,2], [3,4]]
                    const rates = response.rates; // [100, 200]

                    const dataPointRates = {};
                    if (Array.isArray(configGroups) && Array.isArray(rates)) {
                        configGroups.forEach((grp, idx) => {
                            // Reconstruct key: [1,2] -> "1,2"
                            const key = grp.join(',');
                            if (rates[idx] !== undefined) {
                                dataPointRates[key] = rates[idx];
                            }
                        });
                    }

                    const newDataPoint = {
                        time: dataCountRef.current,
                        ...dataPointRates,
                    };

                    setData((prevData) => {
                        const newData = [...prevData, newDataPoint];
                        // Keep last 30 samples
                        return newData.slice(-30);
                    });
                } else {
                    console.error('Coincidence error:', response.error);
                }
            });

            socketRef.current.on('disconnect', () => {
                console.log('Disconnected from coincidence socket');
            });
        }

        // Cleanup function
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [isRunning, groups.length > 0]); // Re-connect if valid groups toggle

    // Runtime Configuration Effect
    useEffect(() => {
        if (isRunning && socketRef.current && socketRef.current.connected && groups.length > 0) {
            socketRef.current.emit('configure', {
                groups: serializeGroups(groups),
                cwin: cwin,
                rtime: windowTime,
            });
        }
    }, [groups, cwin, windowTime, isRunning]);

    const handleStart = () => {
        setIsRunning(true);
    };

    const handleStop = () => {
        setIsRunning(false);
        setData([]);
        dataCountRef.current = 0;
    };

    // --- Dialog Handlers ---
    const handleOpenDialog = () => {
        setSelectedChannels([]); // Reset selection when opening
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
    };

    const handleChannelToggle = (ch) => {
        if (selectedChannels.includes(ch)) {
            setSelectedChannels(prev => prev.filter(c => c !== ch));
        } else {
            setSelectedChannels(prev => [...prev, ch].sort((a, b) => a - b));
        }
    };

    const handleAddGroupConfim = () => {
        if (selectedChannels.length >= 1) {
            setGroups(prev => [...prev, selectedChannels]);
            setOpenDialog(false);
        } else {
            alert("Please select at least 1 channel for a group.");
        }
    };

    const handleDeleteGroup = (indexToDelete) => {
        setGroups(prev => prev.filter((_, idx) => idx !== indexToDelete));
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
                            Coincidence Countrate
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
                            disabled={!isRunning && groups.length === 0}
                            sx={{ fontWeight: 600 }}
                        >
                            {isRunning ? 'Stop' : 'Start'}
                        </Button>
                    </Box>
                </Box>

                <Box mb={4}>
                    <Grid container spacing={2} alignItems="center">
                        {/* 1. Window Time */}
                        <Grid item xs={12} sm={4}>
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

                        {/* 2. Coincidence Window */}
                        <Grid item xs={12} sm={4}>
                            <TextField
                                label="Coincidence Window"
                                type="number"
                                value={cwin}
                                onChange={(e) => setCwin(parseInt(e.target.value))}
                                size="small"
                                fullWidth
                                InputProps={{
                                    endAdornment: <InputAdornment position="end">ps</InputAdornment>,
                                    inputProps: { step: 100, min: 1000, max: 10000 }
                                }}
                            />
                        </Grid>

                        {/* 3. Active Groups (Standardized Input) */}
                        <Grid item xs={12} sm={4}>
                            <FormControl fullWidth size="small" variant="outlined" onClick={handleOpenDialog}>
                                <InputLabel htmlFor="active-groups-display">Active Groups</InputLabel>
                                <OutlinedInput
                                    id="active-groups-display"
                                    label="Active Groups"
                                    readOnly
                                    sx={{
                                        cursor: 'pointer',
                                        height: '40px', // Match standard small TextField height
                                        '& .MuiOutlinedInput-input': {
                                            display: 'none'
                                        }
                                    }}
                                    startAdornment={
                                        <Box sx={{
                                            display: 'flex',
                                            gap: 0.5,
                                            overflowX: 'auto',
                                            maxWidth: '100%',
                                            scrollbarWidth: 'none',
                                            '&::-webkit-scrollbar': { display: 'none' },
                                            alignItems: 'center',
                                            my: 0.5
                                        }}>
                                            {groups.length === 0 ? (
                                                <Typography variant="body2" color="text.disabled" sx={{ whiteSpace: 'nowrap', mx: 0.5 }}>
                                                    Click to add...
                                                </Typography>
                                            ) : (
                                                groups.map((grp, idx) => (
                                                    <Chip
                                                        key={idx}
                                                        label={grp.join('&')}
                                                        onDelete={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteGroup(idx);
                                                        }}
                                                        size="small"
                                                        sx={{ height: 24 }}
                                                    />
                                                ))
                                            )}
                                        </Box>
                                    }
                                    endAdornment={
                                        <InputAdornment position="end">
                                            <Add fontSize="small" />
                                        </InputAdornment>
                                    }
                                />
                            </FormControl>
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
                                        {value}
                                    </span>
                                )}
                            />
                            {/* Render lines for active groups */}
                            {activeGroupKeys.map((groupKey, index) => (
                                <Line
                                    key={groupKey}
                                    type="monotone"
                                    dataKey={groupKey}
                                    stroke={channelColors[index % channelColors.length]}
                                    strokeWidth={2}
                                    name={`Group ${groupKey}`}
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
                        {groups.length} active group{groups.length !== 1 ? 's' : ''}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Window: {windowTime}s • Coincidence Window: {cwin}ps
                    </Typography>
                </Box>

            </CardContent>

            {/* Add Group Dialog */}
            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="xs" fullWidth>
                <DialogTitle>Add Coincidence Group</DialogTitle>
                <DialogContent dividers>
                    <Typography variant="body2" color="text.secondary" paragraph>
                        Select 1 or more channels to check for coincidence.
                    </Typography>
                    <FormGroup sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((ch) => (
                            <FormControlLabel
                                key={ch}
                                control={
                                    <Checkbox
                                        checked={selectedChannels.includes(ch)}
                                        onChange={() => handleChannelToggle(ch)}
                                    />
                                }
                                label={`Channel ${ch}`}
                            />
                        ))}
                    </FormGroup>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Cancel</Button>
                    <Button
                        onClick={handleAddGroupConfim}
                        variant="contained"
                        disabled={selectedChannels.length < 1}
                    >
                        Add
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
}
