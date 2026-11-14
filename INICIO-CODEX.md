# CSPIRE//ARENA — abrir esta entrega en Codex

La carpeta ya contiene el código completo de la versión 0.5.6, sus instrucciones
(`AGENTS.md`) y las decisiones actuales (`PROJECT_CONTEXT.md`). No es necesario
reconstruir el juego ni copiar toda la conversación para continuar desarrollando.

## El paso que se realiza en tu computadora

Descomprime el ZIP en una carpeta de trabajo que quieras conservar. En Codex,
añade la carpeta **`cspire-arena`**, la que contiene `AGENTS.md`, `package.json`
y `server.js`, como carpeta del proyecto. En un proyecto existente usa
**Edit project → Add folder** y márcala **Make primary** cuando corresponda.
Trabaja en **This computer** para editar esos archivos locales.

Este ZIP no se agrega automáticamente a la lista de proyectos de la aplicación.
No instala Codex, no inicia sesión, no cambia permisos, no publica el juego y no
modifica ninguna configuración global. Es código e instrucciones portátiles.

## Mensaje inicial ya preparado

```text
Continúa CSPIRE//ARENA desde esta carpeta; no lo recrees desde cero.
Lee AGENTS.md y PROJECT_CONTEXT.md. Mantén la interfaz del juego en inglés
y responde en español. Ejecuta npm run doctor, npm run check, npm test
y npm run build. No cambies mecánicas ni balance sin pedírtelo.
```

## Ejecutar el proyecto

Desde la raíz de esta carpeta, con Node.js 20 o superior:

```sh
npm run doctor
npm run check
npm test
npm run build
npm start
```

El servidor escucha por defecto en `http://localhost:3000`; se detiene con
Ctrl+C. No necesitas `npm install` para el juego ni sus pruebas de Node.
También puedes abrir `cspire-arena.html` directamente para práctica sin servidor.

Las pruebas visuales son opcionales. Requieren Python, Playwright y Chromium:

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install playwright
python -m playwright install chromium
npm run test:ui
```

En Windows, activa el entorno virtual con `.venv\Scripts\Activate.ps1` en
PowerShell; usa `python` en vez de `python3` si corresponde. `PYTHON` permite
seleccionar un intérprete y `CHROMIUM_PATH` un Chromium existente. El lanzador
no instala paquetes automáticamente ni usa servicios externos.

`docs/CODEX-VERIFICATION.md` distingue las comprobaciones ejecutadas en esta
entrega de los informes históricos incluidos en la versión original.
