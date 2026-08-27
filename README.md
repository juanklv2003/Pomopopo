# Pomopopo

Aplicación web de técnica **Pomodoro** inspirada en el estilo de *pomofocus.io*.

- **Frontend**: Go (sirve el SPA y hace proxy a la API) + **TypeScript** con Vite.
- **Backend**: Node.js (Express) con API REST y persistencia en `backend/data/db.json`.

## Funcionalidades

- Temporizador Pomodoro / Descanso corto / Descanso largo con anillo de progreso.
- Ajustes: modificar duraciones, descanso largo cada N pomodoros, auto-inicio.
- Sonido de alarma configurable (Digital, Campana, Dong, Clásico) — sintetizado con Web Audio.
- Sonido ambiente generado (Lluvia, Café, Viento) sin archivos externos.
- Tema de color de fondo/tarjeta (6 colores).
- Lista de tareas con estimación en pomodoros y contador del día.
- Iconos de la librería Phosphor (peso bold) en toda la interfaz.

## Requisitos

- Go 1.21+ (recomendado 1.27)
- Node.js 18+ y npm

## Instalación

```bash
# Frontend (TypeScript/Vite)
cd frontend
npm install
npm run build        # genera frontend/dist

# Backend (Node.js)
cd ../backend
npm install
```

## Ejecución

Necesitas dos procesos:

```bash
# Terminal 1: backend Node.js (API)
cd backend
npm start
# → http://localhost:4000

# Terminal 2: frontend Go (SPA + proxy a /api)
cd frontend
go run .
# → http://localhost:8080
```

Abre **http://localhost:8080** en el navegador.

> En desarrollo (con recarga en vivo) puedes usar `cd frontend && npm run dev`
> (Vite en http://localhost:5173 con proxy `/api` ya configurado) junto al backend.

## Uso rápido

1. Añade una tarea y púlsala para marcarla como activa.
2. Pulsa **Comenzar** y concéntrate 25 min.
3. Al sonar la alarma, se registra 1 pomodoro completado para la tarea activa.
4. Cada 4 pomodoros (configurable) entra el descanso largo.

## Estructura

```
Pomopopo/
├── frontend/            # Go (servidor) + TypeScript/Vite (UI)
│   ├── main.go          # Servidor Go que sirve dist y proxya /api
│   ├── index.html
│   └── src/
│       ├── main.ts      # Lógica de la app
│       └── lib/         # api.ts, audio.ts, themes.ts, types.ts
├── backend/             # Node.js (Express)
│   └── src/
│       ├── server.js    # Endpoints REST
│       └── store.js     # Persistencia en JSON
└── README.md
```