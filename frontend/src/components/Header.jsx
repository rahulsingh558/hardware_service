import { Box, IconButton, Typography, AppBar, Toolbar, Chip } from '@mui/material';
import { Brightness4, Brightness7, Cable } from '@mui/icons-material';

export default function Header({ darkMode, onThemeToggle }) {
    return (
        <AppBar position="static" elevation={0} sx={{
            backgroundColor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider'
        }}>
            <Toolbar>
                <Cable sx={{
                    mr: 2,
                    color: 'primary.main',
                    fontSize: '1.5rem'
                }} />

                <Typography variant="h6" component="div" sx={{
                    flexGrow: 1,
                    fontWeight: 600,
                    letterSpacing: '-0.5px'
                }}>
                    Photonic Instrument
                </Typography>

                <Chip
                    label="DEMO"
                    color="warning"
                    variant="outlined"
                    size="small"
                    sx={{
                        mr: 2,
                        fontWeight: 500,
                        borderWidth: '2px'
                    }}
                />

                <IconButton
                    onClick={onThemeToggle}
                    sx={{
                        border: '1px solid',
                        borderColor: 'divider',
                        '&:hover': {
                            backgroundColor: 'action.hover'
                        }
                    }}
                >
                    {darkMode ? <Brightness7 /> : <Brightness4 />}
                </IconButton>
            </Toolbar>
        </AppBar>
    );
}