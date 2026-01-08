import { useState, useEffect, useRef } from 'react';
import {
    CardContent,
    Typography,
    Box,
    Chip,
    Paper,
    Switch,
    IconButton,
    Collapse,
} from '@mui/material';
import { Sensors, ExpandMore, ExpandLess } from '@mui/icons-material';
import { timetaggerAPI } from '../services/api';
import { createSocket, NAMESPACES } from '../services/socket';

export default function TestSignals() {
    const [enabledChannels, setEnabledChannels] = useState([]);
    const [isExpanded, setIsExpanded] = useState(false);
    const channels = [1, 2, 3, 4, 5, 6, 7, 8];

    // Track API calls to prevent WebSocket from overriding API responses
    const lastApiCallTime = useRef(0);
    const API_PRIORITY_WINDOW = 500; // ms to ignore WebSocket updates after API call

    useEffect(() => {
        const socket = createSocket(NAMESPACES.TIMETAGGER_STATUS);

        socket.on('connect', () => {
            console.log('Connected to timetagger status socket');
        });

        socket.on('timetagger_status', (data) => {
            // Give priority to API responses - ignore WebSocket updates briefly after API calls
            const timeSinceApiCall = Date.now() - lastApiCallTime.current;
            if (timeSinceApiCall < API_PRIORITY_WINDOW) {
                // API call happened recently, skip WebSocket state updates
                return;
            }

            setEnabledChannels(data.test_enabled_channels || []);
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    const handleChannelToggle = async (channel) => {
        const isEnabled = enabledChannels.includes(channel);
        const previousState = [...enabledChannels];

        try {
            // Mark API call time to prevent WebSocket interference
            lastApiCallTime.current = Date.now();

            // Optimistically update UI
            if (isEnabled) {
                setEnabledChannels(prev => prev.filter(ch => ch !== channel));
            } else {
                setEnabledChannels(prev => [...prev, channel].sort());
            }

            // Call API
            const response = isEnabled
                ? await timetaggerAPI.testing(false, [channel])
                : await timetaggerAPI.testing(true, [channel]);

            // Check response status
            if (response.data.status === 200) {
                // API response takes priority - update with actual state from backend
                setEnabledChannels(response.data.test_enabled_channels || []);
            } else {
                console.error('Failed to toggle test signal:', response.data.error);
                // Revert to previous state on error
                setEnabledChannels(previousState);
            }
        } catch (error) {
            console.error('Failed to toggle test signal:', error);
            // Revert to previous state on error
            setEnabledChannels(previousState);
        }
    };

    return (
        <Paper elevation={0} sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            overflow: 'hidden'
        }}>
            <Box
                onClick={() => setIsExpanded(!isExpanded)}
                sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' }
                }}
            >
                <Box display="flex" alignItems="center" gap={1.5}>
                    <Sensors sx={{ color: 'text.secondary' }} />
                    <Box>
                        <Typography variant="h6" component="div" sx={{ fontWeight: 600, fontSize: '1rem' }}>
                            Test Signals
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {enabledChannels.length} active
                        </Typography>
                    </Box>
                </Box>
                <IconButton size="small">
                    {isExpanded ? <ExpandLess /> : <ExpandMore />}
                </IconButton>
            </Box>

            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                <CardContent sx={{ p: 2, pt: 2 }}>
                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 1.5
                    }}>
                        {channels.map((channel) => {
                            const isEnabled = enabledChannels.includes(channel);
                            return (
                                <Paper
                                    key={channel}
                                    variant="outlined"
                                    sx={{
                                        p: 1.5,
                                        borderRadius: 1.5,
                                        borderColor: isEnabled ? 'primary.main' : 'divider',
                                        borderWidth: isEnabled ? 2 : 1,
                                        backgroundColor: isEnabled ? 'primary.50' : 'background.paper',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'flex-start',
                                        gap: 0.5,
                                        '&:hover': {
                                            borderColor: 'primary.main',
                                            backgroundColor: 'action.hover'
                                        }
                                    }}
                                    onClick={() => handleChannelToggle(channel)}
                                >
                                    <Box display="flex" width="100%" alignItems="center" justifyContent="space-between">
                                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                            CH {channel}
                                        </Typography>
                                        <Switch
                                            size="small"
                                            checked={isEnabled}
                                            readOnly
                                            sx={{ transform: 'scale(0.8)', m: -1, mr: -0.5 }}
                                        />
                                    </Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                        {isEnabled ? 'Active' : 'Off'}
                                    </Typography>
                                </Paper>
                            );
                        })}
                    </Box>
                </CardContent>
            </Collapse>
        </Paper>
    );
}