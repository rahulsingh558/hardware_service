import { useState, useEffect, useRef } from 'react';
import {
    Card,
    CardContent,
    Typography,
    Switch,
    Box,
    Chip,
    Grid,
    CircularProgress,
    Paper,
    LinearProgress,
    Slider,
} from '@mui/material';
import { PowerSettingsNew, FlashOn } from '@mui/icons-material';
import { laserAPI } from '../services/api';
import { createSocket, NAMESPACES } from '../services/socket';

export default function LaserControl() {
    const [laserOn, setLaserOn] = useState(false);
    const [telemetry, setTelemetry] = useState(null);
    const [loading, setLoading] = useState(false);
    const [laserPower, setLaserPower] = useState(1.0);

    // Track API calls to prevent WebSocket from overriding API responses
    const lastApiCallTime = useRef(0);
    const API_PRIORITY_WINDOW = 2000; // ms to ignore WebSocket updates after API call

    useEffect(() => {
        const socket = createSocket(NAMESPACES.LASER_STATUS);

        socket.on('connect', () => {
            console.log('Connected to laser status socket');
        });

        socket.on('laser_status', (data) => {
            setTelemetry(data);

            // Give priority to API responses - ignore WebSocket updates briefly after API calls
            const timeSinceApiCall = Date.now() - lastApiCallTime.current;
            if (timeSinceApiCall < API_PRIORITY_WINDOW) {
                // API call happened recently, skip WebSocket state updates
                return;
            }

            // Backend sends power_state as string: "APC", "ACC", or "OFF"
            setLaserOn(data.power_state !== 'OFF');
            // Only sync power when laser is ON (don't overwrite with 0.0 when OFF)
            if (data.power !== undefined && data.power > 0) {
                setLaserPower(data.power);
            }
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from laser status socket');
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    const handleToggle = async (event) => {
        const newState = event.target.checked;
        setLoading(true);

        try {
            // Mark API call time to prevent WebSocket interference
            lastApiCallTime.current = Date.now();

            // When turning ON, always start at 1.0 mW
            // When turning OFF, don't send power parameter
            const response = newState
                ? await laserAPI.control(1, 1.0)
                : await laserAPI.control(0);

            // Backend returns numeric status: 200 for success, 400 for error
            if (response.data.status === 200) {
                // API response takes priority - update state immediately
                setLaserOn(newState);
                // Update power from API response (will be 1.0 when turning ON)
                if (response.data.power !== undefined) {
                    setLaserPower(response.data.power);
                }
                // Extend the window after successful response to account for latency
                lastApiCallTime.current = Date.now();
            } else {
                console.error('Laser control failed:', response.data.error);
                // Revert the UI state on error
                setLaserOn(!newState);
            }
        } catch (error) {
            console.error('Failed to control laser:', error);
            // Revert the UI state on error
            setLaserOn(!newState);
        } finally {
            setLoading(false);
        }
    };

    const handlePowerChange = async (event, newValue) => {
        setLaserPower(newValue);
    };

    const handlePowerCommit = async (event, newValue) => {
        if (!laserOn) return;

        try {
            // Mark API call time
            lastApiCallTime.current = Date.now();
            const response = await laserAPI.control(1, newValue);

            if (response.data.status === 200) {
                // Update with confirmed value from server
                if (response.data.power !== undefined) {
                    setLaserPower(response.data.power);
                }
                // Extend the window after successful response
                lastApiCallTime.current = Date.now();
            }
        } catch (error) {
            console.error('Failed to set laser power:', error);
        }
    };

    return (
        <Paper elevation={0} sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            height: '100%'
        }}>
            <CardContent sx={{ p: 3 }}>
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
                    <Box display="flex" alignItems="center" gap={1.5}>
                        <Box sx={{
                            width: 40,
                            height: 40,
                            borderRadius: 2,
                            backgroundColor: laserOn ? 'success.dark' : 'action.hover',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid',
                            borderColor: laserOn ? 'success.main' : 'divider'
                        }}>
                            <FlashOn sx={{
                                color: laserOn ? '#fff' : 'text.secondary',
                                fontSize: '1.5rem'
                            }} />
                        </Box>
                        <Box>
                            <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
                                Laser Control
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {laserOn ? 'Emission active' : 'Standby mode'}
                            </Typography>
                        </Box>
                    </Box>
                    <Chip
                        label={laserOn ? "ON" : "OFF"}
                        color={laserOn ? "success" : "default"}
                        variant={laserOn ? "filled" : "outlined"}
                        sx={{ fontWeight: 600 }}
                    />
                </Box>

                <Box sx={{
                    p: 2.5,
                    borderRadius: 1.5,
                    backgroundColor: laserOn ? 'success.dark' : 'background.default',
                    border: '1px solid',
                    borderColor: laserOn ? 'success.main' : 'divider',
                    mb: 4
                }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                        <Typography variant="body1" sx={{ fontWeight: 600, color: laserOn ? '#fff' : 'text.primary' }}>
                            Power Control
                        </Typography>
                        <Box display="flex" alignItems="center" gap={1}>
                            {loading && <CircularProgress size={20} />}
                            <Switch
                                checked={laserOn}
                                onChange={handleToggle}
                                disabled={loading}
                                size="medium"
                                sx={{
                                    '& .MuiSwitch-switchBase.Mui-checked': {
                                        color: 'primary.main',
                                        '&:hover': {
                                            backgroundColor: 'primary.50'
                                        }
                                    }
                                }}
                            />
                        </Box>
                    </Box>

                    {laserOn && (
                        <Box sx={{ mt: 3 }}>
                            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                <Typography variant="caption" sx={{ fontWeight: 600, color: laserOn ? '#fff' : 'text.secondary' }}>
                                    Laser Power Level
                                </Typography>
                                <Typography variant="caption" sx={{ fontWeight: 700, color: '#fff' }}>
                                    {laserPower.toFixed(1)} mW
                                </Typography>
                            </Box>
                            <Slider
                                value={laserPower}
                                onChange={handlePowerChange}
                                onChangeCommitted={handlePowerCommit}
                                min={1.0}
                                max={5.0}
                                step={0.1}
                                valueLabelDisplay="auto"
                                valueLabelFormat={(value) => `${value.toFixed(1)} mW`}
                                color="success"
                                sx={{
                                    '& .MuiSlider-thumb': {
                                        width: 16,
                                        height: 16,
                                    },
                                    '& .MuiSlider-valueLabel': {
                                        fontSize: 12,
                                        fontWeight: 600,
                                    },
                                }}
                            />
                        </Box>
                    )}
                </Box>

                {telemetry && (
                    <>
                        <Grid container spacing={2}>
                            <Grid item xs={12}>
                                <Paper
                                    variant="outlined"
                                    sx={{
                                        p: 2,
                                        borderRadius: 1.5,
                                        height: '100%',
                                        borderColor: 'divider'
                                    }}
                                >
                                    <Typography variant="caption" sx={{
                                        color: 'text.secondary',
                                        fontWeight: 500,
                                        display: 'block',
                                        mb: 0.5
                                    }}>
                                        Current
                                    </Typography>
                                    <Typography variant="h5" sx={{
                                        fontWeight: 700,
                                        color: 'text.primary'
                                    }}>
                                        {parseFloat(telemetry.current || 0).toFixed(2)} <Typography component="span" variant="caption">mA</Typography>
                                    </Typography>
                                </Paper>
                            </Grid>
                            <Grid item xs={12}>
                                <Paper
                                    variant="outlined"
                                    sx={{
                                        p: 2,
                                        borderRadius: 1.5,
                                        height: '100%',
                                        borderColor: 'divider'
                                    }}
                                >
                                    <Typography variant="caption" sx={{
                                        color: 'text.secondary',
                                        fontWeight: 500,
                                        display: 'block',
                                        mb: 0.5
                                    }}>
                                        Voltage
                                    </Typography>
                                    <Typography variant="h5" sx={{
                                        fontWeight: 700,
                                        color: 'text.primary'
                                    }}>
                                        {parseFloat(telemetry.voltage || 0).toFixed(2)} <Typography component="span" variant="caption">V</Typography>
                                    </Typography>
                                </Paper>
                            </Grid>

                            <Grid item xs={12}>
                                <Paper
                                    variant="outlined"
                                    sx={{
                                        p: 2,
                                        borderRadius: 1.5,
                                        height: '100%',
                                        borderColor: 'divider'
                                    }}
                                >
                                    <Typography variant="caption" sx={{
                                        color: 'text.secondary',
                                        fontWeight: 500,
                                        display: 'block',
                                        mb: 0.5
                                    }}>
                                        TEC Load 1
                                    </Typography>
                                    <Typography variant="h5" sx={{
                                        fontWeight: 700,
                                        color: 'text.primary'
                                    }}>
                                        {parseFloat(telemetry.tec_load_1 || 0).toFixed(2)} <Typography component="span" variant="caption">%</Typography>
                                    </Typography>
                                </Paper>
                            </Grid>
                            <Grid item xs={12}>
                                <Paper
                                    variant="outlined"
                                    sx={{
                                        p: 2,
                                        borderRadius: 1.5,
                                        height: '100%',
                                        borderColor: 'divider'
                                    }}
                                >
                                    <Typography variant="caption" sx={{
                                        color: 'text.secondary',
                                        fontWeight: 500,
                                        display: 'block',
                                        mb: 0.5
                                    }}>
                                        Diode Temperature
                                    </Typography>
                                    <Typography variant="h5" sx={{
                                        fontWeight: 700,
                                        color: 'text.primary'
                                    }}>
                                        {parseFloat(telemetry.diode_temperature || 0).toFixed(2)} <Typography component="span" variant="caption">°C</Typography>
                                    </Typography>
                                </Paper>
                            </Grid>

                            <Grid item xs={12}>
                                <Paper
                                    variant="outlined"
                                    sx={{
                                        p: 2,
                                        borderRadius: 1.5,
                                        height: '100%',
                                        borderColor: 'divider'
                                    }}
                                >
                                    <Typography variant="caption" sx={{
                                        color: 'text.secondary',
                                        fontWeight: 500,
                                        display: 'block',
                                        mb: 0.5
                                    }}>
                                        TEC Load 2
                                    </Typography>
                                    <Typography variant="h5" sx={{
                                        fontWeight: 700,
                                        color: 'text.primary'
                                    }}>
                                        {parseFloat(telemetry.tec_load_2 || 0).toFixed(2)} <Typography component="span" variant="caption">%</Typography>
                                    </Typography>
                                </Paper>
                            </Grid>
                            <Grid item xs={12}>
                                <Paper
                                    variant="outlined"
                                    sx={{
                                        p: 2,
                                        borderRadius: 1.5,
                                        height: '100%',
                                        borderColor: 'divider'
                                    }}
                                >
                                    <Typography variant="caption" sx={{
                                        color: 'text.secondary',
                                        fontWeight: 500,
                                        display: 'block',
                                        mb: 0.5
                                    }}>
                                        Electronics Temperature
                                    </Typography>
                                    <Typography variant="h5" sx={{
                                        fontWeight: 700,
                                        color: 'text.primary'
                                    }}>
                                        {parseFloat(telemetry.electronics_temperature || 0).toFixed(2)} <Typography component="span" variant="caption">°C</Typography>
                                    </Typography>
                                </Paper>
                            </Grid>

                            <Grid item xs={12}>
                                <Paper
                                    variant="outlined"
                                    sx={{
                                        p: 2,
                                        borderRadius: 1.5,
                                        height: '100%',
                                        borderColor: 'divider'
                                    }}
                                >
                                    <Typography variant="caption" sx={{
                                        color: 'text.secondary',
                                        fontWeight: 500,
                                        display: 'block',
                                        mb: 0.5
                                    }}>
                                        Fan Load
                                    </Typography>
                                    <Typography variant="h5" sx={{
                                        fontWeight: 700,
                                        color: 'text.primary'
                                    }}>
                                        {parseFloat(telemetry.fan_load || 0).toFixed(2)} <Typography component="span" variant="caption">%</Typography>
                                    </Typography>
                                </Paper>
                            </Grid>
                            <Grid item xs={12}>
                                <Paper
                                    variant="outlined"
                                    sx={{
                                        p: 2,
                                        borderRadius: 1.5,
                                        height: '100%',
                                        borderColor: 'divider'
                                    }}
                                >
                                    <Typography variant="caption" sx={{
                                        color: 'text.secondary',
                                        fontWeight: 500,
                                        display: 'block',
                                        mb: 0.5
                                    }}>
                                        Body Temperature
                                    </Typography>
                                    <Typography variant="h5" sx={{
                                        fontWeight: 700,
                                        color: 'text.primary'
                                    }}>
                                        {parseFloat(telemetry.body_temperature || 0).toFixed(2)} <Typography component="span" variant="caption">°C</Typography>
                                    </Typography>
                                </Paper>
                            </Grid>
                        </Grid>
                    </>
                )}
            </CardContent>
        </Paper>
    );
}