import { createTheme } from '@mui/material/styles';

export const getTheme = (mode) =>
    createTheme({
        palette: {
            mode,
            primary: {
                main: '#1976d2',
                light: '#42a5f5',
                dark: '#1565c0',
            },
            secondary: {
                main: '#00bcd4',
                light: '#4dd0e1',
                dark: '#0097a7',
            },
            background: {
                default: mode === 'dark' ? '#0a0e27' : '#f5f5f5',
                paper: mode === 'dark' ? '#1a1f3a' : '#ffffff',
            },
            success: {
                main: '#4caf50',
            },
            warning: {
                main: '#ff9800',
            },
            error: {
                main: '#f44336',
            },
        },
        typography: {
            fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
            h1: {
                fontSize: '2.5rem',
                fontWeight: 600,
            },
            h2: {
                fontSize: '2rem',
                fontWeight: 600,
            },
            h3: {
                fontSize: '1.75rem',
                fontWeight: 500,
            },
            h4: {
                fontSize: '1.5rem',
                fontWeight: 500,
            },
            h5: {
                fontSize: '1.25rem',
                fontWeight: 500,
            },
            h6: {
                fontSize: '1rem',
                fontWeight: 500,
            },
        },
        shape: {
            borderRadius: 12,
        },
        components: {
            MuiCard: {
                styleOverrides: {
                    root: {
                        backgroundImage: 'none',
                        backdropFilter: 'blur(10px)',
                        border: mode === 'dark' ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
                    },
                },
            },
            MuiButton: {
                styleOverrides: {
                    root: {
                        textTransform: 'none',
                        fontWeight: 500,
                    },
                },
            },
        },
    });
