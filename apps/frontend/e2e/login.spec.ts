import { expect, test } from '@playwright/test';

test('login mostra os erros de validação de e-mail e senha', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByText('Informe um e-mail válido')).toBeVisible();
  await expect(page.getByText('Informe sua senha')).toBeVisible();
});

test('login permite alternar a visibilidade da senha', async ({ page }) => {
  await page.goto('/login');
  const password = page.getByRole('textbox', { name: 'Senha' });

  await password.fill('senha-de-teste');
  await page.getByRole('button', { name: 'Mostrar senha' }).click();
  await expect(password).toHaveAttribute('type', 'text');

  await page.getByRole('button', { name: 'Ocultar senha' }).click();
  await expect(password).toHaveAttribute('type', 'password');
});
