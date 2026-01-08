import { Box, Container, Grid } from '@mui/material';
import LaserControl from './LaserControl';
import TestSignals from './TestSignals';
import CountrateMonitor from './CountrateMonitor';

export default function Dashboard() {
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
                <Grid container spacing={3}>
                    {/* Left Sidebar - Vertical Laser Control */}
                    <Grid item xs={12} md={3}>
                        <LaserControl />
                    </Grid>

                    {/* Right Main Content */}
                    <Grid item xs={12} md={9}>
                        <Grid container spacing={3}>
                            <Grid item xs={12}>
                                <TestSignals />
                            </Grid>
                            <Grid item xs={12}>
                                <CountrateMonitor />
                            </Grid>
                        </Grid>
                    </Grid>
                </Grid>
            </Container>
        </Box>
    );
}