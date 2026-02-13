# PicoMessenger Frontend

Interface Web PWA para comunicação com Raspberry Pi Pico W (BitDogLab).

## 🚀 Como Rodar Localmente

1. Entre na pasta do frontend: `cd frontend`
2. Instale as dependências: `npm install`
3. Inicie o servidor de desenvolvimento: `npm run dev`

## ☁️ Deploy na Vercel

1. Certifique-se de que o backend já está rodando.
2. Na Vercel, importe o diretório `frontend`.
3. Adicione a variável de ambiente:
   - `VITE_API_BASE_URL`: URL completa do seu backend (ex: `https://api.pico.seusite.com`). 
   *Nota: Não inclua a barra final nem `/api`, o App já concatena `/api`.*
4. Use as configurações padrão do Vite para build (`npm run build`, output dir `dist`).

## 🛠️ Detalhes do App
- **Polling:** Busca mensagens a cada 2 segundos.
- **Pareamento:** Usa `thread_id` e `pair_code` (6 dígitos) para autenticar sessões sem necessidade de cadastro formal.
- **Limite:** Mensagens bloqueadas em 280 caracteres para compatibilidade com o buffer do MicroPython.
