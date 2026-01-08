import { useState, useMemo } from 'react';
import { ThemeProvider, CssBaseline, Box } from '@mui/material';
import { getTheme } from './styles/theme';
import Header from './components/Header';
import Dashboard from './components/DashboardNew';
import './styles/global.css';

function App() {
  const [darkMode, setDarkMode] = useState(true);

  const theme = useMemo(() => getTheme(darkMode ? 'dark' : 'light'), [darkMode]);

  const handleThemeToggle = () => {
    setDarkMode((prev) => !prev);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Header darkMode={darkMode} onThemeToggle={handleThemeToggle} />
        <Dashboard darkMode={darkMode} />
      </Box>
    </ThemeProvider>
  );
}

export default App;
