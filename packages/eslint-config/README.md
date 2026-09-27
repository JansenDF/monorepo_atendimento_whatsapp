# Configuração ESLint

O flat config compartilhado fica na raiz em `eslint.config.mjs`. Ele aplica TypeScript ESLint à API e as regras Next.js/Core Web Vitals ao frontend. Apps executáveis declaram o script `lint` local e são agregados pela tarefa `lint` do Turborepo; código gerado, builds e cobertura são ignorados. Revise a regra compartilhada antes de criar exceções por projeto.
