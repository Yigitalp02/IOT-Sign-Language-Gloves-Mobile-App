export const Colors = {
    light: {
        bgPrimary: '#f9fafb',
        bgSecondary: '#ffffff',
        bgCard: '#ffffff',
        textPrimary: '#111827',
        textSecondary: '#6b7280',
        borderColor: '#d1d5db',
        inputBg: '#ffffff',
        accentPrimary: '#10b981',
        accentSecondary: '#8b5cf6',
        accentText: '#ffffff',
        statusBg: '#f3f4f6',
        shadowColor: 'rgba(0, 0, 0, 0.05)',
    },
    dark: {
        bgPrimary: '#0f172a',
        bgSecondary: '#1e293b',
        bgCard: 'rgba(30, 41, 59, 0.9)',
        textPrimary: '#f1f5f9',
        textSecondary: '#94a3b8',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        inputBg: 'rgba(15, 23, 42, 0.6)',
        accentPrimary: '#3b82f6',
        accentSecondary: '#60a5fa',
        accentText: '#ffffff',
        statusBg: 'rgba(30, 41, 59, 0.9)',
        shadowColor: 'rgba(0, 0, 0, 0.3)',
    },
};

export type ThemeColors = typeof Colors.light;
