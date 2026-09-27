'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === 'dark';

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
