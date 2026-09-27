'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  return (
    <Button
      aria-label={dark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      className="text-muted-foreground"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      size="icon"
      variant="ghost"
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
