import { customerSchema, loginSchema, messageSchema, transferSchema } from './schemas';

describe('schemas de fronteira do frontend', () => {
  it('valida as credenciais de login e rejeita e-mail inválido ou senha vazia', () => {
    expect(loginSchema.safeParse({ email: 'agente@example.com', password: 'segura' }).success).toBe(true);

    const result = loginSchema.safeParse({ email: 'invalido', password: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining(['Informe um e-mail válido', 'Informe sua senha']),
      );
    }
  });

  it('remove espaços externos de mensagens e rejeita vazio ou acima do limite', () => {
    expect(messageSchema.parse({ body: '  Olá  ' })).toEqual({ body: 'Olá' });
    expect(messageSchema.safeParse({ body: '   ' }).success).toBe(false);
    expect(messageSchema.safeParse({ body: 'x'.repeat(4097) }).success).toBe(false);
  });

  it('exige departamento válido e aceita atribuição opcional', () => {
    const departmentId = '11111111-1111-4111-8111-111111111111';
    const agentId = '22222222-2222-4222-8222-222222222222';

    expect(transferSchema.safeParse({ departmentId }).success).toBe(true);
    expect(transferSchema.safeParse({ departmentId, assigneeId: agentId }).success).toBe(true);
    expect(transferSchema.safeParse({ departmentId, assigneeId: '' }).success).toBe(true);
    expect(transferSchema.safeParse({ departmentId: 'nao-e-uuid' }).success).toBe(false);
  });

  it('valida dados do cliente, preserva campos opcionais e rejeita conteúdo inválido', () => {
    expect(customerSchema.parse({ displayName: '  Ana Lima  ', email: '', notes: 'Preferência registrada' })).toEqual({
      displayName: 'Ana Lima',
      email: '',
      notes: 'Preferência registrada',
    });
    expect(customerSchema.safeParse({ displayName: 'A', email: '' }).success).toBe(false);
    expect(customerSchema.safeParse({ displayName: 'Ana', email: 'invalido' }).success).toBe(false);
    expect(customerSchema.safeParse({ displayName: 'Ana', email: '', notes: 'x'.repeat(4001) }).success).toBe(false);
  });
});
