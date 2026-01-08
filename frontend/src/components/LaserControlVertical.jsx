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
    TextField,
    InputAdornment,
    Button,
    IconButton,
} from '@mui/material';
import { PowerSettingsNew, FlashOn, Edit, Close } from '@mui/icons-material';
import { laserAPI } from '../services/api';
import { createSocket, NAMESPACES } from '../services/socket';

export default function LaserControlVertical({ onStateChange }) {
    const [laserOn, setLaserOn] = useState(false);
    const [telemetry, setTelemetry] = useState(null);
    const [loading, setLoading] = useState(false);
    const [laserPower, setLaserPower] = useState(1.0);
    const [isEditingPower, setIsEditingPower] = useState(false);
    const [tempPowerInput, setTempPowerInput] = useState('');
    const [showPowerControls, setShowPowerControls] = useState(false);

    // Track API calls to prevent WebSocket from overriding API responses
    const lastApiCallTime = useRef(0);
    const API_PRIORITY_WINDOW = 500; // ms to ignore WebSocket updates after API call

    useEffect(() => {
        if (onStateChange) {
            onStateChange(laserOn);
        }
    }, [laserOn, onStateChange]);

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
            const isLaserOn = data.power_state !== 'OFF';
            setLaserOn(isLaserOn);
            if (!isLaserOn) setShowPowerControls(false);
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

            // When turning ON or OFF, don't send power parameter
            const response = newState
                ? await laserAPI.control(1)
                : await laserAPI.control(0);

            // Backend returns numeric status: 200 for success, 400 for error
            if (response.data.status === 200) {
                // API response takes priority - update state immediately
                setLaserOn(newState);
                if (!newState) setShowPowerControls(false);
                // Update power from API response (will be 1.0 when turning ON)
                if (response.data.power !== undefined) {
                    setLaserPower(response.data.power);
                }
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

    const handlePowerClick = () => {
        setTempPowerInput(laserPower.toString());
        setIsEditingPower(true);
    };

    const handlePowerSubmit = async () => {
        let newValue = parseFloat(tempPowerInput);
        if (!isNaN(newValue)) {
            // Clamp value between 1 and 5 (matching backend)
            newValue = Math.min(Math.max(newValue, 1.0), 5.0);
            setLaserPower(newValue);

            if (laserOn) {
                try {
                    // Mark API call time
                    lastApiCallTime.current = Date.now();
                    await laserAPI.control(1, newValue);
                } catch (error) {
                    console.error('Failed to set laser power:', error);
                }
            }
        }
        setIsEditingPower(false);
    };

    const handlePowerInputKeyDown = (e) => {
        if (e.key === 'Enter') {
            handlePowerSubmit();
        } else if (e.key === 'Escape') {
            setIsEditingPower(false);
        }
    };

    return (
        <Paper elevation={0} sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            height: '100%'
        }}>
            <CardContent sx={{ p: 2 }}>
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
                    backgroundColor: 'background.default',
                    border: '1px solid',
                    borderColor: 'divider',
                    mb: 2
                }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                        <Box>
                            <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary' }}>
                                Power Control
                            </Typography>
                            {laserOn && (
                                <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600, display: 'block' }}>
                                    {laserPower.toFixed(1)} mW
                                </Typography>
                            )}
                        </Box>
                        <Box display="flex" alignItems="center" gap={1}>
                            {loading && <CircularProgress size={20} />}
                            <Switch
                                checked={laserOn}
                                onChange={handleToggle}
                                disabled={loading}
                                size="medium"
                                sx={{
                                    '& .MuiSwitch-switchBase.Mui-checked': {
                                        color: 'success.main',
                                        '&:hover': {
                                            backgroundColor: 'success.50'
                                        }
                                    },
                                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                        backgroundColor: 'success.dark',
                                        opacity: 1
                                    }
                                }}
                            />
                        </Box>
                    </Box>

                    {laserOn && (
                        <Box sx={{ mt: 3 }}>
                            {!isEditingPower && !showPowerControls ? (
                                <Button
                                    variant="outlined"
                                    fullWidth
                                    size="small"
                                    onClick={() => setShowPowerControls(true)}
                                >
                                    Set Manual Power
                                </Button>
                            ) : (
                                <>
                                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                                            Laser Power Level
                                        </Typography>

                                        {isEditingPower ? (
                                            <TextField
                                                value={tempPowerInput}
                                                onChange={(e) => setTempPowerInput(e.target.value)}
                                                onBlur={handlePowerSubmit}
                                                onKeyDown={handlePowerInputKeyDown}
                                                autoFocus
                                                size="small"
                                                variant="standard"
                                                InputProps={{
                                                    endAdornment: <InputAdornment position="end" sx={{ '& .MuiTypography-root': { color: 'text.primary' } }}>mW</InputAdornment>,
                                                    disableUnderline: true,
                                                    sx: {
                                                        fontWeight: 700,
                                                        fontSize: '0.875rem',
                                                        width: '80px',
                                                        textAlign: 'right',
                                                        backgroundColor: 'action.hover',
                                                        borderRadius: 1,
                                                        px: 1,
                                                        '& input': { textAlign: 'right', p: 0.5 }
                                                    }
                                                }}
                                            />
                                        ) : (
                                            <Box
                                                display="flex"
                                                alignItems="center"
                                                onClick={handlePowerClick}
                                                sx={{ cursor: 'pointer', '&:hover': { opacity: 0.8 } }}
                                            >
                                                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary', mr: 0.5 }}>
                                                    {laserPower.toFixed(1)} mW
                                                </Typography>
                                                <Edit sx={{ fontSize: 14, color: 'text.secondary' }} />
                                            </Box>
                                        )}
                                        <IconButton
                                            size="small"
                                            onClick={() => setShowPowerControls(false)}
                                            sx={{
                                                ml: 1,
                                                padding: 0.5,
                                            }}
                                        >
                                            <Close sx={{ fontSize: 16 }} />
                                        </IconButton>
                                    </Box>
                                    <Slider
                                        value={laserPower}
                                        onChange={(e, value) => {
                                            setLaserPower(value);
                                            if (isEditingPower) setIsEditingPower(false);
                                        }}
                                        onChangeCommitted={async (e, value) => {
                                            if (laserOn) {
                                                try {
                                                    // Mark API call time
                                                    lastApiCallTime.current = Date.now();
                                                    await laserAPI.control(1, value);
                                                } catch (error) {
                                                    console.error('Failed to set laser power:', error);
                                                }
                                            }
                                        }}
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
                                                backgroundColor: '#fff',
                                            },
                                            '& .MuiSlider-track': {
                                                backgroundColor: '#fff',
                                                border: 'none',
                                            },
                                            '& .MuiSlider-rail': {
                                                backgroundColor: 'rgba(255,255,255,0.3)',
                                            },
                                            '& .MuiSlider-valueLabel': {
                                                fontSize: 12,
                                                fontWeight: 600,
                                                backgroundColor: '#fff',
                                                color: 'success.main',
                                            },
                                        }}
                                    />
                                </>
                            )}
                        </Box>
                    )}
                </Box>

                {telemetry && (
                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 1.5,
                        width: '100%'
                    }}>
                        <Paper
                            variant="outlined"
                            sx={{
                                p: 2,
                                borderRadius: 1.5,
                                borderColor: 'divider'
                            }}
                        >
                            <Typography variant="caption" sx={{
                                color: 'text.secondary',
                                fontWeight: 500,
                                fontSize: '0.65rem',
                                display: 'block',
                                mb: 0.5
                            }}>
                                Current
                            </Typography>
                            <Typography variant="h5" sx={{
                                fontWeight: 700,
                                fontSize: '1.25rem',
                                color: 'text.primary'
                            }}>
                                {parseFloat(telemetry.current || 0).toFixed(2)} <Typography component="span" variant="caption">mA</Typography>
                            </Typography>
                        </Paper>

                        <Paper
                            variant="outlined"
                            sx={{
                                p: 2,
                                borderRadius: 1.5,
                                borderColor: 'divider'
                            }}
                        >
                            <Typography variant="caption" sx={{
                                color: 'text.secondary',
                                fontWeight: 500,
                                fontSize: '0.65rem',
                                display: 'block',
                                mb: 0.5
                            }}>
                                Voltage
                            </Typography>
                            <Typography variant="h5" sx={{
                                fontWeight: 700,
                                fontSize: '1.25rem',
                                color: 'text.primary'
                            }}>
                                {parseFloat(telemetry.voltage || 0).toFixed(2)} <Typography component="span" variant="caption">V</Typography>
                            </Typography>
                        </Paper>

                        <Paper
                            variant="outlined"
                            sx={{
                                p: 2,
                                borderRadius: 1.5,
                                borderColor: 'divider'
                            }}
                        >
                            <Typography variant="caption" sx={{
                                color: 'text.secondary',
                                fontWeight: 500,
                                fontSize: '0.65rem',
                                display: 'block',
                                mb: 0.5
                            }}>
                                TEC Load 1
                            </Typography>
                            <Typography variant="h5" sx={{
                                fontWeight: 700,
                                fontSize: '1.25rem',
                                color: 'text.primary'
                            }}>
                                {parseFloat(telemetry.tec_load_1 || 0).toFixed(2)} <Typography component="span" variant="caption">%</Typography>
                            </Typography>
                        </Paper>

                        <Paper
                            variant="outlined"
                            sx={{
                                p: 2,
                                borderRadius: 1.5,
                                borderColor: 'divider'
                            }}
                        >
                            <Typography variant="caption" sx={{
                                color: 'text.secondary',
                                fontWeight: 500,
                                fontSize: '0.65rem',
                                display: 'block',
                                mb: 0.5
                            }}>
                                Diode Temperature
                            </Typography>
                            <Typography variant="h5" sx={{
                                fontWeight: 700,
                                fontSize: '1.25rem',
                                color: 'text.primary'
                            }}>
                                {parseFloat(telemetry.diode_temperature || 0).toFixed(2)} <Typography component="span" variant="caption">°C</Typography>
                            </Typography>
                        </Paper>

                        <Paper
                            variant="outlined"
                            sx={{
                                p: 2,
                                borderRadius: 1.5,
                                borderColor: 'divider'
                            }}
                        >
                            <Typography variant="caption" sx={{
                                color: 'text.secondary',
                                fontWeight: 500,
                                fontSize: '0.65rem',
                                display: 'block',
                                mb: 0.5
                            }}>
                                TEC Load 2
                            </Typography>
                            <Typography variant="h5" sx={{
                                fontWeight: 700,
                                fontSize: '1.25rem',
                                color: 'text.primary'
                            }}>
                                {parseFloat(telemetry.tec_load_2 || 0).toFixed(2)} <Typography component="span" variant="caption">%</Typography>
                            </Typography>
                        </Paper>

                        <Paper
                            variant="outlined"
                            sx={{
                                p: 2,
                                borderRadius: 1.5,
                                borderColor: 'divider'
                            }}
                        >
                            <Typography variant="caption" sx={{
                                color: 'text.secondary',
                                fontWeight: 500,
                                fontSize: '0.65rem',
                                display: 'block',
                                mb: 0.5
                            }}>
                                Electronics Temperature
                            </Typography>
                            <Typography variant="h5" sx={{
                                fontWeight: 700,
                                fontSize: '1.25rem',
                                color: 'text.primary'
                            }}>
                                {parseFloat(telemetry.electronics_temperature || 0).toFixed(2)} <Typography component="span" variant="caption">°C</Typography>
                            </Typography>
                        </Paper>

                        <Paper
                            variant="outlined"
                            sx={{
                                p: 2,
                                borderRadius: 1.5,
                                borderColor: 'divider'
                            }}
                        >
                            <Typography variant="caption" sx={{
                                color: 'text.secondary',
                                fontWeight: 500,
                                fontSize: '0.65rem',
                                display: 'block',
                                mb: 0.5
                            }}>
                                Fan Load
                            </Typography>
                            <Typography variant="h5" sx={{
                                fontWeight: 700,
                                fontSize: '1.25rem',
                                color: 'text.primary'
                            }}>
                                {parseFloat(telemetry.fan_load || 0).toFixed(2)} <Typography component="span" variant="caption">%</Typography>
                            </Typography>
                        </Paper>

                        <Paper
                            variant="outlined"
                            sx={{
                                p: 2,
                                borderRadius: 1.5,
                                borderColor: 'divider'
                            }}
                        >
                            <Typography variant="caption" sx={{
                                color: 'text.secondary',
                                fontWeight: 500,
                                fontSize: '0.65rem',
                                display: 'block',
                                mb: 0.5
                            }}>
                                Body Temperature
                            </Typography>
                            <Typography variant="h5" sx={{
                                fontWeight: 700,
                                fontSize: '1.25rem',
                                color: 'text.primary'
                            }}>
                                {parseFloat(telemetry.body_temperature || 0).toFixed(2)} <Typography component="span" variant="caption">°C</Typography>
                            </Typography>
                        </Paper>
                    </Box>
                )}
            </CardContent>
        </Paper>
    );
}