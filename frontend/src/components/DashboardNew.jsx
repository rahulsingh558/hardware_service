import { useState } from 'react';
import { Box, Container, Grid } from '@mui/material';
import LaserControlVertical from './LaserControlVertical';
import TestSignals from './TestSignals';
import CountrateMonitor from './CountrateMonitor';
import CoincidenceMonitor from './CoincidenceMonitor';
import CorrelationMonitor from './CorrelationMonitor';

export default function DashboardNew() {
    const [isLaserOn, setIsLaserOn] = useState(false);

    return (
        <Box sx={{
            flexGrow: 1,
            p: 3,
            minHeight: '100vh',
            backgroundColor: 'background.default',
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(120, 120, 120, 0.1) 1px, transparent 0)',
            backgroundSize: '24px 24px'
        }}>
            <Container maxWidth="xl">
                <Box sx={{ display: 'flex', flexDirection: 'row', gap: 3, alignItems: 'flex-start' }}>
                    {/* Left Sidebar - Vertical Laser Control & Test Signals - Fixed Width */}
                    <Box sx={{ width: '380px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <LaserControlVertical onStateChange={setIsLaserOn} />
                        <TestSignals />
                    </Box>

                    {/* Right Main Content - Takes remaining space */}
                    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <CountrateMonitor isLaserOn={isLaserOn} />
                        <CoincidenceMonitor isLaserOn={isLaserOn} />
                        <CorrelationMonitor isLaserOn={isLaserOn} />
                    </Box>
                </Box>
            </Container>
        </Box>
    );
}
