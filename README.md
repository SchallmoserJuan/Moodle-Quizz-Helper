# Moodle Quizz Helper

Extensión Chrome (Manifest V3) que te ayuda a estudiar en quizzes de Moodle usando la API de **Gemini** o **Groq**. **Solo muestra la respuesta sugerida; nunca completa ni clickea nada automáticamente.**

---

## Instalación en Chrome

1. Abrí Chrome y andá a `chrome://extensions/`.
2. Activá el modo **"Developer mode"** (interruptor arriba a la derecha).
3. Hacé click en **"Load unpacked"** (Cargar descomprimida).
4. Seleccioná la carpeta donde están estos archivos (`manifest.json`, `content.js`, etc.).
5. Listo. La extensión debería aparecer en tu barra de extensiones.

> **Tip:** Si hacés click en el ícono del pin 📌 al lado de la extensión, queda fija en la barra para acceder rápido a las opciones.

---

## Configurar tu API Key

### Opción A: Google Gemini
1. Conseguí una API Key gratuita en [Google AI Studio](https://aistudio.google.com/app/apikey).
2. En las opciones de la extensión, seleccioná **Gemini** como proveedor.
3. Pegá tu API Key de Gemini.
4. Elegí el modelo (default: `gemini-2.5-flash`).

### Opción B: Groq (más rápido, modelos open source)
1. Conseguí una API Key gratuita en [Groq Console](https://console.groq.com/keys).
2. En las opciones de la extensión, seleccioná **Groq** como proveedor.
3. Pegá tu API Key de Groq.
4. Elegí el modelo (default: `openai/gpt-oss-120b`).

### Opción C: OpenAI-Compatible (Custom)
Permite usar **cualquier API con formato OpenAI**: ChatGPT, Claude (vía OpenRouter), DeepSeek, Perplexity, Ollama local, etc.

1. Conseguí tu API Key del servicio que elijas.
2. En las opciones, seleccioná **OpenAI-Compatible (Custom)**.
3. Completá:
   - **API Key**: tu clave
   - **Base URL**: la URL base de la API
     - OpenAI: `https://api.openai.com/v1`
     - OpenRouter: `https://openrouter.ai/api/v1`
     - DeepSeek: `https://api.deepseek.com/v1`
     - Ollama local: `http://localhost:11434/v1`
   - **Modelo**: nombre exacto del modelo
     - `gpt-4o`, `claude-3-5-sonnet-20241022`, `deepseek-chat`, etc.

> Las claves se guardan **localmente** en tu navegador (`chrome.storage.local`). Nunca se envían a ningún servidor externo.

---

## Modelos disponibles

### Gemini
| Modelo | Velocidad | Uso recomendado |
|--------|-----------|----------------|
| `gemini-2.5-flash` | Rápido | **Default** — Balance perfecto |
| `gemini-2.5-pro` | Lento | Máxima calidad, más costoso |
| `gemini-2.0-flash` | Rápido | Modelo anterior, todavía útil |
| `gemini-2.0-flash-lite` | Muy rápido | Más económico |

### Groq (verificados en [documentación oficial](https://console.groq.com/docs/models))

**Recomendados para quizzes académicos (más precisos):**
| Modelo | Velocidad | Uso recomendado |
|--------|-----------|----------------|
| `openai/gpt-oss-120b` | 500 t/s | **Default** — Más preciso, con reasoning. Ideal para cualquier materia. |
| `meta-llama/llama-4-scout-17b-16e-instruct` | 750 t/s | Muy preciso, modelo nuevo de Meta (preview). |
| `llama-3.3-70b-versatile` | 280 t/s | Buen balance calidad/velocidad. |

**Muy rápidos, menos precisos:**
| Modelo | Velocidad | Uso recomendado |
|--------|-----------|----------------|
| `openai/gpt-oss-20b` | 1000 t/s | El más rápido. Para preguntas muy simples. |
| `llama-3.1-8b-instant` | 560 t/s | Ultra rápido. Solo para lo básico. |

**Otros:**
| Modelo | Velocidad | Uso recomendado |
|--------|-----------|----------------|
| `qwen/qwen3-32b` | 400 t/s | Modelo de Alibaba (preview). |

> Para ver la lista actualizada en cualquier momento: `curl -H "Authorization: Bearer $GROQ_API_KEY" https://api.groq.com/openai/v1/models`

---

## Detección automática de áreas académicas

La extensión detecta **automáticamente** el área de la pregunta y agrega contexto especializado al prompt. Esto mejora mucho la precisión en materias técnicas.

### Áreas soportadas

| Área | Palabras clave detectadas |
|------|--------------------------|
| **Derecho Laboral** | despido, indemnización, preaviso, S.A.C., aguinaldo, contrato laboral, LCT |
| **Derecho Civil/Comercial** | contrato, obligaciones, propiedad, sucesiones, título de crédito, hipoteca |
| **Programación** | javascript, python, java, algoritmo, clase, herencia, API, SQL, framework |
| **Redes** | TCP/IP, router, switch, DNS, DHCP, VLAN, VPN, OSPF, BGP, ethernet |
| **Bases de Datos** | MySQL, PostgreSQL, MongoDB, NoSQL, JOIN, índice, normalización, trigger |
| **Gestión de Proyectos** | PMBOK, agile, scrum, WBS, Gantt, riesgo, stakeholder, cronograma |
| **Contabilidad** | activo, pasivo, balance, asiento contable, amortización, ROI, EBITDA |
| **Medicina** | diagnóstico, tratamiento, patología, anatomía, farmaco, epidemiología |
| **Ingeniería/Matemáticas** | cálculo, derivada, matriz, física, termodinámica, circuito, señales |

> Si la pregunta no coincide con ninguna área conocida, la extensión responde con conocimiento general.

### ¿Qué modelo elegir para quizzes académicos?

| Prioridad | Modelo | Proveedor | Por qué |
|-----------|--------|-----------|---------|
| 1° | `gpt-4o` | OpenAI / OpenRouter | **Máxima precisión** en cualquier área. El mejor para derecho, medicina, ingeniería. |
| 2° | `claude-3-5-sonnet` | OpenRouter / Anthropic | Muy preciso, especialmente en textos largos y derecho. |
| 3° | `openai/gpt-oss-120b` | Groq | Preciso, con reasoning. Gratis y muy rápido. |
| 4° | `gemini-2.5-pro` | Gemini | Buena calidad, gratuito con límite de cuota. |
| 5° | `deepseek-chat` | DeepSeek | Buen balance precio/calidad. |
| 6° | `llama-3.3-70b-versatile` | Groq | Buen balance calidad/velocidad. |
| 7° | `openai/gpt-oss-20b` | Groq | 1000 t/s. Solo si la velocidad es más importante que la precisión. |

---

## Cómo usarla en Moodle

### Método 1: Doble click
Hacé **doble click** sobre cualquier pregunta del quiz. La extensión detectará el contenedor, extraerá el texto y las opciones, y mostrará la respuesta en el overlay flotante.

### Método 2: Atajo de teclado
Apretá `Ctrl + Shift + X` (o `Cmd + Shift + X` en Mac) para resolver la pregunta que esté más cerca del centro de la pantalla.

### Overlay
- Aparece arriba a la derecha.
- Podés **arrastrarlo** desde el header.
- Tenés botón para **regenerar** la respuesta (fuerza nueva llamada a la API).
- Tenés botón para **copiar** la respuesta.
- Tenés botón para **cerrar** la ventana.
- Si volvés a consultar la misma pregunta, usa la **caché local** para no gastar tokens de la API.

---

## Estructura de archivos

```
.
├── manifest.json   # Declaración MV3, permisos y comandos
├── background.js   # Service worker que escucha el shortcut Ctrl+Shift+X
├── content.js      # Lógica principal: detección, extracción, APIs (Gemini + Groq), overlay
├── styles.css      # Estilos del overlay (moderno, minimalista, dark mode)
├── options.html    # Página de configuración (API Key y modelo)
└── options.js      # Lógica de guardado en chrome.storage.local
```

---

## Seguridad y privacidad

- **Sin `eval`** ni inline scripts.
- **Sin analytics** ni telemetría.
- **Sin backend propio**: todo corre localmente salvo las llamadas directas a `generativelanguage.googleapis.com` (Gemini) o `api.groq.com` (Groq).
- **Permisos mínimos**: solo `storage` (config y caché) y `activeTab`.
- El content script se carga en cualquier página pero **solo actúa si detecta Moodle por DOM**.

---

## Troubleshooting

| Problema | Solución |
|----------|----------|
| "No se encontró una API Key" | Andá a las opciones de la extensión y configurá tu clave para el proveedor seleccionado. |
| "Error al contactar a Gemini/Groq" | Verificá que la clave sea válida y que no esté vencida. Revisá también tu conexión a internet. |
| "Error 404" (Gemini) | El modelo seleccionado no existe. Probá con `gemini-2.5-flash`. |
| "Error 401/403" (Groq) | Tu API Key de Groq es incorrecta o no tiene permisos. Verificá en [Groq Console](https://console.groq.com/keys). |
| "Error 429" | Agotaste tu cuota gratuita. Esperá unos minutos o usá otro proveedor. |
| El overlay no aparece | Asegurate de estar en una página de Moodle. Abrí la consola (F12) y buscá logs de `[Moodle Study Helper]`. |
| El shortcut no funciona | Andá a `chrome://extensions/shortcuts` y verificá que `Ctrl+Shift+X` esté asignado. |

---

## Aviso importante (Disclaimer)

### Precisión de las respuestas
La **precisión de las respuestas varía significativamente según el modelo de IA** que elijas:
- Modelos más grandes y avanzados (como `gpt-4o`, `claude-3-5-sonnet`, `gemini-2.5-pro`) suelen ser más precisos.
- Modelos más pequeños o rápidos pueden cometer errores, especialmente en materias técnicas o jurídicas.
- **Ningún modelo tiene 100% de precisión.** Siempre verificá las respuestas con tus materiales de estudio.

### Sin garantía de validez
- Este proyecto **no se hace cargo de la validez, exactitud o corrección** de ninguna respuesta generada.
- Las respuestas son generadas por modelos de IA de terceros (Google, Groq, OpenAI, etc.) sobre los cuales no tenemos control.
- **No uses las respuestas como única fuente de verdad** para exámenes, trabajos prácticos o decisiones académicas importantes.

### Uso educativo
- Esta herramienta está diseñada como **auxiliar de estudio**, no como método para copiar o hacer trampa.
- El objetivo es ayudarte a **entender el material**, no reemplazar el estudio.
- Cumplí siempre con las políticas de integridad académica de tu institución.

### Responsabilidad
Los autores y contribuyentes de este proyecto **no son responsables** por:
- Respuestas incorrectas que resulten en notas bajas o reprobación.
- Sanciones disciplinarias por uso indebido en exámenes o evaluaciones.
- Cualquier otro daño directo o indirecto derivado del uso de esta extensión.

---

## Licencia

[MIT License](LICENSE) — Uso personal/educativo. Modificá lo que necesites.
